import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from page_readiness import is_challenge, response_is_challenge, is_empty_document
from navigation_retry import navigate_with_retries
from proxy_fallback import is_unknown_tls_handshake, run_with_proxy_fallback
import test_page_readiness


class AccessRecoveryTests(unittest.TestCase):
    def test_vercel_429_gets_readiness_window(self):
        gate = test_page_readiness.ReadinessTests()
        result = gate.run_gate([gate.content(title="Vercel Security Checkpoint")], [429])
        self.assertEqual(result["readinessError"], "BOT_CHALLENGE")
        recovered = gate.run_gate([gate.content(title="Vercel Security Checkpoint"), gate.content()], [429, 200])
        self.assertTrue(recovered["auditableReady"])

    def test_checkpoint_not_reloaded(self):
        for title, headers in [("Vercel Security Checkpoint", {}), ("Checking", {"x-vercel-mitigated": "challenge"})]:
            page = SimpleNamespace(url="https://example.com", title=lambda: title, wait_for_timeout=Mock())
            navigate = Mock(return_value=SimpleNamespace(status=429, headers=headers))
            navigate_with_retries(page, page.url, navigate)
            self.assertEqual(navigate.call_count, 1)
            page.wait_for_timeout.assert_not_called()

    def test_headers_only_match_challenge(self):
        self.assertTrue(response_is_challenge(SimpleNamespace(headers={"cf-mitigated": "challenge"})))
        self.assertFalse(response_is_challenge(SimpleNamespace(headers={"server": "Vercel"})))
        self.assertFalse(is_challenge({"title": "My Vercel tutorial"}))

    def test_empty_document_is_narrow(self):
        metrics = {"readyState": "complete", "bodyChars": 0, "domCount": 7}
        self.assertTrue(is_empty_document(metrics, 200, False))
        self.assertFalse(is_empty_document(metrics, 200, True))
        self.assertFalse(is_empty_document(metrics, 403, False))
        for change in [{"bodyChars": 12}, {"domCount": 100}, {"media": 1}, {"readyState": "loading"}]:
            self.assertFalse(is_empty_document({**metrics, **change}, 200, False))

    def test_tls_not_certificate_bypass(self):
        self.assertTrue(is_unknown_tls_handshake(RuntimeError("Page.goto: SSL_ERROR_UNKNOWN\nCall log")))
        for error in ["SEC_ERROR_UNKNOWN_ISSUER", "SSL_ERROR_UNKNOWN_CA_ALERT", "SSL_ERROR_BAD_CERT_DOMAIN", "certificate expired"]:
            self.assertFalse(is_unknown_tls_handshake(error))

    def test_new_failures_retry_only_once(self):
        for code in ["EMPTY_DOCUMENT", "TLS_HANDSHAKE_ERROR"]:
            attempt = Mock(side_effect=[{"success": False, "errorCode": code}, {"success": False, "errorCode": code}])
            self.assertFalse(run_with_proxy_fallback(attempt, "fallback")["success"])
            self.assertEqual([call.args for call in attempt.call_args_list], [(False,), (True,)])

    @patch("proxy_fallback.time.sleep")
    def test_retry_after_before_proxy(self, sleep):
        attempt = Mock(side_effect=[{"success": False, "errorCode": "BOT_CHALLENGE", "retryAfterSeconds": 12}, {"success": True}])
        self.assertTrue(run_with_proxy_fallback(attempt, "fallback")["success"])
        sleep.assert_called_once_with(12)

    @patch("proxy_fallback.time.sleep")
    def test_long_retry_after_does_not_change_ip_early(self, sleep):
        attempt = Mock(return_value={"success": False, "errorCode": "BOT_CHALLENGE", "retryAfterSeconds": 120})
        self.assertTrue(run_with_proxy_fallback(attempt, "fallback")["proxyFallbackDeferred"])
        attempt.assert_called_once_with(False)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
