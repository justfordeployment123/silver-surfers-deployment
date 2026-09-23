"""Bounded access fallback, independent of accessibility scores."""
import json
import os
import hashlib
import uuid
import time
import math
import re
from contextvars import ContextVar
from urllib.parse import urlsplit


PROXY_ELIGIBLE_ERRORS = frozenset({"ACCESS_DENIED", "BOT_CHALLENGE", "EMPTY_DOCUMENT", "TLS_HANDSHAKE_ERROR"})
proxy_country_context = ContextVar("proxy_country", default=None)


def proxy_countries(env=None):
    env = os.environ if env is None else env
    raw = env.get("SCANNER_PROXY_COUNTRIES", "").strip()
    if not raw:
        return []
    countries = [c.strip().lower() for c in raw.split(",")]
    if len(countries) > 3 or len(set(countries)) != len(countries) or any(c not in {"us", "pk", "de"} for c in countries):
        raise ValueError("SCANNER_PROXY_COUNTRIES must contain up to three unique values from us,pk,de")
    username = env.get("SCANNER_PROXY_USERNAME", "")
    if "country-{country}" not in username or "sid-{session}" not in username:
        raise ValueError("Country pool requires country-{country} and sid-{session} in SCANNER_PROXY_USERNAME")
    if any(token in username for token in ("-region-", "-city-", "-isp-", "-zip-")):
        raise ValueError("Remove region/city/ISP/ZIP restrictions before enabling the country pool")
    return countries


def _run_country_pool(attempt, mode, countries):
    history = []
    result = None
    routes = ([None] if mode == "fallback" else []) + countries
    for country in routes:
        if result is not None:
            if result.get("success") or result.get("errorCode") not in PROXY_ELIGIBLE_ERRORS:
                break
            delay = float(result.get("retryAfterSeconds") or 0)
            if not math.isfinite(delay) or delay > 60:
                result["proxyFallbackDeferred"] = True
                break
            if delay > 0:
                time.sleep(delay)
        # Context-local routing avoids mutating process-wide credentials in concurrent scans.
        token = proxy_country_context.set(country)
        try:
            print("Scanner access attempt: " + json.dumps({"attempt": len(history) + 1, "requestedCountry": country, "proxyEnabled": country is not None}))
            result = attempt(country is not None)
        finally:
            proxy_country_context.reset(token)
        history.append({"requestedCountry": country, "success": bool(result.get("success")), "errorCode": result.get("errorCode")})
    result["proxyAttempts"] = history
    result["proxyFallbackAttempted"] = mode == "fallback" and len(history) > 1
    if mode == "fallback":
        result["directErrorCode"] = history[0]["errorCode"]
    result["requestedProxyCountry"] = history[-1]["requestedCountry"]
    return result


def is_unknown_tls_handshake(error):
    return bool(re.search(r"\bSSL_ERROR_UNKNOWN\b", str(error)))


def proxy_session_id(job_id=None):
    """Stable across a job's targets/redelivery, without exposing the job ID."""
    return hashlib.sha256(str(job_id).encode()).hexdigest()[:20] if job_id else uuid.uuid4().hex[:20]


def bare_host(hostname):
    return (hostname or "").lower().removeprefix("www.")


def registrable_domain(hostname):
    """Last two labels of a bare hostname (UAT: ign.com's monitoring scan
    was blocked as a cross-domain redirect because it regionally redirects
    to nordic.ign.com — a same-brand subdomain hop, not the bot-wall
    hijack (e.g. ShieldSquare/Radware routing to unrelated validation
    infrastructure) this check exists to catch). Comparing full hostnames
    treated every subdomain redirect as suspicious; comparing registrable
    domains only flags a redirect that actually leaves the site.

    This is a pragmatic non-PSL-aware heuristic, not a real public-suffix
    lookup — it under-matches on multi-part TLDs (foo.co.uk and bar.co.uk
    both reduce to "co.uk"), which trades a rare missed bot-wall on those
    TLDs for not blocking ordinary regional/marketing subdomain redirects
    everywhere else. The bot-wall text-fingerprint and near-empty-DOM
    checks are the backstop for that rare case.
    """
    labels = bare_host(hostname).split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else bare_host(hostname)


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
    normalize = lambda url: (urlsplit(url).hostname or "")
    requested_host = normalize(requested_url)
    final_host = normalize(final_url)
    if requested_host and final_host and registrable_domain(requested_host) != registrable_domain(final_host):
        return "CROSS_DOMAIN_REDIRECT"
    return None


def proxy_mode(env=None):
    env = os.environ if env is None else env
    legacy = "always" if env.get("SCANNER_PROXY_ENABLED", "false").lower() == "true" else "off"
    mode = env.get("SCANNER_PROXY_MODE", legacy).strip().lower()
    if mode not in {"off", "always", "fallback"}:
        raise ValueError("SCANNER_PROXY_MODE must be off, always, or fallback")
    return mode


def run_with_proxy_fallback(attempt, mode, *, site_url=None):
    from full_scan_proxy import active_full_scan
    full_scan = active_full_scan.get()
    if full_scan is not None and mode != "off":
        return full_scan.run(attempt, site_url)
    countries = proxy_countries() if mode != "off" else []
    if countries:
        return _run_country_pool(attempt, mode, countries)
    # Exceptions (TLS, startup, programming failures) are not access evidence.
    result = attempt(mode == "always")
    if mode != "fallback" or result.get("success") or result.get("errorCode") not in PROXY_ELIGIBLE_ERRORS:
        return result
    delay = float(result.get("retryAfterSeconds") or 0)
    if not math.isfinite(delay) or delay > 60:
        result["proxyFallbackDeferred"] = True
        return result
    if delay > 0:
        time.sleep(delay)
    print("Scanner proxy fallback: " + json.dumps({"reason": result.get("errorCode"), "attempt": 1}))
    retried = attempt(True)
    retried["proxyFallbackAttempted"] = True
    retried["directErrorCode"] = result.get("errorCode")
    print("Scanner proxy fallback completed: " + json.dumps({"success": bool(retried.get("success")), "errorCode": retried.get("errorCode")}))
    return retried
