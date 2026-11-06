import type { Request, Response } from 'express';

import Assessment from '../../models/assessment.model.ts';
import { getCurrentQuestionForAssessment } from './assessment-agent.service.ts';
import { canAccessAssessment } from './assessment-preview.access.ts';
import { assessmentForCustomer } from './assessment-customer-view.ts';
import { getQuestionById } from './assessment-questions.ts';

export async function getAssessment(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const id = String(request.params.id || '');

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const assessment = await Assessment.findOne({ _id: id, userId }).lean();
    if (!assessment || !canAccessAssessment(assessment, request.user)) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    response.json({ assessment: assessmentForCustomer(assessment), currentQuestion: getCurrentQuestionForAssessment(assessment) });
  } catch (error) {
    console.error('getAssessment error:', error);
    response.status(500).json({ error: 'Failed to load assessment.' });
  }
}

// Milestone 3.1 Developer Plan, Module 8. Client answers 2026-10-07, #5:
// immediate self-serve start is confirmed workable — no literal
// date/time-picker scheduling step. "Start" is the dashboard's
// "Schedule Assessment" / "Continue Assessment" button calling this
// endpoint the moment the customer opens the chat, not a separate booking
// flow. Idempotent on purpose: calling it again once already in progress
// (or beyond) is a no-op, which is what lets "Continue Assessment" reuse
// the exact same call instead of needing a separate resume endpoint.
//
// The client reconfirmed immediate start on 2026-10-15. No booking step or
// 30-day expiry is part of the approved flow.
export async function startAssessment(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const id = String(request.params.id || '');

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const assessment = await Assessment.findOne({ _id: id, userId });
    if (!assessment || !canAccessAssessment(assessment, request.user)) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    if (assessment.status === 'purchased') {
      assessment.status = 'intake_in_progress';
      assessment.startedAt = new Date();
      // Module 10's chat opens with the agent's first question already in
      // the transcript, same as every subsequent turn — the frontend never
      // has to special-case "nothing said yet".
      const firstQuestion = getQuestionById(1);
      if (firstQuestion) {
        assessment.transcript.push({ role: 'agent', text: firstQuestion.prompt, at: new Date() });
      }
      await assessment.save();
    }

    response.json({ assessment: assessmentForCustomer(assessment.toObject()), currentQuestion: getCurrentQuestionForAssessment(assessment) });
  } catch (error) {
    console.error('startAssessment error:', error);
    response.status(500).json({ error: 'Failed to start assessment.' });
  }
}

// Move the intake pointer back by one accepted answer so the customer can
// replace it. The next /respond call writes the replacement as the current
// answer, so an edit never creates a duplicate question entry.
export async function goBackOneAssessmentAnswer(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const id = String(request.params.id || '');

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const assessment = await Assessment.findOne({ _id: id, userId });
    if (!assessment || !canAccessAssessment(assessment, request.user)) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    if (assessment.status !== 'intake_in_progress') {
      response.status(400).json({ error: 'Answers can only be changed while the assessment is in progress.' });
      return;
    }

    const answer = assessment.answers.at(-1);
    if (!answer) {
      response.status(400).json({ error: 'There is no previous answer to change.' });
      return;
    }

    const question = getQuestionById(answer.questionId);
    if (!question) {
      response.status(400).json({ error: 'The previous question could not be found.' });
      return;
    }

    assessment.answers.pop();
    assessment.pendingClarificationCount = 0;

    // Remove the previous question, its answer, any clarification turns, and
    // the following question from the visible conversation. Then ask the
    // previous question again so the replacement flow is clear.
    const transcriptStart = assessment.transcript.findLastIndex(
      (entry) => entry.role === 'agent' && entry.text === question.prompt,
    );
    if (transcriptStart >= 0) {
      assessment.transcript.splice(transcriptStart);
    }
    assessment.transcript.push({ role: 'agent', text: question.prompt, at: new Date() });

    await assessment.save();
    response.json({
      assessment: assessmentForCustomer(assessment.toObject()),
      currentQuestion: question,
      editingPreviousAnswer: true,
    });
  } catch (error) {
    console.error('goBackOneAssessmentAnswer error:', error);
    response.status(500).json({ error: 'Failed to return to the previous answer.' });
  }
}
