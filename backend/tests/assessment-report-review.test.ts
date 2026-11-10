import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAssessmentAnswer } from '../src/features/assessments/assessment-answer.validation.ts';
import { getQuestionById } from '../src/features/assessments/assessment-questions.ts';
import { buildFallbackSections, requestAnthropicSections } from '../src/features/assessments/assessment-report.ts';

const toolRows = () => getQuestionById(15)!.matrixRows!.map(name => ({function:name,toolsUsed:'No tool currently used'}));
test('no existing tool requires no satisfaction or explanation', () => {
  assert.doesNotThrow(() => validateAssessmentAnswer(getQuestionById(15)!, JSON.stringify(toolRows()), []));
});
test('tool satisfaction is constrained and explanation is conditional', () => {
  const rows = toolRows();
  rows[0] = {...rows[0],toolsUsed:'Excel',satisfied:'Yes'} as any;
  assert.doesNotThrow(() => validateAssessmentAnswer(getQuestionById(15)!, JSON.stringify(rows), []));
  rows[0] = {...rows[0],satisfied:'No'} as any;
  assert.throws(() => validateAssessmentAnswer(getQuestionById(15)!, JSON.stringify(rows), []), /explain/i);
  rows[0] = {...rows[0],satisfied:'Somewhat',notes:'Hard to use'} as any;
  assert.doesNotThrow(() => validateAssessmentAnswer(getQuestionById(15)!, JSON.stringify(rows), []));
});
test('fallback removes review wording and flags conflicting hours before estimating ROI', () => {
  const report = buildFallbackSections([{questionId:1,text:'Bike Shop'},{questionId:7,text:'20'},{questionId:25,text:'100'},{questionId:9,text:JSON.stringify([{hoursPerWeek:'36'}])}]);
  assert.doesNotMatch(report.summary, /staff member|finalized/);
  assert.match(report.hoursReclaimable.explanation, /20.*36/);
  assert.doesNotMatch(report.estimatedFinancialReturn.estimate, /31,200/);
});
test('Claude truncated reports fail rather than being labelled generated', async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({stop_reason:'max_tokens',content:[{type:'text',text:'{}'}]}));
  try { await assert.rejects(requestAnthropicSections([], buildFallbackSections([])), /truncated/i); }
  finally { global.fetch = original; }
});
