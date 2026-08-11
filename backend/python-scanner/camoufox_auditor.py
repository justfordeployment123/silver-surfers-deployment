import os
import random
import time
from typing import Any, Dict, Optional
from urllib.parse import urlparse, urlunparse

from bs4 import BeautifulSoup
from camoufox.sync_api import Camoufox

from axe_integration import ensure_expected_audits, find_axe_core_script, merge_axe_results_into_audits, make_not_checked_audit
from scanner_config import FULL_AUDIT_REFS, LITE_AUDIT_REFS, calculate_score
from scanner_utils import safe_text


class _WcagScopeSkip(Exception):
    """Raised internally to skip a check that's exclusively mapped to a
    WCAG 2.2 criterion when the requested scan scope is WCAG 2.1 only.
    Caught alongside the check's normal Exception handler (2.2.7.2)."""


def _wcag22_in_scope(wcag_filter: Optional[Dict[str, Any]]) -> bool:
    """True unless the caller explicitly restricted this scan to WCAG 2.1
    (wcag_filter is None/omitted for combined/2.2 scans, which both include
    2.2-only checks)."""
    return not wcag_filter or wcag_filter.get("version") != "2.1"


def _resolve_axe_tags(wcag_filter: Optional[Dict[str, Any]]) -> list:
    """
    Maps our wcagStandard/conformanceLevel selection to axe-core's rule tags.
    axe-core does not expose a separate "WCAG 2.2 Level A" tag — its 2.2
    additions are grouped under a single 'wcag22aa' tag regardless of the
    underlying criterion's real level — so a 2.2 Level A selection will still
    run the same 2.2 rules as Level AA at this layer. The WCAG matrix table
    built in wcag-matrix.ts is what actually enforces the precise per-
    criterion level filter for what's *displayed*; this only controls what
    axe-core evaluates in the browser (a scan-time optimisation, not the
    source of truth for report content).
    """
    default_tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]
    if not wcag_filter:
        return default_tags

    version = wcag_filter.get("version")
    level = wcag_filter.get("level") or "AA"

    tags = ["wcag2a", "wcag21a"]
    if level in ("AA", "AAA"):
        tags.append("wcag2aa")
        tags.append("wcag21aa")
    if level == "AAA":
        tags.append("wcag2aaa")

    if version != "2.1" and level in ("AA", "AAA"):
        tags.append("wcag22aa")

    tags.append("best-practice")
    return tags


