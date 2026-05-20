"""
Python Scanner Service for SilverSurfers
Uses Camoufox (Playwright wrapper with advanced anti-detection) to scan websites
and perform accessibility audits compatible with Lighthouse format.
"""

import asyncio
import json
import logging
import os
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
_precheck_lock = threading.Lock()  # Thread-safe lock for synchronous code
_audit_condition = asyncio.Condition()
_active_audits = 0
_queued_audits = 0


_scanner_executor = ThreadPoolExecutor(max_workers=SCANNER_EXECUTOR_WORKERS, thread_name_prefix="scanner")


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
                page = browser.new_page()
                
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

