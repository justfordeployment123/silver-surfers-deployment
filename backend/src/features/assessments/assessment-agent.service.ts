import type { Request, Response } from 'express';

import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import Assessment from '../../models/assessment.model.ts';
import { extractJsonObject, extractResponseText } from './anthropic-text.ts';
import {
  ASSESSMENT_QUESTIONS,
  getQuestionById,
  getQuestionCount,
  type AssessmentQuestion,
} from './assessment-questions.ts';
import { generateAssessmentReport } from './assessment-report.ts';
import { canAccessAssessment } from './assessment-preview.access.ts';
import { validateAssessmentAnswer } from './assessment-answer.validation.ts';

const assessmentAgentLogger = logger.child('feature:assessments:assessment-agent');

// Milestone 3.1 Developer Plan, Module 10 open question: how many
// clarification rounds before an answer is accepted as-is and flagged for
// admin review. Proposed 2, not yet signed off by the client — revisit once
// confirmed (see Docs/Milestone_3.1_Developer_Plan.md, Module 10).
const CLARIFICATION_CAP = 2;

// Only free-text question types get AI clarification-checking at all —
// asking Claude to judge whether a dropdown selection or a 1-5 scale value
// "needs clarification" doesn't make sense, those are already unambiguous
// by construction. Structured answers always classify as complete.
const CLASSIFIABLE_INPUT_TYPES = new Set(['text', 'textarea']);

interface ClassificationResult {
  status: 'complete' | 'needs_clarification';
  clarifyingQuestion: string | null;
}

