import type { Request, Response } from 'express';

import Subscription from '../../models/subscription.model.ts';
import User from '../../models/user.model.ts';
import {
  sendOneTimePurchaseEmail,
  sendSubscriptionCancellationEmail,
} from './billing-email.service.ts';
import { getStripeClient } from './stripe-client.ts';
import type { BillingCycle } from './subscription-plans.ts';
import { getLimitsForCycle, getPlanById, getPriceIdForCycle, getPublicPlans } from './subscription-plans.ts';

function normalizeBillingCycle(value: unknown): BillingCycle {
  return value === 'monthly' ? 'monthly' : 'yearly';
}

function isMissingStripeSubscriptionError(error: unknown): boolean {
  const stripeError = error as { statusCode?: number; code?: string };
  return stripeError.statusCode === 404 || stripeError.code === 'resource_missing';
}

function resolveFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

function getStripePeriodDate(value: unknown, fallback: Date | null = null): Date | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000) : fallback;
}

function normalizeAdminManagedEmbeddedStatus(
  userRole: string | undefined,
  planId: string | undefined,
  status: string | undefined,
): string | null {
  const normalizedStatus = String(status || '').toLowerCase();
  if (!planId || !normalizedStatus || normalizedStatus === 'none') {
    return null;
  }

  if (userRole === 'admin' && normalizedStatus === 'incomplete') {
    return 'active';
  }

  return normalizedStatus;
}

export async function getSubscription(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await User.findById(userId).populate('subscription');
    if (!user) {
      response.status(404).json({ error: 'User not found.' });
      return;
    }

    let subscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing', 'past_due'] },
    }).sort({ createdAt: -1 });

    let isTeamMember = false;

    if (!subscription && user.subscription?.isTeamMember && user.subscription?.teamOwner) {
      subscription = await Subscription.findOne({
        user: user.subscription.teamOwner,
        status: { $in: ['active', 'trialing'] },
      });

      if (subscription) {
        const isActiveMember = (subscription.teamMembers || []).some((member: { user?: { toString(): string } | string; status?: string }) =>
          member.user && String(member.user) === userId && member.status === 'active');

        if (isActiveMember) {
          isTeamMember = true;
        } else {
          await User.findByIdAndUpdate(userId, {
            'subscription.isTeamMember': false,
            'subscription.teamOwner': null,
          });
          subscription = null;
        }
      }
    }

    const plan = subscription?.planId ? getPlanById(subscription.planId) : null;
    const normalizedEmbeddedStatus = normalizeAdminManagedEmbeddedStatus(
      request.user?.role,
      user.subscription?.planId,
      user.subscription?.status,
    );

    if (!subscription && normalizedEmbeddedStatus && ['active', 'trialing', 'past_due'].includes(normalizedEmbeddedStatus)) {
      response.json({
        user: {
          id: user._id,
          email: user.email,
          stripeCustomerId: user.stripeCustomerId,
          oneTimeScans: user.oneTimeScans || 0,
        },
        subscription: {
          id: user.subscription?.stripeSubscriptionId || null,
          status: normalizedEmbeddedStatus,
          planId: user.subscription?.planId,
          plan: getPlanById(user.subscription?.planId || ''),
          billingCycle: 'yearly',
          currentPeriodStart: user.subscription?.currentPeriodStart,
          currentPeriodEnd: user.subscription?.currentPeriodEnd,
          cancelAtPeriodEnd: Boolean(user.subscription?.cancelAtPeriodEnd),
          usage: user.subscription?.usage,
          limits: undefined,
          isTeamMember: Boolean(user.subscription?.isTeamMember),
        },
        oneTimeScans: user.oneTimeScans || 0,
      });
      return;
    }

    response.json({
      user: {
        id: user._id,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
        oneTimeScans: user.oneTimeScans || 0,
      },
      subscription: subscription ? {
        id: subscription._id,
        status: subscription.status,
        planId: subscription.planId,
        plan,
        billingCycle: subscription.billingCycle || 'yearly',
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        usage: subscription.usage,
        limits: subscription.limits,
        isTeamMember,
      } : null,
      oneTimeScans: user.oneTimeScans || 0,
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    response.status(500).json({ error: 'Failed to get subscription.' });
  }
}

