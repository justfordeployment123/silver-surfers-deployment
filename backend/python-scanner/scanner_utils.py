import concurrent.futures
import os
from typing import Any

from scanner_config import KEEP_TEMP_REPORTS


def run_with_clean_event_loop_context(fn, *args):
    # Playwright sync API cannot run inside a running asyncio event loop.
    # Running in a fresh ThreadPoolExecutor thread guarantees no inherited loop.
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        return executor.submit(fn, *args).result()


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
