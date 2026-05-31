import type { Express } from 'express';

import adminRouter from './admin/admin.routes.ts';
import auditsRouter from './audits/audits.routes.ts';
import authRouter from './auth/auth.routes.ts';
import stripeRouter from './billing/stripe.routes.ts';
import subscriptionRouter from './billing/subscription.routes.ts';
import teamRouter from './billing/team.routes.ts';
import contactRouter from './contact/contact.routes.ts';
import contentRouter from './content/content.routes.ts';
import healthRouter from './health/health.routes.ts';
import legalRouter from './legal/legal.routes.ts';
import recordsRouter from './records/records.routes.ts';
import reportDownloadRouter from './report-download/report-download.routes.ts';

export async function registerFeatures(app: Express): Promise<void> {
  app.use(healthRouter);
  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);
  app.use('/', auditsRouter);
  app.use('/', stripeRouter);
  app.use('/', subscriptionRouter);
  app.use('/', teamRouter);
  app.use('/', contactRouter);
  app.use('/', contentRouter);
  app.use('/', legalRouter);
  app.use('/', recordsRouter);
  app.use('/', reportDownloadRouter);
}
