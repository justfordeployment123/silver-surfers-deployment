import type { NextFunction, Request, Response } from 'express';

import jwt from 'jsonwebtoken';

import { env } from '../../config/env.ts';
import { getUserModel } from './auth.dependencies.ts';

interface AuthTokenPayload {
  id: string;
  email: string;
  role?: string;
}

export function readBearerToken(request: Request): string | undefined {
  const authorization = request.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  return authorization.slice('Bearer '.length).trim();
}

export function decodeAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

export function authRequired(request: Request, response: Response, next: NextFunction): void {
  try {
    const token = readBearerToken(request);
    if (!token) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = decodeAuthToken(token);
    void (async () => {
      const User = await getUserModel();
      const user = await User.findById(payload.id).lean();

      if (!user) {
        response.status(401).json({ error: 'Invalid token' });
        return;
      }

      if (String(user.accountStatus || 'active').toLowerCase() === 'suspended') {
        response.status(403).json({ error: 'Your account is suspended. Please contact support.' });
        return;
      }

      request.user = {
        id: String(user._id),
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus || 'active',
        verified: user.verified,
      };
      next();
    })().catch(() => {
      response.status(401).json({ error: 'Invalid token' });
    });
  } catch {
    response.status(401).json({ error: 'Invalid token' });
  }
}
