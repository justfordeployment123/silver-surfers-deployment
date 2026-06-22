"""
Python Scanner Service for SilverSurfers
Uses Camoufox (Playwright wrapper with advanced anti-detection) to scan websites
and perform accessibility audits compatible with Lighthouse format.
"""

import asyncio
import json
import logging
import os
import re
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from camoufox.sync_api import Camoufox

from camoufox_auditor import run_camoufox_audit_sync
from scanner_config import (
    MAX_CONCURRENT_AUDITS,
    MAX_QUEUED_AUDITS,
    SCANNER_EXECUTOR_WORKERS,
    get_viewport_for_device,
)
from scanner_utils import cleanup_temp_report, run_with_clean_event_loop_context, safe_text, sanitize_report_data


# Configure logging to filter out health check requests
class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "/health" not in record.getMessage()

# Apply filter to uvicorn access logs
logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())

app = FastAPI(title="SilverSurfers Python Scanner", version="1.0.0")

# Thread-safe lock for synchronous Camoufox operations
_precheck_lock = threading.Lock()        # one precheck at a time
_link_extraction_lock = threading.Lock() # one link-extraction at a time (independent of precheck)
_audit_condition = asyncio.Condition()
_active_audits = 0
_queued_audits = 0


_scanner_executor = ThreadPoolExecutor(max_workers=SCANNER_EXECUTOR_WORKERS, thread_name_prefix="scanner")


