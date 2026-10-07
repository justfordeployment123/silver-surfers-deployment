import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { createProductCheckoutSession } from './product-checkout.controller.ts';

const router = Router();

router.post('/billing/create-product-checkout-session', authRequired, asyncHandler(createProductCheckoutSession));

export default router;
