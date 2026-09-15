import unittest
from unittest.mock import patch

import requests
from camoufox.pkgman import OS_NAME, CamoufoxFetcher
from install_browser import PinnedBrowserFetcher


class PinnedBrowserTests(unittest.TestCase):
    def asset(self, target):
        return {"name": f"camoufox-{target}-{OS_NAME}.{CamoufoxFetcher.get_platform_arch()}.zip",
                "browser_download_url": f"https://github.com/daijro/camoufox/releases/download/v{target}/browser.zip"}

    @patch("install_browser.requests.get")
    def test_selects_exact_version(self, get):
        target = "135.0.1-beta.24"
        get.return_value.json.return_value = {"tag_name": f"v{target}", "assets": [self.asset("152.0.4-beta.30"), self.asset(target)]}
        fetcher = PinnedBrowserFetcher(target)
        self.assertEqual(fetcher.verstr, target)
        self.assertIn(f"/v{target}/", fetcher.url)
        get.assert_called_once_with(f"https://api.github.com/repos/daijro/camoufox/releases/tags/v{target}", timeout=30)

    @patch("install_browser.requests.get")
    def test_missing_asset_fails(self, get):
        get.return_value.json.return_value = {"tag_name": "v135.0.1-beta.24", "assets": []}
        with self.assertRaises(RuntimeError):
            PinnedBrowserFetcher("135.0.1-beta.24")

    @patch("install_browser.requests.get")
    def test_wrong_tag_fails(self, get):
        get.return_value.json.return_value = {"tag_name": "v152.0.4-beta.30"}
        with self.assertRaises(RuntimeError):
            PinnedBrowserFetcher("135.0.1-beta.24")

    @patch("install_browser.requests.get")
    def test_http_failure_propagates(self, get):
        get.return_value.raise_for_status.side_effect = requests.HTTPError("not found")
        with self.assertRaises(requests.HTTPError):
            PinnedBrowserFetcher("135.0.1-beta.24")

    def test_invalid_version(self):
        with self.assertRaises(ValueError):
            PinnedBrowserFetcher("../../latest")


if __name__ == "__main__":
    unittest.main()
