import unittest
from unittest.mock import MagicMock, patch
from browser_runtime import browser_options, new_scanner_page, safe_url, verify_browser, scanner_browser, capture_failure
import tempfile
from pathlib import Path


class BrowserRuntimeTests(unittest.TestCase):
    def test_direct_default_ignores_proxy_credentials(self):
        self.assertEqual(browser_options({"SCANNER_PROXY_PASSWORD": "secret"}), {"headless": True})

    def test_virtual(self):
        self.assertEqual(browser_options({"SCANNER_BROWSER_MODE": "virtual"}), {"headless": "virtual"})

    def test_invalid_mode(self):
        with self.assertRaises(ValueError):
            browser_options({"SCANNER_BROWSER_MODE": "invalid"})

    def test_missing_proxy_fails_closed(self):
        with self.assertRaises(ValueError):
            browser_options({"SCANNER_PROXY_ENABLED": "true"})

    def test_embedded_credentials_rejected(self):
        with self.assertRaises(ValueError):
            browser_options({"SCANNER_PROXY_ENABLED": "true", "SCANNER_PROXY_SERVER": "http://user:secret@proxy:80"})

    def test_proxy_session_and_geoip(self):
        env = {"SCANNER_PROXY_ENABLED": "true", "SCANNER_PROXY_SERVER": "http://proxy:8080", "SCANNER_PROXY_USERNAME": "user-sid-{session}", "SCANNER_PROXY_PASSWORD": "secret"}
        first, second = browser_options(env), browser_options(env)
        self.assertTrue(first["geoip"])
        self.assertNotEqual(first["proxy"]["username"], second["proxy"]["username"])

    def test_device_and_tls(self):
        browser = MagicMock()
        with patch.dict("os.environ", {}, clear=True):
            new_scanner_page(browser, {"viewport": {"width": 390, "height": 844}, "has_touch": True, "device_scale_factor": 3})
        browser.new_page.assert_called_once_with(ignore_https_errors=False, viewport={"width": 390, "height": 844}, has_touch=True, device_scale_factor=3)

    def test_url_redaction(self):
        self.assertEqual(safe_url("https://user:secret@example.com/path?token=secret#private"), "https://example.com/path")

    @patch("browser_runtime.verify_browser", return_value={})
    @patch("browser_runtime.Camoufox")
    def test_native_device_configuration(self, launch, verify):
        with patch.dict("os.environ", {}, clear=True):
            with scanner_browser({"viewport": {"width": 360, "height": 780}, "has_touch": True}):
                pass
        self.assertEqual(launch.call_args.kwargs["config"]["navigator.maxTouchPoints"], 1)
        self.assertEqual(launch.call_args.kwargs["config"]["window.innerWidth"], 360)

    def test_evidence_opt_in_and_redaction(self):
        page = MagicMock()
        page.url = "https://example.com/?secret=password"
        page.title.return_value = "Test"
        page.content.return_value = '<html><body><script>secret</script><input value="password"><p>private text</p></body></html>'
        with patch.dict("os.environ", {}, clear=True):
            capture_failure(page)
        page.content.assert_not_called()
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict("os.environ", {"SCANNER_DIAGNOSTICS_DIR": directory}, clear=True):
                capture_failure(page)
            html = next(Path(directory).glob("*/structure.html")).read_text()
            self.assertNotIn("private", html)
            self.assertNotIn("password", html)
            self.assertNotIn("script", html)
            page.screenshot.assert_not_called()

    @patch("browser_runtime.camoufox_path")
    @patch("browser_runtime.installed_verstr", return_value="wrong-version")
    def test_browser_version_mismatch(self, installed, path):
        with self.assertRaises(RuntimeError):
            verify_browser()
        path.assert_called_once_with(download_if_missing=False)


if __name__ == "__main__":
    unittest.main()
