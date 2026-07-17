import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import Subscription from '../src/models/subscription.model.ts';
import User from '../src/models/user.model.ts';
import { getStripeClient } from '../src/features/billing/stripe-client.ts';

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

test('createPortalSession refreshes stale local subscriptions instead of opening Stripe portal', async (t) => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;

  t.after(() => {
    mock.restoreAll();

    if (originalSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalSecretKey;
    }
  });

  process.env.STRIPE_SECRET_KEY = 'sk_test_portal_stale_subscription';
  const { createPortalSession } = await import('../src/features/billing/subscription.controller.ts');

  const user = {
    _id: 'user-123',
    email: 'customer@example.com',
    stripeCustomerId: 'cus_existing',
    subscription: { status: 'active', stripeSubscriptionId: 'sub_missing' },
  };
  const localSubscription = {
    _id: 'local-subscription-id',
    stripeSubscriptionId: 'sub_missing',
  };
  const subscriptionUpdates: Array<{ id: string; update: Record<string, unknown> }> = [];
  const userUpdates: Array<{ id: string; update: Record<string, unknown> }> = [];

  mock.method(User, 'findById', async () => user);
  mock.method(User, 'findByIdAndUpdate', async (id: string, update: Record<string, unknown>) => {
    userUpdates.push({ id, update });
    return null;
  });
  mock.method(Subscription, 'findOne', () => ({
    sort: async () => localSubscription,
  }));
  mock.method(Subscription, 'findByIdAndUpdate', async (id: string, update: Record<string, unknown>) => {
    subscriptionUpdates.push({ id, update });
    return null;
  });

  const stripe = getStripeClient();
  mock.method(stripe.subscriptions, 'retrieve', async () => {
    throw { statusCode: 404, code: 'resource_missing' };
  });
  mock.method(stripe.billingPortal.sessions, 'create', async () => {
    throw new Error('portal should not open for a missing Stripe subscription');
  });

  const req = { user: { id: 'user-123' } };
  const res = createMockResponse();

  await createPortalSession(req as never, res as never);

  assert.equal(res.statusCode, 409);
  assert.match((res.payload as { error: string }).error, /no longer exists in Stripe/i);
  assert.equal(subscriptionUpdates.length, 1);
  assert.equal(subscriptionUpdates[0]?.id, 'local-subscription-id');
  assert.equal(subscriptionUpdates[0]?.update.status, 'canceled');
  assert.equal(userUpdates.length, 1);
  assert.equal(userUpdates[0]?.update['subscription.status'], 'canceled');
});

test('createPortalSession uses the Stripe subscription customer when local customer id is stale', async (t) => {
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;

  t.after(() => {
    mock.restoreAll();

    if (originalSecretKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalSecretKey;
    }
  });

  process.env.STRIPE_SECRET_KEY = 'sk_test_portal_customer_refresh';
  const { createPortalSession } = await import('../src/features/billing/subscription.controller.ts');

  const user = {
    _id: 'user-123',
    email: 'customer@example.com',
    stripeCustomerId: 'cus_old',
    subscription: { status: 'active', stripeSubscriptionId: 'sub_active' },
  };
  const localSubscription = {
    _id: 'local-subscription-id',
    stripeSubscriptionId: 'sub_active',
  };
  const userUpdates: Array<{ id: string; update: Record<string, unknown> }> = [];

  mock.method(User, 'findById', async () => user);
  mock.method(User, 'findByIdAndUpdate', async (id: string, update: Record<string, unknown>) => {
    userUpdates.push({ id, update });
    return null;
  });
  mock.method(Subscription, 'findOne', () => ({
    sort: async () => localSubscription,
  }));

  const stripe = getStripeClient();
  mock.method(stripe.subscriptions, 'retrieve', async () => ({
    id: 'sub_active',
    status: 'active',
    customer: 'cus_right',
    cancel_at_period_end: false,
  }));

  let portalCustomer: unknown = null;
  mock.method(stripe.billingPortal.sessions, 'create', async (payload: Record<string, unknown>) => {
    portalCustomer = payload.customer;
    return { url: 'https://billing.stripe.test/session' };
  });

  const req = { user: { id: 'user-123' } };
  const res = createMockResponse();

  await createPortalSession(req as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { url: 'https://billing.stripe.test/session' });
  assert.equal(portalCustomer, 'cus_right');
  assert.equal(userUpdates[0]?.update.stripeCustomerId, 'cus_right');
});
