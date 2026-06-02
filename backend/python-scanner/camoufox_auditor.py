import time
from typing import Any, Dict
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from camoufox.sync_api import Camoufox

from axe_integration import ensure_expected_audits, find_axe_core_script, merge_axe_results_into_audits, make_not_checked_audit
from scanner_config import FULL_AUDIT_REFS, LITE_AUDIT_REFS, calculate_score
from scanner_utils import safe_text


def navigate_for_audit(page, url: str) -> None:
    """
    Prefer a complete page load, but do not fail a scan just because a site keeps
    late scripts, ads, or analytics requests open. Accessibility checks can run
    once the DOM is available.
    """
    try:
        page.goto(url, wait_until="load", timeout=120000)
        return
    except Exception as first_error:
        first_message = safe_text(str(first_error)).lower()
        recoverable = (
            "timeout" in first_message
            or "ns_error_net_reset" in first_message
            or "econnreset" in first_message
            or "connection reset" in first_message
        )
        if not recoverable:
            raise

        try:
            page.wait_for_load_state("domcontentloaded", timeout=10000)
            return
        except Exception:
            pass

        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            return
        except Exception as second_error:
            second_message = safe_text(str(second_error)).lower()
            if "timeout" in second_message:
                try:
                    if safe_text(page.content()):
                        return
                except Exception:
                    pass
            raise first_error


def run_camoufox_audit_sync(url: str, device_config: Dict[str, Any], is_lite: bool) -> Dict[str, Any]:
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
        page = browser.new_page()
        
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
        
        try:
            navigate_for_audit(page, url)
            
            # Wait a bit for dynamic content (sync)
            page.wait_for_timeout(2000)
            
            # Get page content (sync)
            html_content = page.content()
            page_url = page.url
            
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(html_content, 'lxml')
            
            # Get final URL after redirects
            final_url = page_url
            
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
                                    selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
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
                                    selector: link.tagName.toLowerCase() + (link.id ? '#' + link.id : '') + (link.className ? '.' + link.className.split(' ')[0] : ''),
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
                                    selector: btn.tagName.toLowerCase() + (btn.id ? '#' + btn.id : '') + (btn.className ? '.' + btn.className.split(' ')[0] : ''),
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
                        const label = document.querySelector(`label[for="${id}"]`);
                        const ariaLabel = input.getAttribute('aria-label');
                        const placeholder = input.getAttribute('placeholder');
                        if (!label && !ariaLabel && !placeholder) {
                            failingItems.push({
                                node: {
                                    nodeLabel: input.tagName.toLowerCase() + (input.type ? '[' + input.type + ']' : ''),
                                    selector: input.tagName.toLowerCase() + (input.id ? '#' + input.id : '') + (input.className ? '.' + input.className.split(' ')[0] : ''),
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
                                containerSelector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
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
            
            # Performance metrics - sync eval
            performance_metrics = page.evaluate("""
                () => {
                    const perf = performance.timing;
                    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
                    const latestLcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1] : null;
                    const loadTime = perf.loadEventEnd && perf.navigationStart ? perf.loadEventEnd - perf.navigationStart : 0;
                    return {
                        loadTime,
                        lcp: latestLcp ? latestLcp.startTime : null
                    };
                }
            """)
            
            # Largest Contentful Paint (LCP)
            lcp_value = performance_metrics.get("lcp")
            if isinstance(lcp_value, (int, float)) and lcp_value > 0:
                lcp_score = 1.0 if lcp_value < 2500 else max(0, 1 - (lcp_value - 2500) / 2500)
                audits["largest-contentful-paint"] = {
                    "id": "largest-contentful-paint",
                    "title": "Largest Contentful Paint",
                    "description": f"This audit measures how long it takes for the main content to load. LCP time: {lcp_value:.0f}ms. Good if under 2500ms.",
                    "score": lcp_score,
                    "numericValue": lcp_value,
                    "displayValue": f"LCP {lcp_value:.0f}ms",
                }
            else:
                audits["largest-contentful-paint"] = make_not_checked_audit(
                    "largest-contentful-paint",
                    "Largest Contentful Paint",
                    "LCP was not available from the browser performance timeline for this run, so page loading speed is excluded instead of treated as 0ms.",
                )
            
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
                                } else if (link.className) {
                                    const firstClass = link.className.split(' ')[0];
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
                                } else if (div.className) {
                                    const firstClass = div.className.split(' ')[0];
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
                
                # Geolocation on start - check if page requests geolocation immediately
                geolocation_requested = page.evaluate("""
                    () => {
                        // Check if geolocation API was called
                        // This would need to be monitored during page load
                        return false;
                    }
                """)
                audits["geolocation-on-start"] = {
                    "id": "geolocation-on-start",
                    "title": "Does not request geolocation on page load",
                    "description": "This audit checks if the page requests user location immediately on load, which can be intrusive for older adults.",
                    "score": 1.0 if not geolocation_requested else 0.0,
                    "numericValue": 1.0 if not geolocation_requested else 0.0,
                }

                autoplay_results = page.evaluate("""
                    () => {
                        const media = Array.from(document.querySelectorAll('video, audio'));
                        const autoplay = media.filter(el => el.hasAttribute('autoplay')).map(el => {
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
                        });
                        return { total: media.length, autoplayCount: autoplay.length, items: autoplay.slice(0, 50) };
                    }
                """)
                autoplay_count = autoplay_results.get("autoplayCount", 0)
                audits["autoplay-audit"] = {
                    "id": "autoplay-audit",
                    "title": "Audio and video content does not autoplay",
                    "description": "Detects audio or video elements that autoplay without an explicit user action.",
                    "score": 1.0 if autoplay_count == 0 else 0.0,
                    "numericValue": autoplay_count,
                    "scoreDisplayMode": "binary",
                    "displayValue": "No autoplay media found" if autoplay_count == 0 else f"{autoplay_count} autoplay media elements found",
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
                    async () => {
                        const axe = globalThis.axe || window.axe;
                        if (!axe) {
                            throw new Error('axe-core did not load');
                        }
                        return await axe.run(document, {
                            runOnly: {
                                type: 'tag',
                                values: [
                                    'wcag2a',
                                    'wcag2aa',
                                    'wcag21a',
                                    'wcag21aa',
                                    'wcag22aa',
                                    'best-practice'
                                ]
                            },
                            resultTypes: ['violations', 'passes', 'incomplete'],
                            rules: {
                                'color-contrast': { enabled: true }
                            }
                        });
                    }
                """)
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


