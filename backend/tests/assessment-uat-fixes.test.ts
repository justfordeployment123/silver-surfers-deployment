import assert from 'node:assert/strict';
import test from 'node:test';
import { getQuestionById } from '../src/features/assessments/assessment-questions.ts';
import { validateAssessmentAnswer } from '../src/features/assessments/assessment-answer.validation.ts';
import { classifyAnswer } from '../src/features/assessments/assessment-agent.service.ts';
import { env } from '../src/config/env.ts';

test('primary focus uses clarification-capable text until approved choices exist', () => {
  assert.equal(getQuestionById(5)?.inputType, 'textarea');
});

test('matrix requires every selected function and validates hours and pain', () => {
  const question = getQuestionById(9)!;
  const answers = [{ questionId: 8, text: 'Marketing & content creation, Sales & lead follow-up' }];
  assert.throws(() => validateAssessmentAnswer(question, '4', answers), /function|table/i);
  const rows = [
    { function: 'Marketing & content creation', hoursPerWeek: '8', pain: '4', handledBy: 'Owner' },
    { function: 'Sales & lead follow-up', hoursPerWeek: '3', pain: '2', handledBy: 'Sales team' },
  ];
  assert.doesNotThrow(() => validateAssessmentAnswer(question, JSON.stringify(rows), answers));
  assert.throws(() => validateAssessmentAnswer(question, JSON.stringify(rows.slice(0, 1)), answers), /every|each/i);
  assert.throws(() => validateAssessmentAnswer(question, JSON.stringify(rows.map(row => ({ ...row, pain: '8' }))), answers), /1.*5/i);
  assert.throws(() => validateAssessmentAnswer(question, JSON.stringify(rows.map(row => ({ ...row, hoursPerWeek: '-1' }))), answers), /hours/i);
});

test('structured selection rejects arbitrary letters', () => {
  assert.throws(() => validateAssessmentAnswer(getQuestionById(3)!, 'A', []), /available/i);
  assert.doesNotThrow(() => validateAssessmentAnswer(getQuestionById(3)!, 'Retail & E-Commerce', []));
});

test('invalid Claude credentials produce a retry error rather than accepting the answer', async () => {
  const oldFetch = global.fetch;
  const oldKey = env.anthropicApiKey;
  env.anthropicApiKey = 'test-only';
  global.fetch = async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 });
  try {
    await assert.rejects(classifyAnswer(getQuestionById(2)!, 'I like blue'), /temporarily unavailable/i);
  } finally { global.fetch = oldFetch; env.anthropicApiKey = oldKey; }
});

test('Claude clarification and clear responses are respected', async () => {
  const oldFetch = global.fetch;
  const oldKey = env.anthropicApiKey;
  env.anthropicApiKey = 'test-only';
  global.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ status: 'needs_clarification', clarifyingQuestion: 'What service does your business provide?' }) }] }));
  try {
    const result = await classifyAnswer(getQuestionById(2)!, 'I like blue');
    assert.equal(result.status, 'needs_clarification');
    assert.match(result.clarifyingQuestion!, /service/);
  } finally { global.fetch = oldFetch; env.anthropicApiKey = oldKey; }
});
