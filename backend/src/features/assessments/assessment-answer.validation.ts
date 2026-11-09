import { getQuestionById, type AssessmentQuestion } from './assessment-questions.ts';

export function validateAssessmentAnswer(question: AssessmentQuestion, text: string, answers: Array<{questionId: number; text: string}>): void {
  if (question.inputType === 'select' && question.options?.length) {
    if (!question.options.some(option => text === option.label || text === option.value || (option.value === 'other' && /^Other: .+/.test(text)))) {
      throw new Error('Please choose one of the available options.');
    }
  }
  if (question.inputType === 'number' && (!Number.isFinite(Number(text)) || Number(text) < 0)) throw new Error('Enter a valid number of zero or more.');
  if (question.inputType === 'scale' && !/^[1-5]$/.test(text)) throw new Error('Choose a rating from 1 to 5.');
  if (question.inputType !== 'matrix') return;
  let rows: any;
  try { rows = JSON.parse(text); } catch { throw new Error('Please complete the table for each function.'); }
  const source = question.matrixRowsFromQuestionId;
  const previous = answers.find(answer => answer.questionId === source)?.text || '';
  const expected = source
    ? (getQuestionById(source)?.options || []).filter(option => previous.split(', ').includes(option.label)).map(option => option.label)
    : question.matrixRows || [];
  if (!Array.isArray(rows) || !rows.length || rows.length !== expected.length || expected.some(label => rows.filter((row: any) => row.function === label).length !== 1)) {
    throw new Error('Please complete a table row for every selected function.');
  }
  for (const row of rows) {
    for (const column of question.matrixColumns || []) {
      const value = String(row[column.key] ?? '').trim();
      if (!value) throw new Error(`Complete ${column.label} for each function.`);
      if (column.key === 'hoursPerWeek' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 168)) throw new Error('Weekly hours must be between 0 and 168.');
      if (column.key === 'pain' && !/^[1-5]$/.test(value)) throw new Error('Pain must be a rating from 1 to 5.');
    }
  }
}
