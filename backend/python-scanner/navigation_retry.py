"""Bounded retries for temporary origin failures; never retry access denial."""
import json
import math
import random
from urllib.parse import urlparse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from page_readiness import is_challenge, response_is_challenge

RETRYABLE_STATUSES = {429, 500, 502, 503, 504, 520, 522, 524}


def retry_delay(response, attempt):
    value = (response.headers or {}).get("retry-after", "")
    if value:
        try:
            seconds = float(value)
            if not math.isfinite(seconds):
                raise ValueError('Invalid Retry-After')
            return max(0, seconds)
        except (ValueError, TypeError):
            try:
                date = parsedate_to_datetime(value)
                if date.tzinfo is None:
                    date = date.replace(tzinfo=timezone.utc)
                return max(0, (date - datetime.now(timezone.utc)).total_seconds())
            except (ValueError, TypeError, OverflowError):
                pass
    return min(30, 3 * (2 ** attempt)) + random.uniform(0, 1)


def navigate_with_retries(page, url, navigate, max_attempts=3, wait_budget=60):
    response = None
    for attempt in range(max_attempts):
        response = navigate(page, url)
        status = int(getattr(response, "status", 0) or 0)
        print("Navigation response: " + json.dumps({
            "status": status, "attempt": attempt + 1,
            "finalHost": urlparse(page.url).hostname,
        }))
        try:
            challenge = response_is_challenge(response) or is_challenge({"title": page.title()})
        except Exception:
            challenge = response_is_challenge(response)
        if challenge:
            # Keep the document alive so its verification scripts can finish.
            break
        if status not in RETRYABLE_STATUSES or attempt + 1 == max_attempts:
            break
        delay = retry_delay(response, attempt)
        # Do not retry earlier than requested when the server's delay exceeds our budget.
        if delay > wait_budget:
            break
        print("Retrying temporary navigation failure: " + json.dumps({
            "status": status, "delaySeconds": round(delay, 2),
        }))
        page.wait_for_timeout(delay * 1000)
        wait_budget -= delay
    return response