export async function createCheckoutSession(request: Request, response: Response): Promise<void> {
  try {
    const { planId } = request.body ?? {};
    const userId = request.user?.id;
    const billingCycle = normalizeBillingCycle(request.body?.billingCycle);

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!planId) {
      response.status(400).json({ error: 'Plan ID is required.' });
      return;
    }

    const plan = getPlanById(String(planId));
    if (!plan) {
      response.status(400).json({ error: 'Invalid plan ID.' });
      return;
    }

    if (plan.contactSales) {
      response.status(400).json({ error: 'Please contact sales for custom pricing.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      response.status(404).json({ error: 'User not found.' });
      return;
    }

    let customerId = user.stripeCustomerId;
    const stripe = getStripeClient();

    if (!customerId) {
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0]?.id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId },
        });
        customerId = customer.id;
      }

      await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
    }

    const successUrlBase = resolveFrontendUrl();

    if (plan.type === 'one-time') {
      if ((user.oneTimeScans || 0) > 0) {
        response.status(200).json({ url: `${successUrlBase}/checkout` });
        return;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer: customerId,
        line_items: [{
          price_data: {
            currency: plan.currency || 'usd',
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        }],
        metadata: {
          userId,
          planId: plan.id,
          type: 'one-time',
        },
        success_url: `${successUrlBase}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${successUrlBase}/services?canceled=1`,
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      });

      response.json({ url: session.url });
      return;
    }

    const priceId = getPriceIdForCycle(plan, billingCycle);
    if (!priceId) {
      response.status(400).json({ error: 'Price ID not configured for this plan and billing cycle.' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          userId,
          planId: plan.id,
          billingCycle,
        },
      },
      metadata: {
        userId,
        planId: plan.id,
        billingCycle,
      },
      success_url: `${successUrlBase}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successUrlBase}/subscription?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    response.json({ url: session.url });
  } catch (error) {
    console.error('Stripe session error:', error);
    response.status(500).json({ error: 'Failed to create checkout session.' });
  }
}

export async function createPortalSession(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      response.status(404).json({ error: 'User not found.' });
      return;
    }

    if (!user.stripeCustomerId) {
      response.status(400).json({ error: 'No Stripe customer found. Please create a subscription first.' });
      return;
    }

    const stripe = getStripeClient();

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${resolveFrontendUrl()}/subscription`,
      });

      response.json({ url: session.url });
    } catch (error) {
      console.error('Stripe Customer Portal error:', error);
      const portalError = error as { type?: string; message?: string };

      if (portalError.type === 'StripeInvalidRequestError' && portalError.message?.includes('No configuration provided')) {
        response.status(400).json({
          error: 'Customer Portal not configured. Please contact support or use the direct upgrade option.',
          details: 'Stripe Customer Portal needs to be configured in the Stripe dashboard.',
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    console.error('Create portal session error:', error);
    response.status(500).json({ error: 'Failed to create portal session.' });
  }
}

export async function upgradeSubscription(request: Request, response: Response): Promise<void> {
  try {
    const { planId } = request.body ?? {};
    const userId = request.user?.id;
    const billingCycle = normalizeBillingCycle(request.body?.billingCycle);

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!planId) {
      response.status(400).json({ error: 'Plan ID is required.' });
      return;
    }

    const plan = getPlanById(String(planId));
    if (!plan) {
      response.status(400).json({ error: 'Invalid plan ID.' });
      return;
    }

    const currentSubscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] },
    });

    if (!currentSubscription) {
      response.status(404).json({ error: 'No active subscription found.' });
      return;
    }

    const priceId = getPriceIdForCycle(plan, billingCycle);
    if (!priceId) {
      response.status(400).json({ error: 'Price ID not configured for this plan and billing cycle.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user || !user.stripeCustomerId) {
      response.status(404).json({ error: 'User or Stripe customer not found.' });
      return;
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: user.stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          userId,
          planId: plan.id,
          billingCycle,
          isUpgrade: 'true',
          oldSubscriptionId: currentSubscription.stripeSubscriptionId,
        },
      },
      metadata: {
        userId,
        planId: plan.id,
        billingCycle,
        isUpgrade: 'true',
        oldSubscriptionId: currentSubscription.stripeSubscriptionId,
      },
      success_url: `${resolveFrontendUrl()}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${resolveFrontendUrl()}/subscription?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    response.json({
      message: 'Checkout session created for upgrade.',
      url: session.url,
    });
  } catch (error) {
    console.error('Subscription upgrade error:', error);
    response.status(500).json({ error: 'Failed to create upgrade checkout session.' });
  }
}

export async function cancelSubscription(request: Request, response: Response): Promise<void> {
  try {
    const cancelAtPeriodEnd = request.body?.cancelAtPeriodEnd !== false;
    const userId = request.user?.id;
    const userEmail = request.user?.email;

    if (!userId || !userEmail) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const subscription = await Subscription.findOne({
      user: userId,
      status: { $in: ['active', 'trialing'] },
    });

    if (!subscription) {
      response.status(404).json({ error: 'No active subscription found.' });
      return;
    }

    const planName = getPlanById(subscription.planId)?.name || 'Unknown Plan';
    const stripe = getStripeClient();
    if (cancelAtPeriodEnd) {
      try {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } catch (error) {
        if (!isMissingStripeSubscriptionError(error)) {
          throw error;
        }

        // Stripe has no record of this subscription (e.g. deleted directly in Stripe) - treat it as already gone.
        await Subscription.findByIdAndUpdate(subscription._id, {
          status: 'canceled',
          canceledAt: new Date(),
        });

        response.json({ message: 'Subscription was already canceled.' });
        return;
      }

      await Subscription.findByIdAndUpdate(subscription._id, {
        cancelAtPeriodEnd: true,
      });

      try {
        await sendSubscriptionCancellationEmail(
          userEmail,
          planName,
          true,
          subscription.currentPeriodEnd || null,
        );
      } catch (error) {
        console.error('Failed to send cancellation email:', error);
      }

      response.json({ message: 'Subscription will be canceled at the end of the current period.' });
      return;
    }

    try {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (error) {
      if (!isMissingStripeSubscriptionError(error)) {
        throw error;
      }
      // Stripe has no record of this subscription (e.g. deleted directly in Stripe) - treat it as already gone.
    }

    await Subscription.findByIdAndUpdate(subscription._id, {
      status: 'canceled',
      canceledAt: new Date(),
    });

    try {
      await sendSubscriptionCancellationEmail(userEmail, planName, false);
    } catch (error) {
      console.error('Failed to send immediate cancellation email:', error);
    }

    response.json({ message: 'Subscription canceled immediately.' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    response.status(500).json({ error: 'Failed to cancel subscription.' });
  }
}

export async function getPlans(_request: Request, response: Response): Promise<void> {
  try {
    response.json({ plans: getPublicPlans() });
  } catch (error) {
    console.error('Get plans error:', error);
    response.status(500).json({ error: 'Failed to get plans.' });
  }
}

export async function paymentSuccess(request: Request, response: Response): Promise<void> {
  try {
    const sessionId = request.query.session_id;
    const userId = request.user?.id;

    if (!sessionId) {
      response.status(400).json({ error: 'session_id is required' });
      return;
    }

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(String(sessionId));
    if (session.payment_status !== 'paid') {
      response.status(400).json({ error: 'Payment not completed yet.' });
      return;
    }

    const metadataUserId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (!metadataUserId || metadataUserId !== userId) {
      response.status(403).json({ error: 'Unauthorized access to this payment.' });
      return;
    }

    const user = await User.findById(metadataUserId);
    if (!user) {
      response.status(404).json({ error: 'User not found.' });
      return;
    }

    const alreadyProcessed = (user.purchaseHistory || []).some((purchase: { sessionId?: string }) => purchase.sessionId === session.id);

    if (!alreadyProcessed && session.metadata?.type === 'one-time') {
      const planName = getPlanById(planId)?.name || 'One-Time Report';
      user.oneTimeScans = (user.oneTimeScans || 0) + 1;
      user.purchaseHistory = user.purchaseHistory || [];
      user.purchaseHistory.push({
        date: new Date(),
        planId,
        planName,
        amount: session.amount_total || 0,
        sessionId: session.id,
        type: 'one-time',
      });
      await user.save();

      try {
        await sendOneTimePurchaseEmail(user.email, planName);
      } catch (error) {
        console.error('Failed to send confirmation email:', error);
      }
    }

    response.json({
      message: 'Payment successful! Your one-time scan credit has been added.',
      oneTimeScans: user.oneTimeScans || 0,
      purchaseDetails: {
        planId: session.metadata?.planId,
        amount: session.amount_total,
        date: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000),
      },
    });
  } catch (error) {
    console.error('Payment success error:', error);
    response.status(500).json({ error: 'Failed to confirm payment.' });
  }
}

export async function subscriptionSuccess(request: Request, response: Response): Promise<void> {
  try {
    const sessionId = request.query.session_id;
    if (!sessionId) {
      response.status(400).json({ error: 'session_id is required' });
      return;
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(String(sessionId));
    if (session.payment_status !== 'paid') {
      response.status(400).json({ error: 'Payment not completed yet.' });
      return;
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (!subscriptionId) {
      response.status(400).json({ error: 'Subscription not found on checkout session.' });
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    const isUpgrade = session.metadata?.isUpgrade === 'true';
    const oldSubscriptionId = session.metadata?.oldSubscriptionId;

    if (!userId || !planId) {
      response.status(400).json({ error: 'Missing metadata.' });
      return;
    }

    const plan = getPlanById(planId);
    if (!plan) {
      response.status(400).json({ error: 'Invalid plan.' });
      return;
    }

    const billingCycle = normalizeBillingCycle(session.metadata?.billingCycle);

    if (isUpgrade && oldSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(oldSubscriptionId);
        await Subscription.deleteOne({ stripeSubscriptionId: oldSubscriptionId });
      } catch (error) {
        console.error('Failed to cancel old subscription:', error);
      }
    }

    const priceId = subscription.items.data[0]?.price.id;
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        user: userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        status: subscription.status,
        planId,
        priceId,
        billingCycle,
        currentPeriodStart: getStripePeriodDate((subscription as unknown as { current_period_start?: number }).current_period_start, new Date()),
        currentPeriodEnd: getStripePeriodDate((subscription as unknown as { current_period_end?: number }).current_period_end, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        trialStart: getStripePeriodDate((subscription as unknown as { trial_start?: number | null }).trial_start, null),
        trialEnd: getStripePeriodDate((subscription as unknown as { trial_end?: number | null }).trial_end, null),
        limits: getLimitsForCycle(plan, billingCycle),
        usage: {
          scansThisMonth: 0,
          lastResetDate: new Date(),
          totalScans: 0,
        },
      },
      { upsert: true, new: true },
    );

    await User.findByIdAndUpdate(userId, {
      'subscription.status': subscription.status,
      'subscription.planId': planId,
      'subscription.priceId': priceId,
      'subscription.currentPeriodStart': getStripePeriodDate((subscription as unknown as { current_period_start?: number }).current_period_start, new Date()),
      'subscription.currentPeriodEnd': getStripePeriodDate((subscription as unknown as { current_period_end?: number }).current_period_end, new Date()),
    });

    response.json({ message: 'Subscription activated successfully.' });
  } catch (error) {
    console.error('Subscription success error:', error);
    response.status(500).json({ error: 'Failed to activate subscription.' });
  }
}
