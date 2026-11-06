import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import Assessment from '../../models/assessment.model.ts';
import { extractJsonObject, extractResponseText } from './anthropic-text.ts';
import { getQuestionById } from './assessment-questions.ts';

const assessmentReportLogger = logger.child('feature:assessments:assessment-report');

// Per the source doc's addendum intro: the report must cover hours
// reclaimable, impact/effort prioritization, tool recommendations, and
// estimated financial return.
export interface AssessmentReportSections {
  summary: string;
  hoursReclaimable: { estimate: string; explanation: string };
  impactEffortPrioritization: Array<{ item: string; impact: 'high' | 'medium' | 'low'; effort: 'high' | 'medium' | 'low'; rationale: string }>;
  toolRecommendations: Array<{ tool: string; reason: string }>;
  estimatedFinancialReturn: { estimate: string; explanation: string };
}

interface StructuredAnswer { questionId: number; text: string; }

function answerFor(answers: StructuredAnswer[], questionId: number): string {
  return answers.find((a) => a.questionId === questionId)?.text?.trim() || '';
}

function answerNumber(answers: StructuredAnswer[], questionId: number): number | null {
  const raw = answerFor(answers, questionId).replace(/[^0-9.]/g, '');
  const value = Number(raw);
  return Number.isFinite(value) && raw ? value : null;
}

// Deterministic, computed from the customer's own numbers where available
// (same "fallback is a weaker but still genuinely useful answer, never a
// fake AI response" ethos as ai-reporting.ts's buildFallbackAuditAiReport).
function buildFallbackSections(answers: StructuredAnswer[]): AssessmentReportSections {
  const businessName = answerFor(answers, 1) || 'your business';
  const weeklyRepetitiveHours = answerNumber(answers, 7);
  const hourlyValue = answerNumber(answers, 25);
  const topTasks = answerFor(answers, 10);

  // Conservative, clearly-labeled estimate: assume roughly a third of
  // reported repetitive/manual hours could realistically be reclaimed —
  // not a precise figure, just a directional starting point.
  const reclaimableWeeklyHours = weeklyRepetitiveHours !== null ? Math.round(weeklyRepetitiveHours * 0.3 * 10) / 10 : null;
  const annualReturn = reclaimableWeeklyHours !== null && hourlyValue !== null
    ? Math.round(reclaimableWeeklyHours * hourlyValue * 52)
    : null;

  return {
    summary: `Based on ${businessName}'s responses, there are concrete opportunities to reduce time spent on repetitive work and redirect it toward higher-value activity. This summary uses the numbers you provided directly; a staff member will review it before it's finalized.`,
    hoursReclaimable: {
      estimate: reclaimableWeeklyHours !== null
        ? `Roughly ${reclaimableWeeklyHours} hours per week`
        : 'Not enough information to estimate yet',
      explanation: weeklyRepetitiveHours !== null
        ? `You reported about ${weeklyRepetitiveHours} hours per week going into repetitive, manual, or administrative tasks. As a rough, directional estimate, roughly a third of that is often reclaimable with the right tools and process changes.`
        : 'This estimate normally draws on the hours-per-week figure from the intake — that answer was not available here.',
    },
    impactEffortPrioritization: topTasks
      ? [{
        item: topTasks,
        impact: 'high',
        effort: 'medium',
        rationale: 'You identified this as one of the tasks eating the most time each week, which typically makes it the highest-leverage place to start.',
      }]
      : [],
    toolRecommendations: [{
      tool: 'A general-purpose AI assistant (e.g. for drafting, summarizing, and answering routine questions)',
      reason: 'A safe, low-risk starting point for most of the functions described in your intake, before investing in more specialized tools.',
    }],
    estimatedFinancialReturn: {
      estimate: annualReturn !== null ? `Roughly $${annualReturn.toLocaleString('en-US')} per year` : 'Not enough information to estimate yet',
      explanation: annualReturn !== null
        ? `Using your own estimate of $${hourlyValue}/hour and the reclaimable hours above, this is a rough, directional annual figure, not a guarantee.`
        : 'This estimate normally draws on the hourly-value and hours-per-week figures from the intake — one or both were not available here.',
    },
  };
}

function buildPromptPayload(answers: StructuredAnswer[]): string {
  const withQuestionText = answers.map((answer) => ({
    section: getQuestionById(answer.questionId)?.section,
    question: getQuestionById(answer.questionId)?.prompt,
    answer: answer.text,
  }));
  return JSON.stringify(withQuestionText, null, 2);
}

