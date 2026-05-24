"""
SQS scanner worker for production/Fargate deployments.

The Node backend owns users, DB updates, PDF generation, and email delivery.
This worker owns scanner-side browser work, stores raw JSON/PDF artifacts in S3,
and emits a small completion message back to the result queue.
"""

import json
import logging
import os
import re
import signal
import subprocess
import tempfile
import time
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import request as url_request
from urllib.parse import urlparse

import boto3

from camoufox_auditor import run_camoufox_audit_sync
from scanner_config import get_viewport_for_device
from scanner_service import _extract_links_sync
from scanner_utils import run_with_clean_event_loop_context, safe_text, sanitize_report_data


_LOG_CONTEXT: Dict[str, Any] = {}
_LOG_STANDARD_FIELDS = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
}


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        payload.update(_LOG_CONTEXT)

        for key, value in record.__dict__.items():
            if key in _LOG_STANDARD_FIELDS or key.startswith("_"):
                continue
            payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str, ensure_ascii=False)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())


def _set_log_context(**context: Any) -> None:
    for key, value in context.items():
        if value is not None and value != "":
            _LOG_CONTEXT[key] = value


_configure_logging()
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


def _optional_int_from_value(value: Any, fallback: int) -> int:
    try:
        if value is None or value == "":
            return fallback
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _optional_bool(name: str, fallback: bool) -> bool:
    raw_value = os.getenv(name, "").strip().lower()
    if not raw_value:
        return fallback

    return raw_value in {"1", "true", "yes", "on"}


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


_LANGUAGE_CODE_SEGMENTS = {
    "am", "ar", "bg", "bn", "bs", "ca", "cs", "da", "de", "el", "es", "et", "fa", "fi", "fr", "gu",
    "hi", "hr", "hu", "hy", "id", "is", "it", "ja", "ka", "kk", "kn", "ko", "lt", "lv", "mk", "ml",
    "mn", "mr", "ms", "my", "nb", "nl", "pa", "pl", "pt", "ro", "ru", "sk", "sl", "so", "sq", "sr",
    "sv", "sw", "ta", "te", "th", "tl", "tr", "uk", "ur", "vi", "zh",
}


def _canonical_page_url(url: str) -> Optional[Dict[str, str]]:
    try:
        parsed = urlparse(_normalize_url(url))
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None

        path = re.sub(r"/{2,}", "/", parsed.path or "/")
        if path != "/" and path.endswith("/"):
            path = path[:-1]

        normalized_host = (parsed.hostname or parsed.netloc).lower()
        comparable_host = normalized_host[4:] if normalized_host.startswith("www.") else normalized_host
        comparable_path = path.lower()
        if comparable_path in {"", "/", "/home"}:
            comparable_path = "/"

        return {
            "url": f"{parsed.scheme}://{normalized_host}{path if path != '/' else ''}",
            "host": comparable_host,
            "path": path,
            "key": f"{comparable_host}{comparable_path}",
        }
    except Exception:
        return None


def _is_locale_path(path: str) -> bool:
    first = path.strip("/").split("/", 1)[0]
    if not first:
        return False

    normalized = first.replace("_", "-")
    language = normalized.split("-", 1)[0].lower()
    return language in _LANGUAGE_CODE_SEGMENTS and bool(re.fullmatch(r"[a-z]{2,3}(?:-[a-z]{2,4})?", normalized, re.I))


def _is_orchestration_candidate(url: str, home_key: str) -> bool:
    canonical = _canonical_page_url(url)
    if not canonical:
        return False
    path = canonical["path"].lower()
    if canonical["key"] == home_key:
        return True
    if _is_locale_path(path):
        return False
    if re.search(r"/(api|_next|static|assets|cdn-cgi)(/|$)", path):
        return False
    if re.search(r"\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|exe|woff|woff2|ttf|xml|json|csv|mp4|mp3)$", path):
        return False
    if re.search(r"/(translate|writing)/", path) or path.startswith("/translate") or path.startswith("/writing"):
        return False
    if path.startswith("/images/i/"):
        return False
    if re.search(r"/(cart|checkout|identity|login|signin|sign-in|register|profile|account|orderlookup|searchpage)", path):
        return False
    return True


