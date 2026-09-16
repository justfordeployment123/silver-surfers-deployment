import unittest
from types import SimpleNamespace
from unittest.mock import patch
from page_readiness import wait_for_ready


class ReadinessTests(unittest.TestCase):
    def run_gate(self, snapshots, statuses, timeout=5000):
        clock = [0.0]
        index = [0]
        def wait(ms):
            clock[0] += ms / 1000
            index[0] += 1
        page = SimpleNamespace(wait_for_timeout=wait)
        def collect(page):
            return snapshots[min(index[0], len(snapshots)-1)]
        def response():
            return SimpleNamespace(status=statuses[min(index[0], len(statuses)-1)])
        with patch('page_readiness.time.monotonic', side_effect=lambda: clock[0]):
            return wait_for_ready(page, collect, response, timeout)

    def content(self, **changes):
        return dict(dict(title='Website', url='https://example.com/', domCount=100, bodyChars=400, readyState='complete', fontsReady=True, visibleImagesReady=True, stylesReady=True, layoutSignature='1'), **changes)

    def test_stable_content_without_viewport_passes(self):
        self.assertTrue(self.run_gate([self.content()], [200])['auditableReady'])

    def test_challenge_200_never_passes(self):
        r = self.run_gate([self.content(title='Just a moment...')], [200])
        self.assertEqual(r['readinessError'], 'BOT_CHALLENGE')

    def test_challenge_redirect_then_success(self):
        r = self.run_gate([self.content(title='Just a moment...'), self.content(), self.content()], [403, 301, 200])
        self.assertTrue(r['auditableReady'])

    def test_redirect_does_not_pass(self):
        self.assertEqual(self.run_gate([self.content()], [301])['readinessError'], 'REDIRECT_NOT_SETTLED')

    def test_http_error_does_not_pass(self):
        self.assertEqual(self.run_gate([self.content()], [403])['readinessError'], 'HTTP_ERROR')

    def test_fonts_and_loading_block_scoring(self):
        for changes in ({'fontsReady':False}, {'readyState':'loading'}, {'stylesReady':False}, {'visibleImagesReady':False}):
            self.assertFalse(self.run_gate([self.content(**changes)], [200])['auditableReady'])

    def test_layout_change_resets_stability(self):
        r = self.run_gate([self.content(layoutSignature=str(i)) for i in range(12)], [200])
        self.assertFalse(r['auditableReady'])


if __name__ == '__main__':
    unittest.main()
