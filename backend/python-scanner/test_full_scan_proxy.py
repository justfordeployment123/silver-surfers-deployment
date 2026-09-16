import unittest
from unittest.mock import Mock, patch

from browser_runtime import browser_options
from proxy_fallback import discovery_access_error, proxy_session_id
from scanner_service import _extract_links_sync, _extract_links_once
from camoufox_auditor import run_camoufox_audit_sync


ENV = {"SCANNER_PROXY_MODE": "fallback", "SCANNER_PROXY_SERVER": "http://proxy:8080",
       "SCANNER_PROXY_USERNAME": "user-sid-{session}", "SCANNER_PROXY_PASSWORD": "secret"}


class FullScanProxyTests(unittest.TestCase):
    def test_job_identity_is_stable_and_isolated(self):
        session = proxy_session_id("job-a")
        self.assertEqual(session, proxy_session_id("job-a"))
        self.assertNotEqual(session, proxy_session_id("job-b"))
        self.assertNotEqual(proxy_session_id(), proxy_session_id())
        a = browser_options(ENV, use_proxy=True, proxy_session=session)
        b = browser_options(ENV, use_proxy=True, proxy_session=session)
        self.assertEqual(a["proxy"], b["proxy"])

    def test_discovery_error_classification(self):
        url = "https://example.com"
        cases = [(403, "Forbidden", "ACCESS_DENIED"), (200, "Just a moment...", "BOT_CHALLENGE"),
                 (429, "Just a moment...", "RATE_LIMITED"), (404, "Missing", "PAGE_NOT_FOUND"),
                 (200, "Home", None)]
        for status, title, expected in cases:
            self.assertEqual(discovery_access_error(status, title, url, url), expected)
        self.assertEqual(discovery_access_error(200, "Other", url, "https://other.com"), "CROSS_DOMAIN_REDIRECT")
        self.assertIsNone(discovery_access_error(200, "Home", url, "https://www.example.com"))

    @patch.dict("os.environ", ENV, clear=True)
    @patch("scanner_service._extract_links_once")
    def test_discovery_then_audits_share_session(self, extract):
        session = proxy_session_id("full-job")
        extract.side_effect = [{"success": False, "errorCode": "BOT_CHALLENGE"},
                               {"success": True, "links": ["https://example.com/about"]}]
        result = _extract_links_sync("https://example.com", 50, 1, 0, session)
        self.assertEqual(len(result["links"]), 1)
        self.assertEqual([call.kwargs["use_proxy"] for call in extract.call_args_list], [False, True])
        self.assertTrue(all(call.kwargs["proxy_session"] == session for call in extract.call_args_list))
        for device in ["desktop", "mobile", "tablet"]:
            with patch("camoufox_auditor._run_camoufox_audit_once", side_effect=[
                {"success": False, "errorCode": "ACCESS_DENIED"}, {"success": True, "score": 42}
            ]) as audit:
                run_camoufox_audit_sync("https://example.com/about", {"device": device}, False, None, session)
                self.assertEqual([call.kwargs["use_proxy"] for call in audit.call_args_list], [False, True])
                self.assertTrue(all(call.kwargs["proxy_session"] == session for call in audit.call_args_list))

    @patch.dict("os.environ", ENV, clear=True)
    @patch("scanner_service._extract_links_once")
    def test_empty_healthy_site_does_not_spend(self, extract):
        extract.return_value = {"success": True, "links": []}
        _extract_links_sync("https://example.com")
        self.assertEqual(extract.call_count, 1)
        self.assertFalse(extract.call_args.kwargs["use_proxy"])

    @patch.dict("os.environ", ENV, clear=True)
    @patch("scanner_service._extract_links_once")
    def test_discovery_proxy_failure_is_final(self, extract):
        extract.return_value = {"success": False, "errorCode": "BOT_CHALLENGE", "links": []}
        self.assertFalse(_extract_links_sync("https://example.com")["success"])
        self.assertEqual(extract.call_count, 2)

    @patch("scanner_service.new_scanner_page")
    @patch("scanner_service.scanner_browser")
    def test_blocked_discovery_closes_browser_before_retry(self, browser, new_page):
        page = new_page.return_value
        page.url = "https://example.com"
        page.title.return_value = "Just a moment..."
        result = _extract_links_once(page.url, use_proxy=False, proxy_session="testsession")
        self.assertEqual(result["errorCode"], "BOT_CHALLENGE")
        page.close.assert_called_once()
        browser.return_value.__exit__.assert_called_once()


if __name__ == "__main__":
    unittest.main()