def _scanner_ignore_https_errors() -> bool:
    return safe_text(os.getenv("SCANNER_IGNORE_HTTPS_ERRORS", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


async def get_scanner_load() -> Dict[str, int]:
    async with _audit_condition:
        return {
            "activeAudits": _active_audits,
            "queuedAudits": _queued_audits,
            "maxConcurrentAudits": MAX_CONCURRENT_AUDITS,
            "maxQueuedAudits": MAX_QUEUED_AUDITS,
            "browserPoolSize": _active_audits,
            "browsersInUse": _active_audits,
            "browserWaiters": _queued_audits,
        }


async def acquire_audit_slot() -> None:
    global _active_audits, _queued_audits
    queued_this_request = False

    async with _audit_condition:
        if _active_audits >= MAX_CONCURRENT_AUDITS:
            if _queued_audits >= MAX_QUEUED_AUDITS:
                raise HTTPException(
                    status_code=503,
                    detail="Scanner is at capacity. Please try again in a few moments.",
                )

            _queued_audits += 1
            queued_this_request = True

        try:
            await _audit_condition.wait_for(lambda: _active_audits < MAX_CONCURRENT_AUDITS)
        finally:
            if queued_this_request:
                _queued_audits = max(_queued_audits - 1, 0)

        _active_audits += 1


async def release_audit_slot() -> None:
    global _active_audits

    async with _audit_condition:
        _active_audits = max(_active_audits - 1, 0)
        _audit_condition.notify(1)


class AuditRequest(BaseModel):
    url: str
    device: str = "desktop"  # desktop, mobile, tablet
    format: str = "json"  # json or html
    isLiteVersion: bool = False
    includeReport: bool = True


class PrecheckRequest(BaseModel):
    url: str


class PrecheckResponse(BaseModel):
    success: bool
    finalUrl: Optional[str] = None
    status: Optional[int] = None
    redirected: bool = False
    error: Optional[str] = None


class LinkExtractionRequest(BaseModel):
    url: str
    maxDepth: int = 1
    delayMs: int = 500
    maxLinks: int = 50  # 2× the caller's limit so scoring/filtering has room


class LinkExtractionResponse(BaseModel):
    success: bool
    links: list[str] = []
    finalUrl: Optional[str] = None
    error: Optional[str] = None


class AuditResponse(BaseModel):
    success: bool
    reportPath: Optional[str] = None
    report: Optional[Dict[str, Any]] = None
    isLiteVersion: bool = False
    version: str = "Full"
    url: str = ""
    device: str = "desktop"
    strategy: str = "Python-Playwright"
    attemptNumber: int = 1
    message: str = ""
    error: Optional[str] = None
    errorCode: Optional[str] = None


# Health check endpoint (supports both GET and HEAD for Docker healthchecks)
@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    """Health check endpoint for Docker/Kubernetes"""
    return {"status": "healthy", "service": "python-scanner", **await get_scanner_load()}


@app.api_route("/healthz", methods=["GET", "HEAD"])
async def healthz_check():
    """Compatibility health endpoint used by the new Docker compose stack."""
    return {"status": "ok", "service": "python-scanner", **await get_scanner_load()}


@app.get("/load")
async def load_check():
    """Expose scanner capacity for the worker's full-audit load shedding."""
    return await get_scanner_load()


# Precheck endpoint
@app.post("/precheck", response_model=PrecheckResponse)
async def precheck_url(request: PrecheckRequest):
    """
    Lightweight precheck: verify URL is reachable before running full audit.
    This is much faster than a full audit.
    """
    try:
        # Run precheck in thread pool since it uses sync Camoufox
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            _scanner_executor,
            run_with_clean_event_loop_context,
            _precheck_url_sync,
            request.url,
        )
        
        return PrecheckResponse(
            success=result.get("success", False),
            finalUrl=result.get("finalUrl"),
            status=result.get("status"),
            redirected=result.get("redirected", False),
            error=result.get("error")
        )
    except Exception as e:
        return PrecheckResponse(
            success=False,
            error=f"Precheck failed: {str(e)}"
        )


async def _perform_audit_impl(request: AuditRequest):
    """
    Perform accessibility audit using Lighthouse + Camoufox (with fallback to custom audits)
    """
    try:
        # Normalize URL
        url = request.url
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        
        version = "Lite" if request.isLiteVersion else "Full"
        print(f"\n=== Starting {version} audit for {url} ===")
        print(f"Device: {request.device}")
        
        print("Using Camoufox + axe-core audits...")
        
        # Get device configuration (viewport + emulation settings)
        device_config = get_viewport_for_device(request.device)
        print(f"Viewport: {device_config.get('viewport')}")
        print(f"User Agent: {device_config.get('user_agent', '')[:50]}...")
        print(f"Mobile: {device_config.get('is_mobile')}, Touch: {device_config.get('has_touch')}")
        
        # Run Camoufox in a thread pool executor to avoid blocking async event loop
        # Camoufox uses Playwright's sync API, so we need to run it in a separate thread
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            _scanner_executor,
            run_with_clean_event_loop_context,
            run_camoufox_audit_sync,
            url,
            device_config,
            request.isLiteVersion
        )
        
        if not result["success"]:
            raise Exception(result.get("error", "Audit failed"))
        
        report = result["report"]
        final_score = result["score"]
        
        if final_score == 0:
            raise Exception("Audit score is 0, indicating a failed audit")
        
        # Save report to file
        url_obj = urlparse(url)
        hostname = url_obj.hostname.replace(".", "-") if url_obj.hostname else "unknown"
        timestamp = int(time.time() * 1000)
        version_suffix = "-lite" if request.isLiteVersion else ""
        report_filename = f"report-{hostname}-{timestamp}{version_suffix}.json"
        
        # Save to temp directory
        temp_dir = os.getenv("TEMP_DIR", "/tmp")
        os.makedirs(temp_dir, exist_ok=True)
        report_path = os.path.join(temp_dir, report_filename)
        
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        
        print(f"✅ {version} audit completed successfully")
        print(f"📊 Score: {final_score}%")
        print(f"📄 Report saved to: {report_path}")
        
        # Sanitize report data to prevent UnicodeEncodeError during JSON serialization
        sanitized_report = sanitize_report_data(report)
        cleanup_temp_report(report_path)
        
        return AuditResponse(
            success=True,
            reportPath=safe_text(report_path),
            report=sanitized_report,
            isLiteVersion=request.isLiteVersion,
            version=safe_text(version),
            url=safe_text(url),
            device=safe_text(request.device),
            strategy="Python-Camoufox",
            attemptNumber=1,
            message=safe_text(f"{version} audit completed successfully using Python/Camoufox strategy"),
        )
                
    except Exception as e:
        # IMPORTANT: Always sanitize error messages to avoid UnicodeEncodeError
        # when FastAPI/Starlette serializes the response body. Some upstream
        # exceptions can contain invalid surrogate code points.
        raw_error_msg = str(e)
        error_msg = safe_text(raw_error_msg)
        print(f"❌ Audit failed: {error_msg}")
        return AuditResponse(
            success=False,
            error=error_msg,
            errorCode="AUDIT_FAILED",
            isLiteVersion=request.isLiteVersion,
            version="Lite" if request.isLiteVersion else "Full",
            url=safe_text(request.url),
            device=safe_text(request.device),
            strategy="Python-Camoufox",
            attemptNumber=1,
            message=safe_text(f"Audit failed: {error_msg}"),
        )


