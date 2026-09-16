"""Bounded access fallback, independent of accessibility scores."""
import json
import os
import hashlib
import uuid
from urllib.parse import urlsplit


PROXY_ELIGIBLE_ERRORS = frozenset({"ACCESS_DENIED", "BOT_CHALLENGE"})


def proxy_session_id(job_id=None):
    """Stable across a job's targets/redelivery, without exposing the job ID."""
    return hashlib.sha256(str(job_id).encode()).hexdigest()[:20] if job_id else uuid.uuid4().hex[:20]


def discovery_access_error(status, title, requested_url, final_url):
    # Do not turn rate limits or missing pages into proxy retries.
    if status == 429:
        return "RATE_LIMITED"
    if status == 404:
        return "PAGE_NOT_FOUND"
    title = str(title or "").strip().lower()
    if title in {"just a moment...", "just a moment", "checking your browser", "attention required! | cloudflare"}:
        return "BOT_CHALLENGE"
    if status == 403:
        return "ACCESS_DENIED"
    if status >= 400:
        return "PAGE_HTTP_ERROR"
    normalize = lambda url: (urlsplit(url).hostname or "").lower().removeprefix("www.")
    if normalize(requested_url) != normalize(final_url):
        return "CROSS_DOMAIN_REDIRECT"
    return None


def proxy_mode(env=None):
    env = os.environ if env is None else env
    legacy = "always" if env.get("SCANNER_PROXY_ENABLED", "false").lower() == "true" else "off"
    mode = env.get("SCANNER_PROXY_MODE", legacy).strip().lower()
    if mode not in {"off", "always", "fallback"}:
        raise ValueError("SCANNER_PROXY_MODE must be off, always, or fallback")
    return mode


def run_with_proxy_fallback(attempt, mode):
    # Exceptions (TLS, startup, programming failures) are not access evidence.
    result = attempt(mode == "always")
    if mode != "fallback" or result.get("success") or result.get("errorCode") not in PROXY_ELIGIBLE_ERRORS:
        return result
    print("Scanner proxy fallback: " + json.dumps({"reason": result.get("errorCode"), "attempt": 1}))
    retried = attempt(True)
    retried["proxyFallbackAttempted"] = True
    retried["directErrorCode"] = result.get("errorCode")
    print("Scanner proxy fallback completed: " + json.dumps({"success": bool(retried.get("success")), "errorCode": retried.get("errorCode")}))
    return retried
