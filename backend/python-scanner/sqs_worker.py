"""
SQS scanner worker for production/Fargate deployments.

The Node backend owns users, DB updates, PDF generation, and email delivery.
This worker only does browser scanning, stores raw JSON in S3, and emits a
small completion message back to the result queue.
"""

import json
import logging
import os
import signal
import time
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import boto3

from camoufox_auditor import run_camoufox_audit_sync
from scanner_config import get_viewport_for_device
from scanner_utils import run_with_clean_event_loop_context, safe_text, sanitize_report_data


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("scanner-sqs-worker")

_shutdown_requested = False


def _request_shutdown(signum, _frame):
    global _shutdown_requested
    _shutdown_requested = True
    logger.info("Shutdown requested.", extra={"signal": signum})


signal.signal(signal.SIGINT, _request_shutdown)
signal.signal(signal.SIGTERM, _request_shutdown)


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required for scanner SQS worker mode.")
    return value


def _optional_int(name: str, fallback: int) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return fallback

    try:
        return int(raw_value)
    except ValueError:
        return fallback


def _sanitize_key_segment(value: str, fallback: str = "scan") -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in str(value or ""))
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned[:100] or fallback


def _resolve_hostname(url: str) -> str:
    try:
        parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
        return _sanitize_key_segment(parsed.hostname or "unknown", "unknown")
    except Exception:
        return _sanitize_key_segment(url, "unknown")


def _normalize_url(url: str) -> str:
    return url if url.startswith(("http://", "https://")) else f"https://{url}"


