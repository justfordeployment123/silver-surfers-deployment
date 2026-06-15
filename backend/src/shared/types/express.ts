import 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        role?: string;
        accountStatus?: 'active' | 'suspended';
        verified?: boolean;
      };
      subscription?: any;
      hasOneTimeScans?: boolean;
    }
  }
}
