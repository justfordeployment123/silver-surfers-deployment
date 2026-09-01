import test from 'node:test';
import assert from 'node:assert/strict';

import { validateLeadPayload } from '../src/features/leads/leads.routes.ts';
import { syncLeadToGoHighLevel } from '../src/features/leads/ghl-sync.service.ts';
import { env } from '../src/config/env.ts';

const VALID_PAYLOAD = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  company: 'Acme Co',
  requestedResource: 'accessibility-checklist',
  tag: 'LM - Accessibility Checklist',
  marketingConsent: true,
};

test('validateLeadPayload accepts a fully-filled valid payload', () => {
  const result = validateLeadPayload(VALID_PAYLOAD);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.firstName, 'Jane');
    assert.equal(result.fields.email, 'jane@example.com');
    assert.equal(result.fields.marketingConsent, true);
  }
});

test('validateLeadPayload trims whitespace on every string field', () => {
  const result = validateLeadPayload({ ...VALID_PAYLOAD, firstName: '  Jane  ', company: '  Acme Co  ' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.fields.firstName, 'Jane');
    assert.equal(result.fields.company, 'Acme Co');
  }
});

test('validateLeadPayload does not require a company (optional field)', () => {
  const { company, ...withoutCompany } = VALID_PAYLOAD;
  const result = validateLeadPayload(withoutCompany);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.fields.company, '');
});

test('validateLeadPayload defaults marketingConsent to false when omitted or not literally true', () => {
  const { marketingConsent, ...rest } = VALID_PAYLOAD;
  const result = validateLeadPayload(rest);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.fields.marketingConsent, false);

  const resultTruthyString = validateLeadPayload({ ...VALID_PAYLOAD, marketingConsent: 'yes' });
  assert.equal(resultTruthyString.ok, true);
  if (resultTruthyString.ok) assert.equal(resultTruthyString.fields.marketingConsent, false);
});

test('validateLeadPayload rejects a missing first or last name', () => {
  const { firstName, ...withoutFirst } = VALID_PAYLOAD;
  assert.equal(validateLeadPayload(withoutFirst).ok, false);

  const { lastName, ...withoutLast } = VALID_PAYLOAD;
  assert.equal(validateLeadPayload(withoutLast).ok, false);

  assert.equal(validateLeadPayload({ ...VALID_PAYLOAD, firstName: '   ' }).ok, false);
});

test('validateLeadPayload rejects a missing or malformed email', () => {
  const { email, ...withoutEmail } = VALID_PAYLOAD;
  assert.equal(validateLeadPayload(withoutEmail).ok, false);
  assert.equal(validateLeadPayload({ ...VALID_PAYLOAD, email: 'not-an-email' }).ok, false);
  assert.equal(validateLeadPayload({ ...VALID_PAYLOAD, email: 'missing-domain@' }).ok, false);
});

test('validateLeadPayload rejects a missing requestedResource or tag', () => {
  const { requestedResource, ...withoutResource } = VALID_PAYLOAD;
  assert.equal(validateLeadPayload(withoutResource).ok, false);

  const { tag, ...withoutTag } = VALID_PAYLOAD;
  assert.equal(validateLeadPayload(withoutTag).ok, false);
});

test('validateLeadPayload rejects non-string fields instead of throwing', () => {
  const result = validateLeadPayload({ ...VALID_PAYLOAD, firstName: 12345 });
  assert.equal(result.ok, false);
});

test('syncLeadToGoHighLevel (Phase C stub) always reports stubbed and never throws', async () => {
  const fakeLead = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    company: 'Acme Co',
    requestedResource: 'accessibility-checklist',
    tag: 'LM - Accessibility Checklist',
    marketingConsent: true,
    ghlSyncStatus: 'stubbed' as const,
    save: async () => undefined,
  };

  const result = await syncLeadToGoHighLevel(fakeLead);
  assert.equal(result.status, 'stubbed');
  assert.equal(result.error, undefined);
});

