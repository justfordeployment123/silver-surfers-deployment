import copy
import io
import importlib
import sys
import unittest
from unittest.mock import Mock, patch

from full_scan_proxy import FullScanProxy, S3ProxyCheckpoint, ProxyStateError, active_full_scan
from proxy_fallback import run_with_proxy_fallback, proxy_country_context
from scanner_utils import run_with_clean_event_loop_context
from scanner_service import _extract_links_sync
from camoufox_auditor import run_camoufox_audit_sync

ENV = {"SCANNER_PROXY_MODE": "fallback", "SCANNER_PROXY_COUNTRIES": "us,pk,de",
       "SCANNER_PROXY_SERVER": "http://gate.nodemaven.com:8080",
       "SCANNER_PROXY_USERNAME": "test-country-{country}-sid-{session}", "SCANNER_PROXY_PASSWORD": "secret"}


class MemoryCheckpoint:
    def __init__(self):
        self.state = None
    def load(self):
        return copy.deepcopy(self.state)
    def save(self, state):
        self.state = copy.deepcopy(state)


class FullScanRoutingTests(unittest.TestCase):
    @patch.dict("os.environ", ENV, clear=True)
    def test_full_batch_discovers_three_pages_and_audits_all_devices(self):
        with patch.dict(sys.modules, {"boto3": Mock()}):
            worker_module = importlib.import_module("sqs_worker")
        worker = worker_module.ScannerSqsWorker.__new__(worker_module.ScannerSqsWorker)
        worker.s3, worker.bucket, worker.prefix, worker.region = Mock(), "bucket", "prefix", "eu-north-1"
        worker.generate_full_audit_reports = False
        worker._refresh_job_visibility = Mock()
        worker._build_batch_artifact_key = Mock(return_value="aggregate.json")
        countries = []
        def extract(*args, **kwargs):
            country = proxy_country_context.get()
            return {"success": country == "us", "errorCode": "ACCESS_DENIED" if not country else None,
                    "finalUrl": "https://example.com", "links": ["https://example.com/about", "https://example.com/contact"] if country else []}
        def audit(*args, **kwargs):
            countries.append(proxy_country_context.get())
            return {"success": True, "score": 85, "report": {"finalUrl": args[0], "audits": {}}}
        payload = {"url": "https://example.com", "orchestration": {"url": "https://example.com", "devices": ["desktop", "mobile", "tablet"], "crawlScope": {"totalPageLimit": 3}}}
        with patch.object(worker_module, "S3ProxyCheckpoint", return_value=MemoryCheckpoint()), patch.object(worker_module, "_plain_discovery_fallback_enabled", return_value=False), patch("scanner_service._extract_links_once", side_effect=extract), patch("camoufox_auditor._run_camoufox_audit_once", side_effect=audit):
            result = worker._process_full_audit_batch_job("job", payload)
        self.assertTrue(result["success"])
        self.assertEqual(countries, ["us"] * 9)
        import json
        aggregate = json.loads(worker.s3.put_object.call_args.kwargs["Body"])
        self.assertEqual(aggregate["successfulTargetCount"], 9)
        self.assertEqual(aggregate["proxyRouting"]["proxyBrowserAttempts"], 10)
        self.assertEqual(len(aggregate["selectedPages"]), 3)

    @patch.dict("os.environ", ENV, clear=True)
    def test_worker_scope_covers_entire_batch_and_cleans_up(self):
        # AWS client calls are mocked; local test environments need no AWS SDK or credentials.
        with patch.dict(sys.modules, {"boto3": Mock()}):
            worker_module = importlib.import_module("sqs_worker")
        worker = worker_module.ScannerSqsWorker.__new__(worker_module.ScannerSqsWorker)
        worker.s3, worker.bucket, worker.prefix = Mock(), "bucket", "prefix"
        store = MemoryCheckpoint()
        def body(*args):
            self.assertIsNotNone(active_full_scan.get())
            return {"success": True}
        worker._process_full_audit_batch_job_scoped = Mock(side_effect=body)
        with patch.object(worker_module, "S3ProxyCheckpoint", return_value=store):
            self.assertTrue(worker._process_full_audit_batch_job("job", {})["success"])
        self.assertIsNone(active_full_scan.get())

    def test_worker_valid_zero_score_does_not_retry(self):
        with patch.dict(sys.modules, {"boto3": Mock()}):
            worker_module = importlib.import_module("sqs_worker")
        worker = worker_module.ScannerSqsWorker.__new__(worker_module.ScannerSqsWorker)
        with patch.object(worker_module, "run_camoufox_audit_sync", return_value={"success": True, "score": 0, "report": {"audits": {}}}) as scan:
            result = worker._process_full_audit_batch_target("job", "full", {"url": "https://example.com", "device": "desktop", "preferredScanMode": "full"}, 0)
        self.assertTrue(result["success"])
        self.assertEqual(scan.call_count, 1)

    @patch.dict("os.environ", ENV, clear=True)
    def test_discovery_route_reused_across_threads_and_devices(self):
        routing = FullScanProxy(["us", "pk", "de"], "fallback")
        seen = []
        def extract(*args, **kwargs):
            country = proxy_country_context.get()
            seen.append(("extract", kwargs["use_proxy"], country))
            return {"success": country == "pk", "errorCode": "BOT_CHALLENGE",
                    "links": ["https://example.com/about"] if country == "pk" else []}
        def audit(*args, **kwargs):
            seen.append(("audit", kwargs["use_proxy"], proxy_country_context.get()))
            return {"success": True, "score": 0}
        with routing.scope(), patch("scanner_service._extract_links_once", side_effect=extract), patch("camoufox_auditor._run_camoufox_audit_once", side_effect=audit):
            run_with_clean_event_loop_context(_extract_links_sync, "https://example.com", 50, 1, 0, "job")
            for device in ["desktop", "mobile", "tablet"]:
                run_with_clean_event_loop_context(run_camoufox_audit_sync, "https://www.example.com/about", {"device": device}, False, None, "job")
        self.assertEqual(seen[:3], [("extract", False, None), ("extract", True, "us"), ("extract", True, "pk")])
        self.assertEqual(seen[3:], [("audit", True, "pk")] * 3)
        self.assertEqual(routing.state["proxyAttempts"], 5)
        self.assertIsNone(active_full_scan.get())

    def test_exhausted_routes_do_not_restart_for_next_page(self):
        routing = FullScanProxy(["us", "pk", "de"], "fallback")
        attempt = Mock(return_value={"success": False, "errorCode": "BOT_CHALLENGE"})
        routing.run(attempt, "https://example.com")
        result = routing.run(attempt, "https://example.com/about")
        self.assertEqual(attempt.call_count, 4)
        self.assertEqual(result["errorCode"], "PROXY_BUDGET_EXHAUSTED")

    def test_checkpoint_resumes_route_and_budget(self):
        store = MemoryCheckpoint()
        first = FullScanProxy(["us", "pk", "de"], "fallback", 2, store)
        first.run(Mock(side_effect=[{"success": False, "errorCode": "ACCESS_DENIED"}, {"success": True}]), "https://example.com")
        second = FullScanProxy(["us", "pk", "de"], "fallback", 2, store)
        seen = []
        second.run(lambda enabled: seen.append(enabled) or {"success": True}, "https://example.com/about")
        result = second.run(Mock(), "https://example.com/contact")
        self.assertEqual(seen, [True])
        self.assertEqual(result["errorCode"], "PROXY_BUDGET_EXHAUSTED")
        self.assertEqual(store.state["proxyAttempts"], 2)

    def test_reservation_precedes_browser_and_survives_exception(self):
        store = MemoryCheckpoint()
        routing = FullScanProxy(["us"], "always", 1, store)
        def attempt(_):
            self.assertEqual(store.state["proxyAttempts"], 1)
            raise RuntimeError("browser failed")
        with self.assertRaises(RuntimeError):
            routing.run(attempt, "https://example.com")
        self.assertIsNone(proxy_country_context.get())
        self.assertEqual(FullScanProxy(["us"], "always", 1, store).run(Mock(), "https://example.com")["errorCode"], "PROXY_BUDGET_EXHAUSTED")

    def test_rate_limit_preserves_cooldown_without_country_rotation(self):
        routing = FullScanProxy(["us", "pk"], "always")
        attempt = Mock(return_value={"success": False, "errorCode": "RATE_LIMITED", "retryAfterSeconds": 120})
        routing.run(attempt, "https://example.com")
        result = routing.run(attempt, "https://example.com/about")
        self.assertEqual(attempt.call_count, 1)
        self.assertEqual(result["errorCode"], "RATE_LIMITED")
        self.assertEqual(routing.state["sites"]["example.com"]["route"], 0)

    def test_missing_page_does_not_retire_working_route(self):
        routing = FullScanProxy(["us", "pk"], "always")
        routing.run(lambda _: {"success": False, "errorCode": "PAGE_NOT_FOUND"}, "https://example.com/missing")
        self.assertEqual(routing.state["sites"]["example.com"]["route"], 0)

    def test_hosts_do_not_share_route_decisions(self):
        routing = FullScanProxy(["us"], "fallback")
        routing.run(Mock(side_effect=[{"success": False, "errorCode": "ACCESS_DENIED"}, {"success": True}]), "https://example.com")
        attempt = Mock(return_value={"success": True})
        routing.run(attempt, "https://other.com")
        attempt.assert_called_once_with(False)

    def test_state_storage_failure_prevents_proxy_traffic(self):
        store = MemoryCheckpoint()
        store.save = Mock(side_effect=ProxyStateError("storage failed"))
        routing = FullScanProxy(["us"], "always", checkpoint=store)
        attempt = Mock()
        for _ in range(2):
            with self.assertRaises(ProxyStateError):
                routing.run(attempt, "https://example.com")
        attempt.assert_not_called()

    def test_s3_conditional_updates(self):
        s3 = Mock()
        s3.get_object.return_value = {"ETag": "first", "Body": io.BytesIO(b'{"schemaVersion":1}')}
        s3.put_object.return_value = {"ETag": "second"}
        store = S3ProxyCheckpoint(s3, "bucket", "prefix", "job")
        self.assertEqual(store.load()["schemaVersion"], 1)
        store.save({"schemaVersion": 1})
        self.assertEqual(s3.put_object.call_args.kwargs["IfMatch"], "first")
        store.save({"schemaVersion": 1})
        self.assertEqual(s3.put_object.call_args.kwargs["IfMatch"], "second")

    def test_s3_first_write_conflict_is_not_overwritten(self):
        s3 = Mock()
        s3.put_object.side_effect = RuntimeError("412")
        store = S3ProxyCheckpoint(s3, "bucket", "prefix", "job")
        with self.assertRaises(ProxyStateError):
            store.save({})
        self.assertEqual(s3.put_object.call_args.kwargs["IfNoneMatch"], "*")
        self.assertEqual(s3.put_object.call_count, 1)


if __name__ == "__main__":
    unittest.main()