@app.post("/audit", response_model=AuditResponse)
async def perform_audit(request: AuditRequest):
    await acquire_audit_slot()
    try:
        return await _perform_audit_impl(request)
    finally:
        await release_audit_slot()


def _precheck_url_sync(url: str) -> Dict[str, Any]:
    """
    Lightweight precheck: Just verify URL is reachable using Camoufox.
    This is much faster than a full audit - just navigates and checks status.
    Thread-safe using a lock to prevent concurrent browser access issues.
    """
    # Use lock to ensure thread-safe access (one precheck at a time)
    with _precheck_lock:
        try:
            # Use Camoufox with context manager (proper usage pattern)
            with Camoufox(headless=True) as browser:
                page = browser.new_page(ignore_https_errors=_scanner_ignore_https_errors())
                
                # Set basic viewport
                page.set_viewport_size({"width": 1920, "height": 1080})
                
                # Set realistic user agent
                context = page.context
                context.set_extra_http_headers({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                })
                
                try:
                    # Navigate with a shorter timeout for precheck (30 seconds)
                    response = page.goto(url, wait_until="load", timeout=30000)
                    
                    # Get final URL after redirects
                    final_url = page.url
                    status_code = response.status if response else None
                    
                    # Check if redirected
                    redirected = final_url != url
                    
                    # Quick check: verify page has some content (not blocked)
                    content = page.content()
                    has_content = len(content) > 1000  # At least 1KB of content
                    
                    if not has_content:
                        return {
                            "success": False,
                            "error": "Page loaded but has insufficient content (may be blocked)"
                        }
                    
                    return {
                        "success": True,
                        "finalUrl": final_url,
                        "status": status_code,
                        "redirected": redirected
                    }
                except Exception as nav_error:
                    error_msg = str(nav_error)
                    # Check if it's a timeout or connection error
                    if "timeout" in error_msg.lower() or "timeout" in str(type(nav_error)).lower():
                        return {
                            "success": False,
                            "error": f"Request timeout: {error_msg}"
                        }
                    elif "403" in error_msg or "forbidden" in error_msg.lower():
                        # 403 might still mean the site is accessible, just blocked automated requests
                        # But for precheck, we'll consider it a failure
                        return {
                            "success": False,
                            "error": f"Access forbidden (403): Site may block automated requests"
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"Navigation failed: {error_msg}"
                        }
                finally:
                    page.close()
                    
        except Exception as e:
            return {
                "success": False,
                "error": f"Precheck failed: {str(e)}"
            }


_HOMEPAGE_ALIAS_PATHS = {"/", "/home", "/index", "/index.html", "/index.htm", "/default", "/default.aspx"}
_NON_HTML_ASSET_RE = re.compile(
    r"\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|exe|woff|woff2|ttf|xml|json|csv|mp4|mp3|webm|ogg|wav|flac|gz)$",
    re.I,
)
_BLOCKED_AUDIT_PATH_RE = re.compile(
    r"/(cart|checkout|basket|wishlist|my-account|order-status|login|signin|register|signup|identity|profile|sentry|loyalty)(/|$)",
    re.I,
)
_CATALOGUE_ID_SEGMENT_RE = re.compile(r"^(pcm(?:cat|id)\d{4,}.*|(?:ab)?cat\d{4,}\.c)$", re.I)
_DEFAULT_LANDING_FALLBACK_PATHS = ["/home", "/shop", "/browse", "/main", "/us", "/en-us"]


def _scanner_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except Exception:
        value = default
    return max(minimum, min(value, maximum))


def _scanner_normalize_host(hostname: str) -> str:
    return (hostname or "").lower().removeprefix("www.")


def _scanner_canonicalize_url(raw_url: str) -> Optional[Dict[str, str]]:
    try:
        parsed = urlparse(str(raw_url or "").strip())
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return None

        raw_path = re.sub(r"/{2,}", "/", parsed.path or "/").rstrip("/") or "/"
        path = raw_path
        if raw_path.lower() in _HOMEPAGE_ALIAS_PATHS:
            path = "/"

        netloc = parsed.netloc.lower()
        display_url = f"{parsed.scheme}://{netloc}" if path == "/" else f"{parsed.scheme}://{netloc}{path}"
        key = f"{parsed.scheme}://{_scanner_normalize_host(parsed.hostname or parsed.netloc)}{path.lower()}"
        return {"url": display_url, "key": key, "path": path, "rawPath": raw_path}
    except Exception:
        return None


