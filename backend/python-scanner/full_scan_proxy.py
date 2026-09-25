"""Job-scoped proxy routing and a checkpointed browser-attempt budget."""
import hashlib
import json
import time
import math
from contextlib import contextmanager
from contextvars import ContextVar
from urllib.parse import urlsplit

from proxy_fallback import PROXY_ELIGIBLE_ERRORS, proxy_country_context

active_full_scan = ContextVar("active_full_scan", default=None)


class ProxyStateError(RuntimeError):
    error_code = "PROXY_STATE_ERROR"


class S3ProxyCheckpoint:
    def __init__(self, s3, bucket, prefix, job_id):
        self.s3, self.bucket = s3, bucket
        identity = hashlib.sha256(job_id.encode()).hexdigest()
        self.key = f"{prefix}/proxy-state/{identity}.json"
        self.etag = None

    def load(self):
        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=self.key)
        except Exception as error:
            if getattr(error, "response", {}).get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                return None
            raise ProxyStateError("Cannot read full-scan proxy checkpoint; no proxy traffic started.") from error
        self.etag = response["ETag"]
        body = response["Body"]
        try:
            return json.loads(body.read())
        finally:
            body.close()

    def save(self, state):
        condition = {"IfMatch": self.etag} if self.etag else {"IfNoneMatch": "*"}
        try:
            response = self.s3.put_object(
                Bucket=self.bucket, Key=self.key, Body=json.dumps(state).encode(),
                ContentType="application/json", **condition,
            )
            self.etag = response["ETag"]
        except Exception as error:
            # Do not retry a stale writer and overwrite another worker's reservations.
            raise ProxyStateError("Cannot reserve full-scan proxy budget; checkpoint conflict or storage failure.") from error


class FullScanProxy:
    def __init__(self, countries, mode, max_attempts=300, checkpoint=None):
        self.routes = countries or ["configured"]
        self.mode = mode
        self.checkpoint = checkpoint
        self.failed = False
        loaded = checkpoint.load() if checkpoint else None
        self.state = loaded or {"schemaVersion": 1, "countries": self.routes, "mode": mode,
                                "proxyAttempts": 0, "maxAttempts": max_attempts, "sites": {}}
        if self.state.get("schemaVersion") != 1 or self.state.get("countries") != self.routes or self.state.get("mode") != mode:
            raise ProxyStateError("Proxy configuration changed for this job; use a new job ID.")
        self.state["maxAttempts"] = min(self.state["maxAttempts"], max_attempts)
        self.discovery = None

    @contextmanager
    def scope(self):
        token = active_full_scan.set(self)
        try:
            yield self
        finally:
            active_full_scan.reset(token)

    def save(self):
        if self.failed:
            raise ProxyStateError("Full-scan proxy checkpoint is unavailable.")
        if self.checkpoint:
            try:
                self.checkpoint.save(self.state)
            except Exception:
                self.failed = True
                raise

    def run(self, attempt, url):
        host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
        if not host:
            raise ProxyStateError("Full-scan proxy routing requires a website hostname.")
        site = self.state["sites"].setdefault(host, {"route": -1 if self.mode == "fallback" else 0})
        history = []
        while True:
            route = site["route"]
            if self.failed:
                raise ProxyStateError("Full-scan proxy checkpoint is unavailable.")
            if site.get("retryAt", 0) > time.time():
                return {"success": False, "errorCode": "RATE_LIMITED", "error": "Site cooldown is still active; page not audited.",
                        "retryAfterSeconds": math.ceil(site["retryAt"] - time.time())}
            if route >= len(self.routes) or (route >= 0 and self.state["proxyAttempts"] >= self.state["maxAttempts"]):
                return {"success": False, "errorCode": "PROXY_BUDGET_EXHAUSTED",
                        "error": "Full-scan proxy routes or browser-attempt budget exhausted; page not audited.",
                        "proxyAttempts": history, "proxyBudget": self.summary()}
            country = self.routes[route] if route >= 0 else None
            if route >= 0:
                # Reserve before opening a browser, including on SQS redelivery.
                self.state["proxyAttempts"] += 1
                self.save()
            token = proxy_country_context.set(None if country == "configured" else country)
            try:
                result = attempt(route >= 0)
            finally:
                proxy_country_context.reset(token)
            history.append({"requestedCountry": country, "success": bool(result.get("success")),
                            "errorCode": result.get("errorCode")})
            print("Full-scan access result: " + json.dumps({"host": host, **history[-1],
                                                           "jobProxyAttempts": self.state["proxyAttempts"]}))
            result["proxyAttempts"] = history
            result["requestedProxyCountry"] = country
            result["proxyBudget"] = self.summary()
            delay = float(result.get("retryAfterSeconds") or 0)
            if not math.isfinite(delay):
                delay = 3600
            if not result.get("success") and (delay > 0 or result.get("errorCode") == "RATE_LIMITED"):
                site["retryAt"] = time.time() + max(delay, 60)
                self.save()
                result["proxyFallbackDeferred"] = True
                return result
            if result.get("success") or result.get("errorCode") not in PROXY_ELIGIBLE_ERRORS:
                return result
            site["route"] += 1
            self.save()
            if site["route"] >= len(self.routes):
                return result

    def summary(self):
        return {"proxyBrowserAttempts": self.state["proxyAttempts"],
                "maxProxyBrowserAttempts": self.state["maxAttempts"],
                "sites": {host: {"route": self.routes[s["route"]] if 0 <= s["route"] < len(self.routes)
                                  else "direct" if s["route"] == -1 else "exhausted"}
                          for host, s in self.state["sites"].items()}}
