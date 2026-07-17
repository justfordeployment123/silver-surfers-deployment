import type Stripe from 'stripe';

import Subscription from '../../models/subscription.model.ts';
import User from '../../models/user.model.ts';
import {
  sendOneTimePurchaseEmail,
  sendSubscriptionCancellationEmail,
  sendSubscriptionReinstatementEmail,
  sendSubscriptionWelcomeEmail,
} from './billing-email.service.ts';
import { getLimitsForCycle, getPlanById, getPlanByPriceId } from './subscription-plans.ts';
import { getStripeClient } from './stripe-client.ts';

const LOCAL_SUBSCRIPTION_STATUSES = new Set(['active', 'canceled', 'past_due', 'unpaid', 'incomplete', 'trialing', 'paused']);

function getStripePeriodDate(value: number | null | undefined): Date | null {
  return Number.isFinite(value) ? new Date(Number(value) * 1000) : null;
}

function normalizeBillingCycle(value: unknown): 'monthly' | 'yearly' {
  return value === 'monthly' ? 'monthly' : 'yearly';
}

function getStripeCustomerId(subscription: Stripe.Subscription): string | null {
  return typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id || null;
}

async function syncSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<{
  user: { email?: string } | null;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  currentPeriodEnd: Date | null;
} | null> {
  const customerId = getStripeCustomerId(subscription);
  if (!customerId) {
    return null;
  }

  const user = await User.findOne({ stripeCustomerId: customerId });
  if (!user) {
    return null;
  }

  if (!LOCAL_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return null;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const match = getPlanByPriceId(priceId);
  const plan = match?.plan || getPlanById(subscription.metadata?.planId || '');
  if (!priceId || !plan) {
    return {
      user,
      planName: 'Unknown Plan',
      billingCycle: normalizeBillingCycle(subscription.metadata?.billingCycle),
      currentPeriodEnd: getStripePeriodDate((subscription as unknown as { current_period_end?: number }).current_period_end),
    };
  }

  const metadataBillingCycle = subscription.metadata?.billingCycle === 'monthly' || subscription.metadata?.billingCycle === 'yearly'
    ? subscription.metadata.billingCycle
    : null;
  const billingCycle = match?.billingCycle
    || metadataBillingCycle
    || (subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'yearly' : 'monthly');
  const currentPeriodStart = getStripePeriodDate((subscription as unknown as { current_period_start?: number }).current_period_start) || new Date();
  const currentPeriodEnd = getStripePeriodDate((subscription as unknown as { current_period_end?: number }).current_period_end)
    || new Date(Date.now() + (billingCycle === 'monthly' ? 31 : 365) * 24 * 60 * 60 * 1000);
  const existingSubscription = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
  const subscriptionUpdate: Record<string, unknown> = {
    user: user._id,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    status: subscription.status,
    planId: plan.id,
    priceId,
    billingCycle,
    currentPeriodStart,
    currentPeriodEnd,
    trialStart: getStripePeriodDate((subscription as unknown as { trial_start?: number | null }).trial_start),
    trialEnd: getStripePeriodDate((subscription as unknown as { trial_end?: number | null }).trial_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    limits: getLimitsForCycle(plan, billingCycle),
  };

  if (!existingSubscription) {
    subscriptionUpdate.usage = {
      scansThisMonth: 0,
      lastResetDate: new Date(),
      totalScans: 0,
    };
  }

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    subscriptionUpdate,
    { upsert: true, new: true },
  );

  await User.findOneAndUpdate(
    { stripeCustomerId: customerId },
    {
      'subscription.stripeSubscriptionId': subscription.id,
      'subscription.status': subscription.status,
      'subscription.planId': plan.id,
      'subscription.priceId': priceId,
      'subscription.currentPeriodStart': currentPeriodStart,
      'subscription.currentPeriodEnd': currentPeriodEnd,
      'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
    },
  );

  return {
    user,
    planName: plan.name,
    billingCycle,
    currentPeriodEnd,
  };
}

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== 'payment' || session.metadata?.type !== 'one-time') {
    return;
  }

  const userId = session.metadata.userId;
  const planId = session.metadata.planId;
  if (!userId || !planId) {
    return;
  }

  const user = await User.findById(userId);
  const plan = getPlanById(planId);
  if (!user || !plan) {
    return;
  }

  user.oneTimeScans = (user.oneTimeScans || 0) + 1;
  user.purchaseHistory = user.purchaseHistory || [];
  user.purchaseHistory.push({
    date: new Date(),
    planId,
    planName: plan.name,
    amount: session.amount_total || 0,
    sessionId: session.id,
    type: 'one-time',
  });
  await user.save();

  try {
    await sendOneTimePurchaseEmail(user.email, plan.name);
  } catch (error) {
    console.error('Failed to send one-time purchase email:', error);
  }
}

