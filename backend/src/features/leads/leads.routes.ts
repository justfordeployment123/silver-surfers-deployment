import { Router } from 'express';

import { logger } from '../../config/logger.ts';
import Lead, { type LeadDocument } from '../../models/lead.model.ts';
import { asyncHandler } from '../../shared/http/async-handler.ts';
import { syncLeadToGoHighLevel } from './ghl-sync.service.ts';

const leadsLogger = logger.child('feature:leads');
const router = Router();

interface ValidatedLeadFields {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  requestedResource: string;
  tag: string;
  marketingConsent: boolean;
}

type ValidateLeadPayloadResult =
  | { ok: true; fields: ValidatedLeadFields }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pure validation, kept separate from the Express handler below so it can
 * be unit tested directly (this codebase's route files generally aren't
 * integration-tested against a live server — see tests/leads.routes.test.ts).
 */
export function validateLeadPayload(body: Record<string, unknown>): ValidateLeadPayloadResult {
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const requestedResource = typeof body.requestedResource === 'string' ? body.requestedResource.trim() : '';
  const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
  const marketingConsent = body.marketingConsent === true;

  if (!firstName) return { ok: false, error: 'firstName is required.' };
  if (!lastName) return { ok: false, error: 'lastName is required.' };
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required.' };
  if (!requestedResource) return { ok: false, error: 'requestedResource is required.' };
  if (!tag) return { ok: false, error: 'tag is required.' };

  return { ok: true, fields: { firstName, lastName, email, company, requestedResource, tag, marketingConsent } };
}

router.post('/leads', asyncHandler(async (request, response) => {
  const validation = validateLeadPayload(request.body ?? {});
  if (!validation.ok) {
    leadsLogger.info('Rejected lead submission — invalid fields.', { error: validation.error });
    response.status(400).json({ error: validation.error });
    return;
  }

  const lead = await Lead.create(validation.fields) as unknown as LeadDocument;

  const syncResult = await syncLeadToGoHighLevel(lead);
  lead.ghlSyncStatus = syncResult.status;
  if (syncResult.error) lead.ghlSyncError = syncResult.error;
  await lead.save();

  leadsLogger.info('Lead captured.', {
    id: String(lead._id),
    requestedResource: lead.requestedResource,
    ghlSyncStatus: lead.ghlSyncStatus,
  });

  response.status(201).json({ success: true });
}));

export default router;
