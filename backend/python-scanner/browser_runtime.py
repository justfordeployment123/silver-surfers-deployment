"""Shared Camoufox runtime for HTTP and SQS scanner paths."""
import json
import os
import platform
import uuid
from pathlib import Path
from contextlib import contextmanager
from importlib.metadata import version
from urllib.parse import urlsplit, urlunsplit

from camoufox.pkgman import camoufox_path, installed_verstr
from camoufox.sync_api import Camoufox
from camoufox import DefaultAddons
from bs4 import BeautifulSoup
from proxy_fallback import proxy_mode


def browser_options(env=None, *, use_proxy=None, proxy_session=None):
    env = os.environ if env is None else env
    mode = env.get("SCANNER_BROWSER_MODE", "headless")
    if mode not in {"headless", "virtual", "headed"}:
        raise ValueError("SCANNER_BROWSER_MODE must be headless, virtual, or headed")
    options = {"headless": {"headless": True, "virtual": "virtual", "headed": False}[mode]}
    routing_mode = proxy_mode(env)
    enabled = routing_mode == "always" if use_proxy is None else use_proxy
    if enabled:
        server = env.get("SCANNER_PROXY_SERVER", "")
        parsed = urlsplit(server)
        if parsed.scheme not in {"http", "https", "socks5"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("SCANNER_PROXY_SERVER must be a proxy URL without embedded credentials")
        username = env.get("SCANNER_PROXY_USERNAME", "").replace("{session}", proxy_session or uuid.uuid4().hex[:10])
        password = env.get("SCANNER_PROXY_PASSWORD", "")
        if bool(username) != bool(password):
            raise ValueError("Both proxy username and password must be supplied")
        options["proxy"] = {"server": server}
        if username:
            options["proxy"].update(username=username, password=password)
        options["geoip"] = True
    return options


def verify_browser():
    camoufox_path(download_if_missing=False)
    installed = installed_verstr()
    expected = os.getenv("SCANNER_CAMOUFOX_BROWSER_VERSION", "135.0.1-beta.24")
    if installed != expected:
        raise RuntimeError(f"Camoufox browser version mismatch: expected {expected}, installed {installed}")
    return {"camoufox": version("camoufox"), "playwright": version("playwright"),
            "browser": installed, "platform": platform.system(),
            "revision": os.getenv("SCANNER_BUILD_REVISION", "unknown")}


def safe_url(value):
    parsed = urlsplit(value)
    # Never put credentials, query strings, or fragments into diagnostics.
    return urlunsplit((parsed.scheme, parsed.hostname or "", parsed.path, "", ""))


@contextmanager
def scanner_browser(device=None, *, use_proxy=None, proxy_session=None):
    options = browser_options(use_proxy=use_proxy, proxy_session=proxy_session)
    # Audit the page as delivered, not a version altered by an ad blocker.
    options["exclude_addons"] = [DefaultAddons.UBO]
    device = device or {}
    viewport = device.get("viewport", {"width": 1920, "height": 1080})
    # Audits need deterministic dimensions rather than randomized viewport fingerprints.
    options["config"] = {"window.innerWidth": viewport["width"],
                         "window.innerHeight": viewport["height"],
                         "navigator.maxTouchPoints": 1 if device.get("has_touch") else 0}
    metadata = verify_browser()
    print("Scanner browser runtime: " + json.dumps({**metadata, "mode": os.getenv("SCANNER_BROWSER_MODE", "headless"), "proxyEnabled": "proxy" in options}))
    with Camoufox(**options) as browser:
        yield browser


def observe_navigation(page):
    """Record document responses, including redirects/challenge recovery, not subresources."""
    def on_response(response):
        if response.request.is_navigation_request() and response.frame == page.main_frame:
            print("Scanner document response: " + json.dumps({"url": safe_url(response.url), "status": response.status}))
    page.on("response", on_response)


def new_scanner_page(browser, device=None):
    device = device or {}
    page = browser.new_page(
        ignore_https_errors=os.getenv("SCANNER_IGNORE_HTTPS_ERRORS", "").lower() in {"1", "true", "yes", "on"},
        viewport=device.get("viewport", {"width": 1920, "height": 1080}),
        device_scale_factor=device.get("device_scale_factor", 1),
        has_touch=device.get("has_touch", False),
    )
    observe_navigation(page)
    return page


def capture_failure(page):
    """Opt-in local evidence; never upload screenshots or page content automatically."""
    directory = os.getenv("SCANNER_DIAGNOSTICS_DIR", "")
    if not directory:
        return
    try:
        folder = Path(directory) / uuid.uuid4().hex
        folder.mkdir(parents=True, exist_ok=False)
        metadata = {"url": safe_url(page.url), "title": page.title()[:200]}
        (folder / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
        # Structural HTML only: remove scripts, all attributes, and all text.
        soup = BeautifulSoup(page.content(), "html.parser")
        for node in soup.select("script, style, iframe, object, embed"):
            node.decompose()
        for node in soup.find_all(True):
            node.attrs = {}
        for node in soup.find_all(string=True):
            node.replace_with("")
        (folder / "structure.html").write_text(str(soup), encoding="utf-8")
        if os.getenv("SCANNER_DIAGNOSTICS_SCREENSHOTS", "false").lower() == "true":
            page.screenshot(path=str(folder / "page.png"), timeout=5000)
        print("Scanner failure evidence: " + str(folder))
    except Exception:
        print("Scanner failure evidence could not be captured")


if __name__ == "__main__":
    print(json.dumps(verify_browser()))