def _orchestration_page_score(url: str, home_key: str) -> int:
    canonical = _canonical_page_url(url)
    if not canonical:
        return -100
    if canonical["key"] == home_key:
        return 100

    path = canonical["path"].lower().strip("/")
    first = path.split("/", 1)[0]
    score = 20

    primary_keywords = {
        "pricing", "plans", "services", "service", "products", "product", "features", "solutions",
        "business", "enterprise", "industries", "platform", "codex",
    }
    secondary_keywords = {"about", "contact", "support", "help", "company", "faq", "faqs"}

    if first in primary_keywords or any(f"/{keyword}/" in f"/{path}/" for keyword in primary_keywords):
        score += 50
    if first in secondary_keywords or any(f"/{keyword}" in f"/{path}" for keyword in secondary_keywords):
        score += 35
    if re.search(r"/(privacy|terms|legal|cookie|accessibility)(/|$)", f"/{path}/"):
        score -= 20
    if re.search(r"(pcmcat|pcmid|abcat|cat[0-9]{3,})", path):
        score -= 18
    if len(path.split("/")) > 2:
        score -= min(24, (len(path.split("/")) - 2) * 8)

    return score


def _format_size_mb(size: int) -> str:
    return f"{size / (1024 * 1024):.2f}"


def _last_arn_segment(value: str) -> str:
    return safe_text(value).rsplit("/", 1)[-1] if value else ""


class JobStdoutLogger:
    def __init__(self, context: Dict[str, Any]):
        self.context = context
        self.buffer = ""

    def write(self, value: str) -> int:
        self.buffer += value
        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            self._log_line(line)
        return len(value)

    def flush(self) -> None:
        if self.buffer:
            self._log_line(self.buffer)
            self.buffer = ""

    def _log_line(self, line: str) -> None:
        normalized = line.strip()
        if normalized:
            logger.info("Scanner output.", extra={**self.context, "output": normalized})


