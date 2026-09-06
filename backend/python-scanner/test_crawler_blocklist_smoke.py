"""
Phase 9.3 standing smoke test — crawler blocklist (F4, N4).

scanner_service.py has no automated test harness (its real entrypoints need
a live Camoufox/FastAPI stack and a real browser), so this exercises the
pure, dependency-free filtering logic directly: `_scanner_is_auditable_url`
and the `_BLOCKED_AUDIT_PATH_RE` it's built on. No network, no browser —
this is just regex/URL-parsing logic, verified against exactly the two
fixture shapes plan.md's Phase 9.3 calls for:

  - Shopify-like: Web Pixels Manager script-path fragments
    (/previewImage, /cdn, /wpm, /next, /open, /close) that teresegarcia's
    QA re-scan showed slipping through and consuming paid audit slots.
  - Wix-like: bare UUID path segments (machine-generated stub pages) that
    riacc.io's QA re-scan showed the same way.

scanner_service.py itself can't be imported directly in an environment
without camoufox/fastapi/bs4/pydantic installed (this one included) — its
module-level imports pull those in immediately. Rather than hand-copy the
regex (drift risk: the copy could silently diverge from the real one), this
stubs just enough of those third-party modules in sys.modules for the *real*
scanner_service module to import cleanly, then tests its actual objects.

Run directly:  python test_crawler_blocklist_smoke.py
Exit code 0 = all checks passed; non-zero = a real filtering regression.
"""
from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def _install_stub_dependencies() -> None:
    """Stub the third-party packages scanner_service.py imports at module
    scope, only if they aren't actually installed. None of their real
    behavior is exercised by the filtering functions under test here."""

    if "fastapi" not in sys.modules:
        try:
            import fastapi  # noqa: F401
        except ImportError:
            fastapi_stub = types.ModuleType("fastapi")

            class _FastAPI:
                def __init__(self, *args, **kwargs):
                    pass

                def get(self, *args, **kwargs):
                    return lambda fn: fn

                def post(self, *args, **kwargs):
                    return lambda fn: fn

                def api_route(self, *args, **kwargs):
                    return lambda fn: fn

            class _HTTPException(Exception):
                def __init__(self, status_code=500, detail=None):
                    super().__init__(detail)
                    self.status_code = status_code
                    self.detail = detail

            fastapi_stub.FastAPI = _FastAPI
            fastapi_stub.HTTPException = _HTTPException
            sys.modules["fastapi"] = fastapi_stub

    if "pydantic" not in sys.modules:
        try:
            import pydantic  # noqa: F401
        except ImportError:
            pydantic_stub = types.ModuleType("pydantic")

            class _BaseModel:
                def __init__(self, **kwargs):
                    for key, value in kwargs.items():
                        setattr(self, key, value)

            pydantic_stub.BaseModel = _BaseModel
            sys.modules["pydantic"] = pydantic_stub

    if "camoufox" not in sys.modules:
        try:
            import camoufox  # noqa: F401
        except ImportError:
            camoufox_stub = types.ModuleType("camoufox")
            camoufox_sync_api_stub = types.ModuleType("camoufox.sync_api")

            class _Camoufox:
                def __init__(self, *args, **kwargs):
                    pass

            camoufox_sync_api_stub.Camoufox = _Camoufox
            camoufox_stub.sync_api = camoufox_sync_api_stub
            sys.modules["camoufox"] = camoufox_stub
            sys.modules["camoufox.sync_api"] = camoufox_sync_api_stub

    if "camoufox_auditor" not in sys.modules:
        try:
            import bs4  # noqa: F401
            import camoufox_auditor  # noqa: F401
        except ImportError:
            camoufox_auditor_stub = types.ModuleType("camoufox_auditor")
            camoufox_auditor_stub.run_camoufox_audit_sync = lambda *args, **kwargs: None
            sys.modules["camoufox_auditor"] = camoufox_auditor_stub


_install_stub_dependencies()

# With the stubs (or real packages) in place, this imports the *actual*
# scanner_service module — the same regex object and function the live
# service runs — not a hand-maintained copy.
import scanner_service  # noqa: E402