export async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  if (!['active', 'trialing'].includes(subscription.status)) {
    return;
  }

  const syncedSubscription = await syncSubscriptionFromStripe(subscription);
  if (!syncedSubscription) {
    return;
  }

  try {
    if (syncedSubscription.user?.email) {
      await sendSubscriptionWelcomeEmail(
        syncedSubscription.user.email,
        syncedSubscription.planName,
        syncedSubscription.billingCycle,
        syncedSubscription.currentPeriodEnd,
      );
    }
  } catch (error) {
    console.error('Failed to send subscription welcome email:', error);
  }
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const localSubscription = await Subscription.findOne({ stripeSubscriptionId: subscription.id });
  if (!localSubscription) {
    await syncSubscriptionFromStripe(subscription);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const match = getPlanByPriceId(priceId);
  const plan = match?.plan ?? null;
  const currentPeriodStart = getStripePeriodDate((subscription as unknown as { current_period_start?: number }).current_period_start);
  const currentPeriodEnd = getStripePeriodDate((subscription as unknown as { current_period_end?: number }).current_period_end);

  let shouldResetUsage = false;
  if (currentPeriodStart && localSubscription.currentPeriodStart) {
    shouldResetUsage = currentPeriodStart.getTime() !== localSubscription.currentPeriodStart.getTime();
  }

  const wasReactivated = localSubscription.cancelAtPeriodEnd === true && subscription.cancel_at_period_end === false;
  const wasInactive = Boolean(localSubscription.status && !['active', 'trialing'].includes(localSubscription.status));
  const isNowActive = ['active', 'trialing'].includes(subscription.status);

  const subscriptionUpdate: Record<string, unknown> = {
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(plan && match ? { planId: plan.id, billingCycle: match.billingCycle, limits: getLimitsForCycle(plan, match.billingCycle) } : {}),
  };

  if (currentPeriodStart) {
    subscriptionUpdate.currentPeriodStart = currentPeriodStart;
  }

  if (currentPeriodEnd) {
    subscriptionUpdate.currentPeriodEnd = currentPeriodEnd;
  }

  if (shouldResetUsage) {
    subscriptionUpdate['usage.scansThisMonth'] = 0;
  }

  await Subscription.findByIdAndUpdate(localSubscription._id, subscriptionUpdate);

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;
  if (!customerId) {
    return;
  }

  const userUpdate: Record<string, unknown> = {
    'subscription.status': subscription.status,
    'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
  };

  if (currentPeriodStart) {
    userUpdate['subscription.currentPeriodStart'] = currentPeriodStart;
  }

  if (currentPeriodEnd) {
    userUpdate['subscription.currentPeriodEnd'] = currentPeriodEnd;
  }

  if (shouldResetUsage) {
    userUpdate['subscription.usage.scansThisMonth'] = 0;
  }

  const updatedUser = await User.findOneAndUpdate(
    { stripeCustomerId: customerId },
    userUpdate,
    { new: true },
  );

  const planName = plan?.name || 'Unknown Plan';

  if (wasReactivated && updatedUser?.email) {
    try {
      await sendSubscriptionReinstatementEmail(updatedUser.email, planName);
    } catch (error) {
      console.error('Failed to send reinstatement email:', error);
    }
  }

  if (wasInactive && isNowActive && updatedUser?.email) {
    try {
      const billingCycle = match?.billingCycle
        || (subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'yearly' : 'monthly');
      await sendSubscriptionWelcomeEmail(updatedUser.email, planName, billingCycle, currentPeriodEnd);
    } catch (error) {
      console.error('Failed to send welcome email after activation:', error);
    }
  }

  if (subscription.cancel_at_period_end && updatedUser?.email) {
    try {
      await sendSubscriptionCancellationEmail(updatedUser.email, planName, true, currentPeriodEnd);
    } catch (error) {
      console.error('Failed to send cancellation email:', error);
    }
  }
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscription.id },
    { status: 'canceled', canceledAt: new Date() },
  );

  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  const user = customerId
    ? await User.findOneAndUpdate(
        { stripeCustomerId: customerId },
        { 'subscription.status': 'canceled' },
        { new: true },
      )
    : null;

  const match = getPlanByPriceId(subscription.items.data[0]?.price.id);
  const currentPeriodEnd = getStripePeriodDate((subscription as unknown as { current_period_end?: number }).current_period_end);

  if (user?.email) {
    try {
      await sendSubscriptionCancellationEmail(
        user.email,
        match?.plan.name || 'Unknown Plan',
        Boolean(subscription.cancel_at_period_end),
        currentPeriodEnd,
      );
    } catch (error) {
      console.error('Failed to send deleted-subscription email:', error);
    }
  }
}

export async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) {
    return;
  }

  const stripe = getStripeClient();
  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionUpdated(subscription);
}

export async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) {
    return;
  }

  const stripe = getStripeClient();
  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionUpdated(subscription);
}