export async function classifyAnswer(question: AssessmentQuestion, answerText: string): Promise<ClassificationResult> {
  const fallback: ClassificationResult = { status: 'complete', clarifyingQuestion: null };

  if (!env.anthropicApiKey) {
    throw new Error('The AI assistant is temporarily unavailable. Your answer has not been submitted. Please try again shortly or contact our team.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.anthropicTimeoutMs);

  try {
    const systemPrompt = [
      'You are an intake assistant for SilverSurfers.ai\'s AI Readiness Assessment, a 36-question business intake form.',
      'You are given ONE specific question from that form and the customer\'s answer to it.',
      'Decide whether the answer is complete and responsive to the question, or whether it genuinely needs clarification (e.g. it is off-topic, contradictory, or too vague to be usable in a report).',
      'Do not be overly strict — short, plain answers are normal and acceptable. Only ask for clarification when the answer truly cannot be used as-is.',
      'A direct statement that a function is not performed, no tool is used, no experience exists, or the customer is uncertain is a valid answer where relevant. Do not force customers to invent activities or tools.',
      'If clarification is needed, write ONE follow-up question. It must stay focused on the SAME original question and must NOT introduce a new topic or change what is being asked.',
      'Return ONLY a single valid JSON object with EXACTLY these keys: "status" (either "complete" or "needs_clarification") and "clarifyingQuestion" (a string if status is "needs_clarification", otherwise null).',
    ].join('\n');

    const userPrompt = [
      `Question (section: ${question.section}): ${question.prompt}`,
      '',
      `Customer's answer: ${answerText}`,
    ].join('\n');

    const response = await fetch(`${env.anthropicBaseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.anthropicApiKey || '',
        'anthropic-version': env.anthropicVersion,
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: 300,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Anthropic API error (${response.status}): ${errorBody || response.statusText}`);
    }

    const payload = await response.json();
    const outputText = extractResponseText(payload);
    const jsonText = extractJsonObject(outputText);
    const parsed = JSON.parse(jsonText) as Partial<ClassificationResult>;

    if (parsed.status === 'needs_clarification' && typeof parsed.clarifyingQuestion === 'string' && parsed.clarifyingQuestion.trim()) {
      return { status: 'needs_clarification', clarifyingQuestion: parsed.clarifyingQuestion.trim() };
    }

    if (parsed.status === 'complete') return fallback;
    throw new Error('Invalid AI classification response.');
  } catch (error) {
    assessmentAgentLogger.warn('Answer classification failed; keeping the question open for retry.', {
      questionId: question.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('The AI assistant is temporarily unavailable. Your answer has not been submitted. Please try again shortly or contact our team.');
  } finally {
    clearTimeout(timeout);
  }
}

// Milestone 3.1 Developer Plan, Module 10. Owns the full per-turn contract
// for POST /assessments/:id/respond directly (not split into a thin
// controller wrapper) — the turn logic IS this module's entire purpose.
export async function respondToAssessment(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const id = String(request.params.id || '');
    const answerText = String(request.body?.answerText || '').trim();

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!answerText) {
      response.status(400).json({ error: 'answerText is required.' });
      return;
    }

    const assessment = await Assessment.findOne({ _id: id, userId });
    if (!assessment || !canAccessAssessment(assessment, request.user)) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    if (assessment.status !== 'intake_in_progress') {
      response.status(400).json({ error: 'This assessment is not currently in progress.' });
      return;
    }

    const currentIndex = assessment.answers.length;
    if (currentIndex >= getQuestionCount()) {
      response.status(400).json({ error: 'This assessment has already answered all questions.' });
      return;
    }

    const question = getQuestionById(currentIndex + 1);
    if (!question) {
      response.status(500).json({ error: 'Could not resolve the current question.' });
      return;
    }

    try {
      validateAssessmentAnswer(question, answerText, assessment.answers as any);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
      return;
    }

    let classification: ClassificationResult;
    try {
      classification = CLASSIFIABLE_INPUT_TYPES.has(question.inputType) && assessment.pendingClarificationCount < CLARIFICATION_CAP
        ? await classifyAnswer(question, answerText)
        : { status: assessment.pendingClarificationCount >= CLARIFICATION_CAP ? 'needs_clarification' : 'complete', clarifyingQuestion: null };
    } catch (error) {
      response.status(503).json({ error: (error as Error).message });
      return;
    }
    assessment.transcript.push({ role: 'customer', text: answerText, at: new Date() });

    if (classification.status === 'needs_clarification' && assessment.pendingClarificationCount < CLARIFICATION_CAP) {
      assessment.pendingClarificationCount += 1;
      const clarifyingText = classification.clarifyingQuestion || question.prompt;
      assessment.transcript.push({ role: 'agent', text: clarifyingText, at: new Date() });
      await assessment.save();
      response.json({ assessment, currentQuestion: question, clarifying: true, clarifyingQuestion: clarifyingText });
      return;
    }

    // Accepted — either genuinely complete, or the clarification cap was
    // hit and we stop asking (never block the customer indefinitely).
    const clarified = classification.status === 'complete';
    if (!clarified) {
      assessment.needsAdminAttention = true;
    }
    assessment.answers.push({ questionId: question.id, text: answerText, clarified });
    assessment.pendingClarificationCount = 0;

    const nextIndex = assessment.answers.length;
    if (nextIndex >= getQuestionCount()) {
      assessment.status = 'intake_complete';
      assessment.completedAt = new Date();
      assessment.transcript.push({
        role: 'agent',
        text: "Thank you, that completes the assessment. Our team will review your answers and prepare your report.",
        at: new Date(),
      });
      await assessment.save();

      try {
        await generateAssessmentReport(String(assessment._id));
      } catch (error) {
        assessmentAgentLogger.warn('Automatic report generation failed after intake completion.', {
          assessmentId: String(assessment._id),
          error: error instanceof Error ? error.message : String(error),
        });
      }

      response.json({ assessment, currentQuestion: null, done: true });
      return;
    }

    const nextQuestion = getQuestionById(nextIndex + 1);
    assessment.transcript.push({ role: 'agent', text: nextQuestion?.prompt || '', at: new Date() });
    await assessment.save();

    response.json({ assessment, currentQuestion: nextQuestion });
  } catch (error) {
    console.error('respondToAssessment error:', error);
    response.status(500).json({ error: 'Failed to process your answer.' });
  }
}

// Exported for assessment.controller.ts's getAssessment/startAssessment so
// both expose the same "what question is active right now" shape the chat
// UI needs, derived the same way in every response.
export function getCurrentQuestionForAssessment(assessment: {
  status: string;
  answers: Array<{ questionId: number }>;
}): AssessmentQuestion | null {
  if (assessment.status === 'intake_complete' || assessment.answers.length >= ASSESSMENT_QUESTIONS.length) {
    return null;
  }
  return getQuestionById(assessment.answers.length + 1);
}
