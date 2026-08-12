import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import Subscription from '../src/models/subscription.model.ts';
import User from '../src/models/user.model.ts';
import { getPlanById } from '../src/features/billing/subscription-plans.ts';

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    }
  };
}

// Admin-assigned plans are written directly to the database — no Stripe
// subscription is created. Stripe's subscriptions.create requires a payment
// method, which admin-assigned ("comped") accounts don't have, so this path
// intentionally bypasses Stripe entirely (see commit 90a858b).
test('updateUserSubscription replaces a canceled local subscription with a direct DB assignment, without touching Stripe', async (t) => {
  t.after(() => {
    mock.restoreAll();
  });

  const { updateUserSubscription } = await import('../src/features/admin/admin.controller.ts');
  const plan = getPlanById('pro');
  assert.ok(plan, 'pro plan must be configured');

  const currentSubscription = {
    _id: 'local-subscription-id',
    stripeSubscriptionId: 'sub_old_canceled',
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z')
  };

  const user = {
    _id: 'user-123',
    email: 'customer@example.com',
    stripeCustomerId: 'cus_existing_customer'
  };

  const subscriptionUpdates: Array<{ id: string; update: Record<string, unknown> }> = [];
  const userUpdates: Array<{ id: string; update: Record<string, unknown> }> = [];
  let savedSubscription: Record<string, unknown> | null = null;

  mock.method(User, 'findById', async (id: string) => {
    assert.equal(id, 'user-123');
    return user;
  });

  mock.method(User, 'findByIdAndUpdate', async (id: string, update: Record<string, unknown>) => {
    userUpdates.push({ id, update });
    return null;
  });

  mock.method(Subscription, 'findOne', async () => currentSubscription);
  mock.method(Subscription, 'findByIdAndUpdate', async (id: string, update: Record<string, unknown>) => {
    subscriptionUpdates.push({ id, update });
    return null;
  });
  mock.method(Subscription.prototype, 'save', async function (this: Record<string, unknown>) {
    savedSubscription = this;
    return this;
  });

  const req = {
    user: { role: 'admin' },
    body: { userId: 'user-123', planId: 'pro' }
  };
  const res = createMockResponse();

  await updateUserSubscription(req as never, res as never);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.created, true);
  assert.equal(res.payload?.message, `Subscription updated to ${plan!.name} plan successfully.`);
  assert.ok(res.payload?.subscription, 'response must include the new subscription');

  // The old (canceled) local subscription is marked canceled, never touched via Stripe.
  assert.equal(subscriptionUpdates.length, 1);
  assert.equal(subscriptionUpdates[0]?.id, 'local-subscription-id');
  assert.equal(subscriptionUpdates[0]?.update.status, 'canceled');
  assert.equal(subscriptionUpdates[0]?.update.cancelAtPeriodEnd, false);

  // A brand-new subscription is created directly — no Stripe subscription id.
  assert.ok(savedSubscription, 'a new Subscription document must be saved');
  assert.equal(savedSubscription!.status, 'active');
  assert.equal(savedSubscription!.planId, 'pro');
  assert.equal(savedSubscription!.stripeCustomerId, 'cus_existing_customer');
  assert.match(String(savedSubscription!.stripeSubscriptionId), /^admin-/);
  assert.equal(savedSubscription!.priceId, plan!.yearlyPriceId || `admin-price-${plan!.id}`);
  const savedLimits = savedSubscription!.limits as { scansPerMonth: number; maxUsers: number };
  assert.equal(savedLimits.scansPerMonth, plan!.limits.scansPerMonth);
  assert.equal(savedLimits.maxUsers, plan!.limits.maxUsers);

  assert.equal(userUpdates.length, 1);
  assert.equal(userUpdates[0]?.update['subscription.stripeSubscriptionId'], savedSubscription!.stripeSubscriptionId);
  assert.equal(userUpdates[0]?.update['subscription.status'], 'active');
  assert.equal(userUpdates[0]?.update['subscription.planId'], 'pro');
  assert.equal(userUpdates[0]?.update['subscription.priceId'], savedSubscription!.priceId);
});