class CrawlerBlocklistSmokeTest(unittest.TestCase):
    home_key = "https://example.com/"

    def assert_blocked(self, path: str) -> None:
        url = f"https://example.com{path}"
        self.assertFalse(
            scanner_service._scanner_is_auditable_url(url, self.home_key),
            f"{path} must be blocked but _scanner_is_auditable_url allowed it",
        )

    def assert_allowed(self, path: str) -> None:
        url = f"https://example.com{path}"
        self.assertTrue(
            scanner_service._scanner_is_auditable_url(url, self.home_key),
            f"{path} must be allowed but _scanner_is_auditable_url blocked it",
        )

    # Shopify-like: Web Pixels Manager script-path fragments (F4 — teresegarcia).
    def test_shopify_web_pixels_manager_fragments_are_blocked(self) -> None:
        for path in ("/previewImage", "/cdn", "/wpm", "/next", "/open", "/close"):
            with self.subTest(path=path):
                self.assert_blocked(path)

    # Wix-like: bare UUID path segments (F4 — riacc.io).
    def test_wix_uuid_stub_paths_are_blocked(self) -> None:
        for path in (
            "/b2d05acc-1234-4abc-9def-abcdef012345",
            "/dfad67a0-5678-4bcd-8ef0-123456789abc",
        ):
            with self.subTest(path=path):
                self.assert_blocked(path)

    # Positive control: real content pages that merely resemble the
    # blocklist (short "pcm" prefix, no UUID/hex) must still pass — the
    # blocklist must not over-block.
    def test_real_content_pages_are_not_over_blocked(self) -> None:
        for path in ("/products/waves", "/about-us", "/pcm-audio-solutions"):
            with self.subTest(path=path):
                self.assert_allowed(path)

    def test_wordpress_infrastructure_endpoints_are_blocked(self) -> None:
        for path in ("/wp-login.php", "/xmlrpc.php", "/wp-content/plugins/some-plugin/style.css"):
            with self.subTest(path=path):
                self.assert_blocked(path)

    # P3-06 — chateausureau.com's crawl plan queued wp-admin/*, wp-content/*,
    # and admin-ajax.php as if they were real pages; all 6 slots 404'd but
    # still showed up in the client-facing TOC (e.g. "Admin Ajax.php Page").
    def test_wordpress_admin_area_is_blocked(self) -> None:
        for path in (
            "/wp-admin/",
            "/wp-admin/admin-ajax.php",
            "/wp-admin/options-general.php",
            "/wp-content/uploads/2024/01/banner.png",
            "/wp-content/themes/some-theme/style.css",
        ):
            with self.subTest(path=path):
                self.assert_blocked(path)

    # P3-06 — a literal wildcard character can never appear in a real page's
    # URL; chateausureau.com's TOC showed a literal "* Page" entry, meaning
    # a broken template placeholder (or a robots.txt-style glob pattern) got
    # picked up as if it were a real link.
    def test_literal_wildcard_paths_are_blocked(self) -> None:
        for path in ("/category/*", "/*", "/blog/*.php"):
            with self.subTest(path=path):
                self.assert_blocked(path)

    # P3-06 — WordPress date archives (weldingworks's residual case): a
    # chronological listing of post excerpts, not distinct navigable content.
    def test_wordpress_date_archives_are_blocked(self) -> None:
        for path in ("/2016/10/", "/2016/10", "/2016/10/15/some-post-slug"):
            with self.subTest(path=path):
                self.assert_blocked(path)

    # Positive control for the new date-archive pattern specifically: a
    # product/content slug that happens to start with digits must not be
    # mistaken for a date archive — the pattern requires two consecutive
    # numeric path segments shaped like a year and a month.
    def test_numeric_looking_slugs_are_not_mistaken_for_date_archives(self) -> None:
        for path in ("/products/2024-limited-edition", "/2024-annual-report", "/blog/10-tips-for-2024"):
            with self.subTest(path=path):
                self.assert_allowed(path)


if __name__ == "__main__":
    unittest.main()
