import crypto from 'node:crypto';
import type { Request, Response } from 'express';

import Course from '../../models/course.model.ts';
import CoursePurchase from '../../models/course-purchase.model.ts';
import PendingCourseGrant from '../../models/pending-course-grant.model.ts';
import User from '../../models/user.model.ts';
import { grantAddon, grantCourse } from '../courses/course-access.service.ts';
import { courseFilter } from './admin-courses.controller.ts';

// Milestone 3.2 Developer Plan, Module 5. Manual access for buyers who
// checked out with a different email, refunds and comps. Grants follow the
// same rule as GHL purchases: only verified accounts get access directly,
// everyone else gets a pending grant claimed at verification or login.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIST_LIMIT = 500;

async function findCourse(request: Request): Promise<any | null> {
  return Course.findOne(courseFilter(String(request.params.idOrSlug || ''))).lean();
}

function readEmail(request: Request): string {
  return String(request.body?.email || '').trim().toLowerCase();
}

export async function listAdminCourseAccess(request: Request, response: Response): Promise<void> {
  const course = await findCourse(request);
  if (!course) { response.status(404).json({ error: 'Course not found.' }); return; }

  const purchases: any[] = await CoursePurchase.find({ courseId: course._id })
    .populate('userId', 'email')
    .sort({ purchasedAt: -1 })
    .limit(LIST_LIMIT)
    .lean();
  const pending: any[] = await PendingCourseGrant.find({ courseId: course._id, claimedAt: null })
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean();

  response.json({
    owners: purchases
      .filter((purchase) => purchase.userId?.email)
      .map((purchase) => ({
        purchaseId: String(purchase._id),
        email: purchase.userId.email,
        source: purchase.source || 'stripe',
        addons: purchase.addons || [],
        purchasedAt: purchase.purchasedAt,
      })),
    pending: pending.map((grant) => ({
      id: String(grant._id),
      email: grant.email,
      item: grant.item,
      source: grant.source,
      createdAt: grant.createdAt,
    })),
  });
}

export async function grantAdminCourseAccess(request: Request, response: Response): Promise<void> {
  const email = readEmail(request);
  const item = String(request.body?.item || 'course');
  if (!EMAIL_PATTERN.test(email)) { response.status(400).json({ error: 'Enter a valid email address.' }); return; }
  if (item !== 'course' && item !== 'workbook') { response.status(400).json({ error: 'Choose the course or the workbook.' }); return; }

  const course = await findCourse(request);
  if (!course) { response.status(404).json({ error: 'Course not found.' }); return; }

  const externalOrderId = `admin:${crypto.randomUUID()}:${item}`;
  const user: any = await User.findOne({ email }).lean();

  if (user?.verified && item === 'course') {
    await grantCourse({ userId: user._id, courseId: course._id, source: 'admin', externalOrderId });
    response.json({ status: 'granted' });
    return;
  }
  if (user?.verified && await grantAddon({ userId: user._id, courseId: course._id, addon: 'workbook' })) {
    response.json({ status: 'granted' });
    return;
  }

  await PendingCourseGrant.create({ email, courseId: course._id, item, source: 'admin', externalOrderId });
  response.json({ status: 'pending' });
}

export async function revokeAdminCourseAccess(request: Request, response: Response): Promise<void> {
  const email = readEmail(request);
  if (!EMAIL_PATTERN.test(email)) { response.status(400).json({ error: 'Enter a valid email address.' }); return; }

  const course = await findCourse(request);
  if (!course) { response.status(404).json({ error: 'Course not found.' }); return; }

  // Progress is kept, so re-granting later resumes where the user left off.
  const user: any = await User.findOne({ email }).lean();
  const purchases: any = user ? await CoursePurchase.deleteMany({ userId: user._id, courseId: course._id }) : { deletedCount: 0 };
  const pending: any = await PendingCourseGrant.deleteMany({ email, courseId: course._id, claimedAt: null });

  response.json({ removedPurchases: purchases.deletedCount || 0, removedPending: pending.deletedCount || 0 });
}
