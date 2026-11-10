import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssessmentReportReadyEmail } from '../src/features/assessments/assessment-email.service.ts';
test('report email uses the branded navy shell and correct account link', () => {
  const email = buildAssessmentReportReadyEmail(false, 'https://silversurfers.ai');
  assert.match(email.html, /#102447/);
  assert.match(email.html, /View.*report/i);
  assert.match(email.html, /https:\/\/silversurfers.ai\/dashboard/);
  assert.match(email.text, /dashboard/);
});
test('preview notification keeps the isolated preview destination', () => {
  const email = buildAssessmentReportReadyEmail(true);
  assert.match(email.html, /assessment-preview/);
  assert.match(email.subject, /preview/i);
});
