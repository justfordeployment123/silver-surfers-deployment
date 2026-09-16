import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContactNotification, resolveContactNotificationRecipient } from '../src/features/contact/contact-notifications.ts';

// UAT: contact-form submissions weren't reaching hello@silversurfers.ai —
// traced to the deployed CONTACT_NOTIFICATION_EMAIL env var having drifted
// to a personal inbox, plus a code-level fallback that pointed at a stray
// 'info@mg.silversurfers.ai' address rather than hello@ when the env var is
// unset entirely (fresh/local environments).
test('resolveContactNotificationRecipient falls back to hello@silversurfers.ai when unset', () => {
  const original = process.env.CONTACT_NOTIFICATION_EMAIL;
  delete process.env.CONTACT_NOTIFICATION_EMAIL;
  try {
    assert.equal(resolveContactNotificationRecipient(), 'hello@silversurfers.ai');
  } finally {
    if (original === undefined) delete process.env.CONTACT_NOTIFICATION_EMAIL;
    else process.env.CONTACT_NOTIFICATION_EMAIL = original;
  }
});

test('resolveContactNotificationRecipient honors an explicit override', () => {
  const original = process.env.CONTACT_NOTIFICATION_EMAIL;
  process.env.CONTACT_NOTIFICATION_EMAIL = 'ops@silversurfers.ai';
  try {
    assert.equal(resolveContactNotificationRecipient(), 'ops@silversurfers.ai');
  } finally {
    if (original === undefined) delete process.env.CONTACT_NOTIFICATION_EMAIL;
    else process.env.CONTACT_NOTIFICATION_EMAIL = original;
  }
});

test('buildContactNotification formats subject and text for contact submissions', () => {
  const notification = buildContactNotification({
    id: 'msg_123',
    name: 'Taylor',
    email: 'taylor@example.com',
    subject: 'Enterprise inquiry',
    message: 'Please contact us about onboarding.',
    submittedAtIso: '2026-03-16T10:00:00.000Z',
  });

  assert.equal(notification.subject, 'New Contact Form Message: Enterprise inquiry');
  assert.match(notification.text, /Name: Taylor/);
  assert.match(notification.text, /Email: taylor@example.com/);
  assert.match(notification.text, /Please contact us about onboarding\./);
  assert.match(notification.text, /Message ID: msg_123/);
});
