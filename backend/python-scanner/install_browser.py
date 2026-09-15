"""Build-time exact-release installer for the pinned Camoufox 0.4.11 API."""
import os
import re

import requests
from camoufox.addons import DefaultAddons, maybe_download_addons
from camoufox.locale import ALLOW_GEOIP, download_mmdb
from camoufox.pkgman import CamoufoxFetcher, installed_verstr


class PinnedBrowserFetcher(CamoufoxFetcher):
    def __init__(self, target):
        if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)+-[A-Za-z0-9.]+", target):
            raise ValueError("Invalid pinned Camoufox browser version")
        self.target = target
        super().__init__()

    def get_asset(self):
        # A tag lookup cannot accidentally select a newer release or miss an old
        # pin because the latest-release listing is paginated.
        response = requests.get(f"{self.api_url}/tags/v{self.target}", timeout=30)
        response.raise_for_status()
        release = response.json()
        if release.get("tag_name") != f"v{self.target}":
            raise RuntimeError("GitHub returned a different Camoufox release")
        for asset in release.get("assets", []):
            match = self.check_asset(asset)
            if match and match[0].full_string == self.target:
                return match
        raise RuntimeError(f"No supported Camoufox asset for pinned version {self.target} on this platform")


def main():
    target = os.environ.get("SCANNER_CAMOUFOX_BROWSER_VERSION", "135.0.1-beta.24")
    fetcher = PinnedBrowserFetcher(target)
    print(f"Installing pinned Camoufox browser {target}: {fetcher.url}", flush=True)
    fetcher.install()
    if installed_verstr() != target:
        raise RuntimeError("Installed Camoufox browser does not match the requested pin")
    if ALLOW_GEOIP:
        download_mmdb()
    maybe_download_addons(list(DefaultAddons))


if __name__ == "__main__":
    main()
