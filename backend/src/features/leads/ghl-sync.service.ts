import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import type { LeadDocument } from '../../models/lead.model.ts';

const ghlSyncLogger = logger.child('feature:leads:ghl-sync');

export interface GhlSyncResult {
  status: 'stubbed' | 'sent' | 'failed';
  error?: string;
}

interface GhlCustomFieldSummary {
  id: string;
  name?: string;
}

function isConfigured(): boolean {
  return Boolean(env.ghlPrivateIntegrationToken && env.ghlLocationId);
}

function ghlHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.ghlPrivateIntegrationToken}`,
    Version: env.ghlApiVersion,
  };
}

// The "Requested Resource" custom field (todo.md Phase F2 / the
// recommendation doc's field table) is something the client creates in
// their own GHL account (Phase F3) — we don't know its field ID ahead of
// time, and guessing one would either silently fail or write to the wrong
// field. Looked up by name on every sync instead of cached: lead-form
// submissions are low-volume (not a hot path), and always resolving fresh
// means a field the client adds mid-launch starts working on the very next
// submission, with no server restart or cache invalidation needed. If
// it's not there yet, the sync still creates the contact and applies the
// tag — the custom field is a nice-to-have, not a hard dependency for
// delivery.
async function resolveRequestedResourceFieldId(): Promise<string | null> {
  try {
    const response = await fetch(
      `${env.ghlApiBaseUrl.replace(/\/$/, '')}/locations/${env.ghlLocationId}/customFields`,
      { method: 'GET', headers: ghlHeaders() },
    );

    if (!response.ok) {
      ghlSyncLogger.warn('Could not fetch GHL custom fields — will sync without the Requested Resource field.', {
        status: response.status,
      });
      return null;
    }

    const payload = (await response.json()) as { customFields?: GhlCustomFieldSummary[] };
    const match = (payload.customFields || []).find(
      (field) => field.name?.trim().toLowerCase() === 'requested resource',
    );

    if (!match) {
      ghlSyncLogger.warn(
        'No "Requested Resource" custom field found in this GHL location yet — syncing contact + tag only.',
      );
    }
    return match?.id || null;
  } catch (error) {
    ghlSyncLogger.warn('Error fetching GHL custom fields — will sync without the Requested Resource field.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Real GoHighLevel sync (todo.md Phase F2), replacing the Phase C stub.
 * Creates/updates the contact by email (GHL's upsert semantics), applies
 * the resource's tag, and best-effort sets the "Requested Resource" custom
 * field if the client has already created it on their end. Authenticated
 * with the Private Integration Token + Location ID the client sent
 * (todo.md Phase F1) — read from env, never hardcoded.
 *
 * Falls back to 'stubbed' (not 'failed') if the credentials simply aren't
 * configured yet, so local/dev environments without GHL access keep
 * working exactly like before this phase.
 */
export async function syncLeadToGoHighLevel(lead: LeadDocument): Promise<GhlSyncResult> {
  if (!isConfigured()) {
    ghlSyncLogger.info('GHL credentials not configured — stubbing sync.', {
      email: lead.email,
      requestedResource: lead.requestedResource,
      tag: lead.tag,
    });
    return { status: 'stubbed' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ghlTimeoutMs);

  try {
    const requestedResourceFieldId = await resolveRequestedResourceFieldId();

    const response = await fetch(`${env.ghlApiBaseUrl.replace(/\/$/, '')}/contacts/upsert`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify({
        locationId: env.ghlLocationId,
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        companyName: lead.company || undefined,
        tags: [lead.tag],
        source: 'SilverSurfers Website - Resource Request',
        ...(requestedResourceFieldId
          ? { customFields: [{ id: requestedResourceFieldId, field_value: lead.requestedResource }] }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`GoHighLevel API error (${response.status}): ${errorBody || response.statusText}`);
    }

    await response.json().catch(() => undefined);

    ghlSyncLogger.info('Synced lead to GoHighLevel.', {
      email: lead.email,
      requestedResource: lead.requestedResource,
      tag: lead.tag,
    });
    return { status: 'sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ghlSyncLogger.error('Failed to sync lead to GoHighLevel.', {
      email: lead.email,
      requestedResource: lead.requestedResource,
      error: message,
    });
    return { status: 'failed', error: message };
  } finally {
    clearTimeout(timeout);
  }
}
