import test from 'node:test';
import assert from 'node:assert/strict';

import { validateLeadPayload } from '../src/features/leads/leads.routes.ts';
import { syncLeadToGoHighLevel } from '../src/features/leads/ghl-sync.service.ts';

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
