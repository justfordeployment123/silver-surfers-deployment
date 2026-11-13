import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { handleGhlPurchase } from './ghl.controller.ts';

// Simple in-memory fixed window per IP. GHL sends one call per product
// bought, so 60 a minute is far above real traffic and only stops abuse.
export function createIpRateLimit(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (request: Request, response: Response, next: NextFunction): void => {
    const key = request.ip || 'unknown';
    const time = now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      if (hits.size > 10_000) hits.clear();
      hits.set(key, { count: 1, resetAt: time + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      response.status(429).json({ error: 'Too many requests.' });
      return;
    }
    next();
  };
}

const router = Router();
router.post('/integrations/ghl/purchase', createIpRateLimit(60, 60_000), asyncHandler(handleGhlPurchase));

export default router;
