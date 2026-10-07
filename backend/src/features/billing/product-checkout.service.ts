import type Stripe from 'stripe';

import Assessment from '../../models/assessment.model.ts';
import Course from '../../models/course.model.ts';
import CoursePurchase from '../../models/course-purchase.model.ts';
import CourseProgress from '../../models/course-progress.model.ts';
import Ebook from '../../models/ebook.model.ts';
import EbookPurchase from '../../models/ebook-purchase.model.ts';
import { QUESTIONNAIRE_VERSION } from '../assessments/assessment-questions.ts';

const EBOOK_DOWNLOAD_LINK_LIFETIME_DAYS = 7; // client answers 2026-10-07, #9

async function handleCourseCheckout(session: Stripe.Checkout.Session, userId: string): Promise<void> {
  const courseSlug = session.metadata?.courseSlug;
  if (!courseSlug) {
    console.error('Course checkout completed with no courseSlug in metadata:', session.id);
    return;
  }

  const course = await Course.findOne({ slug: courseSlug }).lean();
  if (!course) {
    // Doesn't block the purchase from being recorded elsewhere — but there's
    // nothing to link a CoursePurchase to without a real Course doc. Module
    // 4's seed script must run before this product goes live.
    console.error(`Course checkout completed but no Course found for slug "${courseSlug}":`, session.id);
    return;
  }

  await CoursePurchase.create({
    userId,
    courseId: course._id,
    stripeSessionId: session.id,
    amount: session.amount_total || 0,
    purchasedAt: new Date(),
  });

  // Created empty (not lazily on first page view, Module 5) so the
  // dashboard has something to render the instant payment completes.
  await CourseProgress.create({
    userId,
    courseId: course._id,
    moduleProgress: [],
  });
}

async function handleAssessmentCheckout(session: Stripe.Checkout.Session, userId: string): Promise<void> {
  await Assessment.create({
    userId,
    status: 'purchased',
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    stripeSessionId: session.id,
    amount: session.amount_total || 0,
  });
}

async function handleEbookCheckout(session: Stripe.Checkout.Session, userId: string): Promise<void> {
  const ebookId = session.metadata?.ebookId;
  if (!ebookId) {
    console.error('Ebook checkout completed with no ebookId in metadata:', session.id);
    return;
  }

  const ebook = await Ebook.findById(ebookId).lean();
  if (!ebook) {
    console.error(`Ebook checkout completed but no Ebook found for id "${ebookId}":`, session.id);
    return;
  }

  const downloadTokenExpiresAt = new Date(
    Date.now() + EBOOK_DOWNLOAD_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  );

  await EbookPurchase.create({
    userId,
    ebookId: ebook._id,
    stripeSessionId: session.id,
    amount: session.amount_total || 0,
    purchasedAt: new Date(),
    downloadTokenExpiresAt,
  });
}

// Dispatched from stripe-webhook.service.ts's handleCheckoutSessionCompleted
// as an if/else branch on metadata.productType, ahead of (not replacing)
// the existing one-time-scan-purchase handling (Architecture Decision 2.2).
export async function handleProductCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const productType = session.metadata?.productType;
  const userId = session.metadata?.userId;

  if (!productType || !userId) {
    return;
  }

  switch (productType) {
    case 'course':
      await handleCourseCheckout(session, userId);
      break;
    case 'assessment':
      await handleAssessmentCheckout(session, userId);
      break;
    case 'ebook':
      await handleEbookCheckout(session, userId);
      break;
    default:
      console.error(`Unknown productType "${productType}" on checkout session:`, session.id);
  }
}