def _scanner_is_auditable_url(raw_url: str, home_key: str) -> bool:
    canonical = _scanner_canonicalize_url(raw_url)
    if not canonical:
        return False
    path = canonical["path"]
    path_lower = path.lower()
    if canonical["key"] == home_key:
        return False
    if _NON_HTML_ASSET_RE.search(path_lower):
        return False
    if _BLOCKED_AUDIT_PATH_RE.search(path_lower):
        return False
    if any(_CATALOGUE_ID_SEGMENT_RE.match(segment) for segment in path_lower.split("/") if segment):
        return False
    return True


def _scanner_landing_candidate_score(raw_url: str, home_key: str) -> int:
    canonical = _scanner_canonicalize_url(raw_url)
    if not canonical:
        return -1

    path = canonical["path"].lower()
    raw_path = canonical["rawPath"].lower()
    segments = [segment for segment in raw_path.split("/") if segment]

    if _NON_HTML_ASSET_RE.search(raw_path) or _BLOCKED_AUDIT_PATH_RE.search(raw_path):
        return -1
    if any(_CATALOGUE_ID_SEGMENT_RE.match(segment) for segment in segments):
        return -1
    if len(segments) > 2:
        return -1

    if canonical["key"] == home_key and raw_path != "/":
        return 100
    if path in {"/shop", "/main", "/browse"}:
        return 80
    if any(token in raw_path for token in ("home", "shop", "browse")):
        return 60
    return 20 if len(segments) <= 1 else 0


def _scanner_landing_fallback_paths() -> list[str]:
    configured = os.getenv("SCANNER_LINK_EXTRACTION_FALLBACK_PATHS", "")
    paths = [path.strip() for path in configured.split(",") if path.strip()]
    if not paths:
        paths = _DEFAULT_LANDING_FALLBACK_PATHS
    return [path if path.startswith("/") else f"/{path}" for path in paths]


