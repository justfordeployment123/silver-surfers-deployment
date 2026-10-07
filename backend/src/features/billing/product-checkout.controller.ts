import type { Request, Response } from 'express';

import Ebook from '../../models/ebook.model.ts';
import User from '../../models/user.model.ts';
import { getProductByKey } from './product-catalog.ts';
import { getStripeClient } from './stripe-client.ts';

function resolveFrontendUrl(): string {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

// 'ebook:<slug>' productKeys resolve against the Ebook collection directly
// rather than the static PRODUCT_CATALOG (see product-catalog.ts's comment)
// — this is the one place that lookup happens, so both the checkout
// controller and the webhook handler can share it.
async function resolveEbookProduct(productKey: string): Promise<{
  productKey: string;
  productType: 'ebook';
  name: string;
  stripePriceId?: string;
  ebookId: string;
} | null> {
  if (!productKey.startsWith('ebook:')) {
    return null;
  }

  const slug = productKey.slice('ebook:'.length);
  const ebook = await Ebook.findOne({ slug, active: true }).lean();
  if (!ebook) {
    return null;
  }

  return {
    productKey,
    productType: 'ebook',
    name: ebook.title,
    stripePriceId: ebook.stripePriceId,
    ebookId: String(ebook._id),
  };
}

// Mirrors subscription.controller.ts's createCheckoutSession exactly in
// shape (same early-return-guard style, same console.error-then-500
// pattern) — see Architecture Decision 2.2. Generalized checkout for the
// three 3.1 product types, dispatched by productType via Stripe session
// metadata rather than a plan id.
export async function createProductCheckoutSession(request: Request, response: Response): Promise<void> {
  try {
    const { productKey } = request.body ?? {};
    const userId = request.user?.id;

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!productKey || typeof productKey !== 'string') {
      response.status(400).json({ error: 'productKey is required.' });
      return;
    }

    const catalogEntry = getProductByKey(productKey);
    const ebookEntry = catalogEntry ? null : await resolveEbookProduct(productKey);
    const product = catalogEntry || ebookEntry;

    if (!product) {
      response.status(400).json({ error: 'Unknown productKey.' });
      return;
    }

    if (!product.stripePriceId) {
      response.status(500).json({ error: 'This product has no Stripe price configured yet.' });
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
      const existingCustomers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0]?.id;
      } else {
        const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
        customerId = customer.id;
      }
      await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
    }

    const successUrlBase = resolveFrontendUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{ price: product.stripePriceId, quantity: 1 }],
      metadata: {
        userId,
        productKey: product.productKey,
        productType: product.productType,
      },
      success_url: `${successUrlBase}/dashboard?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${successUrlBase}/explore?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    response.json({ url: session.url });
  } catch (error) {
    console.error('Product checkout session error:', error);
    response.status(500).json({ error: 'Failed to create checkout session.' });
  }
}