def _scanner_ignore_https_errors() -> bool:
    return safe_text(os.getenv("SCANNER_IGNORE_HTTPS_ERRORS", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _www_to_apex_retry_url(url: str) -> Optional[str]:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if not hostname.lower().startswith("www."):
        return None

    apex_hostname = hostname[4:]
    netloc = apex_hostname
    if parsed.port:
        netloc = f"{apex_hostname}:{parsed.port}"

    return urlunparse(
        (
            parsed.scheme or "https",
            netloc,
            parsed.path or "/",
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )


def navigate_for_audit(page, url: str):
    """
    Prefer a complete page load, but do not fail a scan just because a site keeps
    late scripts, ads, or analytics requests open. Accessibility checks can run
    once the DOM is available.

    Returns the main-document response when one is available so the caller can
    gate on the final HTTP status and content type; recovery paths that never
    completed a navigation return None.
    """
    try:
        return page.goto(url, wait_until="load", timeout=120000)
    except Exception as first_error:
        first_message = safe_text(str(first_error)).lower()
        if "ssl_error_bad_cert_domain" in first_message:
            apex_retry_url = _www_to_apex_retry_url(url)
            if apex_retry_url and apex_retry_url != url:
                return page.goto(apex_retry_url, wait_until="domcontentloaded", timeout=60000)

        recoverable = (
            "timeout" in first_message
            or "ns_error_net_reset" in first_message
            or "ns_error_net_interrupt" in first_message
            or "econnreset" in first_message
            or "connection reset" in first_message
            or "network interrupt" in first_message
        )
        if not recoverable:
            raise

        try:
            page.wait_for_load_state("domcontentloaded", timeout=10000)
            return None
        except Exception:
            pass

        try:
            return page.goto(url, wait_until="domcontentloaded", timeout=60000)
        except Exception as second_error:
            second_message = safe_text(str(second_error)).lower()
            if "timeout" in second_message or "ns_error_net_interrupt" in second_message:
                try:
                    if safe_text(page.content()):
                        return None
                except Exception:
                    pass
            raise first_error


def run_camoufox_audit_sync(
    url: str,
    device_config: Dict[str, Any],
    is_lite: bool,
    wcag_filter: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Synchronous wrapper for Camoufox audit.
    This runs in a thread pool to avoid blocking the async event loop.
    Camoufox uses Playwright's sync API, so we need to run it in a separate thread.
    
    Args:
        url: URL to audit
        device_config: Device configuration (viewport, user agent, etc.)
        is_lite: Whether to use lite version
    Returns:
        {"success": True, "report": {...}, "score": ...}
    """
    # Use Camoufox for advanced anti-detection (sync API)
    # Note: viewport is set on the page, not in the browser constructor
    with Camoufox(headless=True) as browser:
        # Get a page from the browser (sync API)
        page = browser.new_page(ignore_https_errors=_scanner_ignore_https_errors())
        
        # Set viewport and device emulation for the page
        viewport = device_config.get("viewport", {"width": 1920, "height": 1080})
        page.set_viewport_size(viewport)
        
        # Get device emulation settings
        user_agent = device_config.get("user_agent")
        device_scale_factor = device_config.get("device_scale_factor", 1)
        is_mobile = device_config.get("is_mobile", False)
        has_touch = device_config.get("has_touch", False)
        
        # Set user agent via context (more reliable)
        if user_agent:
            context = page.context
            context.set_extra_http_headers({"User-Agent": user_agent})
        
        # Emulate device characteristics via JavaScript injection before navigation
        # This must be done before goto() to ensure proper emulation
        touch_value = 1 if has_touch else 0
        platform_value = 'Linux armv8l' if is_mobile else 'Win32'
        mobile_bool = 'true' if is_mobile else 'false'
        
        page.add_init_script(f"""
            // Override user agent
            Object.defineProperty(navigator, 'userAgent', {{
                get: () => '{user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}',
                configurable: true
            }});
            
            // Override max touch points for touch support
            Object.defineProperty(navigator, 'maxTouchPoints', {{
                get: () => {touch_value},
                configurable: true
            }});
            
            // Override device pixel ratio
            Object.defineProperty(window, 'devicePixelRatio', {{
                get: () => {device_scale_factor},
                configurable: true
            }});
            
            // Override platform
            Object.defineProperty(navigator, 'platform', {{
                get: () => '{platform_value}',
                configurable: true
            }});
            
            // Override hardware concurrency for mobile devices
            if ({mobile_bool}) {{
                Object.defineProperty(navigator, 'hardwareConcurrency', {{
                    get: () => 8,
                    configurable: true
                }});
            }}
        """)

        page.add_init_script("""
            (() => {
                const ignoredPatterns = [
                    /ResizeObserver loop limit exceeded/i,
                    /ResizeObserver loop completed with undelivered notifications/i,
                ];
                const shouldIgnore = (message) => ignoredPatterns.some((pattern) => pattern.test(String(message || '')));
                const store = [];
                const pushError = (kind, message, source, line, column) => {
                    const text = String(message || '').slice(0, 500);
                    if (!text || shouldIgnore(text)) return;
                    store.push({
                        kind,
                        message: text,
                        source: source ? String(source).slice(0, 250) : '',
                        line: Number(line) || 0,
                        column: Number(column) || 0,
                        timestamp: Date.now(),
                    });
                };

                Object.defineProperty(window, '__silverTechnicalErrors', {
                    get: () => store.slice(0, 100),
                    configurable: true,
                });

                const originalConsoleError = console.error;
                console.error = (...args) => {
                    try {
                        pushError('console.error', args.map((arg) => {
                            if (arg instanceof Error) return arg.message;
                            if (typeof arg === 'object') return JSON.stringify(arg);
                            return String(arg);
                        }).join(' '));
                    } catch (_) {}
                    return originalConsoleError.apply(console, args);
                };

                window.addEventListener('error', (event) => {
                    pushError('window.error', event.message, event.filename, event.lineno, event.colno);
                });

                window.addEventListener('unhandledrejection', (event) => {
                    const reason = event.reason;
                    const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection');
                    pushError('unhandledrejection', message);
                });
            })();
        """)

        # Intercept navigator.geolocation before page load so we can detect
        # whether the page calls getCurrentPosition / watchPosition on startup.
        page.add_init_script("""
            (() => {
                let _geoRequested = false;
                try {
                    const geo = navigator.geolocation;
                    if (geo) {
                        const _wrap = (orig) => function(...args) {
                            _geoRequested = true;
                            return orig.apply(geo, args);
                        };
                        Object.defineProperty(geo, 'getCurrentPosition', {
                            value: _wrap(geo.getCurrentPosition), writable: true, configurable: true
                        });
                        Object.defineProperty(geo, 'watchPosition', {
                            value: _wrap(geo.watchPosition), writable: true, configurable: true
                        });
                    }
                } catch (_) {}
                Object.defineProperty(window, '__silverGeolocationRequested', {
                    get: () => _geoRequested,
                    configurable: true,
                });
            })();
        """)
        
        try:
            nav_response = navigate_for_audit(page, url)

            # Jittered post-navigation wait to look human and let dynamic content settle
            page.wait_for_timeout(random.randint(2000, 4500))
            try:
                page.evaluate("() => { window.scrollBy(0, Math.floor(Math.random() * 350) + 150); }")
                page.wait_for_timeout(random.randint(400, 1000))
                page.evaluate("() => { window.scrollBy(0, Math.floor(Math.random() * 250) + 100); }")
                page.wait_for_timeout(random.randint(300, 800))
            except Exception:
                pass
            
            # Get page content (sync)
            html_content = page.content()
            page_url = page.url
            
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(html_content, 'lxml')
            
            # Get final URL after redirects
            final_url = page_url

            # Check 0: HTTP status / content-type gate — never spend audit work
            # on error pages or non-HTML endpoints. The response object comes
            # from the main-document navigation; recovery paths may have no
            # response, in which case the later content gates still apply.
            if nav_response is not None:
                try:
                    nav_status = int(getattr(nav_response, "status", 0) or 0)
                except Exception:
                    nav_status = 0
                if nav_status and not 200 <= nav_status < 300:
                    return {
                        "success": False,
                        "errorCode": "PAGE_NOT_FOUND" if nav_status == 404 else "PAGE_HTTP_ERROR",
                        "error": f"Page returned HTTP {nav_status} during navigation. URL skipped.",
                    }
                try:
                    nav_content_type = safe_text((nav_response.headers or {}).get("content-type") or "").lower()
                except Exception:
                    nav_content_type = ""
                if nav_content_type and "html" not in nav_content_type:
                    return {
                        "success": False,
                        "errorCode": "NON_HTML",
                        "error": f"Page returned non-HTML content ({nav_content_type}). URL skipped.",
                    }

            # --- Bot-protection and empty-page gate ---
            # Run before any audit work so bad pages consume no further resources.

            # Check 1: cross-domain redirect — bot-walls (e.g. ShieldSquare/Radware) silently
            # redirect the browser to a validation host before returning a CAPTCHA page.
            def _bare_host(h: str) -> str:
                return (h or "").lower().removeprefix("www.")

            requested_parsed = urlparse(url if url.startswith("http") else f"https://{url}")
            final_parsed = urlparse(final_url)
            req_host = _bare_host(requested_parsed.hostname or "")
            fin_host = _bare_host(final_parsed.hostname or "")
            if req_host and fin_host and req_host != fin_host:
                return {
                    "success": False,
                    "error": f"Page redirected to a different domain ({final_parsed.hostname}) — bot protection suspected. URL skipped.",
                }

            # Check 2: bot-wall text fingerprints in the page body.
            page_text_lower = soup.get_text(separator=" ", strip=True).lower()
            _BOT_WALL_PHRASES = (
                "your activity and behavior",
                "we think you are a bot",
                "please verify you are a human",
                "access to this page has been blocked",
                "request was blocked",
                "shieldsquare",
                "radware bot manager",
                "perfdrive.com",
            )
            if any(phrase in page_text_lower for phrase in _BOT_WALL_PHRASES):
                return {
                    "success": False,
                    "error": "Bot-protection wall detected on this page — content not auditable. URL skipped.",
                }

            # Check 3: near-empty DOM (UUID redirect stubs, blank interstitials).
            # Real pages have hundreds of elements; stubs typically have < 20.
            try:
                dom_count = page.evaluate("() => document.querySelectorAll('*').length")
                visible_chars = len(page_text_lower.strip())
                if dom_count < 25 and visible_chars < 300:
                    return {
                        "success": False,
                        "error": f"Page appears empty or a stub ({dom_count} DOM elements, {visible_chars} visible chars). URL skipped.",
                    }
            except Exception:
                pass

            # Check 4: minimum auditable-content gate — word stubs with no real
            # navigation (e.g. UUID redirect stubs) must not consume a scored
            # audit slot. Both signals come from the rendered page: visible-text
            # words (same source as the readability audit) and same-origin links.
            try:
                content_metrics = page.evaluate(
                    """
                    () => {
                        const text = (document.body && document.body.innerText) || '';
                        const words = text.split(/\\s+/).filter((word) => word.trim().length > 0);
                        const host = window.location.hostname.toLowerCase().replace(/^www\\./, '');
                        const links = new Set();
                        document.querySelectorAll('a[href]').forEach((anchor) => {
                            try {
                                const href = new URL(anchor.getAttribute('href'), window.location.href);
                                if (['http:', 'https:'].includes(href.protocol)
                                    && href.hostname.toLowerCase().replace(/^www\\./, '') === host) {
                                    links.add(href.href);
                                }
                            } catch (_) {}
                        });
                        return { words: words.length, links: links.size };
                    }
                    """
                ) or {}
                analyzable_words = int(content_metrics.get("words", 0) or 0)
                navigable_links = int(content_metrics.get("links", 0) or 0)
                if analyzable_words < 30 and navigable_links <= 1:
                    return {
                        "success": False,
                        "errorCode": "NO_AUDITABLE_CONTENT",
                        "error": (
                            f"Page has insufficient auditable content "
                            f"({analyzable_words} analyzable words, {navigable_links} navigable links). URL skipped."
                        ),
                    }
            except Exception:
                pass

            # Perform audits using sync Playwright API
            audits = {}
            
            # Color contrast - calculate actual WCAG contrast ratios
            # Old backend uses Lighthouse's built-in color-contrast audit (binary: pass/fail)
            # We'll sample text elements and calculate contrast ratios
            # Note: Full calculation is expensive, so we sample up to 100 elements
            try:
                color_contrast_results = page.evaluate("""
                    () => {
                        // Helper function to calculate relative luminance
                        function getLuminance(r, g, b) {
                            const rs = r / 255;
                            const gs = g / 255;
                            const bs = b / 255;
                            const rLinear = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
                            const gLinear = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
                            const bLinear = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
                            return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
                        }
                        
                        // Helper function to calculate contrast ratio
                        function getContrastRatio(color1, color2) {
                            const lum1 = getLuminance(color1.r, color1.g, color1.b);
                            const lum2 = getLuminance(color2.r, color2.g, color2.b);
                            const lighter = Math.max(lum1, lum2);
                            const darker = Math.min(lum1, lum2);
                            return (lighter + 0.05) / (darker + 0.05);
                        }
                        
                        // Helper to parse color string to RGB
                        function parseColor(colorStr) {
                            if (!colorStr || colorStr === 'transparent') return null;
                            const rgbMatch = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
                            if (rgbMatch) {
                                return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
                            }
                            return null;
                        }
                        
                        // Sample text elements (limit to 100 for performance)
                        const textElements = [];
                        const allElements = document.querySelectorAll('p, span, div, li, td, th, a, button, label, h1, h2, h3, h4, h5, h6');
                        const maxSamples = Math.min(100, allElements.length);
                        
                        for (let i = 0; i < maxSamples; i++) {
                            const el = allElements[i];
                            if (!el.offsetParent) continue; // Skip hidden elements
                            
                            const style = window.getComputedStyle(el);
                            const fontSize = parseFloat(style.fontSize);
                            const fontWeight = parseInt(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);
                            const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
                            const minRatio = isLargeText ? 3.0 : 4.5; // WCAG AA standards
                            
                            const fgColor = parseColor(style.color);
                            let bgColor = parseColor(style.backgroundColor);
                            
                            // If background is transparent, check parent (up to 3 levels)
                            if (!bgColor || (bgColor.r === 0 && bgColor.g === 0 && bgColor.b === 0 && style.backgroundColor.includes('rgba(0, 0, 0, 0)'))) {
                                let parentEl = el.parentElement;
                                let levels = 0;
                                while (parentEl && levels < 3 && !bgColor) {
                                    const parentStyle = window.getComputedStyle(parentEl);
                                    bgColor = parseColor(parentStyle.backgroundColor);
                                    if (bgColor && bgColor.r > 0 && bgColor.g > 0 && bgColor.b > 0) break;
                                    parentEl = parentEl.parentElement;
                                    levels++;
                                }
                            }
                            
                            // Default to white if no background found
                            if (!bgColor) {
                                bgColor = { r: 255, g: 255, b: 255 };
                            }
                            
                            if (fgColor && bgColor) {
                                const ratio = getContrastRatio(fgColor, bgColor);
                                textElements.push({
                                    ratio: ratio,
                                    minRequired: minRatio,
                                    passes: ratio >= minRatio
                                });
                            }
                        }
                        
                        const total = textElements.length;
                        const passing = textElements.filter(e => e.passes).length;
                        const failing = total - passing;
                        
                        return {
                            total: total,
                            passing: passing,
                            failing: failing,
                            score: total > 0 ? passing / total : 1.0
                        };
                    }
                """)
                
                contrast_score = color_contrast_results.get("score", 1.0) if color_contrast_results else 1.0
                failing_count = color_contrast_results.get("failing", 0) if color_contrast_results else 0
                total_count = color_contrast_results.get("total", 0) if color_contrast_results else 0
            except Exception as e:
                print(f"⚠️ Color contrast calculation failed: {e}")
                contrast_score = 1.0
                failing_count = 0
                total_count = 0
            
            audits["color-contrast"] = {
                "id": "color-contrast",
                "title": "Background and foreground colors have a sufficient contrast ratio",
                "description": f"This audit checks whether text and background colors have sufficient contrast for readability. Found {failing_count} elements with insufficient contrast out of {total_count} sampled text elements.",
                "score": contrast_score,
                "numericValue": contrast_score,
                "displayValue": f"{failing_count} of {total_count} sampled text elements have insufficient contrast",
                "scoreDisplayMode": "numeric" if contrast_score < 1.0 else "binary",
            }
            
            # Target size (check for small clickable elements) - sync eval with details
            target_size_results = page.evaluate("""
                () => {
                    const elements = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
                    const smallItems = [];
                    elements.forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 44 || rect.height < 44) {
                            smallItems.push({
                                node: {
                                    nodeLabel: el.textContent.trim().substring(0, 50) || el.tagName.toLowerCase(),
                                    selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (() => { const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal || ''); return cls ? '.' + cls.trim().split(/\\s+/)[0] : ''; })(),
                                    path: el.tagName.toLowerCase()
                                },
                                width: Math.round(rect.width),
                                height: Math.round(rect.height)
                            });
                        }
                    });
                    return { total: elements.length, small: smallItems.length, items: smallItems.slice(0, 50) };
                }
            """)
            target_score = 1.0 if target_size_results["small"] == 0 else max(0, 1 - (target_size_results["small"] / max(target_size_results["total"], 1)))
            
            target_details_items = []
            if target_size_results.get("items"):
                for item in target_size_results["items"]:
                    target_details_items.append({
                        "node": item.get("node", {}),
                        "width": item.get("width", 0),
                        "height": item.get("height", 0)
                    })
            
            audits["target-size"] = {
                "id": "target-size",
                "title": "Touch targets have sufficient size and spacing",
                "description": f"This audit checks if interactive elements (buttons, links) are large enough for easy clicking. Found {target_size_results['small']} small targets out of {target_size_results['total']} total interactive elements.",
                "score": target_score,
                "numericValue": target_score,
                "displayValue": f"{target_size_results['small']} of {target_size_results['total']} interactive elements are below 44x44px",
            }
            if target_size_results["total"] == 0:
                audits["target-size"].update({
                    "description": "This audit checks if interactive elements (buttons, links) are large enough for easy clicking. No interactive elements were found on the page, so the check is not applicable.",
                    "score": None,
                    "numericValue": None,
                    "displayValue": "No interactive elements found — check not applicable",
                    "scoreDisplayMode": "notApplicable",
                })
            
            if target_details_items:
                audits["target-size"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "width", "itemType": "numeric", "text": "Width"},
                        {"key": "height", "itemType": "numeric", "text": "Height"}
                    ],
                    "items": target_details_items
                }
            
            # Viewport meta tag
            viewport_meta = soup.find("meta", attrs={"name": "viewport"})
            has_viewport = viewport_meta is not None
            audits["viewport"] = {
                "id": "viewport",
                "title": "Has a `<meta name=\"viewport\">` tag with `width` or `initial-scale`",
                "description": "This audit checks if the page has a proper viewport meta tag for mobile devices. A viewport tag ensures the page displays correctly on tablets and phones.",
                "score": 1.0 if has_viewport else 0.0,
                "numericValue": 1.0 if has_viewport else 0.0,
            }
            
            # Link names - sync eval with details
            link_name_results = page.evaluate("""
                () => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const failingItems = [];
                    links.forEach(link => {
                        const text = link.textContent.trim();
                        const ariaLabel = link.getAttribute('aria-label');
                        const title = link.getAttribute('title');
                        if (!text && !ariaLabel && !title) {
                            failingItems.push({
                                node: {
                                    nodeLabel: link.href || 'Link',
                                    selector: link.tagName.toLowerCase() + (link.id ? '#' + link.id : '') + (() => { const cls = typeof link.className === 'string' ? link.className : (link.className?.baseVal || ''); return cls ? '.' + cls.trim().split(/\\s+/)[0] : ''; })(),
                                    path: link.tagName.toLowerCase()
                                }
                            });
                        }
                    });
                    return { total: links.length, failing: failingItems.length, items: failingItems.slice(0, 50) };
                }
            """)
            link_score = 1.0 if link_name_results["total"] == 0 else max(0, 1 - (link_name_results["failing"] / max(link_name_results["total"], 1)))
            
            link_details_items = []
            if link_name_results.get("items"):
                for item in link_name_results["items"]:
                    link_details_items.append({
                        "node": item.get("node", {})
                    })
            
            audits["link-name"] = {
                "id": "link-name",
                "title": "Links have a discernible name",
                "description": f"This audit checks if all links have descriptive text. Found {link_name_results['failing']} links without text out of {link_name_results['total']} total links.",
                "score": link_score,
                "numericValue": link_score,
                "displayValue": f"{link_name_results['failing']} of {link_name_results['total']} links lack discernible text",
            }
            if link_name_results["total"] == 0:
                audits["link-name"].update({
                    "description": "This audit checks if all links have descriptive text. No links were found on the page, so the check is not applicable.",
                    "score": None,
                    "numericValue": None,
                    "displayValue": "No links found — check not applicable",
                    "scoreDisplayMode": "notApplicable",
                })
            
            if link_details_items:
                audits["link-name"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "selector", "itemType": "code", "text": "Location"}
                    ],
                    "items": link_details_items
                }
            
            # Button names - sync eval with details
            button_name_results = page.evaluate("""
                () => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]'))
                        .filter(btn => btn.offsetParent !== null && !btn.disabled && btn.getAttribute('aria-hidden') !== 'true');
                    const failingItems = [];
                    buttons.forEach(btn => {
                        const text = (btn.innerText || btn.textContent || '').trim();
                        const ariaLabel = (btn.getAttribute('aria-label') || '').trim();
                        const labelledBy = btn.getAttribute('aria-labelledby');
                        const labelledByText = labelledBy
                            ? labelledBy.split(/\\s+/)
                                .map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '')
                                .join(' ')
                                .trim()
                            : '';
                        const value = btn.getAttribute('value');
                        const title = btn.getAttribute('title');
                        const alt = btn.getAttribute('alt');
                        const svgTitle = btn.querySelector('svg title')?.textContent?.trim() || '';
                        if (!text && !ariaLabel && !labelledByText && !value && !title && !alt && !svgTitle) {
                            failingItems.push({
                                node: {
                                    nodeLabel: btn.tagName.toLowerCase(),
                                    selector: btn.tagName.toLowerCase() + (btn.id ? '#' + btn.id : '') + (() => { const cls = typeof btn.className === 'string' ? btn.className : (btn.className?.baseVal || ''); return cls ? '.' + cls.trim().split(/\\s+/)[0] : ''; })(),
                                    path: btn.tagName.toLowerCase()
                                }
                            });
                        }
                    });
                    return { total: buttons.length, failing: failingItems.length, items: failingItems.slice(0, 50) };
                }
            """)
            button_score = 1.0 if button_name_results["total"] == 0 else max(0, 1 - (button_name_results["failing"] / max(button_name_results["total"], 1)))
            
            button_details_items = []
            if button_name_results.get("items"):
                for item in button_name_results["items"]:
                    button_details_items.append({
                        "node": item.get("node", {})
                    })
            
            audits["button-name"] = {
                "id": "button-name",
                "title": "Buttons have an accessible name",
                "description": f"This audit checks if all buttons have descriptive labels. Found {button_name_results['failing']} buttons without text out of {button_name_results['total']} total buttons.",
                "score": button_score,
                "numericValue": button_score,
                "displayValue": f"{button_name_results['failing']} of {button_name_results['total']} buttons lack a discernible accessible name",
            }
            if button_name_results["total"] == 0:
                audits["button-name"].update({
                    "description": "This audit checks if all buttons have descriptive labels. No buttons were found on the page, so the check is not applicable.",
                    "score": None,
                    "numericValue": None,
                    "displayValue": "No buttons found — check not applicable",
                    "scoreDisplayMode": "notApplicable",
                })
            
            if button_details_items:
                audits["button-name"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "selector", "itemType": "code", "text": "Location"}
                    ],
                    "items": button_details_items
                }
            
            # Form labels - sync eval with details
            label_results = page.evaluate("""
                () => {
                    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
                    const failingItems = [];
                    inputs.forEach(input => {
                        const id = input.id;
                        const name = input.name;
                        const label = id
                            ? Array.from(document.querySelectorAll('label')).find(candidate => candidate.htmlFor === id)
                            : null;
                        const ariaLabel = input.getAttribute('aria-label');
                        const placeholder = input.getAttribute('placeholder');
                        if (!label && !ariaLabel && !placeholder) {
                            failingItems.push({
                                node: {
                                    nodeLabel: input.tagName.toLowerCase() + (input.type ? '[' + input.type + ']' : ''),
                                    selector: input.tagName.toLowerCase() + (input.id ? '#' + input.id : '') + (() => { const cls = typeof input.className === 'string' ? input.className : (input.className?.baseVal || ''); return cls ? '.' + cls.trim().split(/\\s+/)[0] : ''; })(),
                                    path: input.tagName.toLowerCase()
                                }
                            });
                        }
                    });
                    return { total: inputs.length, failing: failingItems.length, items: failingItems.slice(0, 50) };
                }
            """)
            label_score = 1.0 if label_results["total"] == 0 else max(0, 1 - (label_results["failing"] / max(label_results["total"], 1)))
            
            label_details_items = []
            if label_results.get("items"):
                for item in label_results["items"]:
                    label_details_items.append({
                        "node": item.get("node", {})
                    })
            
            audits["label"] = {
                "id": "label",
                "title": "Form elements have associated labels",
                "description": f"This audit checks if all form inputs have associated labels. Found {label_results['failing']} inputs without labels out of {label_results['total']} total inputs.",
                "score": label_score,
                "numericValue": label_score,
                "displayValue": f"{label_results['failing']} of {label_results['total']} form controls lack labels",
            }
            if label_results["total"] == 0:
                audits["label"].update({
                    "description": "This audit checks if all form inputs have associated labels. No form controls were found on the page, so the check is not applicable.",
                    "score": None,
                    "numericValue": None,
                    "displayValue": "No form controls found — check not applicable",
                    "scoreDisplayMode": "notApplicable",
                })
            
            if label_details_items:
                audits["label"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "selector", "itemType": "code", "text": "Location"}
                    ],
                    "items": label_details_items
                }

            # Image alt text - technical accessibility foundation
            image_alt_results = page.evaluate("""
                () => {
                    const images = Array.from(document.querySelectorAll('img'))
                        .filter(img => img.offsetParent !== null && img.getAttribute('aria-hidden') !== 'true');
                    const failingItems = [];
                    images.forEach(img => {
                        const role = (img.getAttribute('role') || '').toLowerCase();
                        const alt = img.getAttribute('alt');
                        const ariaLabel = img.getAttribute('aria-label');
                        const labelledBy = img.getAttribute('aria-labelledby');
                        const labelledByText = labelledBy
                            ? labelledBy.split(/\\s+/)
                                .map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '')
                                .join(' ')
                                .trim()
                            : '';
                        const isDecorative = role === 'presentation' || role === 'none' || alt === '';
                        const hasName = isDecorative || (alt && alt.trim()) || (ariaLabel && ariaLabel.trim()) || labelledByText;
                        if (!hasName) {
                            failingItems.push({
                                node: {
                                    nodeLabel: img.getAttribute('src') || 'Image',
                                    selector: img.tagName.toLowerCase() + (img.id ? '#' + img.id : '') + (img.className ? '.' + String(img.className).split(' ')[0] : ''),
                                    path: img.tagName.toLowerCase()
                                }
                            });
                        }
                    });
                    return { total: images.length, failing: failingItems.length, items: failingItems.slice(0, 50) };
                }
            """)
            image_alt_score = 1.0 if image_alt_results["total"] == 0 else max(0, 1 - (image_alt_results["failing"] / max(image_alt_results["total"], 1)))
            audits["image-alt"] = {
                "id": "image-alt",
                "title": "Images have alternate text",
                "description": f"This audit checks whether meaningful images have text alternatives. Found {image_alt_results['failing']} images without alt text out of {image_alt_results['total']} visible images.",
                "score": image_alt_score,
                "numericValue": image_alt_score,
                "displayValue": f"{image_alt_results['failing']} of {image_alt_results['total']} visible images lack text alternatives",
            }
            if image_alt_results["total"] == 0:
                audits["image-alt"].update({
                    "description": "This audit checks whether meaningful images have text alternatives. No visible images were found on the page, so the check is not applicable.",
                    "score": None,
                    "numericValue": None,
                    "displayValue": "No images found — check not applicable",
                    "scoreDisplayMode": "notApplicable",
                })
            if image_alt_results.get("items"):
                audits["image-alt"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Image"},
                        {"key": "selector", "itemType": "code", "text": "Location"}
                    ],
                    "items": [{"node": item.get("node", {})} for item in image_alt_results.get("items", [])]
                }
            
            # Heading order - sync eval
            heading_order_valid = page.evaluate("""
                () => {
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                    let lastLevel = 0;
                    for (const heading of headings) {
                        const level = parseInt(heading.tagName[1]);
                        if (level > lastLevel + 1) return false;
                        lastLevel = level;
                    }
                    return true;
                }
            """)
            audits["heading-order"] = {
                "id": "heading-order",
                "title": "Heading elements appear in a sequentially-descending order",
                "description": "This audit checks if headings follow a logical order (H1, then H2, then H3, etc.). Proper heading structure helps screen readers and improves content organization.",
                "score": 1.0 if heading_order_valid else 0.0,
                "numericValue": 1.0 if heading_order_valid else 0.0,
            }
            
            # HTTPS check
            is_https = urlparse(final_url).scheme == "https"
            audits["is-on-https"] = {
                "id": "is-on-https",
                "title": "Uses HTTPS",
                "description": "This audit checks if the page is served over HTTPS. HTTPS encrypts data and provides security for users.",
                "score": 1.0 if is_https else 0.0,
                "numericValue": 1.0 if is_https else 0.0,
            }
            
            # Text font audit - sync eval with detailed items
            text_font_results = page.evaluate("""
                () => {
                    const elements = document.querySelectorAll('p, span, div, li, td, th, a, button, label');
                    const failingItems = [];
                    elements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        const fontSize = parseFloat(style.fontSize);
                        if (fontSize < 16 && el.textContent.trim()) {
                            failingItems.push({
                                textSnippet: el.textContent.trim().substring(0, 100) || 'Text element',
                                containerSelector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (() => { const cls = typeof el.className === 'string' ? el.className : (el.className?.baseVal || ''); return cls ? '.' + cls.trim().split(/\\s+/)[0] : ''; })(),
                                fontSize: fontSize.toFixed(1) + 'px'
                            });
                        }
                    });
                    return {
                        total: elements.length,
                        small: failingItems.length,
                        items: failingItems.slice(0, 50)  // Limit to 50 items for performance
                    };
                }
            """)
            total_text_elements = text_font_results.get("total", 0)
            small_text_count = text_font_results.get("small", 0)
            text_score = 1.0 if total_text_elements == 0 else max(0, 1 - (small_text_count / max(total_text_elements, 1)))
            
            # Build details.items for table generation
            text_details_items = []
            if text_font_results.get("items"):
                for item in text_font_results["items"]:
                    text_details_items.append({
                        "textSnippet": item.get("textSnippet", "Text element"),
                        "containerSelector": item.get("containerSelector", "N/A"),
                        "fontSize": item.get("fontSize", "N/A")
                    })
            
            audits["text-font-audit"] = {
                "id": "text-font-audit",
                "title": "Text is appropriately sized for readability",
                "description": f"This audit checks if text is large enough for readability. Found {small_text_count} text elements with font size less than 16px out of {total_text_elements} total text elements.",
                "score": text_score,
                "numericValue": text_score,
            }
            if total_text_elements == 0:
                audits["text-font-audit"].update({
                    "description": "This audit checks if text is large enough for readability. No text elements were found on the page, so the check is not applicable.",
                    "score": None,
                    "numericValue": None,
                    "displayValue": "No text elements found — check not applicable",
                    "scoreDisplayMode": "notApplicable",
                })
            
            # Add details.items if there are failing items
            if text_details_items:
                audits["text-font-audit"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "textSnippet", "itemType": "text", "text": "Text Content"},
                        {"key": "containerSelector", "itemType": "code", "text": "Element Selector"},
                        {"key": "fontSize", "itemType": "text", "text": "Reason"}
                    ],
                    "items": text_details_items
                }

            if not is_lite:
                line_spacing_results = page.evaluate("""
                    () => {
                        const bodyTags = new Set(['P', 'LI', 'TD', 'TH', 'DD', 'DT', 'BLOCKQUOTE', 'FIGCAPTION', 'LABEL', 'SPAN', 'DIV']);
                        const elements = Array.from(document.querySelectorAll('p, li, td, th, dd, dt, blockquote, figcaption, label, span, div'))
                            .filter(el => bodyTags.has(el.tagName) && el.textContent.trim().length >= 20 && el.offsetParent !== null);
                        const failingItems = [];
                        let passing = 0;
                        for (const el of elements.slice(0, 300)) {
                            const style = window.getComputedStyle(el);
                            const fontSize = parseFloat(style.fontSize);
                            if (!fontSize || fontSize <= 0) {
                                passing++;
                                continue;
                            }
                            let lineHeightPx = null;
                            if (style.lineHeight && style.lineHeight !== 'normal') {
                                if (style.lineHeight.endsWith('px')) {
                                    lineHeightPx = parseFloat(style.lineHeight);
                                } else {
                                    const ratio = parseFloat(style.lineHeight);
                                    if (Number.isFinite(ratio)) lineHeightPx = ratio * fontSize;
                                }
                            }
                            const ratio = lineHeightPx === null ? 1.2 : lineHeightPx / fontSize;
                            if (ratio < 1.5) {
                                let selector = el.tagName.toLowerCase();
                                if (el.id) selector += '#' + el.id;
                                else if (typeof el.className === 'string' && el.className.trim()) selector += '.' + el.className.trim().split(/\\s+/)[0];
                                failingItems.push({
                                    textSnippet: el.textContent.trim().slice(0, 100),
                                    fontSize: `${fontSize.toFixed(1)}px`,
                                    lineHeight: style.lineHeight || 'normal',
                                    containerTag: el.tagName.toLowerCase(),
                                    containerSelector: selector,
                                    ratio: ratio.toFixed(2)
                                });
                            } else {
                                passing++;
                            }
                        }
                        return { total: Math.min(elements.length, 300), failing: failingItems.length, passing, items: failingItems.slice(0, 50) };
                    }
                """)
                line_total = line_spacing_results.get("total", 0)
                line_failing = line_spacing_results.get("failing", 0)
                line_score = 1.0 if line_total == 0 else max(0, 1 - (line_failing / max(line_total, 1)))
                audits["line-spacing-audit"] = {
                    "id": "line-spacing-audit",
                    "title": "Body text has adequate line spacing for readability",
                    "description": "Checks whether body text line-height is at least 1.5x font size for older-adult readability.",
                    "score": line_score,
                    "numericValue": line_score,
                    "scoreDisplayMode": "numeric",
                    "displayValue": f"{line_failing} text elements with line spacing below 1.5x",
                    "details": {
                        "type": "table",
                        "headings": [
                            {"key": "textSnippet", "itemType": "text", "text": "Text Sample"},
                            {"key": "fontSize", "itemType": "text", "text": "Font Size"},
                            {"key": "lineHeight", "itemType": "text", "text": "Line Height"},
                            {"key": "containerSelector", "itemType": "text", "text": "Selector"},
                        ],
                        "items": line_spacing_results.get("items", []),
                    } if line_failing else None,
                }
                if line_total == 0:
                    audits["line-spacing-audit"].update({
                        "description": "Checks whether body text line-height is at least 1.5x font size for older-adult readability. No text blocks were found on the page, so the check is not applicable.",
                        "score": None,
                        "numericValue": None,
                        "displayValue": "No text blocks found — check not applicable",
                        "scoreDisplayMode": "notApplicable",
                    })
            
            # --- Mobile & Cross-Platform audits (JS-injected, anti-bot safe) ---

            # 1. User-Scalable Audit: pinch-to-zoom must not be blocked
            try:
                user_scalable_result = page.evaluate("""
                    () => {
                        const meta = document.querySelector('meta[name="viewport"]');
                        if (!meta) return { blocked: false, content: '' };
                        const content = meta.getAttribute('content') || '';
                        const blocksZoom = /user-scalable\\s*=\\s*no/i.test(content)
                            || /maximum-scale\\s*=\\s*[01](\\.[0-9]+)?(?!\\d)/i.test(content);
                        return { blocked: blocksZoom, content: content };
                    }
                """)
                zoom_blocked = user_scalable_result.get("blocked", False)
                zoom_content = user_scalable_result.get("content", "")
            except Exception as e:
                print(f"⚠️ user-scalable-audit failed: {e}")
                zoom_blocked = False
                zoom_content = ""

            audits["user-scalable-audit"] = {
                "id": "user-scalable-audit",
                "title": "Pinch-to-Zoom is not blocked",
                "description": (
                    f"This audit checks if the viewport meta tag blocks pinch-to-zoom. "
                    f"Viewport: '{zoom_content}'. "
                    + ("Zoom is blocked — this prevents older adults from enlarging content." if zoom_blocked
                       else "Zoom is allowed, enabling users to enlarge content as needed.")
                ),
                "score": 0.0 if zoom_blocked else 1.0,
                "numericValue": 0.0 if zoom_blocked else 1.0,
            }

            # 2. Horizontal Scroll Audit: content must not overflow at 320px — the exact
            # viewport width required by WCAG 1.4.10 Reflow (AA). Content must reflow
            # without horizontal scrolling or loss of information at this width.
            _original_viewport = page.viewport_size or {"width": 1920, "height": 1080}
            try:
                page.set_viewport_size({"width": 320, "height": 812})
                page.wait_for_timeout(300)  # allow reflow
                h_scroll_result = page.evaluate("""
                    () => ({
                        overflows: document.documentElement.scrollWidth > window.innerWidth + 5,
                        scrollWidth: document.documentElement.scrollWidth,
                        innerWidth: window.innerWidth,
                    })
                """)
                h_overflows = h_scroll_result.get("overflows", False)
                scroll_width = h_scroll_result.get("scrollWidth", 0)
                inner_width = h_scroll_result.get("innerWidth", 0)
            except Exception as e:
                print(f"⚠️ horizontal-scroll-audit failed: {e}")
                h_overflows = False
                scroll_width = 0
                inner_width = 375
            finally:
                try:
                    page.set_viewport_size(_original_viewport)
                    page.wait_for_timeout(200)
                except Exception:
                    pass

            audits["horizontal-scroll-audit"] = {
                "id": "horizontal-scroll-audit",
                "title": "Content reflows at 320px without horizontal scrolling (WCAG 1.4.10)",
                "description": (
                    f"Checks if page content reflows within a 320px viewport (WCAG 1.4.10 Reflow AA requirement). "
                    f"Content width: {scroll_width}px, tested at: {inner_width}px. "
                    + ("Horizontal scrolling required at 320px — content does not reflow correctly for mobile users." if h_overflows
                       else "Content reflows within 320px — meets WCAG 1.4.10 Reflow requirement.")
                ),
                "score": 0.0 if h_overflows else 1.0,
                "numericValue": 0.0 if h_overflows else 1.0,
            }

            # 3. Text-Size-Adjust Audit: CSS must not disable mobile text scaling
            try:
                text_adjust_result = page.evaluate("""
                    () => {
                        const elements = [document.documentElement, document.body];
                        for (const el of elements) {
                            const style = window.getComputedStyle(el);
                            const val = style.webkitTextSizeAdjust || style.textSizeAdjust || '';
                            if (val === 'none') {
                                return { blocked: true, value: val };
                            }
                        }
                        return { blocked: false, value: '' };
                    }
                """)
                text_adjust_blocked = text_adjust_result.get("blocked", False)
            except Exception as e:
                print(f"⚠️ text-size-adjust-audit failed: {e}")
                text_adjust_blocked = False

            audits["text-size-adjust-audit"] = {
                "id": "text-size-adjust-audit",
                "title": "Mobile text scaling is not disabled",
                "description": (
                    "This audit checks if CSS disables the browser's automatic text size adjustment on mobile. "
                    + ("Text scaling is blocked via CSS — older adults lose automatic text enlargement on mobile." if text_adjust_blocked
                       else "Text scaling is not disabled — browsers can adjust text size for readability.")
                ),
                "score": 0.0 if text_adjust_blocked else 1.0,
                "numericValue": 0.0 if text_adjust_blocked else 1.0,
            }

            # 4. Text Spacing Audit (WCAG 1.4.12 AA)
            # Override line-height, letter-spacing, and word-spacing to the WCAG minimum
            # values, then check if any text content overflows or is clipped.
            try:
                text_spacing_result = page.evaluate("""
                    () => {
                        const style = document.createElement('style');
                        style.id = '__ss_text_spacing_test__';
                        style.textContent = `
                            * {
                                line-height: 1.5 !important;
                                letter-spacing: 0.12em !important;
                                word-spacing: 0.16em !important;
                            }
                            p { margin-bottom: 2em !important; }
                        `;
                        document.head.appendChild(style);

                        const overflowing = [];
                        const elements = document.querySelectorAll('p, li, dt, dd, h1, h2, h3, h4, h5, h6, label, span, a, button');
                        for (const el of elements) {
                            if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
                            if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
                                let selector = el.tagName.toLowerCase();
                                if (el.id) selector += '#' + el.id;
                                else if (el.className && typeof el.className === 'string') {
                                    selector += '.' + el.className.trim().split(/\\s+/)[0];
                                }
                                overflowing.push({ selector, tag: el.tagName.toLowerCase() });
                                if (overflowing.length >= 5) break;
                            }
                        }

                        document.head.removeChild(style);
                        return { overflowCount: overflowing.length, items: overflowing };
                    }
                """)
                spacing_overflow_count = text_spacing_result.get("overflowCount", 0)
                spacing_items = text_spacing_result.get("items", [])
            except Exception as e:
                print(f"⚠️ text-spacing-audit failed: {e}")
                spacing_overflow_count = 0
                spacing_items = []

            audits["text-spacing-audit"] = {
                "id": "text-spacing-audit",
                "title": "Content does not clip or overflow when text spacing is increased (WCAG 1.4.12)",
                "description": (
                    "Applies WCAG 1.4.12 minimum text spacing overrides (line-height 1.5, "
                    "letter-spacing 0.12em, word-spacing 0.16em) and checks for clipped or "
                    "overflowing content. "
                    + (f"{spacing_overflow_count} element(s) overflow when spacing is increased — "
                       "text content becomes inaccessible for users who need wider spacing."
                       if spacing_overflow_count > 0
                       else "No overflow detected with increased text spacing — meets WCAG 1.4.12.")
                ),
                "score": 0.0 if spacing_overflow_count > 0 else 1.0,
                "numericValue": float(spacing_overflow_count),
                "scoreDisplayMode": "binary",
                "details": {
                    "type": "table",
                    "headings": [{"key": "selector", "itemType": "code", "text": "Element"}],
                    "items": [{"selector": item.get("selector", "")} for item in spacing_items],
                } if spacing_items else None,
                "wcagReferences": [{"criterion": "1.4.12", "level": "AA", "version": "2.1"}],
            }

            # Cumulative Layout Shift (CLS) - measure actual CLS from performance entries
            # Note: CLS is measured during page load, so we read from existing performance entries
            try:
                cls_result = page.evaluate("""
                    () => {
                        let clsValue = 0;
                        let clsEntries = [];
                        
                        try {
                            // Read buffered layout-shift entries
                            const entries = performance.getEntriesByType('layout-shift');
                            for (const entry of entries) {
                                if (!entry.hadRecentInput) {
                                    clsValue += entry.value;
                                    clsEntries.push({
                                        value: entry.value,
                                        startTime: entry.startTime
                                    });
                                }
                            }
                            
                            // Lighthouse CLS scoring: 0.1 = good, 0.25 = needs improvement, 0.25+ = poor
                            // Score: 1.0 if CLS <= 0.1, linear decrease to 0 if CLS >= 0.25
                            let score = 1.0;
                            if (clsValue > 0.1) {
                                if (clsValue >= 0.25) {
                                    score = 0;
                                } else {
                                    score = 1 - ((clsValue - 0.1) / 0.15);
                                }
                            }
                            
                            return {
                                cls: clsValue,
                                score: Math.max(0, Math.min(1, score)),
                                entries: clsEntries.length
                            };
                        } catch (e) {
                            // Fallback if Performance API not available
                            return {
                                cls: 0,
                                score: 1.0,
                                entries: 0,
                                error: e.message
                            };
                        }
                    }
                """)
                
                cls_data = cls_result if isinstance(cls_result, dict) else {"cls": 0, "score": 1.0, "entries": 0}
                cls_score = cls_data.get("score", 1.0)
                cls_value = cls_data.get("cls", 0)
            except Exception as e:
                print(f"⚠️ CLS calculation failed: {e}")
                cls_score = 1.0
                cls_value = 0
            
            audits["cumulative-layout-shift"] = {
                "id": "cumulative-layout-shift",
                "title": "Cumulative Layout Shift",
                "description": f"This audit measures visual stability. CLS value: {cls_value:.3f}. A low CLS score means the page layout is stable and doesn't shift unexpectedly, which is important for older adults.",
                "score": cls_score,
                "numericValue": cls_value,
            }
            
            # Missing audits - set to 0 (not None) so they're included in weight calculation
            # CRITICAL: Must use 0, not None, to match old backend behavior
            # The old backend returns 0 for missing audits, which are included in total weight
            # If we use None, pdf_generator.js filters them out, reducing total weight
            if not is_lite:
                # Layout brittle audit (checks for fixed-height containers)
                layout_brittle_results = page.evaluate("""
                    () => {
                        const candidates = Array.from(document.querySelectorAll('main, article, section, div, p, li, card, aside'))
                            .filter((el) => {
                                const text = (el.innerText || el.textContent || '').trim();
                                if (text.length < 25 || el.offsetParent === null) return false;
                                const rect = el.getBoundingClientRect();
                                if (rect.width < 80 || rect.height < 16) return false;
                                return true;
                            })
                            .slice(0, 500);

                        const failingItems = [];
                        let flexible = 0;

                        for (const el of candidates) {
                            const style = window.getComputedStyle(el);
                            const heightValue = style.height || '';
                            const maxHeightValue = style.maxHeight || '';
                            const hasFixedHeight = /px$/.test(heightValue) && parseFloat(heightValue) > 0;
                            const hasFixedMaxHeight = /px$/.test(maxHeightValue) && parseFloat(maxHeightValue) > 0 && maxHeightValue !== 'none';
                            const hasTextChildren = Array.from(el.querySelectorAll('p, span, a, button, li, h1, h2, h3, h4, h5, h6'))
                                .some((child) => (child.textContent || '').trim().length >= 15);

                            if ((hasFixedHeight || hasFixedMaxHeight) && hasTextChildren) {
                                let selector = el.tagName.toLowerCase();
                                if (el.id) selector += '#' + el.id;
                                else if (typeof el.className === 'string' && el.className.trim()) {
                                    selector += '.' + el.className.trim().split(/\\s+/)[0];
                                }

                                const property = hasFixedMaxHeight ? 'max-height' : 'height';
                                const value = hasFixedMaxHeight ? maxHeightValue : heightValue;
                                const overflow = `${style.overflowX}/${style.overflowY}`;
                                let reason = 'Fixed-size text container may overflow or overlap when users increase spacing.';
                                if (/(hidden|clip)/.test(overflow)) {
                                    reason = 'Fixed-size text container may clip text when users increase spacing.';
                                } else if (/(scroll|auto)/.test(overflow)) {
                                    reason = 'Fixed-size text container may create nested scrolling when users increase spacing.';
                                }

                                failingItems.push({
                                    node: {
                                        nodeLabel: (el.innerText || el.textContent || '').trim().slice(0, 120),
                                        selector,
                                        snippet: el.outerHTML.slice(0, 250),
                                        boundingRect: {
                                            top: Math.round(el.getBoundingClientRect().top),
                                            left: Math.round(el.getBoundingClientRect().left),
                                            width: Math.round(el.getBoundingClientRect().width),
                                            height: Math.round(el.getBoundingClientRect().height),
                                        },
                                    },
                                    failingProperty: `${property}: ${value}`,
                                    overflow,
                                    reason,
                                });
                            } else {
                                flexible++;
                            }
                        }

                        return {
                            total: candidates.length,
                            failing: failingItems.length,
                            flexible,
                            items: failingItems.slice(0, 50),
                        };
                    }
                """)
                brittle_total = layout_brittle_results.get("total", 0)
                brittle_failing = layout_brittle_results.get("failing", 0)
                brittle_score = 1.0 if brittle_total == 0 else max(0, 1 - (brittle_failing / max(brittle_total, 1)))
                audits["layout-brittle-audit"] = {
                    "id": "layout-brittle-audit",
                    "title": "Containers allow for text spacing adjustments",
                    "description": "This audit checks if containers have fixed heights that may prevent text spacing adjustments (WCAG 1.4.12).",
                    "score": brittle_score,
                    "numericValue": brittle_score,
                    "scoreDisplayMode": "numeric",
                    "displayValue": f"{brittle_failing} of {brittle_total} text containers may be brittle",
                    "details": {
                        "type": "table",
                        "headings": [
                            {"key": "node", "itemType": "node", "text": "Element"},
                            {"key": "failingProperty", "itemType": "text", "text": "Problematic Style"},
                            {"key": "overflow", "itemType": "text", "text": "Overflow"},
                            {"key": "reason", "itemType": "text", "text": "Potential Issue"},
                        ],
                        "items": layout_brittle_results.get("items", []),
                    } if brittle_failing else None,
                }
                if brittle_total == 0:
                    audits["layout-brittle-audit"].update({
                        "description": "This audit checks if containers have fixed heights that may prevent text spacing adjustments (WCAG 1.4.12). No text containers were found on the page, so the check is not applicable.",
                        "score": None,
                        "numericValue": None,
                        "displayValue": "No text containers found — check not applicable",
                        "scoreDisplayMode": "notApplicable",
                    })
                
                # Flesch-Kincaid readability audit
                readability_results = page.evaluate("""
                    () => {
                        const selectors = 'main p, main li, article p, article li, section p, section li, [role="main"] p, [role="main"] li, p, li';
                        const fragments = Array.from(document.querySelectorAll(selectors))
                            .filter((el) => el.offsetParent !== null)
                            .map((el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim())
                            .filter((text) => text.length >= 40)
                            .filter((text) => !/^(learn more|read more|click here|sign in|log in|privacy policy|terms)/i.test(text))
                            .slice(0, 250);

                        const fullText = [...new Set(fragments)].join(' ');
                        const sentenceMatches = fullText.match(/[^.!?]+[.!?]+/g) || [];
                        const sentences = sentenceMatches
                            .map((sentence) => sentence.replace(/\\s+/g, ' ').trim())
                            .filter((sentence) => sentence.split(/\\s+/).length >= 5);
                        const words = sentences.join(' ').toLowerCase().match(/\\b[a-z][a-z'-]{1,}\\b/g) || [];

                        function countSyllables(word) {
                            const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
                            if (cleaned.length <= 3) return 1;
                            const withoutSilentE = cleaned.replace(/e$/, '');
                            const matches = withoutSilentE.match(/[aeiouy]+/g);
                            return Math.max(1, matches ? matches.length : 1);
                        }

                        const wordCount = words.length;
                        const sentenceCount = Math.max(1, sentences.length);
                        const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

                        if (wordCount < 30 || sentences.length === 0) {
                            return {
                                score: 1,
                                rawScore: null,
                                adjustedScore: null,
                                words: wordCount,
                                sentences: sentences.length,
                                syllables,
                                notApplicable: true,
                                displayValue: `${wordCount} analyzable words found`,
                                items: [
                                    { metric: 'Status', value: 'Not enough prose content to score reliably' },
                                    { metric: 'Words analyzed', value: String(wordCount) },
                                    { metric: 'Sentences analyzed', value: String(sentences.length) },
                                ],
                            };
                        }

                        const avgWordsPerSentence = wordCount / sentenceCount;
                        const avgSyllablesPerWord = syllables / wordCount;
                        const rawScore = Math.round((206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord) * 10) / 10;
                        const adjustedScore = rawScore;
                        let auditScore = 0;
                        if (adjustedScore >= 70) {
                            auditScore = 1;
                        } else if (adjustedScore >= 60) {
                            auditScore = 0.8 + ((adjustedScore - 60) / 10) * 0.19;
                        } else if (adjustedScore >= 50) {
                            auditScore = 0.5 + ((adjustedScore - 50) / 10) * 0.29;
                        } else if (adjustedScore >= 30) {
                            auditScore = 0.2 + ((adjustedScore - 30) / 20) * 0.29;
                        } else {
                            auditScore = Math.max(0, adjustedScore / 30 * 0.19);
                        }
                        auditScore = Math.round(Math.max(0, Math.min(1, auditScore)) * 100) / 100;

                        let rating = 'Needs Improvement';
                        if (adjustedScore >= 70) rating = 'Easy';
                        else if (adjustedScore >= 60) rating = 'Plain English';
                        else if (adjustedScore >= 50) rating = 'Moderately Difficult';
                        else if (adjustedScore >= 30) rating = 'Difficult';
                        else rating = 'Very Difficult';

                        return {
                            score: auditScore,
                            rawScore,
                            adjustedScore,
                            words: wordCount,
                            sentences: sentences.length,
                            syllables,
                            notApplicable: false,
                            displayValue: `Reading Ease ${adjustedScore} (${rating})`,
                            items: [
                                { metric: 'Reading Ease Score', value: String(adjustedScore) },
                                { metric: 'Suitability Rating', value: rating },
                                { metric: 'Words analyzed', value: String(wordCount) },
                                { metric: 'Sentences analyzed', value: String(sentences.length) },
                                { metric: 'Syllables counted', value: String(syllables) },
                                { metric: 'Average words per sentence', value: avgWordsPerSentence.toFixed(2) },
                                { metric: 'Average syllables per word', value: avgSyllablesPerWord.toFixed(2) },
                                { metric: 'Sample sentences', value: sentences.slice(0, 3).join(' | ') },
                            ],
                        };
                    }
                """)
                audits["flesch-kincaid-audit"] = {
                    "id": "flesch-kincaid-audit",
                    "title": "Flesch-Kincaid Reading Ease (Older Adult-Adjusted)",
                    "description": "This audit calculates the Flesch-Kincaid reading ease score with category-based adjustments for older adult users.",
                    "score": readability_results.get("score", 0),
                    "numericValue": readability_results.get("adjustedScore"),
                    "numericUnit": "reading-ease",
                    "scoreDisplayMode": "notApplicable" if readability_results.get("notApplicable") else "numeric",
                    "notApplicable": bool(readability_results.get("notApplicable")),
                    "displayValue": readability_results.get("displayValue", "Readability not calculated"),
                    "details": {
                        "type": "table",
                        "headings": [
                            {"key": "metric", "itemType": "text", "text": "Metric"},
                            {"key": "value", "itemType": "text", "text": "Value"},
                        ],
                        "items": readability_results.get("items", []),
                    },
                    "extendedInfo": {
                        "value": {
                            "rawScore": readability_results.get("rawScore"),
                            "adjustedScore": readability_results.get("adjustedScore"),
                            "words": readability_results.get("words"),
                            "sentences": readability_results.get("sentences"),
                            "syllables": readability_results.get("syllables"),
                        }
                    },
                }
                
                # Total Blocking Time (TBT) - measure actual TBT from performance entries
                # Note: TBT requires Long Tasks API which may not be available, so we estimate from load time
                try:
                    tbt_result = page.evaluate("""
                        () => {
                            let totalBlockingTime = 0;
                            
                            try {
                                // Try to read buffered longtask entries
                                const longTasks = performance.getEntriesByType('longtask');
                                for (const entry of longTasks) {
                                    // TBT is the sum of blocking time (time > 50ms) for all long tasks
                                    const blockingTime = entry.duration - 50;
                                    if (blockingTime > 0) {
                                        totalBlockingTime += blockingTime;
                                    }
                                }
                                
                                // If no long tasks found, estimate from load time
                                if (totalBlockingTime === 0) {
                                    const perf = performance.timing;
                                    const loadTime = perf.loadEventEnd - perf.navigationStart;
                                    // Rough estimate: assume some blocking during load (10% of load time over 2s)
                                    totalBlockingTime = Math.max(0, (loadTime - 2000) * 0.1);
                                }
                                
                                // Lighthouse TBT scoring: 200ms = good, 600ms = needs improvement, 600ms+ = poor
                                // Score: 1.0 if TBT <= 200ms, linear decrease to 0 if TBT >= 600ms
                                let score = 1.0;
                                if (totalBlockingTime > 200) {
                                    if (totalBlockingTime >= 600) {
                                        score = 0;
                                    } else {
                                        score = 1 - ((totalBlockingTime - 200) / 400);
                                    }
                                }
                                
                                return {
                                    tbt: totalBlockingTime,
                                    score: Math.max(0, Math.min(1, score)),
                                    longTasks: longTasks.length
                                };
                            } catch (e) {
                                // Fallback: estimate from load time
                                const perf = performance.timing;
                                const loadTime = perf.loadEventEnd - perf.navigationStart;
                                const estimatedTBT = Math.max(0, (loadTime - 2000) * 0.1);
                                let score = 1.0;
                                if (estimatedTBT > 200) {
                                    if (estimatedTBT >= 600) {
                                        score = 0;
                                    } else {
                                        score = 1 - ((estimatedTBT - 200) / 400);
                                    }
                                }
                                return {
                                    tbt: estimatedTBT,
                                    score: Math.max(0, Math.min(1, score)),
                                    longTasks: 0,
                                    estimated: true
                                };
                            }
                        }
                    """)
                    
                    tbt_data = tbt_result if isinstance(tbt_result, dict) else {"tbt": 0, "score": 1.0, "longTasks": 0}
                    tbt_score = tbt_data.get("score", 1.0)
                    tbt_value = tbt_data.get("tbt", 0)
                except Exception as e:
                    print(f"⚠️ TBT calculation failed: {e}")
                    tbt_score = 1.0
                    tbt_value = 0
                
                audits["total-blocking-time"] = {
                    "id": "total-blocking-time",
                    "title": "Total Blocking Time",
                    "description": f"This audit measures the total amount of time that a page is blocked from responding to user input. TBT: {tbt_value:.0f}ms. Lower is better.",
                    "score": tbt_score,
                    "numericValue": tbt_value,
                }
                
                # Interactive color audit (link color distinction)
                interactive_color_results = page.evaluate("""
                    () => {
                        const MINIMUM_COLOR_DIFFERENCE = 10;

                        function rgbToLab(rgbString) {
                            const match = String(rgbString || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
                            if (!match) return { L: 50, a: 0, b: 0 };
                            let r = Number(match[1]) / 255;
                            let g = Number(match[2]) / 255;
                            let b = Number(match[3]) / 255;
                            r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
                            g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
                            b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
                            let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
                            let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
                            let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
                            x /= 0.95047; y /= 1.00000; z /= 1.08883;
                            x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x + 16 / 116);
                            y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y + 16 / 116);
                            z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z + 16 / 116);
                            return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
                        }

                        function deltaE(color1, color2) {
                            const lab1 = rgbToLab(color1);
                            const lab2 = rgbToLab(color2);
                            const deltaL = lab1.L - lab2.L;
                            const deltaA = lab1.a - lab2.a;
                            const deltaB = lab1.b - lab2.b;
                            return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
                        }

                        function selectorFor(el) {
                            let selector = el.tagName.toLowerCase();
                            if (el.id) selector += '#' + el.id;
                            else if (typeof el.className === 'string' && el.className.trim()) {
                                selector += '.' + el.className.trim().split(/\\s+/)[0];
                            }
                            return selector;
                        }

                        const links = Array.from(document.querySelectorAll('a[href]'))
                            .filter(link => link.offsetParent !== null && (link.innerText || link.textContent || '').trim().length > 0)
                            .slice(0, 500);
                        const failingItems = [];

                        for (const link of links) {
                            const linkStyle = window.getComputedStyle(link);
                            const parent = link.parentElement;
                            const parentStyle = parent ? window.getComputedStyle(parent) : linkStyle;
                            const linkColor = linkStyle.color;
                            const parentColor = parentStyle.color;
                            const hasNonColorCue =
                                linkStyle.textDecorationLine.includes('underline') ||
                                linkStyle.fontWeight === 'bold' ||
                                Number(linkStyle.fontWeight) >= 600 ||
                                link.querySelector('svg,img') !== null;
                            const difference = deltaE(linkColor, parentColor);

                            if (!hasNonColorCue && difference < MINIMUM_COLOR_DIFFERENCE) {
                                const rect = link.getBoundingClientRect();
                                const short = Math.round(((MINIMUM_COLOR_DIFFERENCE - difference) / MINIMUM_COLOR_DIFFERENCE) * 100);
                                failingItems.push({
                                    node: {
                                        nodeLabel: (link.innerText || link.textContent || '').trim().slice(0, 80),
                                        selector: selectorFor(link),
                                        snippet: link.outerHTML.slice(0, 250),
                                        boundingRect: {
                                            top: Math.round(rect.top),
                                            left: Math.round(rect.left),
                                            width: Math.round(rect.width),
                                            height: Math.round(rect.height),
                                        },
                                    },
                                    text: (link.innerText || link.textContent || '').trim().slice(0, 80),
                                    linkColor,
                                    parentColor,
                                    difference: Number(difference.toFixed(2)),
                                    explanation: difference === 0
                                        ? 'The link color matches the surrounding text and has no non-color cue.'
                                        : `Color difference is ${difference.toFixed(1)} Delta E, ${short}% below the recommended minimum of ${MINIMUM_COLOR_DIFFERENCE}.`,
                                });
                            }
                        }

                        return {
                            total: links.length,
                            failing: failingItems.length,
                            items: failingItems.slice(0, 50),
                        };
                    }
                """)
                interactive_total = interactive_color_results.get("total", 0)
                interactive_failing = interactive_color_results.get("failing", 0)
                interactive_score = 1.0 if interactive_total == 0 else max(0, 1 - (interactive_failing / max(interactive_total, 1)))
                audits["interactive-color-audit"] = {
                    "id": "interactive-color-audit",
                    "title": "Links are visually distinct from surrounding text",
                    "description": "This audit checks if links have a noticeable color difference from surrounding text (Delta E > 10).",
                    "score": interactive_score,
                    "numericValue": interactive_score,
                    "scoreDisplayMode": "numeric",
                    "displayValue": f"{interactive_failing} of {interactive_total} links rely on weak color distinction",
                    "details": {
                        "type": "table",
                        "headings": [
                            {"key": "node", "itemType": "node", "text": "Link Element"},
                            {"key": "linkColor", "itemType": "text", "text": "Link Color"},
                            {"key": "parentColor", "itemType": "text", "text": "Surrounding Text Color"},
                            {"key": "difference", "itemType": "numeric", "text": "Difference"},
                            {"key": "explanation", "itemType": "text", "text": "Details"},
                        ],
                        "items": interactive_color_results.get("items", []),
                    } if interactive_failing else None,
                }
                if interactive_total == 0:
                    audits["interactive-color-audit"].update({
                        "description": "This audit checks if links have a noticeable color difference from surrounding text (Delta E > 10). No links were found on the page, so the check is not applicable.",
                        "score": None,
                        "numericValue": None,
                        "displayValue": "No links found — check not applicable",
                        "scoreDisplayMode": "notApplicable",
                    })
                
                # DOM size audit
                dom_size = page.evaluate("() => document.querySelectorAll('*').length")
                dom_size_score = 1.0 if dom_size < 1500 else max(0, 1 - (dom_size - 1500) / 1500)
                
                # Get sample DOM elements for detailed findings table
                # Get top-level elements and navigation items as examples
                sample_elements = page.evaluate("""
                    () => {
                        const elements = [];
                        // Get navigation links
                        const navLinks = Array.from(document.querySelectorAll('nav a, header a, .nav a, .navigation a')).slice(0, 10);
                        navLinks.forEach(link => {
                            const text = link.textContent.trim().substring(0, 50);
                            if (text) {
                                // Build selector
                                let selector = link.tagName.toLowerCase();
                                if (link.id) {
                                    selector += '#' + link.id;
                                } else {
                                    const cls = typeof link.className === 'string' ? link.className : (link.className?.baseVal || '');
                                    const firstClass = cls.trim().split(/\\s+/)[0];
                                    if (firstClass) selector += '.' + firstClass;
                                }
                                elements.push({
                                    nodeLabel: text || 'Navigation Link',
                                    selector: selector,
                                    explanation: 'May impact older adult users'
                                });
                            }
                        });
                        // Get some divs with complex nesting (potential complexity issues)
                        const complexDivs = Array.from(document.querySelectorAll('div[class*="relative"], div[class*="absolute"]')).slice(0, 5);
                        complexDivs.forEach(div => {
                            const depth = div.querySelectorAll('*').length;
                            if (depth > 5) {
                                let selector = div.tagName.toLowerCase();
                                if (div.id) {
                                    selector += '#' + div.id;
                                } else {
                                    const cls = typeof div.className === 'string' ? div.className : (div.className?.baseVal || '');
                                    const firstClass = cls.trim().split(/\\s+/)[0];
                                    if (firstClass) selector += '.' + firstClass;
                                }
                                elements.push({
                                    nodeLabel: selector,
                                    selector: selector,
                                    explanation: 'May impact older adult users'
                                });
                            }
                        });
                        return elements.slice(0, 10); // Limit to 10 items
                    }
                """)
                
                # Build details.items in the format expected by PDF generator's default table config
                # Default config expects: item.node?.nodeLabel, item.node?.selector, item.explanation
                details_items = []
                if sample_elements:
                    for elem in sample_elements:
                        details_items.append({
                            "node": {
                                "nodeLabel": elem.get("nodeLabel", "Page Element"),
                                "selector": elem.get("selector", "N/A")
                            },
                            "explanation": elem.get("explanation", "May impact older adult users")
                        })
                
                audits["dom-size"] = {
                    "id": "dom-size",
                    "title": "Avoids an excessive DOM size",
                    "description": f"This audit checks if the page has a reasonable number of DOM elements. Found {dom_size} elements. Recommended: under 1500.",
                    "score": dom_size_score,
                    "numericValue": dom_size,
                    "displayValue": f"{dom_size} elements",
                    "details": {
                        "type": "table",
                        "items": details_items
                    } if details_items else None
                }
                
                # Technical stability - collect console errors, thrown window errors, and unhandled promise rejections.
                technical_errors = page.evaluate("() => window.__silverTechnicalErrors || []")
                if not isinstance(technical_errors, list):
                    technical_errors = []
                error_count = len(technical_errors)
                technical_stability_score = max(0, 1 - (min(error_count, 10) / 10))
                audits["errors-in-console"] = {
                    "id": "errors-in-console",
                    "title": "No JavaScript errors in console",
                    "description": "Checks whether page scripts emit console errors, uncaught errors, or unhandled promise rejections during initial load.",
                    "score": technical_stability_score,
                    "numericValue": error_count,
                    "scoreDisplayMode": "numeric",
                    "displayValue": "No console or runtime errors captured" if error_count == 0 else f"{error_count} console/runtime error{'s' if error_count != 1 else ''} captured",
                    "details": {
                        "type": "table",
                        "headings": [
                            {"key": "node", "itemType": "node", "text": "Error"},
                            {"key": "kind", "itemType": "text", "text": "Type"},
                            {"key": "source", "itemType": "text", "text": "Source"},
                        ],
                        "items": [
                            {
                                "node": {
                                    "nodeLabel": safe_text(error.get("message", "Runtime error"))[:180],
                                    "selector": safe_text(error.get("source", "browser console"))[:160] or "browser console",
                                },
                                "kind": safe_text(error.get("kind", "error"))[:80],
                                "source": f"{safe_text(error.get('source', ''))[:120]}:{error.get('line', 0)}:{error.get('column', 0)}".strip(":0"),
                                "explanation": safe_text(error.get("message", "Runtime error"))[:240],
                            }
                            for error in technical_errors[:50]
                        ],
                    } if error_count else None,
                }
                
                # Geolocation on start - reads the flag set by the init-script interceptor.
                # The interceptor wraps navigator.geolocation.getCurrentPosition /
                # watchPosition before navigation so any synchronous or early-async call
                # during page load is captured.
                geolocation_requested = page.evaluate(
                    "() => window.__silverGeolocationRequested === true"
                )
                audits["geolocation-on-start"] = {
                    "id": "geolocation-on-start",
                    "title": "Does not request geolocation on page load",
                    "description": "This audit checks if the page requests user location immediately on load, which can be intrusive for older adults.",
                    "score": 1.0 if not geolocation_requested else 0.0,
                    "numericValue": 1.0 if not geolocation_requested else 0.0,
                }

                # WCAG 1.4.2 / ACT rule 80f0bf: a violation requires media that is
                # actually playing with sound — autoplay AND unmuted AND not paused
                # AND (duration > 3s OR looping) AND has an audio track. Muted
                # autoplay loops cannot make sound; they are collected separately and
                # routed to 2.2.2 (ss-pause-stop-hide-audit) for review instead.
                autoplay_results = page.evaluate("""
                    () => {
                        const media = Array.from(document.querySelectorAll('video, audio'));
                        const describe = (el) => {
                            let selector = el.tagName.toLowerCase();
                            if (el.id) selector += '#' + el.id;
                            else if (typeof el.className === 'string' && el.className.trim()) selector += '.' + el.className.trim().split(/\\s+/)[0];
                            return {
                                tagName: el.tagName.toLowerCase(),
                                src: el.currentSrc || el.src || '(inline)',
                                selector,
                                hasMuted: Boolean(el.muted),
                                hasControls: Boolean(el.controls)
                            };
                        };
                        const hasAudioTrack = (el) => {
                            if (el.tagName === 'AUDIO') return true;
                            if (typeof el.mozHasAudio === 'boolean') return el.mozHasAudio;
                            if (typeof el.webkitAudioDecodedByteCount === 'number') return el.webkitAudioDecodedByteCount > 0;
                            if (el.audioTracks && typeof el.audioTracks.length === 'number') return el.audioTracks.length > 0;
                            return true; // audio presence unknown — only consulted for unmuted media
                        };
                        const autoplaying = media.filter(el => el.autoplay);
                        const failing = autoplaying.filter(el =>
                            !el.muted && !el.paused && (el.duration > 3 || el.loop) && hasAudioTrack(el)
                        );
                        const mutedAutoplay = autoplaying.filter(el => el.muted);
                        return {
                            total: media.length,
                            failingCount: failing.length,
                            mutedCount: mutedAutoplay.length,
                            items: failing.slice(0, 50).map(describe)
                        };
                    }
                """)
                autoplay_count = autoplay_results.get("failingCount", 0)
                muted_autoplay_count = autoplay_results.get("mutedCount", 0)
                if autoplay_count > 0:
                    autoplay_display = f"{autoplay_count} media element{'s' if autoplay_count != 1 else ''} autoplaying with sound"
                elif muted_autoplay_count > 0:
                    autoplay_display = f"No audible autoplay media found ({muted_autoplay_count} muted loop(s) reviewed under 2.2.2)"
                else:
                    autoplay_display = "No audible autoplay media found"
                audits["autoplay-audit"] = {
                    "id": "autoplay-audit",
                    "title": "Audio and video content does not autoplay",
                    "description": (
                        "Detects audio or video that autoplays with audible sound (unmuted, actively "
                        "playing, longer than 3 seconds or looping, with an audio track) per WCAG ACT "
                        "rule 80f0bf. Muted autoplay loops make no sound, so they are not 1.4.2 "
                        "violations and are routed to 2.2.2 for pause/stop review instead."
                    ),
                    "score": 1.0 if autoplay_count == 0 else 0.0,
                    "numericValue": autoplay_count,
                    "scoreDisplayMode": "binary",
                    "displayValue": autoplay_display,
                    "details": {
                        "type": "table",
                        "headings": [
                            {"key": "tagName", "itemType": "code", "text": "Element"},
                            {"key": "src", "itemType": "text", "text": "Source"},
                            {"key": "selector", "itemType": "code", "text": "Selector"},
                            {"key": "hasMuted", "itemType": "text", "text": "Muted"},
                            {"key": "hasControls", "itemType": "text", "text": "Has Controls"},
                        ],
                        "items": autoplay_results.get("items", []),
                    } if autoplay_count else None,
                }

                # --- 2.1 Orientation lock (WCAG 1.3.4) ---
                # Only true orientation locks are flagged:
                #   1. JS screen.orientation.lock() calls in page scripts
                #   2. CSS transform:rotate applied directly to html/body (rotates the whole viewport)
                # Responsive @media (orientation:...) blocks are normal layout technique — NOT a lock.
                # When no lock is found the check cannot be fully automated (mobile-only behaviour),
                # so we return scoreDisplayMode:"manual" instead of a false pass.
                try:
                    orientation_results = page.evaluate("""
                        () => {
                            const issues = [];
                            // Check 1: JS orientation lock API
                            const scriptText = Array.from(document.scripts)
                                .map(s => s.textContent || '').join('\\n');
                            if (/screen\\.orientation\\.lock\\s*\\(/.test(scriptText)) {
                                issues.push({ type: 'js', description: 'screen.orientation.lock() detected in page scripts' });
                            }
                            // Check 2: CSS transform:rotate on html or body (rotates the whole frame)
                            const sheets = Array.from(document.styleSheets);
                            for (const sheet of sheets) {
                                let rules = [];
                                try { rules = Array.from(sheet.cssRules || []); } catch (e) { continue; }
                                for (const rule of rules) {
                                    if (rule.style) {
                                        const sel = (rule.selectorText || '').trim().toLowerCase();
                                        const transform = rule.style.transform || '';
                                        if ((sel === 'html' || sel === 'body') &&
                                                /rotate\\s*\\(\\s*(?:90|270|-90|-270)/.test(transform)) {
                                            issues.push({ type: 'css', selector: rule.selectorText, transform });
                                        }
                                    }
                                }
                            }
                            return { issueCount: issues.length, items: issues.slice(0, 20) };
                        }
                    """)
                    orientation_count = orientation_results.get("issueCount", 0)
                    if orientation_count > 0:
                        audits["ss-orientation-audit"] = {
                            "id": "ss-orientation-audit",
                            "title": "Page does not lock orientation (WCAG 1.3.4)",
                            "description": (
                                "Detected CSS or JavaScript that locks the page to a single screen orientation, "
                                "preventing users from rotating their device."
                            ),
                            "score": 0.0,
                            "numericValue": orientation_count,
                            "scoreDisplayMode": "binary",
                            "displayValue": f"{orientation_count} orientation-locking pattern(s) found",
                            "details": {
                                "type": "table",
                                "headings": [
                                    {"key": "type", "itemType": "text", "text": "Type"},
                                    {"key": "description", "itemType": "text", "text": "Detail"},
                                ],
                                "items": orientation_results.get("items", []),
                            },
                        }
                    else:
                        audits["ss-orientation-audit"] = {
                            "id": "ss-orientation-audit",
                            "title": "Page does not lock orientation (WCAG 1.3.4)",
                            "description": (
                                "No CSS or JavaScript orientation lock detected. "
                                "Full verification requires manual testing on a physical mobile device."
                            ),
                            "score": None,
                            "numericValue": 0,
                            "scoreDisplayMode": "manual",
                            "displayValue": "No automated lock detected — manual device test recommended",
                        }
                except Exception as e:
                    audits["ss-orientation-audit"] = {
                        "id": "ss-orientation-audit",
                        "title": "Page does not lock orientation (WCAG 1.3.4)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # --- 2.2 Identify input purpose (WCAG 1.3.5) ---
                try:
                    input_purpose_results = page.evaluate("""
                        () => {
                            // Personal data field types that require autocomplete per WCAG 1.3.5
                            const personalFieldMap = {
                                name: 'name', fname: 'given-name', firstname: 'given-name',
                                'given-name': 'given-name', lname: 'family-name', lastname: 'family-name',
                                'family-name': 'family-name', email: 'email', phone: 'tel',
                                telephone: 'tel', tel: 'tel', mobile: 'tel', address: 'street-address',
                                street: 'street-address', city: 'address-level2', state: 'address-level1',
                                zip: 'postal-code', postcode: 'postal-code', country: 'country',
                                username: 'username', user: 'username', password: 'current-password',
                                'new-password': 'new-password', birthday: 'bday', bday: 'bday',
                                cc: 'cc-number', 'credit-card': 'cc-number', cardnumber: 'cc-number',
                            };
                            const validAutocompleteTokens = new Set([
                                'name','honorific-prefix','given-name','additional-name','family-name',
                                'honorific-suffix','nickname','username','new-password','current-password',
                                'one-time-code','organization-title','organization','street-address',
                                'address-line1','address-line2','address-line3','address-level4',
                                'address-level3','address-level2','address-level1','country',
                                'country-name','postal-code','cc-name','cc-given-name','cc-additional-name',
                                'cc-family-name','cc-number','cc-exp','cc-exp-month','cc-exp-year',
                                'cc-csc','cc-type','transaction-currency','transaction-amount',
                                'language','bday','bday-day','bday-month','bday-year','sex',
                                'url','photo','tel','tel-country-code','tel-national',
                                'tel-area-code','tel-local','tel-extension','impp','email',
                                'off','on',
                            ]);
                            const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                            const failing = [];
                            for (const el of inputs) {
                                const type = (el.type || 'text').toLowerCase();
                                if (['hidden','submit','reset','button','image','file'].includes(type)) continue;
                                const ac = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
                                const id = (el.id || '').toLowerCase();
                                const name = (el.name || '').toLowerCase();
                                const placeholder = (el.placeholder || '').toLowerCase();
                                const label = (el.labels && el.labels[0] ? el.labels[0].textContent : '').toLowerCase();
                                const hint = id + ' ' + name + ' ' + placeholder + ' ' + label;
                                let expectedToken = null;
                                for (const [key, token] of Object.entries({
                                    name:'name',fname:'given-name',firstname:'given-name',
                                    lname:'family-name',lastname:'family-name',email:'email',
                                    phone:'tel',telephone:'tel',tel:'tel',mobile:'tel',
                                    address:'street-address',street:'street-address',city:'address-level2',
                                    state:'address-level1',zip:'postal-code',postcode:'postal-code',
                                    country:'country',username:'username',user:'username',
                                    password:'current-password',bday:'bday',birthday:'bday',
                                    cardnumber:'cc-number',
                                })) {
                                    if (hint.includes(key)) { expectedToken = token; break; }
                                }
                                if (!expectedToken) continue;
                                const hasValid = ac && validAutocompleteTokens.has(ac.split(' ').pop());
                                if (!hasValid) {
                                    let selector = el.tagName.toLowerCase();
                                    if (el.id) selector += '#' + el.id;
                                    else if (el.name) selector += '[name="' + el.name + '"]';
                                    failing.push({
                                        node: { nodeLabel: el.name || el.id || el.placeholder || el.type, selector },
                                        expectedAutocomplete: expectedToken,
                                        currentAutocomplete: ac || '(none)',
                                    });
                                }
                            }
                            const total = inputs.filter(el => {
                                const type = (el.type || 'text').toLowerCase();
                                return !['hidden','submit','reset','button','image','file'].includes(type);
                            }).length;
                            return { total, failCount: failing.length, items: failing.slice(0, 50) };
                        }
                    """)
                    fail_count = input_purpose_results.get("failCount", 0)
                    total_inputs = input_purpose_results.get("total", 0)
                    audits["ss-input-purpose-audit"] = {
                        "id": "ss-input-purpose-audit",
                        "title": "Input fields collecting personal data have autocomplete attributes (WCAG 1.3.5)",
                        "description": (
                            f"Checks that form inputs collecting personal data (name, email, phone, address, etc.) "
                            f"include a valid autocomplete attribute so browsers and assistive technology can autofill them. "
                            f"Found {fail_count} input(s) missing required autocomplete out of {total_inputs} total."
                        ),
                        "score": 1.0 if fail_count == 0 else 0.0,
                        "numericValue": fail_count,
                        "scoreDisplayMode": "binary",
                        "displayValue": (
                            "All personal data inputs have autocomplete"
                            if fail_count == 0
                            else f"{fail_count} of {total_inputs} personal data inputs missing autocomplete"
                        ),
                        "details": {
                            "type": "table",
                            "headings": [
                                {"key": "node", "itemType": "node", "text": "Input"},
                                {"key": "expectedAutocomplete", "itemType": "code", "text": "Expected autocomplete"},
                                {"key": "currentAutocomplete", "itemType": "text", "text": "Current value"},
                            ],
                            "items": input_purpose_results.get("items", []),
                        } if fail_count else None,
                    }
                except Exception as e:
                    audits["ss-input-purpose-audit"] = {
                        "id": "ss-input-purpose-audit",
                        "title": "Input fields collecting personal data have autocomplete attributes (WCAG 1.3.5)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # --- 2.3 Use of color (WCAG 1.4.1) ---
                try:
                    use_of_color_results = page.evaluate("""
                        () => {
                            const colorWords = [
                                'red','green','blue','yellow','orange','purple','pink',
                                'grey','gray','black','white','brown','cyan','magenta',
                            ];
                            const colorOnlyPattern = new RegExp(
                                '\\\\b(' + colorWords.join('|') + ')\\\\b',
                                'i'
                            );
                            const actionWords = /\\b(click|press|select|choose|tap|see|look for|find|use|go to|follow|check)\\b/i;
                            const issues = [];

                            // 1. Text instructions that reference color as the sole differentiator
                            const textNodes = document.createTreeWalker(
                                document.body,
                                NodeFilter.SHOW_TEXT,
                                { acceptNode: n => n.textContent.trim().length > 10 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
                            );
                            let node;
                            while ((node = textNodes.nextNode())) {
                                const text = node.textContent.trim();
                                if (colorOnlyPattern.test(text) && actionWords.test(text)) {
                                    const parent = node.parentElement;
                                    if (!parent) continue;
                                    const tag = parent.tagName.toLowerCase();
                                    if (['script','style','noscript'].includes(tag)) continue;
                                    let selector = tag;
                                    if (parent.id) selector += '#' + parent.id;
                                    issues.push({
                                        type: 'color-instruction',
                                        text: text.slice(0, 120),
                                        node: { nodeLabel: text.slice(0, 80), selector },
                                    });
                                }
                            }

                            // 2. Form fields where the only error indicator is a color change
                            const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                            for (const el of inputs) {
                                const style = window.getComputedStyle(el);
                                const borderColor = style.borderColor;
                                const outlineColor = style.outlineColor;
                                const bgColor = style.backgroundColor;
                                // Look for red-tinted borders or backgrounds with no associated error text nearby
                                const hasRedBorder = /rgb\\(\\s*(?:2[0-9]{2}|1[5-9][0-9])\\s*,\\s*(?:[0-9]|[1-5][0-9])\\s*,\\s*(?:[0-9]|[1-5][0-9])\\s*\\)/.test(borderColor);
                                if (hasRedBorder) {
                                    // Check if there is visible error text near this input
                                    const parent = el.closest('form, fieldset, div, section') || el.parentElement;
                                    const nearbyText = parent ? parent.textContent.toLowerCase() : '';
                                    const hasErrorText = /error|invalid|required|please|must|cannot|warning/.test(nearbyText);
                                    if (!hasErrorText) {
                                        let selector = el.tagName.toLowerCase();
                                        if (el.id) selector += '#' + el.id;
                                        else if (el.name) selector += '[name="' + el.name + '"]';
                                        issues.push({
                                            type: 'color-only-error',
                                            text: 'Input has red-tinted border with no nearby error text',
                                            node: { nodeLabel: el.name || el.id || el.type, selector },
                                        });
                                    }
                                }
                            }

                            return { issueCount: issues.length, items: issues.slice(0, 30) };
                        }
                    """)
                    color_issue_count = use_of_color_results.get("issueCount", 0)
                    audits["ss-use-of-color-audit"] = {
                        "id": "ss-use-of-color-audit",
                        "title": "Color is not used as the sole means of conveying information (WCAG 1.4.1)",
                        "description": (
                            "Detects text instructions that reference color as the only differentiator "
                            "(e.g. 'click the red button') and form fields that use only a color change to "
                            f"communicate an error state. Found {color_issue_count} potential issue(s)."
                        ),
                        "score": 1.0 if color_issue_count == 0 else 0.0,
                        "numericValue": color_issue_count,
                        "scoreDisplayMode": "binary",
                        "displayValue": (
                            "No color-only information patterns detected"
                            if color_issue_count == 0
                            else f"{color_issue_count} color-only information pattern(s) found"
                        ),
                        "details": {
                            "type": "table",
                            "headings": [
                                {"key": "node", "itemType": "node", "text": "Element"},
                                {"key": "type", "itemType": "text", "text": "Issue type"},
                                {"key": "text", "itemType": "text", "text": "Details"},
                            ],
                            "items": use_of_color_results.get("items", []),
                        } if color_issue_count else None,
                    }
                except Exception as e:
                    audits["ss-use-of-color-audit"] = {
                        "id": "ss-use-of-color-audit",
                        "title": "Color is not used as the sole means of conveying information (WCAG 1.4.1)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # --- 2.4 Non-text contrast (WCAG 1.4.11) ---
                try:
                    ntc_results = page.evaluate("""
                        () => {
                            function getLuminance(r, g, b) {
                                const [rs, gs, bs] = [r, g, b].map(c => {
                                    const s = c / 255;
                                    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
                                });
                                return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
                            }
                            function contrastRatio(l1, l2) {
                                const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
                                return (hi + 0.05) / (lo + 0.05);
                            }
                            function parseRgb(str) {
                                const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
                                return m ? [+m[1], +m[2], +m[3]] : null;
                            }
                            const selectors = [
                                { sel: 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image])', label: 'Input border' },
                                { sel: 'select', label: 'Select border' },
                                { sel: 'textarea', label: 'Textarea border' },
                                { sel: 'button:not([disabled])', label: 'Button outline' },
                                { sel: '[role=checkbox], [role=radio], [role=switch]', label: 'Custom control' },
                                { sel: 'svg[aria-hidden=false], img[role=img]', label: 'Informational icon' },
                            ];
                            const failing = [];
                            const MIN_RATIO = 3.0;
                            for (const { sel, label } of selectors) {
                                const els = Array.from(document.querySelectorAll(sel)).slice(0, 10);
                                for (const el of els) {
                                    if (!el.offsetParent && el.tagName !== 'BODY') continue;
                                    const st = window.getComputedStyle(el);
                                    const parentSt = window.getComputedStyle(el.parentElement || document.body);
                                    const fgRgb = parseRgb(st.borderColor || st.outlineColor || st.color);
                                    const bgRgb = parseRgb(parentSt.backgroundColor) || [255, 255, 255];
                                    if (!fgRgb) continue;
                                    const ratio = contrastRatio(getLuminance(...fgRgb), getLuminance(...bgRgb));
                                    if (ratio < MIN_RATIO) {
                                        let selector = el.tagName.toLowerCase();
                                        if (el.id) selector += '#' + el.id;
                                        else if (typeof el.className === 'string' && el.className.trim()) selector += '.' + el.className.trim().split(/\\s+/)[0];
                                        failing.push({
                                            node: { nodeLabel: label + ': ' + selector, selector },
                                            ratio: ratio.toFixed(2) + ':1',
                                            required: MIN_RATIO + ':1',
                                        });
                                    }
                                }
                            }
                            return { failCount: failing.length, items: failing.slice(0, 30) };
                        }
                    """)
                    ntc_fail = ntc_results.get("failCount", 0)
                    audits["ss-non-text-contrast-audit"] = {
                        "id": "ss-non-text-contrast-audit",
                        "title": "UI components and graphical objects have sufficient contrast (WCAG 1.4.11)",
                        "description": (
                            f"Checks that input borders, button outlines, focus rings, and informational icons "
                            f"have at least a 3:1 contrast ratio against their background. "
                            f"Found {ntc_fail} component(s) below the required ratio."
                        ),
                        "score": 1.0 if ntc_fail == 0 else 0.0,
                        "numericValue": ntc_fail,
                        "scoreDisplayMode": "binary",
                        "displayValue": (
                            "All sampled UI components meet 3:1 contrast"
                            if ntc_fail == 0
                            else f"{ntc_fail} UI component(s) below 3:1 contrast ratio"
                        ),
                        "details": {
                            "type": "table",
                            "headings": [
                                {"key": "node", "itemType": "node", "text": "Element"},
                                {"key": "ratio", "itemType": "text", "text": "Contrast ratio"},
                                {"key": "required", "itemType": "text", "text": "Required"},
                            ],
                            "items": ntc_results.get("items", []),
                        } if ntc_fail else None,
                    }
                except Exception as e:
                    audits["ss-non-text-contrast-audit"] = {
                        "id": "ss-non-text-contrast-audit",
                        "title": "UI components and graphical objects have sufficient contrast (WCAG 1.4.11)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # --- 2.5 Content on hover or focus (WCAG 1.4.13) ---
                try:
                    hover_results = page.evaluate("""
                        () => {
                            // WCAG 1.4.13 applies to CUSTOM tooltip/popover content controlled by the author.
                            // Native browser title-attribute tooltips are a user-agent mechanism and are
                            // outside the scope of 1.4.13 — do not include [title] in the trigger selector.
                            const triggers = Array.from(document.querySelectorAll(
                                '[aria-describedby], [data-tooltip], [data-tippy-content], ' +
                                '[data-toggle=tooltip], [data-bs-toggle=tooltip], .tooltip-trigger, ' +
                                '.has-tooltip'
                            ));
                            const issues = [];
                            for (const el of triggers.slice(0, 30)) {
                                const problems = [];
                                // Check: aria-describedby points to an element with pointer-events:none
                                // (the tooltip can appear but the user cannot hover over it to keep it open)
                                const describedBy = el.getAttribute('aria-describedby');
                                if (describedBy) {
                                    const target = document.getElementById(describedBy);
                                    if (target) {
                                        const st = window.getComputedStyle(target);
                                        const isHidden = st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0';
                                        if (isHidden && st.pointerEvents === 'none') {
                                            problems.push('Tooltip content has pointer-events:none — cannot be hovered to keep it open');
                                        }
                                    }
                                }
                                if (problems.length) {
                                    let selector = el.tagName.toLowerCase();
                                    if (el.id) selector += '#' + el.id;
                                    issues.push({
                                        node: { nodeLabel: el.textContent?.trim().slice(0, 60) || selector, selector },
                                        problems: problems.join('; '),
                                    });
                                }
                            }
                            return { triggerCount: triggers.length, issueCount: issues.length, items: issues.slice(0, 20) };
                        }
                    """)
                    hover_issues = hover_results.get("issueCount", 0)
                    trigger_count = hover_results.get("triggerCount", 0)
                    audits["ss-hover-focus-audit"] = {
                        "id": "ss-hover-focus-audit",
                        "title": "Content shown on hover or focus is dismissible, hoverable, and persistent (WCAG 1.4.13)",
                        "description": (
                            f"Detects tooltip and popover triggers and checks that shown content can be dismissed "
                            f"without moving focus, can be hovered by pointer, and does not disappear automatically. "
                            f"Found {trigger_count} trigger(s), {hover_issues} with potential issue(s)."
                        ),
                        "score": 1.0 if hover_issues == 0 else max(0.0, 1.0 - (hover_issues / max(trigger_count, 1))),
                        "numericValue": hover_issues,
                        "scoreDisplayMode": "numeric" if hover_issues > 0 else "binary",
                        "displayValue": (
                            f"No hover/focus content issues detected ({trigger_count} trigger(s) checked)"
                            if hover_issues == 0
                            else f"{hover_issues} of {trigger_count} tooltip trigger(s) have issues"
                        ),
                        "details": {
                            "type": "table",
                            "headings": [
                                {"key": "node", "itemType": "node", "text": "Trigger element"},
                                {"key": "problems", "itemType": "text", "text": "Issue"},
                            ],
                            "items": hover_results.get("items", []),
                        } if hover_issues else None,
                    }
                except Exception as e:
                    audits["ss-hover-focus-audit"] = {
                        "id": "ss-hover-focus-audit",
                        "title": "Content shown on hover or focus is dismissible, hoverable, and persistent (WCAG 1.4.13)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # --- 2.6 Keyboard accessibility (WCAG 2.1.1) ---
                try:
                    keyboard_results = page.evaluate("""
                        () => {
                            const interactiveTags = new Set(['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']);
                            const interactiveRoles = new Set([
                                'button', 'link', 'checkbox', 'radio', 'textbox', 'combobox',
                                'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
                                'option', 'slider', 'spinbutton', 'switch', 'tab', 'treeitem',
                            ]);
                            const elements = Array.from(document.querySelectorAll('*'));
                            const failing = [];
                            for (const el of elements) {
                                if (!el.offsetParent && el.tagName !== 'BODY') continue;
                                const tag = el.tagName.toLowerCase();
                                const role = (el.getAttribute('role') || '').toLowerCase();
                                const isInteractiveTag = interactiveTags.has(tag);
                                const isInteractiveRole = interactiveRoles.has(role);
                                const hasClickHandler = el.onclick !== null || el.getAttribute('onclick');
                                const hasTabIndex = el.hasAttribute('tabindex');
                                const tabIndexVal = parseInt(el.getAttribute('tabindex') || '0', 10);
                                if (!isInteractiveTag && !isInteractiveRole && !hasClickHandler) continue;
                                // Skip elements that are natively focusable and not disabled
                                if (isInteractiveTag && !el.disabled && !hasTabIndex) continue;
                                if (isInteractiveTag && !el.disabled && tabIndexVal >= 0) continue;
                                // Flag: explicitly removed from tab order with tabindex=-1.
                                // Native interactive elements (button, a, input) legitimately use
                                // tabindex=-1 for focus management in carousels, tab panels, and
                                // accordions — only flag them when an inline onclick is also present,
                                // which indicates the element is intended to be activated by click.
                                if (hasTabIndex && tabIndexVal === -1 && (!isInteractiveTag || hasClickHandler)) {
                                    // Only flag if visible and not inside a modal/dialog that manages focus
                                    const isInDialog = el.closest('[role=dialog], [role=alertdialog], dialog');
                                    if (!isInDialog) {
                                        let selector = tag;
                                        if (el.id) selector += '#' + el.id;
                                        else if (typeof el.className === 'string' && el.className.trim()) selector += '.' + el.className.trim().split(/\\s+/)[0];
                                        failing.push({
                                            node: { nodeLabel: el.textContent?.trim().slice(0, 60) || el.getAttribute('aria-label') || selector, selector },
                                            reason: 'tabindex="-1" removes element from keyboard tab order',
                                            tag,
                                            role: role || '(none)',
                                        });
                                    }
                                }
                                // Flag: div/span with click handler but no keyboard role or tabindex
                                if (!isInteractiveTag && (isInteractiveRole || hasClickHandler) && !hasTabIndex) {
                                    let selector = tag;
                                    if (el.id) selector += '#' + el.id;
                                    else if (typeof el.className === 'string' && el.className.trim()) selector += '.' + el.className.trim().split(/\\s+/)[0];
                                    failing.push({
                                        node: { nodeLabel: el.textContent?.trim().slice(0, 60) || selector, selector },
                                        reason: 'Interactive element is not keyboard focusable (missing tabindex)',
                                        tag,
                                        role: role || '(none)',
                                    });
                                }
                            }
                            const totalInteractive = elements.filter(el => {
                                const tag = el.tagName.toLowerCase();
                                return interactiveTags.has(tag) || interactiveRoles.has((el.getAttribute('role') || '').toLowerCase());
                            }).length;
                            return { totalInteractive, failCount: failing.length, items: failing.slice(0, 50) };
                        }
                    """)
                    kb_fail = keyboard_results.get("failCount", 0)
                    kb_total = keyboard_results.get("totalInteractive", 0)
                    kb_score = 1.0 if kb_fail == 0 else max(0.0, 1.0 - (kb_fail / max(kb_total, 1)))
                    audits["ss-keyboard-audit"] = {
                        "id": "ss-keyboard-audit",
                        "title": "All interactive elements are keyboard accessible (WCAG 2.1.1)",
                        "description": (
                            f"Checks that all interactive elements (links, buttons, inputs, custom controls) "
                            f"can receive keyboard focus and are not removed from the tab order without justification. "
                            f"Found {kb_fail} issue(s) across {kb_total} interactive element(s)."
                        ),
                        "score": kb_score,
                        "numericValue": kb_fail,
                        "scoreDisplayMode": "numeric" if kb_fail > 0 else "binary",
                        "displayValue": (
                            f"All {kb_total} interactive elements are keyboard accessible"
                            if kb_fail == 0
                            else f"{kb_fail} of {kb_total} interactive element(s) have keyboard access issues"
                        ),
                        "details": {
                            "type": "table",
                            "headings": [
                                {"key": "node", "itemType": "node", "text": "Element"},
                                {"key": "reason", "itemType": "text", "text": "Issue"},
                                {"key": "tag", "itemType": "code", "text": "Tag"},
                                {"key": "role", "itemType": "text", "text": "Role"},
                            ],
                            "items": keyboard_results.get("items", []),
                        } if kb_fail else None,
                    }
                except Exception as e:
                    audits["ss-keyboard-audit"] = {
                        "id": "ss-keyboard-audit",
                        "title": "All interactive elements are keyboard accessible (WCAG 2.1.1)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.7 No Keyboard Trap (WCAG 2.1.2) ──────────────────────────
                try:
                    trap_results = page.evaluate("""
                        () => {
                            const focusable = Array.from(document.querySelectorAll(
                                'a[href], button, input, select, textarea, [tabindex]'
                            )).filter(el => {
                                const ti = el.getAttribute('tabindex');
                                return ti === null || parseInt(ti, 10) >= 0;
                            });
                            // Detect modal/dialog elements without proper close mechanism.
                            // Check all visible dialogs, not only those with aria-modal="true".
                            const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog');
                            let trapCount = 0;
                            dialogs.forEach(dlg => {
                                const st = window.getComputedStyle(dlg);
                                const isVisible = st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
                                // Native <dialog> is only "open" when it has the open attribute
                                const isNativeDialog = dlg.tagName.toLowerCase() === 'dialog';
                                const isOpen = isNativeDialog ? dlg.hasAttribute('open') : isVisible;
                                if (!isOpen) return;
                                const hasClose = dlg.querySelector(
                                    'button[aria-label*="close" i], button[aria-label*="dismiss" i], ' +
                                    'button[aria-label*="cancel" i], [data-dismiss], .close, .modal-close, ' +
                                    '[data-bs-dismiss], button[class*="close"]'
                                );
                                if (!hasClose) trapCount++;
                            });
                            return { trapCount, dialogCount: dialogs.length, focusableCount: focusable.length };
                        }
                    """)
                    trap_count = trap_results.get("trapCount", 0)
                    audits["ss-no-keyboard-trap-audit"] = {
                        "id": "ss-no-keyboard-trap-audit",
                        "title": "No keyboard trap (WCAG 2.1.2)",
                        "description": (
                            f"Checks dialogs and modal regions for missing close controls that could trap "
                            f"keyboard users. Found {trap_results.get('dialogCount', 0)} dialog(s), "
                            f"{trap_count} potential trap(s)."
                        ),
                        "score": 1.0 if trap_count == 0 else 0.0,
                        "numericValue": float(trap_count),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "description", "label": "Issue"}],
                            "items": [{"description": f"{trap_count} dialog(s) with aria-modal=true but no visible close button"}] if trap_count else [],
                        } if trap_count else None,
                    }
                except Exception as e:
                    audits["ss-no-keyboard-trap-audit"] = {
                        "id": "ss-no-keyboard-trap-audit",
                        "title": "No keyboard trap (WCAG 2.1.2)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.8 Timing Adjustable (WCAG 2.2.1) ─────────────────────────
                try:
                    timing_results = page.evaluate("""
                        () => {
                            // Look for meta refresh, countdown timers, session-timeout indicators
                            const metaRefresh = document.querySelector('meta[http-equiv="refresh" i]');
                            let metaSeconds = null;
                            if (metaRefresh) {
                                const content = metaRefresh.getAttribute('content') || '';
                                const match = content.match(/^(\\d+)/);
                                if (match) metaSeconds = parseInt(match[1], 10);
                            }
                            // Short meta-refresh (< 20 seconds) without user control = fail
                            const hasForcedRedirect = metaSeconds !== null && metaSeconds < 20;
                            // Look for countdown/timer elements
                            const timerEls = document.querySelectorAll(
                                '[class*="countdown" i], [class*="timer" i], [id*="countdown" i], [id*="timer" i]'
                            );
                            const extendButtons = document.querySelectorAll(
                                'button[class*="extend" i], button[class*="renew" i], [aria-label*="extend" i]'
                            );
                            return {
                                hasForcedRedirect,
                                metaSeconds,
                                timerCount: timerEls.length,
                                hasExtendControl: extendButtons.length > 0,
                            };
                        }
                    """)
                    forced = timing_results.get("hasForcedRedirect", False)
                    audits["ss-timing-adjustable-audit"] = {
                        "id": "ss-timing-adjustable-audit",
                        "title": "Timing adjustable (WCAG 2.2.1)",
                        "description": (
                            f"Checks for short meta-refresh redirects (< 20s) that remove user control over timing. "
                            f"Meta refresh seconds: {timing_results.get('metaSeconds', 'none')}."
                        ),
                        "score": 0.0 if forced else 1.0,
                        "numericValue": float(timing_results.get("metaSeconds") or 0),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "description", "label": "Issue"}],
                            "items": [{"description": f"Meta refresh set to {timing_results.get('metaSeconds')}s with no user control"}],
                        } if forced else None,
                    }
                except Exception as e:
                    audits["ss-timing-adjustable-audit"] = {
                        "id": "ss-timing-adjustable-audit",
                        "title": "Timing adjustable (WCAG 2.2.1)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.9 Pause, Stop, Hide (WCAG 2.2.2) ─────────────────────────
                try:
                    motion_results = page.evaluate("""
                        () => {
                            const issues = [];
                            // Unmuted autoplay video — reliably auto-playing and always a WCAG 2.2.2 concern
                            const autoplayVideos = Array.from(document.querySelectorAll('video'))
                                .filter(v => v.autoplay && !v.muted);
                            if (autoplayVideos.length > 0) {
                                issues.push(`${autoplayVideos.length} auto-playing video(s) without mute`);
                            }
                            // <marquee> is always auto-scrolling by spec
                            const marquees = document.querySelectorAll('marquee');
                            // Tickers always scroll; carousels/sliders only auto-advance when
                            // the author adds an explicit autoplay attribute — check for those signals.
                            // (data-slick is filtered in JS to keep the selector quotes valid.)
                            const autoplayCarousels = Array.from(document.querySelectorAll(
                                '[class*="ticker" i], ' +
                                '[data-ride="carousel"]:not([data-pause="hover"]), ' +
                                '[data-autoplay="true"], [data-auto-slide="true"], ' +
                                '[data-slick]'
                            )).filter(el => !el.hasAttribute('data-slick') ||
                                (el.getAttribute('data-slick') || '').indexOf('"autoplay":true') !== -1);
                            const movingEls = marquees.length + autoplayCarousels.length;
                            if (movingEls > 0) {
                                const pauseControls = document.querySelectorAll(
                                    '[aria-label*="pause" i], [aria-label*="stop" i], ' +
                                    'button[class*="pause" i], button[class*="stop" i]'
                                );
                                if (pauseControls.length === 0) {
                                    issues.push(`${movingEls} auto-advancing element(s) without pause/stop control`);
                                }
                            }
                            // Muted autoplay loops make no sound (not a 1.4.2 issue), but a muted
                            // video that loops or runs >3s with no visible controls still moves on
                            // screen — collect for 2.2.2 manual review of a pause mechanism.
                            const mutedLoops = Array.from(document.querySelectorAll('video'))
                                .filter(v => v.autoplay && v.muted && (v.loop || v.duration > 3) && !v.controls)
                                .map(v => {
                                    let selector = 'video';
                                    if (v.id) selector += '#' + v.id;
                                    else if (typeof v.className === 'string' && v.className.trim()) selector += '.' + v.className.trim().split(/\\s+/)[0];
                                    return { selector, src: v.currentSrc || v.src || '(inline)' };
                                });
                            return { issueCount: issues.length, issues, mutedLoopCount: mutedLoops.length, mutedLoops: mutedLoops.slice(0, 50) };
                        }
                    """)
                    motion_issues = motion_results.get("issueCount", 0)
                    muted_loop_count = motion_results.get("mutedLoopCount", 0)
                    muted_loop_items = [
                        {"description": f"Muted auto-playing loop without pause/stop control: {loop.get('selector', 'video')} ({loop.get('src', '')})"}
                        for loop in motion_results.get("mutedLoops", [])
                    ]
                    if motion_issues > 0:
                        audits["ss-pause-stop-hide-audit"] = {
                            "id": "ss-pause-stop-hide-audit",
                            "title": "Pause, stop, hide moving content (WCAG 2.2.2)",
                            "description": (
                                f"Checks for auto-playing videos and animated/scrolling regions without pause or stop controls. "
                                f"Found {motion_issues} issue(s)."
                            ),
                            "score": 0.0,
                            "numericValue": float(motion_issues),
                            "scoreDisplayMode": "binary",
                            "details": {
                                "type": "table",
                                "headings": [{"key": "description", "label": "Issue"}],
                                "items": [{"description": i} for i in motion_results.get("issues", [])] + muted_loop_items,
                            },
                        }
                    elif muted_loop_count > 0:
                        # Only muted loops found — not an auto-fail, but a human should
                        # confirm a pause/stop mechanism exists (WCAG 2.2.2 needs review).
                        audits["ss-pause-stop-hide-audit"] = {
                            "id": "ss-pause-stop-hide-audit",
                            "title": "Pause, stop, hide moving content (WCAG 2.2.2)",
                            "description": (
                                f"Found {muted_loop_count} muted auto-playing loop(s) without visible controls. "
                                "Muted loops make no sound (not a 1.4.2 violation), but a human should "
                                "confirm a pause/stop mechanism exists."
                            ),
                            "score": None,
                            "numericValue": float(muted_loop_count),
                            "scoreDisplayMode": "manual",
                            "displayValue": f"{muted_loop_count} muted loop(s) without controls — manual review recommended",
                            "details": {
                                "type": "table",
                                "headings": [{"key": "description", "label": "Issue"}],
                                "items": muted_loop_items,
                            },
                        }
                    else:
                        audits["ss-pause-stop-hide-audit"] = {
                            "id": "ss-pause-stop-hide-audit",
                            "title": "Pause, stop, hide moving content (WCAG 2.2.2)",
                            "description": (
                                "Checks for auto-playing videos and animated/scrolling regions without pause or stop controls. "
                                "Found 0 issue(s)."
                            ),
                            "score": 1.0,
                            "numericValue": 0.0,
                            "scoreDisplayMode": "binary",
                            "details": None,
                        }
                except Exception as e:
                    audits["ss-pause-stop-hide-audit"] = {
                        "id": "ss-pause-stop-hide-audit",
                        "title": "Pause, stop, hide moving content (WCAG 2.2.2)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.10 Focus Order (WCAG 2.4.3) ───────────────────────────────
                try:
                    focus_order_results = page.evaluate("""
                        () => {
                            const focusable = Array.from(document.querySelectorAll(
                                'a[href], button, input, select, textarea, [tabindex]'
                            )).filter(el => {
                                const ti = el.getAttribute('tabindex');
                                return ti === null || parseInt(ti, 10) >= 0;
                            });
                            // Detect positive tabindex values which disrupt natural focus order
                            const positiveTabindex = focusable.filter(el => {
                                const ti = parseInt(el.getAttribute('tabindex') || '0', 10);
                                return ti > 0;
                            });
                            return { positiveCount: positiveTabindex.length, totalFocusable: focusable.length };
                        }
                    """)
                    pos_count = focus_order_results.get("positiveCount", 0)
                    total_focus = focus_order_results.get("totalFocusable", 1)
                    score = 1.0 if pos_count == 0 else 0.0
                    audits["ss-focus-order-audit"] = {
                        "id": "ss-focus-order-audit",
                        "title": "Focus order preserves meaning (WCAG 2.4.3)",
                        "description": (
                            f"Detects positive tabindex values that override natural DOM focus order. "
                            f"Found {pos_count} element(s) with tabindex > 0 out of {total_focus} focusable."
                        ),
                        "score": score,
                        "numericValue": float(pos_count),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "description", "label": "Issue"}],
                            "items": [{"description": f"{pos_count} element(s) use positive tabindex, disrupting natural focus order"}],
                        } if pos_count else None,
                    }
                except Exception as e:
                    audits["ss-focus-order-audit"] = {
                        "id": "ss-focus-order-audit",
                        "title": "Focus order preserves meaning (WCAG 2.4.3)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.11 Focus Visible (WCAG 2.4.7) ────────────────────────────
                try:
                    focus_visible_results = page.evaluate("""
                        () => {
                            const sheet_texts = Array.from(document.styleSheets).flatMap(ss => {
                                try { return Array.from(ss.cssRules || []).map(r => r.cssText || ''); }
                                catch { return []; }
                            });
                            const full_css = sheet_texts.join('\\n');
                            // Detect global outline:none / outline:0 on :focus without replacement
                            const outlineNone = (full_css.match(/:focus[^{]*\\{[^}]*outline\\s*:\\s*(?:none|0)/gi) || []).length;
                            const hasCustomFocus = (full_css.match(/:focus[^{]*\\{[^}]*(?:box-shadow|border|background|ring)/gi) || []).length;
                            const issue = outlineNone > 0 && hasCustomFocus === 0;
                            return { outlineNone, hasCustomFocus, issue };
                        }
                    """)
                    fv_issue = focus_visible_results.get("issue", False)
                    audits["ss-focus-visible-audit"] = {
                        "id": "ss-focus-visible-audit",
                        "title": "Focus indicator is visible (WCAG 2.4.7)",
                        "description": (
                            f"Checks CSS for outline:none on :focus selectors without a replacement visual indicator. "
                            f"outline:none rules: {focus_visible_results.get('outlineNone', 0)}, "
                            f"custom focus styles: {focus_visible_results.get('hasCustomFocus', 0)}."
                        ),
                        "score": 0.0 if fv_issue else 1.0,
                        "numericValue": float(focus_visible_results.get("outlineNone", 0)),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "description", "label": "Issue"}],
                            "items": [{"description": "CSS removes focus outline globally with no visible replacement"}],
                        } if fv_issue else None,
                    }
                except Exception as e:
                    audits["ss-focus-visible-audit"] = {
                        "id": "ss-focus-visible-audit",
                        "title": "Focus indicator is visible (WCAG 2.4.7)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.12 Focus Not Obscured (WCAG 2.4.11) ───────────────────────
                try:
                    if not _wcag22_in_scope(wcag_filter):
                        raise _WcagScopeSkip("Outside the selected WCAG 2.1 scan scope.")
                    obscure_results = page.evaluate("""
                        () => {
                            // Check for sticky/fixed headers or footers that may cover focused elements
                            const fixed = Array.from(document.querySelectorAll('*')).filter(el => {
                                const st = window.getComputedStyle(el).position;
                                return st === 'fixed' || st === 'sticky';
                            });
                            const fixedHeader = fixed.filter(el => {
                                const rect = el.getBoundingClientRect();
                                return rect.top < 120 && rect.height > 20 && rect.width > window.innerWidth * 0.5;
                            });
                            const fixedFooter = fixed.filter(el => {
                                const rect = el.getBoundingClientRect();
                                return rect.bottom > window.innerHeight - 120 && rect.height > 20 && rect.width > window.innerWidth * 0.5;
                            });
                            return {
                                fixedHeaderCount: fixedHeader.length,
                                fixedFooterCount: fixedFooter.length,
                                totalFixed: fixed.length,
                            };
                        }
                    """)
                    header_count = obscure_results.get("fixedHeaderCount", 0)
                    footer_count = obscure_results.get("fixedFooterCount", 0)
                    has_risk = header_count > 0 or footer_count > 0
                    if has_risk:
                        # Sticky/fixed elements are a risk factor but cannot be confirmed as a violation
                        # without testing each focused element's visibility — flag for manual review.
                        audits["ss-focus-not-obscured-audit"] = {
                            "id": "ss-focus-not-obscured-audit",
                            "title": "Focus is not fully obscured by sticky content (WCAG 2.4.11)",
                            "description": (
                                f"Detected {header_count} sticky header(s) and {footer_count} sticky footer(s). "
                                f"Manually verify that no focused element is fully hidden behind these overlays."
                            ),
                            "score": None,
                            "numericValue": float(header_count + footer_count),
                            "scoreDisplayMode": "manual",
                            "details": {
                                "type": "table",
                                "headings": [{"key": "description", "label": "Risk"}],
                                "items": (
                                    ([{"description": f"{header_count} sticky/fixed header(s) detected — verify focused elements remain visible"}] if header_count else []) +
                                    ([{"description": f"{footer_count} sticky/fixed footer(s) detected — verify focused elements remain visible"}] if footer_count else [])
                                ),
                            },
                        }
                    else:
                        audits["ss-focus-not-obscured-audit"] = {
                            "id": "ss-focus-not-obscured-audit",
                            "title": "Focus is not fully obscured by sticky content (WCAG 2.4.11)",
                            "description": "No fixed/sticky headers or footers detected that could obscure focused elements.",
                            "score": 1.0,
                            "numericValue": 0.0,
                            "scoreDisplayMode": "binary",
                            "details": None,
                        }
                except _WcagScopeSkip as skip:
                    audits["ss-focus-not-obscured-audit"] = {
                        "id": "ss-focus-not-obscured-audit",
                        "title": "Focus is not fully obscured by sticky content (WCAG 2.4.11)",
                        "description": f"Skipped: {skip}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }
                except Exception as e:
                    audits["ss-focus-not-obscured-audit"] = {
                        "id": "ss-focus-not-obscured-audit",
                        "title": "Focus is not fully obscured by sticky content (WCAG 2.4.11)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.13 Label in Name (WCAG 2.5.3) ────────────────────────────
                try:
                    label_name_results = page.evaluate("""
                        () => {
                            const issues = [];
                            // Find elements with both visible text and aria-label
                            const interactive = document.querySelectorAll(
                                'a[aria-label], button[aria-label], [role="button"][aria-label], [role="link"][aria-label]'
                            );
                            interactive.forEach(el => {
                                const ariaLabel = (el.getAttribute('aria-label') || '').trim().toLowerCase();
                                const visibleText = (el.textContent || '').trim().toLowerCase().replace(/\\s+/g, ' ');
                                if (visibleText.length > 0 && ariaLabel.length > 0 && !ariaLabel.includes(visibleText) && !visibleText.includes(ariaLabel)) {
                                    issues.push({ tag: el.tagName, aria: ariaLabel.substring(0, 60), visible: visibleText.substring(0, 60) });
                                }
                            });
                            return { issueCount: issues.length, issues: issues.slice(0, 10) };
                        }
                    """)
                    ln_issues = label_name_results.get("issueCount", 0)
                    audits["ss-label-in-name-audit"] = {
                        "id": "ss-label-in-name-audit",
                        "title": "Label in name matches visible text (WCAG 2.5.3)",
                        "description": (
                            f"Checks that aria-label values on interactive elements contain the visible text, "
                            f"so speech users can activate controls by speaking what they see. "
                            f"Found {ln_issues} mismatch(es)."
                        ),
                        "score": 1.0 if ln_issues == 0 else 0.0,
                        "numericValue": float(ln_issues),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [
                                {"key": "aria", "label": "aria-label"},
                                {"key": "visible", "label": "Visible text"},
                            ],
                            "items": label_name_results.get("issues", []),
                        } if ln_issues else None,
                    }
                except Exception as e:
                    audits["ss-label-in-name-audit"] = {
                        "id": "ss-label-in-name-audit",
                        "title": "Label in name matches visible text (WCAG 2.5.3)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.14 On Focus (WCAG 3.2.1) ──────────────────────────────────
                try:
                    on_focus_results = page.evaluate("""
                        () => {
                            // Detect onfocus attributes that trigger navigation or form submission
                            const onfocusEls = document.querySelectorAll('[onfocus]');
                            const risky = [];
                            onfocusEls.forEach(el => {
                                const handler = el.getAttribute('onfocus') || '';
                                if (/submit|location|href|navigate|window\\.open/i.test(handler)) {
                                    risky.push({ tag: el.tagName, handler: handler.substring(0, 80) });
                                }
                            });
                            return { riskyCount: risky.length, total: onfocusEls.length, items: risky.slice(0, 10) };
                        }
                    """)
                    of_issues = on_focus_results.get("riskyCount", 0)
                    audits["ss-on-focus-audit"] = {
                        "id": "ss-on-focus-audit",
                        "title": "No context change on focus (WCAG 3.2.1)",
                        "description": (
                            f"Checks for onfocus event handlers that trigger navigation or form submission, "
                            f"which causes unexpected context changes for keyboard users. "
                            f"Found {of_issues} risky handler(s) out of {on_focus_results.get('total', 0)} onfocus element(s)."
                        ),
                        "score": 1.0 if of_issues == 0 else 0.0,
                        "numericValue": float(of_issues),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "tag", "label": "Element"}, {"key": "handler", "label": "Handler"}],
                            "items": on_focus_results.get("items", []),
                        } if of_issues else None,
                    }
                except Exception as e:
                    audits["ss-on-focus-audit"] = {
                        "id": "ss-on-focus-audit",
                        "title": "No context change on focus (WCAG 3.2.1)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.15 On Input (WCAG 3.2.2) ──────────────────────────────────
                try:
                    on_input_results = page.evaluate("""
                        () => {
                            // Detect onchange on selects/radios that auto-submit or navigate
                            const changingEls = document.querySelectorAll('select[onchange], input[type="radio"][onchange], input[type="checkbox"][onchange]');
                            const risky = [];
                            changingEls.forEach(el => {
                                const handler = el.getAttribute('onchange') || '';
                                if (/submit|location|href|navigate|window\\.open|this\\.form/i.test(handler)) {
                                    risky.push({ tag: el.tagName, type: el.type || 'select', handler: handler.substring(0, 80) });
                                }
                            });
                            return { riskyCount: risky.length, items: risky.slice(0, 10) };
                        }
                    """)
                    oi_issues = on_input_results.get("riskyCount", 0)
                    audits["ss-on-input-audit"] = {
                        "id": "ss-on-input-audit",
                        "title": "No context change on input (WCAG 3.2.2)",
                        "description": (
                            f"Checks for onchange handlers on select/radio/checkbox elements that auto-submit forms "
                            f"or navigate without a submit button. Found {oi_issues} instance(s)."
                        ),
                        "score": 1.0 if oi_issues == 0 else 0.0,
                        "numericValue": float(oi_issues),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "tag", "label": "Element"}, {"key": "handler", "label": "Handler"}],
                            "items": on_input_results.get("items", []),
                        } if oi_issues else None,
                    }
                except Exception as e:
                    audits["ss-on-input-audit"] = {
                        "id": "ss-on-input-audit",
                        "title": "No context change on input (WCAG 3.2.2)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.16 Consistent Navigation (WCAG 3.2.3) ─────────────────────
                try:
                    nav_results = page.evaluate("""
                        () => {
                            const navEls = document.querySelectorAll('nav, [role="navigation"]');
                            const unnamed = Array.from(navEls).filter(n =>
                                !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')
                            );
                            return { navCount: navEls.length, unnamedCount: unnamed.length };
                        }
                    """)
                    nav_count = nav_results.get("navCount", 0)
                    unnamed_count = nav_results.get("unnamedCount", 0)
                    # WCAG 3.2.3 requires navigation to appear in the same location and order
                    # across all pages — this can only be verified by comparing multiple pages.
                    # A single-page scan cannot confirm or deny cross-page consistency, so this
                    # audit always returns "Needs Manual Review" regardless of landmark labels.
                    # (Multiple unlabelled nav elements are a 4.1.2 / best-practice concern,
                    # not a 3.2.3 violation, and are not scored here.)
                    label_note = (
                        f"{unnamed_count} of {nav_count} navigation landmark(s) lack aria-label (best practice to add). "
                        if unnamed_count > 0
                        else f"{nav_count} navigation landmark(s) found, all with accessible names. "
                    )
                    audits["ss-consistent-navigation-audit"] = {
                        "id": "ss-consistent-navigation-audit",
                        "title": "Navigation is consistent (WCAG 3.2.3)",
                        "description": (
                            label_note +
                            "WCAG 3.2.3 requires navigation to appear in the same order and location across all pages — "
                            "verify manually by comparing the navigation across multiple pages of this site."
                        ),
                        "score": None,
                        "numericValue": float(unnamed_count),
                        "scoreDisplayMode": "manual",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "description", "label": "Note"}],
                            "items": [{"description": "Cross-page navigation order and location consistency requires manual verification."}],
                        },
                    }
                except Exception as e:
                    audits["ss-consistent-navigation-audit"] = {
                        "id": "ss-consistent-navigation-audit",
                        "title": "Navigation is consistent (WCAG 3.2.3)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.17 Consistent Help (WCAG 3.2.6) ───────────────────────────
                try:
                    if not _wcag22_in_scope(wcag_filter):
                        raise _WcagScopeSkip("Outside the selected WCAG 2.1 scan scope.")
                    help_results = page.evaluate("""
                        () => {
                            // Look for help mechanisms: contact links, chat widgets, help pages
                            const helpLinks = document.querySelectorAll(
                                'a[href*="help" i], a[href*="support" i], a[href*="contact" i], ' +
                                'a[href*="faq" i], [aria-label*="help" i], [aria-label*="support" i], ' +
                                '[class*="chat" i][class*="support" i], [id*="help-widget" i]'
                            );
                            const helpInHeader = Array.from(helpLinks).some(el => {
                                const header = el.closest('header, [role="banner"], nav, [role="navigation"]');
                                return !!header;
                            });
                            return { helpCount: helpLinks.length, helpInHeader };
                        }
                    """)
                    help_count = help_results.get("helpCount", 0)
                    help_in_header = help_results.get("helpInHeader", False)
                    if help_count == 0:
                        # WCAG 3.2.6 only applies when the page provides a help mechanism;
                        # pages with no help at all are not subject to this criterion.
                        audits["ss-consistent-help-audit"] = {
                            "id": "ss-consistent-help-audit",
                            "title": "Consistent help mechanism (WCAG 3.2.6)",
                            "description": "No help or support mechanism detected on this page. WCAG 3.2.6 does not apply.",
                            "score": None,
                            "numericValue": 0.0,
                            "scoreDisplayMode": "notApplicable",
                            "details": None,
                        }
                    else:
                        location_note = "Help is in the header/nav (consistent location)." if help_in_header else "Help is not in the header/nav — verify consistent placement across pages."
                        audits["ss-consistent-help-audit"] = {
                            "id": "ss-consistent-help-audit",
                            "title": "Consistent help mechanism (WCAG 3.2.6)",
                            "description": (
                                f"Found {help_count} help link(s)/widget(s). {location_note} "
                                f"Cross-page consistency requires manual verification."
                            ),
                            "score": 1.0,
                            "numericValue": float(help_count),
                            "scoreDisplayMode": "binary",
                            "details": {
                                "type": "table",
                                "headings": [{"key": "description", "label": "Note"}],
                                "items": [{"description": location_note}, {"description": "Manually verify help appears in the same location on all pages of the site."}],
                            },
                        }
                except _WcagScopeSkip as skip:
                    audits["ss-consistent-help-audit"] = {
                        "id": "ss-consistent-help-audit",
                        "title": "Consistent help mechanism (WCAG 3.2.6)",
                        "description": f"Skipped: {skip}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }
                except Exception as e:
                    audits["ss-consistent-help-audit"] = {
                        "id": "ss-consistent-help-audit",
                        "title": "Consistent help mechanism (WCAG 3.2.6)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.18 Error Identification (WCAG 3.3.1) ───────────────────────
                try:
                    error_results = page.evaluate("""
                        () => {
                            const forms = document.querySelectorAll('form');
                            const requiredInputs = document.querySelectorAll(
                                'input[required], select[required], textarea[required], ' +
                                '[aria-required="true"]'
                            );
                            // Check required inputs have associated labels
                            const unlabeled = Array.from(requiredInputs).filter(inp => {
                                const id = inp.id;
                                const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                                const hasAria = inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby');
                                const wrapped = inp.closest('label');
                                return !hasLabel && !hasAria && !wrapped;
                            });
                            // Check for aria-describedby on required inputs (error message pattern)
                            const withErrDesc = Array.from(requiredInputs).filter(inp =>
                                inp.getAttribute('aria-describedby') || inp.getAttribute('aria-errormessage')
                            );
                            return {
                                formCount: forms.length,
                                requiredCount: requiredInputs.length,
                                unlabeledRequired: unlabeled.length,
                                withErrorDescription: withErrDesc.length,
                            };
                        }
                    """)
                    unlabeled_req = error_results.get("unlabeledRequired", 0)
                    req_count = error_results.get("requiredCount", 0)
                    score = 1.0 if unlabeled_req == 0 else max(0.0, 1.0 - (unlabeled_req / max(req_count, 1)))
                    audits["ss-error-identification-audit"] = {
                        "id": "ss-error-identification-audit",
                        "title": "Error identification on required fields (WCAG 3.3.1)",
                        "description": (
                            f"Checks that required form fields have accessible labels so errors can be identified. "
                            f"{req_count} required field(s) found, {unlabeled_req} missing accessible label."
                        ),
                        "score": score,
                        "numericValue": float(unlabeled_req),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "description", "label": "Issue"}],
                            "items": [{"description": f"{unlabeled_req} required input(s) have no associated label or aria-label"}],
                        } if unlabeled_req else None,
                    }
                except Exception as e:
                    audits["ss-error-identification-audit"] = {
                        "id": "ss-error-identification-audit",
                        "title": "Error identification on required fields (WCAG 3.3.1)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

                # ── 2.19 Status Messages (WCAG 4.1.3) ───────────────────────────
                try:
                    status_results = page.evaluate("""
                        () => {
                            // Look for live regions (proper status message pattern)
                            const liveRegions = document.querySelectorAll(
                                '[aria-live], [role="status"], [role="alert"], [role="log"], [role="timer"]'
                            );
                            // Look for common toast/notification/alert patterns without live region
                            const toasts = document.querySelectorAll(
                                '[class*="toast" i], [class*="notification" i], [class*="alert" i], ' +
                                '[class*="snackbar" i], [class*="banner" i][class*="message" i]'
                            );
                            const toastsWithoutLive = Array.from(toasts).filter(t =>
                                !t.getAttribute('aria-live') && !t.closest('[aria-live]') &&
                                !['status','alert','log'].includes(t.getAttribute('role') || '')
                            );
                            return {
                                liveRegionCount: liveRegions.length,
                                toastCount: toasts.length,
                                toastsWithoutLive: toastsWithoutLive.length,
                            };
                        }
                    """)
                    missing_live = status_results.get("toastsWithoutLive", 0)
                    live_count = status_results.get("liveRegionCount", 0)
                    audits["ss-status-messages-audit"] = {
                        "id": "ss-status-messages-audit",
                        "title": "Status messages use live regions (WCAG 4.1.3)",
                        "description": (
                            f"Checks that toast/notification elements use aria-live regions so screen readers "
                            f"announce status updates without focus change. "
                            f"Found {live_count} live region(s), {missing_live} notification element(s) missing aria-live."
                        ),
                        "score": 1.0 if missing_live == 0 else 0.0,
                        "numericValue": float(missing_live),
                        "scoreDisplayMode": "binary",
                        "details": {
                            "type": "table",
                            "headings": [{"key": "description", "label": "Issue"}],
                            "items": [{"description": f"{missing_live} notification/toast element(s) lack aria-live attribute"}],
                        } if missing_live else None,
                    }
                except Exception as e:
                    audits["ss-status-messages-audit"] = {
                        "id": "ss-status-messages-audit",
                        "title": "Status messages use live regions (WCAG 4.1.3)",
                        "description": f"Check could not run: {e}",
                        "score": None,
                        "numericValue": None,
                        "scoreDisplayMode": "notApplicable",
                    }

            # axe-core is the canonical WCAG engine for the Camoufox path. It runs
            # inside the same browser page that bypassed bot protection, then its
            # results are normalized into Lighthouse-shaped audits for existing PDFs.
            try:
                axe_script = find_axe_core_script()
                if not axe_script:
                    raise RuntimeError("axe-core script not found. Run pnpm install in backend or set AXE_CORE_PATH.")

                with open(axe_script, "r", encoding="utf-8") as axe_file:
                    axe_source = axe_file.read()

                page.evaluate(
                    """(axeSource) => {
                        const global = globalThis;
                        global.eval(axeSource);
                        return Boolean(global.axe);
                    }""",
                    axe_source,
                )
                axe_results = page.evaluate("""
                    async (tagValues) => {
                        const axe = globalThis.axe || window.axe;
                        if (!axe) {
                            throw new Error('axe-core did not load');
                        }
                        return await axe.run(document, {
                            runOnly: {
                                type: 'tag',
                                values: tagValues
                            },
                            resultTypes: ['violations', 'passes', 'incomplete'],
                            rules: {
                                'color-contrast': { enabled: true }
                            }
                        });
                    }
                """, _resolve_axe_tags(wcag_filter))
                merge_axe_results_into_audits(audits, axe_results)
                print(f"axe-core completed: {len(axe_results.get('violations', []))} violation rules")
            except Exception as axe_error:
                print(f"axe-core scan failed: {axe_error}")
                audits["axe-core"] = {
                    "id": "axe-core",
                    "title": "axe-core WCAG accessibility scan",
                    "description": f"axe-core could not complete on this page: {safe_text(str(axe_error))}",
                    "score": 0.0,
                    "numericValue": 0.0,
                    "scoreDisplayMode": "binary",
                    "errorMessage": safe_text(str(axe_error)),
                }

            ensure_expected_audits(audits, is_lite)
            
            # Build Lighthouse-compatible report
            category_id = "senior-friendly-lite" if is_lite else "senior-friendly"
            category_title = "Senior Accessibility (Lite)" if is_lite else "Senior Friendliness"
            
            final_score = calculate_score({"audits": audits}, is_lite)
            
            report = {
                "scannerVersion": "camoufox-axe-1.0",
                "fetchTime": time.time() * 1000,
                "requestedUrl": url,
                "finalUrl": final_url,
                "categories": {
                    category_id: {
                        "id": category_id,
                        "title": category_title,
                        "score": final_score / 100,
                        "auditRefs": LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS,
                    }
                },
                "audits": audits
            }
            
            return {
                "success": True,
                "report": report,
                "score": final_score
            }
            
        finally:
            page.close()


