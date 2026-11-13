import { logger } from '../../config/logger.ts';
import CoursePurchase from '../../models/course-purchase.model.ts';
import CourseProgress from '../../models/course-progress.model.ts';
import PendingCourseGrant from '../../models/pending-course-grant.model.ts';

// Milestone 3.2 Developer Plan, Module 2. The single write path that
// unlocks a course, shared by the Stripe webhook, the GHL webhook, admin
// grants and claimed pending grants.

const courseAccessLogger = logger.child('feature:course-access');

export type CourseGrantSource = 'stripe' | 'ghl' | 'admin';
export type CourseAddon = 'workbook';

interface GrantCourseInput {
  userId: unknown;
  courseId: unknown;
  source: CourseGrantSource;
  stripeSessionId?: string;
  externalOrderId?: string;
  amountCents?: number;
}

export async function grantCourse(input: GrantCourseInput): Promise<void> {
  const { userId, courseId, source, stripeSessionId, externalOrderId, amountCents } = input;

  // Stripe keeps one purchase per checkout session (unchanged 3.1
  // behaviour). Other sources keep one purchase per user and course, so a
  // retried webhook or a second grant never creates a duplicate.
  const filter = stripeSessionId ? { userId, courseId, stripeSessionId } : { userId, courseId };
  const insert: Record<string, unknown> = {
    userId,
    courseId,
    source,
    amount: amountCents || 0,
    purchasedAt: new Date(),
  };
  if (stripeSessionId) insert.stripeSessionId = stripeSessionId;
  if (externalOrderId) insert.externalOrderId = externalOrderId;

  await CoursePurchase.updateOne(filter, { $setOnInsert: insert }, { upsert: true });

  // Created empty (not lazily on first page view, Module 5 of 3.1) so the
  // dashboard has something to render the instant access is granted.
  await CourseProgress.updateOne({ userId, courseId }, {
    $setOnInsert: { userId, courseId, moduleProgress: [] },
  }, { upsert: true });
}

// Returns false when the user has no purchase of this course yet, so the
// caller can keep the add-on pending until the course grant lands.
export async function grantAddon({ userId, courseId, addon }: { userId: unknown; courseId: unknown; addon: CourseAddon }): Promise<boolean> {
  const result: any = await CoursePurchase.updateOne({ userId, courseId }, { $addToSet: { addons: addon } });
  return Boolean(result?.matchedCount);
}

export async function ownsAddon(userId: unknown, courseId: unknown, addon: CourseAddon): Promise<boolean> {
  return Boolean(await CoursePurchase.exists({ userId, courseId, addons: addon }));
}

export async function claimPendingGrants(user: { _id?: unknown; id?: unknown; email?: string | null }): Promise<{ claimed: number }> {
  const email = String(user?.email || '').trim().toLowerCase();
  const userId = user?._id ?? user?.id;
  if (!email || !userId) return { claimed: 0 };

  const grants: any[] = await PendingCourseGrant.find({ email, claimedAt: null }).lean();
  // Course grants first, so a workbook bought in the same order finds the
  // course purchase it attaches to.
  grants.sort((a, b) => Number(a.item !== 'course') - Number(b.item !== 'course'));

  let claimed = 0;
  for (const grant of grants) {
    if (grant.item === 'course') {
      await grantCourse({
        userId,
        courseId: grant.courseId,
        source: grant.source === 'admin' ? 'admin' : 'ghl',
        externalOrderId: grant.externalOrderId,
        amountCents: grant.amountCents,
      });
    } else if (!(await grantAddon({ userId, courseId: grant.courseId, addon: 'workbook' }))) {
      continue;
    }

    await PendingCourseGrant.updateOne({ _id: grant._id, claimedAt: null }, {
      $set: { claimedAt: new Date(), claimedByUserId: userId },
    });
    claimed += 1;
  }

  return { claimed };
}

// Used on login and email verification (Module 4): a claim failure is
// logged and retried at the next login, and must never block signing in.
export async function claimGrantsSafely(user: Parameters<typeof claimPendingGrants>[0]): Promise<{ claimed: number }> {
  try {
    return await claimPendingGrants(user);
  } catch (error) {
    courseAccessLogger.error('Claiming pending course grants failed.', {
      userId: String(user?._id ?? user?.id ?? ''),
      error: error instanceof Error ? error.message : String(error),
    });
    return { claimed: 0 };
  }
}
