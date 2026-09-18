import unittest
from unittest.mock import patch

from browser_runtime import browser_options
from proxy_fallback import proxy_countries, proxy_country_context, run_with_proxy_fallback


ENV = {
    "SCANNER_PROXY_MODE": "fallback",
    "SCANNER_PROXY_COUNTRIES": "us,pk,de",
    "SCANNER_PROXY_SERVER": "http://gate.nodemaven.com:8080",
    "SCANNER_PROXY_USERNAME": "account-country-{country}-sid-{session}-filter-high",
    "SCANNER_PROXY_PASSWORD": "test-secret",
}


class CountryPoolTests(unittest.TestCase):
    @patch.dict("os.environ", ENV, clear=True)
    def test_routes_and_unique_sessions(self):
        routes = []
        def attempt(enabled):
            options = browser_options(use_proxy=enabled, proxy_session="job-one")
            routes.append(options.get("proxy", {}).get("username"))
            return {"success": False, "errorCode": "BOT_CHALLENGE"}
        result = run_with_proxy_fallback(attempt, "fallback")
        self.assertIsNone(routes[0])
        self.assertEqual(len(routes), 4)
        for country, username in zip(["us", "pk", "de"], routes[1:]):
            self.assertIn("country-" + country, username)
        self.assertEqual(len({u.split("-sid-")[1] for u in routes[1:]}), 3)
        self.assertEqual(result["requestedProxyCountry"], "de")
        self.assertIsNone(proxy_country_context.get())

    @patch.dict("os.environ", ENV, clear=True)
    def test_stops_on_success_and_noneligible_failure(self):
        for terminal in [{"success": True, "score": 12}, {"success": False, "errorCode": "RATE_LIMITED"}, {"success": False, "errorCode": "PAGE_NOT_FOUND"}]:
            calls = []
            def attempt(enabled):
                calls.append(enabled)
                return dict(terminal)
            run_with_proxy_fallback(attempt, "fallback")
            self.assertEqual(calls, [False])

    @patch.dict("os.environ", ENV, clear=True)
    def test_always_mode_and_early_proxy_success(self):
        countries = []
        def attempt(enabled):
            self.assertTrue(enabled)
            countries.append(proxy_country_context.get())
            return {"success": len(countries) == 2, "errorCode": "ACCESS_DENIED"}
        run_with_proxy_fallback(attempt, "always")
        self.assertEqual(countries, ["us", "pk"])

    @patch.dict("os.environ", ENV, clear=True)
    def test_exception_resets_context_without_retry(self):
        def attempt(enabled):
            raise RuntimeError("startup failed")
        with self.assertRaises(RuntimeError):
            run_with_proxy_fallback(attempt, "always")
        self.assertIsNone(proxy_country_context.get())

    @patch.dict("os.environ", ENV, clear=True)
    def test_retry_after_prevents_immediate_rotation(self):
        result = run_with_proxy_fallback(lambda _: {"success": False, "errorCode": "BOT_CHALLENGE", "retryAfterSeconds": 120}, "always")
        self.assertTrue(result["proxyFallbackDeferred"])
        self.assertEqual(len(result["proxyAttempts"]), 1)

    def test_invalid_configuration(self):
        for changes in [{"SCANNER_PROXY_COUNTRIES": "us,us"}, {"SCANNER_PROXY_COUNTRIES": "us,pk,de,gb"}, {"SCANNER_PROXY_USERNAME": "fixed-user"}, {"SCANNER_PROXY_USERNAME": ENV["SCANNER_PROXY_USERNAME"] + "-region-california"}]:
            with self.assertRaises(ValueError):
                proxy_countries({**ENV, **changes})


if __name__ == "__main__":
    unittest.main()
