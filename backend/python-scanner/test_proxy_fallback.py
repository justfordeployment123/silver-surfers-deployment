import unittest
from unittest.mock import Mock

from proxy_fallback import proxy_mode, registrable_domain, run_with_proxy_fallback
from browser_runtime import browser_options


class ProxyFallbackTests(unittest.TestCase):
    def test_registrable_domain_ignores_www_and_subdomains(self):
        self.assertEqual(registrable_domain("ign.com"), "ign.com")
        self.assertEqual(registrable_domain("www.ign.com"), "ign.com")
        self.assertEqual(registrable_domain("nordic.ign.com"), "ign.com")
        self.assertEqual(registrable_domain("uk.shop.ign.com"), "ign.com")
        self.assertNotEqual(registrable_domain("ign.com"), registrable_domain("other.com"))
        self.assertEqual(registrable_domain(""), "")
        self.assertEqual(registrable_domain(None), "")

    def test_legacy_and_explicit_modes(self):
        self.assertEqual(proxy_mode({}), "off")
        self.assertEqual(proxy_mode({"SCANNER_PROXY_ENABLED": "true"}), "always")
        self.assertEqual(proxy_mode({"SCANNER_PROXY_ENABLED": "true", "SCANNER_PROXY_MODE": "fallback"}), "fallback")
        with self.assertRaises(ValueError):
            proxy_mode({"SCANNER_PROXY_MODE": "typo"})

    def test_success_including_zero_score_never_retries(self):
        for score in [0, 50, 100]:
            attempt = Mock(return_value={"success": True, "score": score})
            run_with_proxy_fallback(attempt, "fallback")
            attempt.assert_called_once_with(False)

    def test_access_failure_retries_once(self):
        for code in ["ACCESS_DENIED", "BOT_CHALLENGE"]:
            attempt = Mock(side_effect=[{"success": False, "errorCode": code}, {"success": True}])
            result = run_with_proxy_fallback(attempt, "fallback")
            self.assertTrue(result["proxyFallbackAttempted"])
            self.assertEqual([c.args for c in attempt.call_args_list], [(False,), (True,)])

    def test_second_failure_is_final(self):
        attempt = Mock(return_value={"success": False, "errorCode": "BOT_CHALLENGE"})
        self.assertFalse(run_with_proxy_fallback(attempt, "fallback")["success"])
        self.assertEqual(attempt.call_count, 2)

    def test_non_access_errors_do_not_retry(self):
        for code in ["PAGE_NOT_FOUND", "RATE_LIMITED", "SSL_ERROR_UNKNOWN", "PAGE_NOT_READY", "CROSS_DOMAIN_REDIRECT", "NON_HTML"]:
            attempt = Mock(return_value={"success": False, "errorCode": code})
            run_with_proxy_fallback(attempt, "fallback")
            attempt.assert_called_once_with(False)

    def test_exceptions_do_not_retry(self):
        attempt = Mock(side_effect=RuntimeError("TLS or browser failure"))
        with self.assertRaises(RuntimeError):
            run_with_proxy_fallback(attempt, "fallback")
        attempt.assert_called_once_with(False)

    def test_off_and_always(self):
        for mode, enabled in [("off", False), ("always", True)]:
            attempt = Mock(return_value={"success": False, "errorCode": "ACCESS_DENIED"})
            run_with_proxy_fallback(attempt, mode)
            attempt.assert_called_once_with(enabled)

    def test_fallback_browser_is_direct_unless_explicit(self):
        env = {"SCANNER_PROXY_MODE": "fallback", "SCANNER_PROXY_SERVER": "http://proxy:8080", "SCANNER_PROXY_USERNAME": "user-sid-{session}", "SCANNER_PROXY_PASSWORD": "secret"}
        self.assertNotIn("proxy", browser_options(env))
        self.assertNotIn("proxy", browser_options(env, use_proxy=False))
        options = browser_options(env, use_proxy=True)
        self.assertTrue(options["geoip"])
        self.assertNotIn("{session}", options["proxy"]["username"])
        self.assertEqual(env["SCANNER_PROXY_USERNAME"], "user-sid-{session}")


if __name__ == "__main__":
    unittest.main()
