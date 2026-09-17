"""Bounded readiness gate; challenges and partial documents are not audit targets."""
import time


def is_challenge(metrics):
    title = str(metrics.get("title", "")).strip().lower()
    return title in {"just a moment...", "just a moment", "checking your browser", "attention required! | cloudflare", "vercel security checkpoint"} or bool(metrics.get("challengeDetected"))


def response_is_challenge(response):
    headers = getattr(response, "headers", {}) or {}
    return isinstance(headers, dict) and any(
        str(headers.get(key, "")).lower() == "challenge"
        for key in ("x-vercel-mitigated", "cf-mitigated")
    )


def is_empty_document(metrics, status, has_frames):
    return (status == 200 and not has_frames
            and metrics.get("readyState") == "complete"
            and metrics.get("bodyChars") == 0
            and 0 < metrics.get("domCount", 0) <= 10
            and all(metrics.get(key, 0) == 0 for key in ("links", "buttons", "controls", "media", "headings")))


def wait_for_ready(page, collect, latest_response, timeout_ms=45000):
    deadline = time.monotonic() + timeout_ms / 1000
    previous = None
    stable_since = None
    metrics = {}
    while True:
        metrics = collect(page)
        response = latest_response()
        status = int(getattr(response, "status", 0) or 0)
        challenge = is_challenge(metrics) or response_is_challenge(response)
        reason = "PAGE_NOT_READY"
        if challenge:
            reason = "BOT_CHALLENGE"
        elif status >= 400:
            return {**metrics, "auditableReady": False, "readinessError": "HTTP_ERROR"}
        elif 300 <= status < 400:
            reason = "REDIRECT_NOT_SETTLED"
        else:
            content = int(metrics.get("domCount", 0)) >= 25 or int(metrics.get("bodyChars", 0)) >= 300
            loaded = metrics.get("readyState") in {"interactive", "complete"}
            resources = metrics.get("fontsReady", False) and metrics.get("visibleImagesReady", False) and metrics.get("stylesReady", False)
            signature = (metrics.get("url"), metrics.get("domCount"), metrics.get("bodyChars"), metrics.get("layoutSignature"), status)
            if content and loaded and resources:
                if signature != previous:
                    stable_since = time.monotonic()
                elif stable_since is not None and time.monotonic() - stable_since >= 1.5:
                    return {**metrics, "auditableReady": True}
                previous = signature
            else:
                previous, stable_since = None, None
        if challenge or 300 <= status < 400:
            previous, stable_since = None, None
        if time.monotonic() >= deadline:
            return {**metrics, "auditableReady": False, "readinessError": reason}
        try:
            page.wait_for_timeout(500)
        except Exception:
            return {**metrics, "auditableReady": False, "readinessError": "PAGE_CLOSED"}
