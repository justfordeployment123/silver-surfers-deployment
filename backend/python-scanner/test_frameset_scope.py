import unittest
from unittest.mock import MagicMock
from types import SimpleNamespace
from frameset_scope import eligible_frame, public_web_url, select_frameset_scope, FrameAuditPage


class FramesetScopeTests(unittest.TestCase):
    def snapshot(self, **kwargs):
        return dict(dict(framesetCount=1, frameCount=1, iframeCount=0, bodyContent=False, visible=True, coverage=1), **kwargs)

    def setup_page(self):
        page = MagicMock()
        page.url = 'https://wrapper.example/'
        page.evaluate.return_value = self.snapshot()
        element = page.query_selector.return_value
        element.get_attribute.return_value = 'https://content.example/'
        frame = element.content_frame.return_value
        frame.url = 'https://content.example/'
        frame.parent_frame = page.main_frame
        frame.child_frames = []
        responses = {page.main_frame: SimpleNamespace(status=200), frame: SimpleNamespace(status=200)}
        return page, frame, responses

    def test_normal_pages_and_iframes_excluded(self):
        for changes in [dict(framesetCount=0), dict(iframeCount=1), dict(frameCount=2),
                        dict(framesetCount=2), dict(bodyContent=True), dict(visible=False), dict(coverage=.2)]:
            self.assertFalse(eligible_frame(self.snapshot(**changes)))

    def test_one_dominant_frame_selected_without_navigation(self):
        page, frame, responses = self.setup_page()
        selected, scope = select_frameset_scope(page, responses)
        self.assertIsInstance(selected, FrameAuditPage)
        self.assertEqual(scope['wrapperUrl'], page.url)
        self.assertEqual(scope['contentUrl'], frame.url)
        selected.evaluate('test')
        frame.evaluate.assert_called_once_with('test')
        selected.close()
        page.close.assert_called_once()
        page.goto.assert_not_called()

    def test_normal_page_returns_original_object(self):
        page, frame, responses = self.setup_page()
        page.evaluate.return_value = self.snapshot(framesetCount=0, iframeCount=4)
        selected, scope = select_frameset_scope(page, responses)
        self.assertIs(selected, page)
        self.assertIsNone(scope)
        page.query_selector.assert_not_called()

    def test_redirect_to_unrelated_frame_host_rejected(self):
        page, frame, responses = self.setup_page()
        frame.url = 'https://challenge.example/'
        self.assertIsNone(select_frameset_scope(page, responses)[1])

    def test_wrapper_redirect_cannot_expand_scope(self):
        page, frame, responses = self.setup_page()
        self.assertIsNone(select_frameset_scope(page, responses, 'https://different.example/')[1])
        page.evaluate.assert_not_called()

    def test_missing_response_or_frame_rejected(self):
        page, frame, responses = self.setup_page()
        del responses[frame]
        self.assertIsNone(select_frameset_scope(page, responses)[1])
        page.query_selector.return_value.content_frame.return_value = None
        self.assertIsNone(select_frameset_scope(page, responses)[1])

    def test_bad_wrapper_and_https_downgrade_rejected(self):
        page, frame, responses = self.setup_page()
        responses[page.main_frame].status = 403
        self.assertIsNone(select_frameset_scope(page, responses)[1])
        responses[page.main_frame].status = 200
        frame.url = 'http://content.example/'
        self.assertIsNone(select_frameset_scope(page, responses)[1])

    def test_untrusted_urls_rejected(self):
        for url in ['about:blank', 'javascript:alert(1)', 'file:///tmp/a', 'http://127.0.0.1/',
                    'http://169.254.169.254/', 'http://[::1]/', 'http://localhost/', 'http://a.internal/', 'https://user:pass@example.com/']:
            self.assertFalse(public_web_url(url))

    def test_error_frame_selected_but_not_misrepresented_as_200(self):
        page, frame, responses = self.setup_page()
        responses[frame].status = 403
        selected, scope = select_frameset_scope(page, responses)
        self.assertEqual(responses[selected.main_frame].status, 403)


if __name__ == '__main__':
    unittest.main()
