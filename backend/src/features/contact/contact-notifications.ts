import { logger } from '../../config/logger.ts';
import { sendDirectMail } from '../audits/report-delivery.ts';

const contactLogger = logger.child('feature:contact');

export interface ContactNotificationInput {
  id: string;
  name?: string;
  email?: string;
  subject?: string;
  message: string;
  submittedAtIso?: string;
}

export function buildContactNotification(input: ContactNotificationInput): { subject: string; text: string } {
  const subject = `New Contact Form Message${input.subject ? `: ${input.subject}` : ''}`;
  const text = `
New contact form submission received:

Name: ${input.name || 'Not provided'}
Email: ${input.email || 'Not provided'}
Subject: ${input.subject || 'Not provided'}

Message:
${input.message}

---
Submitted at: ${input.submittedAtIso || new Date().toISOString()}
Message ID: ${input.id}
  `.trim();

  return { subject, text };
}

// Extracted so the fallback address is directly testable without mocking
// sendDirectMail — a UAT finding traced back to this exact fallback once
// pointing at a stray 'info@mg.silversurfers.ai' address, and separately to
// the deployed CONTACT_NOTIFICATION_EMAIL override having drifted to a
// team member's personal inbox instead of hello@silversurfers.ai.
export function resolveContactNotificationRecipient(): string {
  return process.env.CONTACT_NOTIFICATION_EMAIL?.trim() || 'hello@silversurfers.ai';
}

export async function sendContactNotification(input: ContactNotificationInput): Promise<void> {
  const notification = buildContactNotification(input);
  const to = resolveContactNotificationRecipient();
  const result = await sendDirectMail({
    to,
    subject: notification.subject,
    text: notification.text,
  });

  if (result.success) {
    contactLogger.info('Contact notification email sent.', { to, messageId: result.messageId });
    return;
  }

  contactLogger.warn('Contact notification email failed.', {
    to,
    error: result.error,
  });
}
