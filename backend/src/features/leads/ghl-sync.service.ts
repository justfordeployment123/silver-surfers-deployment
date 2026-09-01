import { logger } from '../../config/logger.ts';
import type { LeadDocument } from '../../models/lead.model.ts';

const ghlSyncLogger = logger.child('feature:leads:ghl-sync');

export interface GhlSyncResult {
  status: 'stubbed' | 'sent' | 'failed';
  error?: string;
}

/**
 * Phase C stub (todo.md). The real call — create/update the GHL contact,
 * set the "Requested Resource" custom field, apply the resource's tag,
 * authenticated with the client's Private Integration Token + Location ID
 * (see todo.md Phase F1) — lands in Phase F2. This function is the ONLY
 * thing Phase F2 needs to change; leads.routes.ts and the Lead model don't
 * know or care whether the sync is real or stubbed.
 *
 * For now: log what would have been sent, and report 'stubbed' so the
 * caller can record that on the Lead row without treating it as a failure.
 */
export async function syncLeadToGoHighLevel(lead: LeadDocument): Promise<GhlSyncResult> {
  ghlSyncLogger.info('Stubbed GHL sync — would create/update contact and apply tag.', {
    email: lead.email,
    requestedResource: lead.requestedResource,
    tag: lead.tag,
    marketingConsent: lead.marketingConsent,
  });

  return { status: 'stubbed' };
}
