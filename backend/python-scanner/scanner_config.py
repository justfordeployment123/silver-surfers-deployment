import os
from typing import Any, Dict


def read_int_env(name: str, default: int, minimum: int = 0) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        return default


MAX_CONCURRENT_AUDITS = read_int_env("SCANNER_MAX_CONCURRENT_AUDITS", 1, 1)
MAX_QUEUED_AUDITS = read_int_env("SCANNER_MAX_QUEUED_AUDITS", 8, 0)
SCANNER_EXECUTOR_WORKERS = read_int_env(
    "SCANNER_EXECUTOR_WORKERS",
    max(2, MAX_CONCURRENT_AUDITS + 1),
    1,
)
KEEP_TEMP_REPORTS = os.getenv("SCANNER_KEEP_TEMP_REPORTS", "false").lower() in {"1", "true", "yes", "on"}


LITE_AUDIT_REFS = [
    {"id": "color-contrast", "weight": 5},
    {"id": "target-size", "weight": 5},
    {"id": "text-font-audit", "weight": 5},
    {"id": "viewport", "weight": 3},
    {"id": "link-name", "weight": 3},
    {"id": "button-name", "weight": 3},
    {"id": "label", "weight": 3},
    {"id": "heading-order", "weight": 2},
    {"id": "is-on-https", "weight": 2},
    {"id": "cumulative-layout-shift", "weight": 1},
    {"id": "user-scalable-audit", "weight": 2},
    {"id": "horizontal-scroll-audit", "weight": 1},
    {"id": "text-size-adjust-audit", "weight": 1},
    {"id": "image-alt", "weight": 3},
]


FULL_AUDIT_REFS = [
    {"id": "color-contrast", "weight": 10},
    {"id": "target-size", "weight": 10},
    {"id": "viewport", "weight": 10},
    {"id": "cumulative-layout-shift", "weight": 10},
    {"id": "text-font-audit", "weight": 15},
    {"id": "layout-brittle-audit", "weight": 2},
    {"id": "flesch-kincaid-audit", "weight": 15},
    {"id": "user-scalable-audit", "weight": 4},
    {"id": "horizontal-scroll-audit", "weight": 3},
    {"id": "text-size-adjust-audit", "weight": 3},
    {"id": "total-blocking-time", "weight": 5},
    {"id": "link-name", "weight": 5},
    {"id": "button-name", "weight": 5},
    {"id": "label", "weight": 5},
    {"id": "interactive-color-audit", "weight": 5},
    {"id": "is-on-https", "weight": 2},
    {"id": "dom-size", "weight": 2},
    {"id": "heading-order", "weight": 2},
    {"id": "errors-in-console", "weight": 2},
    {"id": "geolocation-on-start", "weight": 2},
    {"id": "image-alt", "weight": 5},
    {"id": "focus-traps", "weight": 4},
    {"id": "bypass", "weight": 3},
    {"id": "line-spacing-audit", "weight": 5},
    {"id": "autoplay-audit", "weight": 3},
]


def calculate_score(report: Dict[str, Any], is_lite: bool = False) -> float:
    audit_refs = LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS
    audits = report.get("audits", {})
    total_weighted_score = 0
    total_weight = 0

    for audit_ref in audit_refs:
        audit_id = audit_ref["id"]
        weight = audit_ref["weight"]
        result = audits.get(audit_id)

        if result and (
            result.get("notApplicable")
            or result.get("notChecked")
            or result.get("scoreDisplayMode") in {"notApplicable", "notChecked", "manual"}
        ):
            continue

        score = result.get("score", 0) if result else 0
        if result and result.get("score") is None:
            score = 0

        total_weighted_score += score * weight
        total_weight += weight

    final_score = (total_weighted_score / total_weight * 100) if total_weight > 0 else 0
    return round(final_score, 2)


def get_viewport_for_device(device: str = "desktop") -> Dict[str, Any]:
    device_configs = {
        "desktop": {
            "viewport": {"width": 1920, "height": 1080},
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "device_scale_factor": 1,
            "is_mobile": False,
            "has_touch": False,
        },
        "tablet": {
            "viewport": {"width": 800, "height": 1280},
            "user_agent": "Mozilla/5.0 (Linux; Android 12; SM-X906B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "device_scale_factor": 2,
            "is_mobile": True,
            "has_touch": True,
        },
        "mobile": {
            "viewport": {"width": 360, "height": 780},
            "user_agent": "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
            "device_scale_factor": 3,
            "is_mobile": True,
            "has_touch": True,
        },
    }
    return device_configs.get(device, device_configs["desktop"])