class EcsTaskProtection:
    def __init__(self, region: str):
        self.enabled = _optional_bool("SCANNER_ECS_TASK_PROTECTION_ENABLED", True)
        self.expires_in_minutes = _optional_int("SCANNER_ECS_TASK_PROTECTION_EXPIRES_MINUTES", 180)
        self.agent_uri = os.getenv("ECS_AGENT_URI", "").strip()
        self.metadata_uri = os.getenv("ECS_CONTAINER_METADATA_URI_V4", "").strip()
        self.cluster: Optional[str] = None
        self.task_arn: Optional[str] = None
        self.ecs = None

        if self.metadata_uri:
            try:
                self._load_task_metadata()
            except Exception as error:
                logger.warning(
                    "Failed to load ECS task metadata for logging.",
                    extra={"error": safe_text(str(error))},
                )

        if self.enabled and not self.agent_uri and not self.metadata_uri:
            logger.info("ECS task protection unavailable outside ECS; continuing without it.")
            self.enabled = False

        if self.enabled and not self.agent_uri:
            self.ecs = boto3.client("ecs", region_name=region)

    def protect(self, scanner_job_id: str) -> None:
        self._set_protection(True, scanner_job_id)

    def unprotect(self, scanner_job_id: str) -> None:
        self._set_protection(False, scanner_job_id)

    def _set_protection(self, protection_enabled: bool, scanner_job_id: str) -> None:
        if not self.enabled:
            logger.info(
                "ECS task scale-in protection skipped because it is disabled or unavailable.",
                extra={
                    "scannerJobId": scanner_job_id,
                    "protectionEnabled": protection_enabled,
                },
            )
            return

        requested_expires_at = (
            datetime.now(timezone.utc) + timedelta(minutes=self.expires_in_minutes)
            if protection_enabled
            else None
        )
        protection_method = "agent" if self.agent_uri else "ecs-api"

        logger.info(
            "Requesting ECS task scale-in protection update.",
            extra={
                "scannerJobId": scanner_job_id,
                "protectionEnabled": protection_enabled,
                "protectionMethod": protection_method,
                "expiresInMinutes": self.expires_in_minutes if protection_enabled else None,
                "requestedExpiresAt": requested_expires_at.isoformat() if requested_expires_at else None,
                "ecsCluster": _last_arn_segment(self.cluster or ""),
                "ecsTaskId": _last_arn_segment(self.task_arn or ""),
            },
        )

        try:
            if self.agent_uri:
                protection_details = self._set_protection_via_agent(protection_enabled)
            else:
                protection_details = self._set_protection_via_api(protection_enabled)

            logger.info(
                "Updated ECS task scale-in protection.",
                extra={
                    "scannerJobId": scanner_job_id,
                    "protectionEnabled": protection_enabled,
                    "protectionMethod": protection_method,
                    "expiresInMinutes": self.expires_in_minutes if protection_enabled else None,
                    "requestedExpiresAt": requested_expires_at.isoformat() if requested_expires_at else None,
                    **protection_details,
                },
            )
        except Exception as error:
            logger.warning(
                "Failed to update ECS task scale-in protection; continuing scan.",
                extra={
                    "scannerJobId": scanner_job_id,
                    "protectionEnabled": protection_enabled,
                    "protectionMethod": protection_method,
                    "expiresInMinutes": self.expires_in_minutes if protection_enabled else None,
                    "requestedExpiresAt": requested_expires_at.isoformat() if requested_expires_at else None,
                    "error": safe_text(str(error)),
                },
            )

    def _set_protection_via_agent(self, protection_enabled: bool) -> Dict[str, Any]:
        body: Dict[str, Any] = {"ProtectionEnabled": protection_enabled}
        if protection_enabled:
            body["ExpiresInMinutes"] = self.expires_in_minutes

        request = url_request.Request(
            f"{self.agent_uri}/task-protection/v1/state",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PUT",
        )
        with url_request.urlopen(request, timeout=10) as response:
            if response.status >= 400:
                raise RuntimeError(f"ECS task protection endpoint returned HTTP {response.status}.")
            response_body = response.read().decode("utf-8").strip()

        details: Dict[str, Any] = {
            "taskProtectionHttpStatus": response.status,
        }
        if response_body:
            try:
                parsed_response = json.loads(response_body)
                if isinstance(parsed_response, dict):
                    details["taskProtectionResponse"] = parsed_response
            except Exception:
                details["taskProtectionResponseText"] = response_body[:1000]

        return details

    def _set_protection_via_api(self, protection_enabled: bool) -> Dict[str, Any]:
        if not self.cluster or not self.task_arn:
            self._load_task_metadata()

        if not self.cluster or not self.task_arn:
            raise RuntimeError("ECS task metadata did not include cluster/task ARN.")

        params: Dict[str, Any] = {
            "cluster": self.cluster,
            "tasks": [self.task_arn],
            "protectionEnabled": protection_enabled,
        }
        if protection_enabled:
            params["expiresInMinutes"] = self.expires_in_minutes

        response = self.ecs.update_task_protection(**params)
        protections = response.get("protectedTasks") if isinstance(response, dict) else None
        failures = response.get("failures") if isinstance(response, dict) else None

        details: Dict[str, Any] = {}
        if protections:
            details["taskProtectionResponse"] = protections
        if failures:
            details["taskProtectionFailures"] = failures

        return details

    def _load_task_metadata(self) -> None:
        if not self.metadata_uri:
            return

        with url_request.urlopen(f"{self.metadata_uri}/task", timeout=10) as response:
            if response.status >= 400:
                raise RuntimeError(f"ECS task metadata endpoint returned HTTP {response.status}.")
            metadata = json.loads(response.read().decode("utf-8"))

        self.cluster = safe_text(metadata.get("Cluster") or "")
        self.task_arn = safe_text(metadata.get("TaskARN") or "")
        containers = metadata.get("Containers") if isinstance(metadata, dict) else None
        container_name = ""
        if isinstance(containers, list) and containers:
            first_container = containers[0] if isinstance(containers[0], dict) else {}
            container_name = safe_text(first_container.get("Name") or "")

        _set_log_context(
            ecsCluster=_last_arn_segment(self.cluster),
            ecsTaskArn=self.task_arn,
            ecsTaskId=_last_arn_segment(self.task_arn),
            ecsContainerName=container_name,
            ecsAvailabilityZone=safe_text(metadata.get("AvailabilityZone") or ""),
        )


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
        self.generate_full_audit_reports = _optional_bool("SCANNER_FULL_AUDIT_GENERATE_REPORTS_ENABLED", False)
        self.final_report_prefix = os.getenv("SCANNER_SQS_FINAL_REPORT_PREFIX", "silver-surfers/audit-reports").strip("/")
        self.s3_url_mode = os.getenv("AWS_S3_URL_MODE", "signed").strip().lower()
        self.signed_url_expires_seconds = _optional_int("AWS_S3_SIGNED_URL_EXPIRES_SECONDS", 7 * 24 * 60 * 60)

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
        self.task_protection = EcsTaskProtection(self.region)

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
        queue_kind = safe_text(payload.get("queueKind") or os.getenv("SCANNER_QUEUE_KIND", "default"))

        try:
            self.task_protection.protect(scanner_job_id)
            result = self._process_scan_job(scanner_job_id, payload, receipt_handle)
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
                    "queueKind": queue_kind,
                    "success": False,
                    "error": error_message,
                    "errorCode": "SCANNER_WORKER_FAILED",
                }
            )
            if receipt_handle:
                self.sqs.delete_message(QueueUrl=self.job_queue_url, ReceiptHandle=receipt_handle)
        finally:
            self.task_protection.unprotect(scanner_job_id)

    def _parse_payload(self, body: Optional[str]) -> Dict[str, Any]:
        if not body:
            raise RuntimeError("SQS message body is empty.")

        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise RuntimeError("SQS message body must be a JSON object.")

        return payload

    def _process_scan_job(
        self,
        scanner_job_id: str,
        payload: Dict[str, Any],
        receipt_handle: Optional[str] = None,
    ) -> Dict[str, Any]:
        if safe_text(payload.get("jobType")) == "fullAuditBatch":
            return self._process_full_audit_batch_job(scanner_job_id, payload, receipt_handle)

        started_at = time.time()
        raw_url = safe_text(payload.get("url") or "").strip()
        if not raw_url:
            raise RuntimeError("Scanner job URL is required.")
        url = _normalize_url(raw_url)

        device = safe_text(payload.get("device") or "desktop")
        queue_kind = safe_text(payload.get("queueKind") or os.getenv("SCANNER_QUEUE_KIND", "default"))
        is_lite_version = bool(payload.get("isLiteVersion"))
        version = "Lite" if is_lite_version else "Full"
        device_config = get_viewport_for_device(device)

        logger.info(
            "Starting scanner SQS audit.",
            extra={
                "scannerJobId": scanner_job_id,
                "url": url,
                "device": device,
                "queueKind": queue_kind,
                "isLiteVersion": is_lite_version,
                "version": version,
            },
        )

        job_log_context = {
            "scannerJobId": scanner_job_id,
            "url": url,
            "device": device,
            "queueKind": queue_kind,
            "version": version,
        }

        with redirect_stdout(JobStdoutLogger(job_log_context)):
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
                "durationMs": round((time.time() - started_at) * 1000),
                "queueKind": queue_kind,
                "device": device,
                "version": version,
            },
        )

        return {
            "schemaVersion": 1,
            "scannerJobId": scanner_job_id,
            "queueKind": queue_kind,
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

    def _refresh_job_visibility(self, scanner_job_id: str, receipt_handle: Optional[str]) -> None:
        if not receipt_handle:
            return

        try:
            self.sqs.change_message_visibility(
                QueueUrl=self.job_queue_url,
                ReceiptHandle=receipt_handle,
                VisibilityTimeout=self.visibility_timeout_seconds,
            )
        except Exception as error:
            logger.warning(
                "Failed to refresh SQS job visibility timeout.",
                extra={
                    "scannerJobId": scanner_job_id,
                    "error": safe_text(str(error)),
                },
            )

    def _process_full_audit_batch_job(
        self,
        scanner_job_id: str,
        payload: Dict[str, Any],
        receipt_handle: Optional[str] = None,
    ) -> Dict[str, Any]:
        started_at = time.time()
        queue_kind = safe_text(payload.get("queueKind") or os.getenv("SCANNER_QUEUE_KIND", "full"))
        targets = payload.get("targets")
        selected_pages = payload.get("selectedPages") if isinstance(payload.get("selectedPages"), list) else []
        orchestration = payload.get("orchestration") if isinstance(payload.get("orchestration"), dict) else None
        if (not isinstance(targets, list) or not targets) and orchestration:
            selected_pages, targets = self._build_orchestrated_full_audit_targets(scanner_job_id, payload, orchestration, receipt_handle)
            payload = dict(payload)
            payload["targets"] = targets
            payload["selectedPages"] = selected_pages

        if not isinstance(targets, list) or not targets:
            raise RuntimeError("Full-audit batch job requires at least one target.")

        logger.info(
            "Starting scanner SQS full-audit batch.",
            extra={
                "scannerJobId": scanner_job_id,
                "queueKind": queue_kind,
                "targetCount": len(targets),
                "orchestratedInScanner": bool(orchestration),
            },
        )

        target_results = []
        for index, target in enumerate(targets):
            self._refresh_job_visibility(scanner_job_id, receipt_handle)
            if not isinstance(target, dict):
                target_results.append({
                    "success": False,
                    "url": "",
                    "device": "desktop",
                    "isLiteVersion": False,
                    "scanModeUsed": "full",
                    "error": "Batch target must be a JSON object.",
                    "errorCode": "INVALID_BATCH_TARGET",
                })
                continue

            target_results.append(self._process_full_audit_batch_target(scanner_job_id, queue_kind, target, index))

        successful_count = sum(1 for target in target_results if target.get("success"))
        aggregate_report = {
            "schemaVersion": 1,
            "jobType": "fullAuditBatch",
            "scannerJobId": scanner_job_id,
            "queueKind": queue_kind,
            "targetCount": len(target_results),
            "successfulTargetCount": successful_count,
            "failedTargetCount": len(target_results) - successful_count,
            "orchestratedInScanner": bool(orchestration),
            "selectedPages": selected_pages,
            "targets": target_results,
        }
        key = self._build_batch_artifact_key(scanner_job_id)
        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=json.dumps(aggregate_report, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json",
        )
        report_storage = None
        if self.generate_full_audit_reports:
            report_storage = self._generate_and_upload_full_audit_reports(scanner_job_id, payload, aggregate_report)

        logger.info(
            "Scanner SQS full-audit batch completed.",
            extra={
                "scannerJobId": scanner_job_id,
                "queueKind": queue_kind,
                "targetCount": len(target_results),
                "successfulTargetCount": successful_count,
                "failedTargetCount": len(target_results) - successful_count,
                "s3Key": key,
                "finalReportObjectCount": report_storage.get("objectCount") if report_storage else None,
                "durationMs": round((time.time() - started_at) * 1000),
            },
        )

        result = {
            "schemaVersion": 1,
            "jobType": "fullAuditBatch",
            "scannerJobId": scanner_job_id,
            "queueKind": queue_kind,
            "success": successful_count > 0,
            "report": {
                "bucket": self.bucket,
                "region": self.region,
                "key": key,
            },
            "message": "Full-audit batch completed by scanner SQS worker.",
        }
        if report_storage:
            result["reportStorage"] = report_storage
            result["reportsGeneratedInWorker"] = True
        return result

    def _build_orchestrated_full_audit_targets(
        self,
        scanner_job_id: str,
        payload: Dict[str, Any],
        orchestration: Dict[str, Any],
        receipt_handle: Optional[str] = None,
    ) -> tuple[list[Dict[str, Any]], list[Dict[str, Any]]]:
        root_url = safe_text(orchestration.get("url") or payload.get("url") or "").strip()
        if not root_url:
            raise RuntimeError("Scanner full-audit orchestration requires a root URL.")

        crawl_scope = orchestration.get("crawlScope") if isinstance(orchestration.get("crawlScope"), dict) else {}
        total_page_limit = max(1, min(_optional_int_from_value(crawl_scope.get("totalPageLimit"), 25), 100))
        max_pages = max(total_page_limit, min(_optional_int_from_value(crawl_scope.get("maxPages"), total_page_limit), 500))
        max_depth = max(0, min(_optional_int_from_value(crawl_scope.get("maxDepth"), 1), 5))
        delay_ms = max(0, min(_optional_int_from_value(crawl_scope.get("delayMs"), 500), 10000))
        priority_page_limit = max(0, min(_optional_int_from_value(crawl_scope.get("priorityPageLimit"), 3), 20))
        full_mode_page_limit = max(0, min(_optional_int_from_value(crawl_scope.get("fullModePageLimit"), total_page_limit), total_page_limit))
        raw_link_limit = max(total_page_limit * 5, max_pages, 100)

        requested_devices = orchestration.get("devices") if isinstance(orchestration.get("devices"), list) else ["desktop"]
        devices = [
            safe_text(device).lower()
            for device in requested_devices
            if safe_text(device).lower() in {"desktop", "mobile", "tablet"}
        ] or ["desktop"]

        self._refresh_job_visibility(scanner_job_id, receipt_handle)
        extraction = run_with_clean_event_loop_context(
            _extract_links_sync,
            root_url,
            raw_link_limit,
            max_depth,
            delay_ms,
        )
        if not extraction.get("success") and not extraction.get("links"):
            raise RuntimeError(safe_text(extraction.get("error") or "Scanner link extraction failed."))

        root_canonical = _canonical_page_url(safe_text(extraction.get("finalUrl") or root_url)) or _canonical_page_url(root_url)
        if not root_canonical:
            raise RuntimeError("Scanner could not normalize the full-audit root URL.")

        home_key = root_canonical["key"]
        candidates: list[str] = [root_canonical["url"]]
        candidates.extend([safe_text(link) for link in extraction.get("links") or [] if safe_text(link)])

        by_key: Dict[str, Dict[str, Any]] = {}
        for candidate in candidates:
            canonical = _canonical_page_url(candidate)
            if not canonical or not _is_orchestration_candidate(canonical["url"], home_key):
                continue
            score = _orchestration_page_score(canonical["url"], home_key)
            existing = by_key.get(canonical["key"])
            if not existing or score > existing["score"]:
                by_key[canonical["key"]] = {
                    "url": canonical["url"],
                    "score": score,
                    "isHomepage": canonical["key"] == home_key,
                }

        ranked_pages = sorted(
            by_key.values(),
            key=lambda page: (
                0 if page["isHomepage"] else 1,
                -int(page["score"]),
                len(safe_text(page["url"])),
                safe_text(page["url"]),
            ),
        )[:total_page_limit]

        if not ranked_pages:
            ranked_pages = [{"url": root_canonical["url"], "score": 100, "isHomepage": True}]

        selected_pages: list[Dict[str, Any]] = []
        targets: list[Dict[str, Any]] = []
        for page_index, page in enumerate(ranked_pages):
            preferred_scan_mode = "full" if page_index < max(1, full_mode_page_limit) else "lite"
            priority_bucket = "homepage" if page["isHomepage"] else (
                "primary" if page_index <= priority_page_limit else "secondary" if int(page["score"]) >= 55 else "other"
            )
            selected_page = {
                "url": page["url"],
                "priorityBucket": priority_bucket,
                "preferredScanMode": preferred_scan_mode,
                "isHomepage": bool(page["isHomepage"]),
                "score": int(page["score"]),
            }
            selected_pages.append(selected_page)
            for device in devices:
                targets.append({
                    "url": page["url"],
                    "device": device,
                    "preferredScanMode": preferred_scan_mode,
                    "isLiteVersion": preferred_scan_mode == "lite",
                    "isHomepage": bool(page["isHomepage"]),
                    "allowFullRetry": bool(page["isHomepage"]),
                })

        logger.info(
            "Scanner built full-audit orchestration target plan.",
            extra={
                "scannerJobId": scanner_job_id,
                "rootUrl": root_url,
                "finalUrl": root_canonical["url"],
                "selectedPageCount": len(selected_pages),
                "targetCount": len(targets),
                "devices": devices,
                "linkCount": len(extraction.get("links") or []),
                "extractionWarning": extraction.get("error"),
            },
        )

        return selected_pages, targets

    def _process_full_audit_batch_target(
        self,
        scanner_job_id: str,
        queue_kind: str,
        target: Dict[str, Any],
        index: int,
    ) -> Dict[str, Any]:
        raw_url = safe_text(target.get("url") or "").strip()
        if not raw_url:
            return {
                "success": False,
                "url": "",
                "device": "desktop",
                "isLiteVersion": False,
                "scanModeUsed": "full",
                "error": "Target URL is required.",
                "errorCode": "INVALID_BATCH_TARGET",
            }

        url = _normalize_url(raw_url)
        device = safe_text(target.get("device") or "desktop")
        preferred_scan_mode = safe_text(target.get("preferredScanMode") or "").lower()
        if preferred_scan_mode not in {"full", "lite"}:
            preferred_scan_mode = "lite" if bool(target.get("isLiteVersion")) else "full"

        allow_full_retry = bool(target.get("allowFullRetry"))

        if preferred_scan_mode == "lite":
            return self._run_batch_target_attempt(scanner_job_id, queue_kind, url, device, True, index, "lite")

        first_attempt = self._run_batch_target_attempt(scanner_job_id, queue_kind, url, device, False, index, "full")
        if first_attempt.get("success"):
            return first_attempt

        if allow_full_retry:
            time.sleep(1.5)
            second_attempt = self._run_batch_target_attempt(scanner_job_id, queue_kind, url, device, False, index, "full")
            if second_attempt.get("success"):
                return second_attempt

        lite_attempt = self._run_batch_target_attempt(scanner_job_id, queue_kind, url, device, True, index, "lite")
        lite_attempt["fullFailureCountDelta"] = 1
        lite_attempt["shouldUseLiteForFuture"] = allow_full_retry
        lite_attempt["degradedReason"] = (
            "Full scanner failed, so this target fell back to lite mode."
            if lite_attempt.get("success")
            else "Full scanner failed, and lite fallback also failed."
        )
        return lite_attempt

    def _run_batch_target_attempt(
        self,
        scanner_job_id: str,
        queue_kind: str,
        url: str,
        device: str,
        is_lite_version: bool,
        index: int,
        scan_mode_used: str,
    ) -> Dict[str, Any]:
        started_at = time.time()
        version = "Lite" if is_lite_version else "Full"
        device_config = get_viewport_for_device(device)
        job_log_context = {
            "scannerJobId": scanner_job_id,
            "url": url,
            "device": device,
            "queueKind": queue_kind,
            "version": version,
            "batchTargetIndex": index,
        }

        logger.info(
            "Starting scanner SQS batch target.",
            extra={
                **job_log_context,
                "isLiteVersion": is_lite_version,
                "scanModeUsed": scan_mode_used,
            },
        )

        try:
            with redirect_stdout(JobStdoutLogger(job_log_context)):
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

            logger.info(
                "Scanner SQS batch target completed.",
                extra={
                    **job_log_context,
                    "score": final_score,
                    "durationMs": round((time.time() - started_at) * 1000),
                },
            )
            return {
                "success": True,
                "url": url,
                "device": device,
                "isLiteVersion": is_lite_version,
                "scanModeUsed": scan_mode_used,
                "report": sanitize_report_data(result.get("report") or {}),
            }
        except Exception as error:
            error_message = safe_text(str(error))
            logger.warning(
                "Scanner SQS batch target failed.",
                extra={
                    **job_log_context,
                    "error": error_message,
                    "durationMs": round((time.time() - started_at) * 1000),
                },
            )
            return {
                "success": False,
                "url": url,
                "device": device,
                "isLiteVersion": is_lite_version,
                "scanModeUsed": scan_mode_used,
                "error": error_message,
                "errorCode": "SCANNER_WORKER_FAILED",
            }

    def _generate_and_upload_full_audit_reports(
        self,
        scanner_job_id: str,
        payload: Dict[str, Any],
        aggregate_report: Dict[str, Any],
    ) -> Dict[str, Any]:
        report_metadata = payload.get("reportGeneration") if isinstance(payload.get("reportGeneration"), dict) else {}
        email = safe_text(report_metadata.get("email") or payload.get("email") or "unknown-client")
        plan_id = safe_text(report_metadata.get("planId") or "pro")
        task_id = safe_text(report_metadata.get("taskId") or scanner_job_id)
        website_url = safe_text(report_metadata.get("url") or payload.get("url") or "full-audit")

        with tempfile.TemporaryDirectory(prefix=f"scanner-report-{_sanitize_key_segment(scanner_job_id)}-") as temp_dir:
            temp_path = Path(temp_dir)
            aggregate_path = temp_path / "aggregate.json"
            output_dir = temp_path / "reports"
            manifest_path = temp_path / "manifest.json"
            aggregate_path.write_text(json.dumps(aggregate_report, ensure_ascii=False), encoding="utf-8")

            command = [
                "node",
                "--import",
                "/app/reporting/scripts/register-typescript-loader.mjs",
                "/app/reporting/generate-full-audit-report.mjs",
                "--aggregate",
                str(aggregate_path),
                "--output-dir",
                str(output_dir),
                "--manifest",
                str(manifest_path),
                "--email",
                email,
                "--plan-id",
                plan_id,
            ]

            logger.info(
                "Generating full-audit report PDFs in scanner worker.",
                extra={
                    "scannerJobId": scanner_job_id,
                    "taskId": task_id,
                    "planId": plan_id,
                },
            )
            completed = subprocess.run(
                command,
                cwd="/app/reporting",
                text=True,
                capture_output=True,
                timeout=_optional_int("SCANNER_FULL_AUDIT_REPORT_GENERATION_TIMEOUT_SECONDS", 1800),
            )
            if completed.stdout:
                logger.info(
                    "Full-audit report generator output.",
                    extra={"scannerJobId": scanner_job_id, "output": completed.stdout[-4000:]},
                )
            if completed.stderr:
                logger.warning(
                    "Full-audit report generator stderr.",
                    extra={"scannerJobId": scanner_job_id, "output": completed.stderr[-4000:]},
                )
            if completed.returncode != 0:
                raise RuntimeError(f"Full-audit report generator exited with code {completed.returncode}.")

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not manifest.get("success"):
                raise RuntimeError(safe_text(manifest.get("error") or "Full-audit report generation produced no files."))

            report_prefix = self._build_final_report_prefix(email, task_id, website_url)
            uploaded_objects = []
            for file_info in manifest.get("files") or []:
                file_path = Path(safe_text(file_info.get("path")))
                if not file_path.is_file():
                    continue

                filename = safe_text(file_info.get("filename") or file_path.name)
                key = f"{report_prefix}/{self._sanitize_storage_object_name(filename)}"
                size = file_path.stat().st_size
                self.s3.upload_file(
                    str(file_path),
                    self.bucket,
                    key,
                    ExtraArgs={"ContentType": "application/pdf"},
                )
                uploaded_objects.append({
                    "filename": filename,
                    "key": key,
                    "size": size,
                    "sizeMB": _format_size_mb(size),
                    "providerUrl": self._build_object_access_url(key),
                })

            if not uploaded_objects:
                raise RuntimeError("Full-audit report generation completed but no PDF files were uploaded.")

            logger.info(
                "Uploaded full-audit report PDFs from scanner worker.",
                extra={
                    "scannerJobId": scanner_job_id,
                    "taskId": task_id,
                    "prefix": report_prefix,
                    "uploadedCount": len(uploaded_objects),
                },
            )

            return {
                "provider": "s3",
                "bucket": self.bucket,
                "region": self.region,
                "prefix": report_prefix,
                "objectCount": len(uploaded_objects),
                "signedUrlExpiresInSeconds": self.signed_url_expires_seconds,
                "objects": uploaded_objects,
            }

    def _build_final_report_prefix(self, email: str, task_id: str, website_url: str) -> str:
        now = datetime.now(timezone.utc)
        email_segment = _sanitize_key_segment(email.replace("@", "-at-"), "anonymous")
        website_segment = _sanitize_key_segment(website_url, "full-audit")
        task_segment = _sanitize_key_segment(task_id, "task")
        return (
            f"{self.final_report_prefix}/"
            f"{now.strftime('%Y/%m/%d')}/"
            f"{email_segment}/"
            f"{task_segment}-{website_segment}"
        )

    def _sanitize_storage_object_name(self, value: str) -> str:
        sanitized_segments = []
        for segment in str(value).replace("\\", "/").split("/"):
            if not segment:
                continue
            stem, extension = os.path.splitext(segment)
            cleaned_stem = _sanitize_key_segment(stem, "file")
            cleaned_extension = "".join(char.lower() for char in extension if char.isalnum() or char == ".")[:16]
            sanitized_segments.append(f"{cleaned_stem}{cleaned_extension}")

        return "/".join(sanitized_segments) or "file.pdf"

    def _build_object_access_url(self, key: str) -> str:
        if self.s3_url_mode == "object":
            return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"

        return self.s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=self.signed_url_expires_seconds,
        )

    def _build_artifact_key(self, scanner_job_id: str, url: str, is_lite_version: bool) -> str:
        version = "lite" if is_lite_version else "full"
        hostname = _resolve_hostname(url)
        timestamp = int(time.time() * 1000)
        return (
            f"{self.prefix}/{time.strftime('%Y/%m/%d')}/"
            f"{_sanitize_key_segment(scanner_job_id)}/"
            f"report-{hostname}-{timestamp}-{version}.json"
        )

    def _build_batch_artifact_key(self, scanner_job_id: str) -> str:
        timestamp = int(time.time() * 1000)
        return (
            f"{self.prefix}/{time.strftime('%Y/%m/%d')}/"
            f"{_sanitize_key_segment(scanner_job_id)}/"
            f"full-audit-batch-{timestamp}.json"
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