// ── syncLeadToGoHighLevel (Phase F2 real call) ──────────────────────────────
// env.ghlPrivateIntegrationToken/ghlLocationId are undefined by default in
// this test environment (no GHL creds in .env), which is exactly what makes
// the test above exercise the 'stubbed' path. These tests temporarily set
// both so the real-call branch runs, mocking global.fetch the same way
// tests/internal-links-sitemap.test.ts does, and always restore both
// afterwards so later tests keep seeing the unconfigured default.

const FAKE_LEAD = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  company: 'Acme Co',
  requestedResource: 'accessibility-checklist',
  tag: 'LM - Accessibility Checklist',
  marketingConsent: true,
  ghlSyncStatus: 'stubbed' as const,
  save: async () => undefined,
};

function withGhlConfigured<T>(run: () => Promise<T>): Promise<T> {
  const previousToken = env.ghlPrivateIntegrationToken;
  const previousLocationId = env.ghlLocationId;
  env.ghlPrivateIntegrationToken = 'test-token';
  env.ghlLocationId = 'test-location';
  return run().finally(() => {
    env.ghlPrivateIntegrationToken = previousToken;
    env.ghlLocationId = previousLocationId;
  });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response): () => void {
  const original = globalThis.fetch;
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = async (input, init) =>
    handler(String(input), init);
  return () => {
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = original;
  };
}

test('syncLeadToGoHighLevel sends the contact + tag and the resolved custom field id when configured', async () => {
  let upsertBody: Record<string, unknown> | null = null;

  const restore = mockFetch((url, init) => {
    if (url.endsWith('/customFields')) {
      return new Response(JSON.stringify({ customFields: [{ id: 'field-123', name: 'Requested Resource' }] }), { status: 200 });
    }
    if (url.endsWith('/contacts/upsert')) {
      upsertBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ contact: { id: 'contact-1' } }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });

  try {
    const result = await withGhlConfigured(() => syncLeadToGoHighLevel(FAKE_LEAD));
    assert.equal(result.status, 'sent');
    assert.equal(result.error, undefined);
    assert.ok(upsertBody);
    assert.equal((upsertBody as Record<string, unknown>).email, 'jane@example.com');
    assert.deepEqual((upsertBody as Record<string, unknown>).tags, ['LM - Accessibility Checklist']);
    assert.deepEqual((upsertBody as Record<string, unknown>).customFields, [{ id: 'field-123', field_value: 'accessibility-checklist' }]);
  } finally {
    restore();
  }
});

test('syncLeadToGoHighLevel still syncs the contact + tag when the custom field is not found yet', async () => {
  let upsertBody: Record<string, unknown> | null = null;

  const restore = mockFetch((url, init) => {
    if (url.endsWith('/customFields')) {
      return new Response(JSON.stringify({ customFields: [] }), { status: 200 });
    }
    if (url.endsWith('/contacts/upsert')) {
      upsertBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ contact: { id: 'contact-1' } }), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });

  try {
    const result = await withGhlConfigured(() => syncLeadToGoHighLevel(FAKE_LEAD));
    assert.equal(result.status, 'sent');
    assert.ok(upsertBody);
    assert.equal('customFields' in (upsertBody as Record<string, unknown>), false);
  } finally {
    restore();
  }
});

test('syncLeadToGoHighLevel reports failed (not a thrown error) when the GHL API rejects the request', async () => {
  const restore = mockFetch((url) => {
    if (url.endsWith('/customFields')) {
      return new Response(JSON.stringify({ customFields: [] }), { status: 200 });
    }
    return new Response('Invalid Location ID', { status: 401 });
  });

  try {
    const result = await withGhlConfigured(() => syncLeadToGoHighLevel(FAKE_LEAD));
    assert.equal(result.status, 'failed');
    assert.match(result.error || '', /GoHighLevel API error \(401\)/);
  } finally {
    restore();
  }
});
