import crypto from 'node:crypto';
import type { Request, Response } from 'express';

import { logger } from '../../config/logger.ts';
import Course from '../../models/course.model.ts';
import CoursePurchase from '../../models/course-purchase.model.ts';
import PendingCourseGrant from '../../models/pending-course-grant.model.ts';
import User from '../../models/user.model.ts';
import { claimPendingGrants, grantAddon, grantCourse } from '../courses/course-access.service.ts';

// Milestone 3.2 Developer Plan, Module 3. GoHighLevel order forms charge
// through the client's Stripe account with their own PaymentIntents, so
// our Stripe webhook never sees them. A GHL workflow calls this endpoint
// once per product bought ("course" or "workbook") to unlock access.

const ghlLogger = logger.child('feature:ghl');
const ITEMS = ['course', 'workbook'] as const;
type GhlItem = typeof ITEMS[number];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function secretMatches(provided: string, expected: string): boolean {
  // Hash both sides so timingSafeEqual always compares equal lengths.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

export function parseAmountCents(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : undefined;
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}

export async function handleGhlPurchase(request: Request, response: Response): Promise<void> {
  const expected = String(process.env.GHL_WEBHOOK_SECRET || '').trim();
  if (!expected) {
    ghlLogger.error('GHL purchase webhook called but GHL_WEBHOOK_SECRET is not set.');
    response.status(503).json({ error: 'GHL integration is not configured.' });
    return;
  }

  const provided = String(request.get('x-silversurfers-secret') || request.query?.token || '');
  if (!provided || !secretMatches(provided, expected)) {
    ghlLogger.warn('GHL purchase webhook rejected: invalid secret.', { ip: request.ip });
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = request.body ?? {};
  const email = String(body.email || '').trim().toLowerCase();
  const orderId = String(body.orderId || '').trim();
  const courseSlug = String(body.courseSlug || '').trim().toLowerCase();
  const item = String(body.item || '').trim().toLowerCase() as GhlItem;

  const problem = !EMAIL_PATTERN.test(email) ? 'A valid email is required.'
    : !orderId ? 'orderId is required.'
      : !courseSlug ? 'courseSlug is required.'
        : !ITEMS.includes(item) ? 'item must be "course" or "workbook".'
          : null;
  if (problem) {
    ghlLogger.warn('GHL purchase webhook rejected: invalid payload.', { problem });
    response.status(400).json({ error: problem });
    return;
  }

  try {
    const course: any = await Course.findOne({ slug: courseSlug }).lean();
    if (!course) {
      ghlLogger.warn('GHL purchase webhook rejected: unknown course.', { courseSlug });
      response.status(400).json({ error: `Unknown course "${courseSlug}".` });
      return;
    }

    const externalOrderId = `ghl:${orderId}:${item}`;
    if (await CoursePurchase.exists({ externalOrderId }) || await PendingCourseGrant.exists({ externalOrderId })) {
      ghlLogger.info('GHL purchase webhook duplicate ignored.', { externalOrderId });
      response.json({ status: 'duplicate' });
      return;
    }

    const amountCents = parseAmountCents(body.amount);
    const user: any = await User.findOne({ email, verified: true }).lean();

    if (user && item === 'course') {
      await grantCourse({ userId: user._id, courseId: course._id, source: 'ghl', externalOrderId, amountCents });
      // A workbook webhook that arrived before this one is waiting as a
      // pending grant; attach it now rather than at the next login.
      await claimPendingGrants(user);
      ghlLogger.info('GHL course granted.', { externalOrderId, email: maskEmail(email) });
      response.json({ status: 'granted' });
      return;
    }

    if (user && await grantAddon({ userId: user._id, courseId: course._id, addon: 'workbook' })) {
      ghlLogger.info('GHL workbook recorded.', { externalOrderId, email: maskEmail(email) });
      response.json({ status: 'granted' });
      return;
    }

    try {
      await PendingCourseGrant.create({
        email,
        courseId: course._id,
        item,
        source: 'ghl',
        externalOrderId,
        amountCents,
        rawPayload: body,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        response.json({ status: 'duplicate' });
        return;
      }
      throw error;
    }

    ghlLogger.info('GHL purchase stored as pending grant.', { externalOrderId, email: maskEmail(email) });
    response.json({ status: 'pending' });
  } catch (error) {
    ghlLogger.error('GHL purchase webhook failed.', { error: error instanceof Error ? error.message : String(error) });
    response.status(500).json({ error: 'Failed to record purchase.' });
  }
}
