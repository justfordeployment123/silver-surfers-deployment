import asyncio
import os
from typing import Any

from scanner_config import KEEP_TEMP_REPORTS


def run_with_clean_event_loop_context(fn, *args):
    try:
        asyncio.set_event_loop(None)
    except Exception:
        pass

    return fn(*args)


def safe_text(value: Any) -> str:
    if value is None:
        return ""

    try:
        text = str(value)
        return text.encode("utf-8", errors="replace").decode("utf-8")
    except Exception:
        return "[Invalid text encoding]"


def sanitize_report_data(data: Any) -> Any:
    if isinstance(data, dict):
        return {key: sanitize_report_data(value) for key, value in data.items()}
    if isinstance(data, list):
        return [sanitize_report_data(item) for item in data]
    if isinstance(data, str):
        return safe_text(data)
    return data


def cleanup_temp_report(report_path: str) -> None:
    if KEEP_TEMP_REPORTS:
        return

    try:
        os.remove(report_path)
        print(f"Cleaned up temporary report: {report_path}")
    except FileNotFoundError:
        return
    except Exception as cleanup_error:
        print(f"Warning: failed to clean temporary report {report_path}: {cleanup_error}")