class ScannerSqsWorker:
    def __init__(self):
        self.job_queue_url = _required_env("SCANNER_SQS_JOB_QUEUE_URL")
        self.result_queue_url = _required_env("SCANNER_SQS_RESULT_QUEUE_URL")
        self.bucket = os.getenv("SCANNER_SQS_ARTIFACT_BUCKET", "").strip() or _required_env("AWS_S3_BUCKET")
        self.region = (
            os.getenv("SCANNER_SQS_ARTIFACT_REGION", "").strip()
            or os.getenv("AWS_REGION", "").strip()
            or "us-east-1"
        )
        self.prefix = os.getenv("SCANNER_SQS_ARTIFACT_PREFIX", "silver-surfers/scanner-results").strip("/")
        self.wait_time_seconds = _optional_int("SCANNER_SQS_WAIT_TIME_SECONDS", 20)
        self.visibility_timeout_seconds = _optional_int("SCANNER_SQS_JOB_VISIBILITY_TIMEOUT_SECONDS", 900)

        sqs_endpoint_url = os.getenv("AWS_SQS_ENDPOINT_URL", "").strip() or None
        s3_endpoint_url = os.getenv("AWS_S3_ENDPOINT", "").strip() or None
        force_path_style = os.getenv("AWS_S3_FORCE_PATH_STYLE", "").strip().lower() == "true"

        self.sqs = boto3.client("sqs", region_name=self.region, endpoint_url=sqs_endpoint_url)
        s3_config: Dict[str, Any] = {"region_name": self.region}
        if s3_endpoint_url:
            s3_config["endpoint_url"] = s3_endpoint_url
        if force_path_style:
            from botocore.config import Config

            s3_config["config"] = Config(s3={"addressing_style": "path"})
        self.s3 = boto3.client("s3", **s3_config)

    def run_forever(self) -> None:
        logger.info(
            "Scanner SQS worker started.",
            extra={
                "jobQueueUrl": self.job_queue_url,
                "resultQueueUrl": self.result_queue_url,
                "bucket": self.bucket,
                "prefix": self.prefix,
            },
        )

        while not _shutdown_requested:
            response = self.sqs.receive_message(
                QueueUrl=self.job_queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=self.wait_time_seconds,
                VisibilityTimeout=self.visibility_timeout_seconds,
            )

            for message in response.get("Messages", []):
                self._handle_message(message)

        logger.info("Scanner SQS worker stopped.")

    def _handle_message(self, message: Dict[str, Any]) -> None:
        receipt_handle = message.get("ReceiptHandle")
        payload = self._parse_payload(message.get("Body"))
        scanner_job_id = safe_text(payload.get("scannerJobId") or f"unknown-{int(time.time() * 1000)}")

        try:
            result = self._process_scan_job(scanner_job_id, payload)
            self._send_result(result)
            if receipt_handle:
                self.sqs.delete_message(QueueUrl=self.job_queue_url, ReceiptHandle=receipt_handle)
        except Exception as error:
            error_message = safe_text(str(error))
            logger.exception("Scanner SQS job failed.", extra={"scannerJobId": scanner_job_id})
            self._send_result(
                {
                    "schemaVersion": 1,
                    "scannerJobId": scanner_job_id,
                    "success": False,
                    "error": error_message,
                    "errorCode": "SCANNER_WORKER_FAILED",
                }
            )
            if receipt_handle:
                self.sqs.delete_message(QueueUrl=self.job_queue_url, ReceiptHandle=receipt_handle)

    def _parse_payload(self, body: Optional[str]) -> Dict[str, Any]:
        if not body:
            raise RuntimeError("SQS message body is empty.")

        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise RuntimeError("SQS message body must be a JSON object.")

        return payload

    def _process_scan_job(self, scanner_job_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        raw_url = safe_text(payload.get("url") or "").strip()
        if not raw_url:
            raise RuntimeError("Scanner job URL is required.")
        url = _normalize_url(raw_url)

        device = safe_text(payload.get("device") or "desktop")
        is_lite_version = bool(payload.get("isLiteVersion"))
        version = "Lite" if is_lite_version else "Full"
        device_config = get_viewport_for_device(device)

        logger.info(
            "Starting scanner SQS audit.",
            extra={
                "scannerJobId": scanner_job_id,
                "url": url,
                "device": device,
                "isLiteVersion": is_lite_version,
            },
        )

        result = run_with_clean_event_loop_context(
            run_camoufox_audit_sync,
            url,
            device_config,
            is_lite_version,
        )

        if not result.get("success"):
            raise RuntimeError(result.get("error") or "Audit failed.")

        final_score = result.get("score")
        if final_score == 0:
            raise RuntimeError("Audit score is 0, indicating a failed audit.")

        report = sanitize_report_data(result.get("report") or {})
        key = self._build_artifact_key(scanner_job_id, url, is_lite_version)
        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json",
        )

        logger.info(
            "Scanner SQS audit completed.",
            extra={
                "scannerJobId": scanner_job_id,
                "url": url,
                "score": final_score,
                "s3Key": key,
            },
        )

        return {
            "schemaVersion": 1,
            "scannerJobId": scanner_job_id,
            "success": True,
            "report": {
                "bucket": self.bucket,
                "region": self.region,
                "key": key,
            },
            "isLiteVersion": is_lite_version,
            "version": version,
            "url": url,
            "device": device,
            "strategy": "Python-Camoufox-SQS",
            "attemptNumber": 1,
            "message": f"{version} audit completed successfully by scanner SQS worker.",
        }

    def _build_artifact_key(self, scanner_job_id: str, url: str, is_lite_version: bool) -> str:
        version = "lite" if is_lite_version else "full"
        hostname = _resolve_hostname(url)
        timestamp = int(time.time() * 1000)
        return (
            f"{self.prefix}/{time.strftime('%Y/%m/%d')}/"
            f"{_sanitize_key_segment(scanner_job_id)}/"
            f"report-{hostname}-{timestamp}-{version}.json"
        )

    def _send_result(self, result: Dict[str, Any]) -> None:
        self.sqs.send_message(
            QueueUrl=self.result_queue_url,
            MessageBody=json.dumps(result),
        )


def main() -> None:
    ScannerSqsWorker().run_forever()


if __name__ == "__main__":
    main()
