"""Select only a legacy single-content frameset, never ordinary iframes."""
from urllib.parse import urlsplit, urljoin
import ipaddress
import json


def public_web_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        return False
    host = parsed.hostname.lower()
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return "." in host


def eligible_frame(snapshot):
    return (snapshot.get("framesetCount") == 1 and snapshot.get("frameCount") == 1
            and snapshot.get("iframeCount") == 0 and not snapshot.get("bodyContent")
            and snapshot.get("visible") is True and snapshot.get("coverage", 0) >= 0.8)


class FrameAuditPage:
    """Document operations use the frame; viewport/lifetime remain the page's."""
    def __init__(self, page, frame):
        self._page, self._frame = page, frame

    @property
    def url(self):
        return self._frame.url

    @property
    def main_frame(self):
        return self._frame

    @property
    def frames(self):
        return [self._frame, *self._frame.child_frames]

    def evaluate(self, *args, **kwargs):
        return self._frame.evaluate(*args, **kwargs)

    def content(self):
        return self._frame.content()

    def title(self):
        return self._frame.title()

    def __getattr__(self, name):
        return getattr(self._page, name)


def select_frameset_scope(page, responses, requested_url=None):
    normalize = lambda url: (urlsplit(url).hostname or '').lower().removeprefix('www.')
    if requested_url and normalize(requested_url) != normalize(page.url):
        return page, None
    snapshot = page.evaluate("""() => {
        const frames = document.querySelectorAll('frame');
        const frame = frames[0];
        const rect = frame ? frame.getBoundingClientRect() : null;
        const style = frame ? getComputedStyle(frame) : null;
        const visible = !!rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
        const viewportWidth = document.documentElement.clientWidth || innerWidth;
        const viewportHeight = document.documentElement.clientHeight || innerHeight;
        const width = rect ? Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(0, rect.left)) : 0;
        const height = rect ? Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(0, rect.top)) : 0;
        return {framesetCount: document.querySelectorAll('frameset').length,
            frameCount: frames.length, iframeCount: document.querySelectorAll('iframe').length,
            bodyContent: !!document.querySelector('body:not(frameset) main, body:not(frameset) form') ||
                !!(document.body && document.body.tagName === 'BODY' && document.body.innerText.trim()),
            visible, coverage: width * height / Math.max(1, viewportWidth * viewportHeight)};
    }""")
    if snapshot.get('framesetCount'):
        print('Scanner frameset selection: ' + json.dumps(snapshot))
    if not eligible_frame(snapshot):
        return page, None
    wrapper_response = responses.get(page.main_frame)
    if wrapper_response is None or not 200 <= wrapper_response.status < 300:
        return page, None
    element = page.query_selector('frameset > frame')
    frame = element.content_frame() if element else None
    if frame is None or frame.parent_frame != page.main_frame:
        return page, None
    source = urljoin(page.url, element.get_attribute('src') or '')
    if not public_web_url(source) or not public_web_url(frame.url):
        return page, None
    if normalize(source) != normalize(frame.url):
        return page, None
    if urlsplit(page.url).scheme == 'https' and urlsplit(frame.url).scheme != 'https':
        return page, None
    response = responses.get(frame)
    if response is None:
        return page, None
    return FrameAuditPage(page, frame), {
        'type': 'legacy-frameset-content', 'wrapperUrl': page.url,
        'contentUrl': frame.url, 'sourceUrl': source,
        'limitation': 'Score covers the embedded content frame only, not the frameset wrapper. Other embedded frames are not separate scan targets.',
    }
