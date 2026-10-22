import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductCheckoutSession } from '../src/features/billing/product-checkout.controller.ts';

test('native checkout rejects legacy ebook product keys before database or Stripe access', async () => {
  let statusCode = 200;
  let payload: unknown;

  const request = {
    body: { productKey: 'ebook:the-longevity-gap' },
    user: { id: 'customer-id' },
  } as any;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  } as any;

  await createProductCheckoutSession(request, response);

  assert.equal(statusCode, 400);
  assert.deepEqual(payload, {
    error: 'Book purchases are completed through the external book store.',
  });
});