async function requestAnthropicSections(
  answers: StructuredAnswer[],
  fallback: AssessmentReportSections,
): Promise<AssessmentReportSections> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.anthropicTimeoutMs);

  try {
    const systemPrompt = [
      'You are a senior business consultant writing an AI Readiness Assessment report for a small business, based on their intake answers.',
      'Write for a business owner, not a technologist. Tone: confident, specific, practical.',
      'Ground every section in the actual answers provided — reference their real numbers, tasks, and tools by name. Do NOT use generic boilerplate.',
      'Do NOT invent specific numbers (dollar amounts, hour counts, percentages) that are not directly derivable from the provided answers.',
      'Return ONLY a single valid JSON object with EXACTLY these keys (no extras, no comments):',
      '  - "summary": 2-3 sentences summarizing their overall AI readiness and biggest opportunity.',
      '  - "hoursReclaimable": { "estimate": short string, "explanation": 1-2 sentences grounded in their reported hours }.',
      '  - "impactEffortPrioritization": array of 3-5 objects, each { "item": string, "impact": "high"|"medium"|"low", "effort": "high"|"medium"|"low", "rationale": string }, derived from their reported pain points and priorities.',
      '  - "toolRecommendations": array of 2-4 objects, each { "tool": string, "reason": string }, relevant to the functions and tools they described.',
      '  - "estimatedFinancialReturn": { "estimate": short string, "explanation": 1-2 sentences }, grounded in their reported hourly value and reclaimable time if available.',
    ].join('\n');

    const userPrompt = [
      'Generate the AI Readiness Assessment report from this customer\'s intake answers (JSON, one entry per question):',
      '',
      buildPromptPayload(answers),
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
        max_tokens: 3000,
        temperature: 0.4,
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

    let parsed: Partial<AssessmentReportSections>;
    try {
      parsed = JSON.parse(jsonText) as Partial<AssessmentReportSections>;
    } catch (parseError) {
      throw new Error(`Failed to parse model JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}. Preview: ${jsonText.slice(0, 400)}`);
    }

    return {
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
      hoursReclaimable: parsed.hoursReclaimable?.estimate ? parsed.hoursReclaimable as AssessmentReportSections['hoursReclaimable'] : fallback.hoursReclaimable,
      impactEffortPrioritization: Array.isArray(parsed.impactEffortPrioritization) && parsed.impactEffortPrioritization.length > 0
        ? parsed.impactEffortPrioritization
        : fallback.impactEffortPrioritization,
      toolRecommendations: Array.isArray(parsed.toolRecommendations) && parsed.toolRecommendations.length > 0
        ? parsed.toolRecommendations
        : fallback.toolRecommendations,
      estimatedFinancialReturn: parsed.estimatedFinancialReturn?.estimate ? parsed.estimatedFinancialReturn as AssessmentReportSections['estimatedFinancialReturn'] : fallback.estimatedFinancialReturn,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Milestone 3.1 Developer Plan, Module 12. Callable on demand — triggered
// automatically once at intake_complete (assessment-agent.service.ts), and
// again by the admin "Regenerate" action (Module 13) — same function
// either way, not a one-shot-only generator.
//
// Decided (answers doc #6): draft only. This never sets status beyond
// 'pending_review' — 'report_ready' is only ever set by a human approval
// action in Module 13.
export async function generateAssessmentReport(assessmentId: string): Promise<void> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) {
    assessmentReportLogger.warn('generateAssessmentReport called for a missing assessment.', { assessmentId });
    return;
  }

  const answers = assessment.answers as unknown as StructuredAnswer[];
  const fallback = buildFallbackSections(answers);

  let sections = fallback;
  let status: 'generated' | 'fallback' = 'fallback';
  let provider: 'anthropic' | 'local' = 'local';

  if (env.anthropicApiKey) {
    try {
      sections = await requestAnthropicSections(answers, fallback);
      status = 'generated';
      provider = 'anthropic';
    } catch (error) {
      assessmentReportLogger.warn('Claude assessment report generation failed. Falling back to local summary.', {
        assessmentId,
        model: env.anthropicModel,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  assessment.aiReport = {
    status,
    provider,
    sections,
    generatedAt: new Date(),
  };
  assessment.status = 'pending_review';
  await assessment.save();
}
