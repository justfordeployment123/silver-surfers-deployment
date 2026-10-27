import assert from 'node:assert/strict';
import test from 'node:test';

import { canAccessAssessment, canUseAssessmentPreview } from '../src/features/assessments/assessment-preview.access.ts';
import { assessmentForCustomer } from '../src/features/assessments/assessment-customer-view.ts';

test('assessment preview is disabled unless explicitly enabled', () => {
  const priorEnabled = process.env.ASSESSMENT_PREVIEW_ENABLED;
  const priorEmails = process.env.ASSESSMENT_PREVIEW_EMAILS;

  try {
    process.env.ASSESSMENT_PREVIEW_ENABLED = 'false';
    process.env.ASSESSMENT_PREVIEW_EMAILS = 'tester@example.com';
    const user = { id: 'test-user', email: 'tester@example.com', verified: true };

    assert.equal(canUseAssessmentPreview(user), false);
    assert.equal(canAccessAssessment({ source: 'preview' }, user), false);
    assert.equal(canAccessAssessment({ source: 'purchase' }, user), true);
  } finally {
    if (priorEnabled === undefined) delete process.env.ASSESSMENT_PREVIEW_ENABLED;
    else process.env.ASSESSMENT_PREVIEW_ENABLED = priorEnabled;
    if (priorEmails === undefined) delete process.env.ASSESSMENT_PREVIEW_EMAILS;
    else process.env.ASSESSMENT_PREVIEW_EMAILS = priorEmails;
  }
});

test('customer API hides unapproved AI drafts and admin review metadata', () => {
  const draft = { status: 'pending_review', aiReport: { sections: { summary: 'Draft' } }, adminReview: { notes: 'Internal' } };
  assert.deepEqual(assessmentForCustomer(draft), { status: 'pending_review' });
  assert.deepEqual(assessmentForCustomer({ ...draft, status: 'report_ready' }), {
    status: 'report_ready', aiReport: draft.aiReport,
  });
});

test('assessment preview admits only signed-in, allowlisted email accounts', () => {
  const priorEnabled = process.env.ASSESSMENT_PREVIEW_ENABLED;
  const priorEmails = process.env.ASSESSMENT_PREVIEW_EMAILS;

  try {
    process.env.ASSESSMENT_PREVIEW_ENABLED = 'true';
    process.env.ASSESSMENT_PREVIEW_EMAILS = ' person.one@example.com , PERSON.TWO@example.com ';

    assert.equal(canUseAssessmentPreview({ id: 'one', email: 'Person.One@Example.com', verified: true }), true);
    assert.equal(canUseAssessmentPreview({ id: 'two', email: 'person.two@example.com', verified: true }), true);
    assert.equal(canUseAssessmentPreview({ id: 'one', email: 'person.one@example.com', verified: false }), false);
    assert.equal(canUseAssessmentPreview({ id: 'other', email: 'other@example.com', verified: true }), false);
    assert.equal(canUseAssessmentPreview(undefined), false);
  } finally {
    if (priorEnabled === undefined) delete process.env.ASSESSMENT_PREVIEW_ENABLED;
    else process.env.ASSESSMENT_PREVIEW_ENABLED = priorEnabled;
    if (priorEmails === undefined) delete process.env.ASSESSMENT_PREVIEW_EMAILS;
    else process.env.ASSESSMENT_PREVIEW_EMAILS = priorEmails;
  }
});