def _scanner_build_landing_fallback_urls(
    final_url: str,
    discovered_links: list[str],
    visited_keys: set[str],
    queued_keys: set[str],
) -> list[str]:
    parsed = urlparse(final_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return []

    origin = f"{parsed.scheme}://{parsed.netloc.lower()}"
    home_key = (_scanner_canonicalize_url(final_url) or {}).get("key", "")
    scored: list[tuple[int, str, str]] = []

    for link in discovered_links:
        canonical = _scanner_canonicalize_url(link)
        if not canonical or canonical["key"] in visited_keys or canonical["key"] in queued_keys:
            continue
        score = _scanner_landing_candidate_score(link, home_key)
        if score > 0:
            scored.append((score, canonical["rawPath"], link))

    for path in _scanner_landing_fallback_paths():
        candidate = f"{origin}{path}"
        canonical = _scanner_canonicalize_url(candidate)
        if not canonical or canonical["key"] in visited_keys or canonical["key"] in queued_keys:
            continue
        score = _scanner_landing_candidate_score(candidate, home_key)
        if score > 0:
            scored.append((score - 5, canonical["rawPath"], candidate))

    seen_keys: set[str] = set()
    result: list[str] = []
    for _score, _path, candidate in sorted(scored, key=lambda item: (-item[0], len(item[1]))):
        canonical = _scanner_canonicalize_url(candidate)
        if not canonical or canonical["key"] in seen_keys:
            continue
        seen_keys.add(canonical["key"])
        result.append(candidate)
    return result


def _extract_links_sync(url: str, max_links: int = 50, max_depth: int = 1, delay_ms: int = 500) -> Dict[str, Any]:
    """
    Navigate to a URL using Camoufox and return all same-origin internal links.

    Camoufox uses Firefox with randomised fingerprints, which bypasses bot-detection
    mechanisms that block headless Chromium (Puppeteer) and plain HTTP clients.

    Thread-safe via its own lock so it never blocks audits or prechecks.
    """
    with _link_extraction_lock:
        try:
            with Camoufox(headless=True) as browser:
                page = browser.new_page(ignore_https_errors=_scanner_ignore_https_errors())
                page.set_viewport_size({"width": 1920, "height": 1080})

                # Realistic desktop user-agent
                page.context.set_extra_http_headers({
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/131.0.0.0 Safari/537.36"
                    )
                })

                try:
                    max_depth = max(0, min(int(max_depth or 1), 3))
                    max_links = max(1, min(int(max_links or 50), 200))
                    delay_ms = max(0, min(int(delay_ms or 0), 10_000))
                    max_pages = _scanner_int_env("SCANNER_LINK_EXTRACTION_MAX_PAGES", 3, 1, 10)
                    timeout_ms = _scanner_int_env("SCANNER_LINK_EXTRACTION_TIMEOUT_MS", 90_000, 15_000, 300_000)
                    navigation_timeout_ms = _scanner_int_env("SCANNER_LINK_EXTRACTION_NAV_TIMEOUT_MS", 20_000, 5_000, 60_000)
                    selector_timeout_ms = _scanner_int_env("SCANNER_LINK_EXTRACTION_SELECTOR_TIMEOUT_MS", 3_000, 500, 10_000)
                    deadline = time.monotonic() + timeout_ms / 1000

                    visited = set()
                    visited_keys = set()
                    queue = [(url, 0)]
                    queued = {url}
                    queued_keys = {(_scanner_canonicalize_url(url) or {"key": url})["key"]}
                    seen_links = set()
                    links = []
                    final_url = url
                    home_key = ""
                    landing_recovery_enqueued = False
                    warnings = []

                    while queue and len(links) < max_links:
                        if len(visited_keys) >= max_pages:
                            break
                        remaining_ms = int((deadline - time.monotonic()) * 1000)
                        if remaining_ms <= 0:
                            return {
                                "success": True,
                                "links": links[:max_links],
                                "finalUrl": (_scanner_canonicalize_url(final_url) or {"url": final_url})["url"],
                                "error": f"Link extraction stopped after {timeout_ms}ms timeout with partial results",
                            }

                        current_url, depth = queue.pop(0)
                        current_key = (_scanner_canonicalize_url(current_url) or {"key": current_url})["key"]
                        if current_key in visited_keys:
                            continue
                        visited.add(current_url)
                        visited_keys.add(current_key)

                        if len(visited) > 1 and delay_ms > 0:
                            page.wait_for_timeout(delay_ms)

                        try:
                            page.goto(current_url, wait_until="domcontentloaded", timeout=min(navigation_timeout_ms, max(1_000, remaining_ms)))
                        except Exception as page_error:
                            warnings.append(f"Skipped {current_url}: {str(page_error)}")
                            if current_url == url and not links:
                                return {"success": False, "links": [], "finalUrl": final_url, "error": f"Navigation failed: {str(page_error)}"}
                            continue

                        try:
                            page.wait_for_selector(
                                "nav a[href], header a[href], main a[href], footer a[href], [role='navigation'] a[href]",
                                timeout=min(selector_timeout_ms, max(500, int((deadline - time.monotonic()) * 1000))),
                            )
                        except Exception:
                            page.wait_for_timeout(min(1_000, max(0, int((deadline - time.monotonic()) * 1000))))

                        if current_url == url:
                            final_url = page.url
                            home_key = (_scanner_canonicalize_url(final_url) or {}).get("key", "")

                        parsed = urlparse(final_url)
                        base_scheme = parsed.scheme
                        base_host = parsed.hostname or parsed.netloc

                        page_links = page.evaluate(
                            """
                            ({ baseScheme, baseHost }) => {
                                const result = [];
                                const seen = new Set();
                                const NON_HTML = /\\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|exe|woff|woff2|ttf|xml|json|csv|mp4|mp3|webm|ogg|wav|flac|gz)$/i;
                                const normalizeHost = (hostname) => String(hostname || '').toLowerCase().replace(/^www\\./, '');
                                const expectedHost = normalizeHost(baseHost);
                                const blockedPath = /\\/(api|_next|static|assets|cdn-cgi)(\\/|$)/i;

                                const addCandidate = (raw) => {
                                    const href = String(raw || '').trim();
                                    if (!href || /^(javascript|mailto|tel):/i.test(href)) return;
                                    try {
                                        const u = new URL(href, window.location.href);
                                        if (u.protocol.replace(':', '') !== baseScheme) return;
                                        if (normalizeHost(u.hostname) !== expectedHost) return;
                                        if (NON_HTML.test(u.pathname)) return;
                                        if (blockedPath.test(u.pathname)) return;
                                        u.hash = '';
                                        u.search = '';
                                        const clean = u.href.replace(/\\/$/, '');
                                        if (clean && clean !== u.origin && !seen.has(clean)) {
                                            seen.add(clean);
                                            result.push(clean);
                                        }
                                    } catch (_) {}
                                };

                                document.querySelectorAll('a[href], [href], [to], [data-href]').forEach(el => {
                                    addCandidate(el.getAttribute('href') || el.href);
                                    addCandidate(el.getAttribute('to'));
                                    addCandidate(el.getAttribute('data-href'));
                                });

                                // Many modern SPAs keep route paths in JSON hydration payloads
                                // rather than rendered anchors. Pull shallow internal paths from
                                // those payloads so sites like chatgpt.com expose their nav pages.
                                document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__').forEach(script => {
                                    const text = script.textContent || '';
                                    const matches = text.matchAll(/["'](\\/(?!\\/)[A-Za-z0-9][^"'<>\\s?#]{1,160})["']/g);
                                    for (const match of matches) {
                                        addCandidate(match[1]);
                                        if (result.length >= 250) break;
                                    }
                                });
                                return result;
                            }
                            """,
                            {"baseScheme": base_scheme, "baseHost": base_host},
                        )

                        if not isinstance(page_links, list):
                            page_links = []

                        for link in page_links:
                            canonical = _scanner_canonicalize_url(link)
                            if not canonical or not _scanner_is_auditable_url(canonical["url"], home_key):
                                continue
                            clean_link = canonical["url"]
                            clean_key = canonical["key"]

                            if clean_key not in seen_links:
                                seen_links.add(clean_key)
                                links.append(clean_link)
                                if len(links) >= max_links:
                                    break
                            if (
                                depth < max_depth
                                and len(queued_keys) < max_pages
                                and clean_key not in visited_keys
                                and clean_key not in queued_keys
                            ):
                                queue.append((clean_link, depth + 1))
                                queued.add(clean_link)
                                queued_keys.add(clean_key)

                        if not queue and len(links) < 3 and not landing_recovery_enqueued:
                            for fallback_url in _scanner_build_landing_fallback_urls(final_url, page_links, visited_keys, queued_keys):
                                if len(queued_keys) >= max_pages:
                                    break
                                fallback_key = (_scanner_canonicalize_url(fallback_url) or {}).get("key")
                                if not fallback_key:
                                    continue
                                queue.append((fallback_url, 0))
                                queued.add(fallback_url)
                                queued_keys.add(fallback_key)
                            landing_recovery_enqueued = True

                    return {
                        "success": True,
                        "links": links[:max_links],
                        "finalUrl": (_scanner_canonicalize_url(final_url) or {"url": final_url})["url"],
                        "error": "; ".join(warnings[:3]) if warnings else None,
                    }


                except Exception as nav_error:
                    if links:
                        return {
                            "success": True,
                            "links": links[:max_links],
                            "finalUrl": (_scanner_canonicalize_url(final_url) or {"url": final_url})["url"],
                            "error": f"Link extraction returned partial results after error: {str(nav_error)}",
                        }
                    return {"success": False, "links": [], "finalUrl": final_url, "error": f"Navigation failed: {str(nav_error)}"}
                finally:
                    page.close()

        except Exception as e:
            return {"success": False, "error": f"Browser error: {str(e)}"}


@app.post("/extract-links", response_model=LinkExtractionResponse)
async def extract_links_endpoint(request: LinkExtractionRequest):
    """
    Extract internal navigation links from a page using Camoufox.

    Called by the Node.js backend as Strategy 3 in the internal-links pipeline
    when Cheerio (plain HTTP) fails to find useful links (e.g., bot-protected or
    JS-heavy sites).  Does NOT consume an audit slot.
    """
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            _scanner_executor,
            run_with_clean_event_loop_context,
            _extract_links_sync,
            request.url,
            request.maxLinks,
            request.maxDepth,
            request.delayMs,
        )
        return LinkExtractionResponse(
            success=result.get("success", False),
            links=result.get("links", []),
            finalUrl=result.get("finalUrl"),
            error=result.get("error"),
        )
    except Exception as e:
        return LinkExtractionResponse(
            success=False,
            error=f"Link extraction failed: {str(e)}",
        )

