import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from navigation_retry import navigate_with_retries, retry_delay


def response(status, headers=None):
    return SimpleNamespace(status=status, headers=headers or {})


class NavigationRetryTests(unittest.TestCase):
    def setUp(self):
        self.page = SimpleNamespace(url='https://example.com/', wait_for_timeout=Mock())

    def test_temporary_failure_recovers(self):
        ok = response(200)
        navigate = Mock(side_effect=[response(503, {'retry-after': '2'}), ok])
        self.assertIs(navigate_with_retries(self.page, self.page.url, navigate), ok)
        self.page.wait_for_timeout.assert_called_once_with(2000)

    def test_access_denial_and_tls_are_not_retried(self):
        for status in (403, 404, 525):
            navigate = Mock(return_value=response(status))
            navigate_with_retries(self.page, self.page.url, navigate)
            self.assertEqual(navigate.call_count, 1)

    def test_rate_limit_longer_than_budget_is_not_retried_early(self):
        navigate = Mock(return_value=response(429, {'retry-after': '120'}))
        navigate_with_retries(self.page, self.page.url, navigate)
        self.assertEqual(navigate.call_count, 1)
        self.page.wait_for_timeout.assert_not_called()

    def test_attempts_are_bounded(self):
        navigate = Mock(return_value=response(503, {'retry-after': '1'}))
        result = navigate_with_retries(self.page, self.page.url, navigate)
        self.assertEqual(result.status, 503)
        self.assertEqual(navigate.call_count, 3)

    def test_retry_after_date(self):
        self.assertEqual(retry_delay(response(429, {'retry-after': 'Wed, 21 Oct 2015 07:28:00 GMT'}), 0), 0)

    def test_invalid_retry_after_uses_backoff(self):
        with patch('navigation_retry.random.uniform', return_value=0):
            self.assertEqual(retry_delay(response(503, {'retry-after': 'invalid'}), 1), 6)
            self.assertEqual(retry_delay(response(503, {'retry-after': 'NaN'}), 1), 6)

    def test_navigation_exception_is_preserved(self):
        navigate = Mock(side_effect=RuntimeError('certificate expired'))
        with self.assertRaisesRegex(RuntimeError, 'certificate expired'):
            navigate_with_retries(self.page, self.page.url, navigate)
        self.assertEqual(navigate.call_count, 1)


if __name__ == '__main__':
    unittest.main()
