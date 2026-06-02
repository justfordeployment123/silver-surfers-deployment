import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import type { AuditScorecard } from './audit-scorecard.ts';
import type { AnalysisRemediationItem } from './analysis-details.ts';

const aiReportingLogger = logger.child('feature:audits:ai-reporting');
const MAX_AI_FINDING_GUIDANCE = 20;

export type AuditAiReportStatus = 'generated' | 'fallback';
export type AuditAiReportProvider = 'openai' | 'local';

export interface AuditAiReport {
  status: AuditAiReportStatus;
  provider: AuditAiReportProvider;
  model?: string;
  generatedAt: string;
  headline: string;
  summary: string;
  businessImpact: string;
  prioritySummary: string;
  topRecommendations: string[];
  perFindingGuidance: AuditAiFindingGuidance[];
  stakeholderNote: string;
}

export interface AuditAiFindingGuidance {
  auditId: string;
  title: string;
  explanation: string;
  remediation: string;
  wcagCriteria?: string[];
}

export interface GenerateAuditAiReportOptions {
  url: string;
  fullName?: string;
  scorecard: AuditScorecard;
  remediationRoadmap: AnalysisRemediationItem[];
  isLiteVersion?: boolean;
}

interface OpenAiAuditReportPayload {
  headline?: string;
  summary?: string;
  businessImpact?: string;
  prioritySummary?: string;
  topRecommendations?: unknown;
  perFindingGuidance?: unknown;
  stakeholderNote?: string;
}

function describeSiteContext(options: GenerateAuditAiReportOptions): string {
  const { scorecard } = options;
  const weakest = [...(scorecard.dimensions || [])].sort((a, b) => a.score - b.score)[0];
  const strongest = [...(scorecard.dimensions || [])].sort((a, b) => b.score - a.score)[0];
  const issueTitles = (scorecard.topIssues || []).slice(0, 3).map((i) => i.title).filter(Boolean);

  return [
    `Site: ${options.url}`,
    `Overall score: ${Math.round(Number(scorecard.overallScore || 0))}% (risk tier: ${String(scorecard.riskTier || 'unknown')})`,
    weakest ? `Weakest area: ${weakest.label} at ${Math.round(weakest.score)}%` : '',
    strongest ? `Strongest area: ${strongest.label} at ${Math.round(strongest.score)}%` : '',
    issueTitles.length > 0 ? `Top issues: ${issueTitles.join('; ')}` : '',
  ].filter(Boolean).join('. ');
}

function toPercent(value: number | null | undefined): string {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? `${Math.round(normalized)}%` : 'N/A';
}

function capitalize(value: string | undefined): string {
  if (!value) {
    return 'Unknown';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function limitRecommendationList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function limitFindingGuidanceList(values: unknown, fallback: AuditAiFindingGuidance[]): AuditAiFindingGuidance[] {
  if (!Array.isArray(values)) {
    return fallback;
  }

  const normalized = values
    .map((value) => {
      const item = value as Partial<AuditAiFindingGuidance> | undefined;
      const auditId = String(item?.auditId || '').trim();
      const title = String(item?.title || '').trim();
      const explanation = String(item?.explanation || '').trim();
      const remediation = String(item?.remediation || '').trim();
      const wcagCriteria = Array.isArray(item?.wcagCriteria)
        ? item.wcagCriteria.map((criterion) => String(criterion || '').trim()).filter(Boolean)
        : [];

      if (!auditId || !title || !explanation || !remediation) {
        return null;
      }

      return {
        auditId,
        title,
        explanation,
        remediation,
        ...(wcagCriteria.length ? { wcagCriteria } : {}),
      };
    })
    .filter((item): item is AuditAiFindingGuidance => Boolean(item))
    .slice(0, MAX_AI_FINDING_GUIDANCE);

  return normalized.length > 0 ? normalized : fallback;
}

function sanitizeSentence(value: unknown, fallback: string): string {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function getPrimaryConcern(scorecard: AuditScorecard): string {
  const weakestDimension = [...(scorecard.dimensions || [])]
    .sort((left, right) => left.score - right.score)[0];

  if (!weakestDimension) {
    return 'overall usability';
  }

  return weakestDimension.label.toLowerCase();
}

function buildPrioritySummaryText(remediationRoadmap: AnalysisRemediationItem[]): string {
  const quickWins = remediationRoadmap.filter((item) => item.bucketKey === 'quick-wins').length;
  const mediumEffort = remediationRoadmap.filter((item) => item.bucketKey === 'medium-effort').length;
  const highEffort = remediationRoadmap.filter((item) => item.bucketKey === 'high-effort').length;

  return `Roadmap balance: ${quickWins} Quick Wins, ${mediumEffort} Medium Effort items, and ${highEffort} High Effort items. Start with lower-effort fixes that remove immediate friction, then schedule the heavier engineering and design work in a planned remediation phase.`;
}

export function buildFallbackAuditAiReport(options: GenerateAuditAiReportOptions): AuditAiReport {
  const { scorecard, remediationRoadmap, isLiteVersion } = options;
  const primaryConcern = getPrimaryConcern(scorecard);
  const topIssueTitles = (scorecard.topIssues || []).slice(0, 2).map((issue) => issue.title);
  const headline = scorecard.overallScore >= 80
    ? 'Strong foundation with focused improvements remaining'
    : scorecard.overallScore >= 70
      ? 'Usable foundation with meaningful remediation priorities'
      : 'High-friction experience for older adults that needs planned remediation';

  const summary = [
    `This ${isLiteVersion ? 'quick scan' : 'audit'} scored ${toPercent(scorecard.overallScore)} and is currently classified as ${capitalize(scorecard.riskTier)} risk.`,
    `The most significant pressure point is ${primaryConcern}, with ${scorecard.pageCount} page${scorecard.pageCount === 1 ? '' : 's'} included in the current scorecard.`,
    topIssueTitles.length > 0
      ? `The top issues currently affecting the experience are ${topIssueTitles.join(' and ')}.`
      : 'The current scorecard does not yet include enough issue detail to name specific findings.',
  ].join(' ');

  const businessImpact = scorecard.overallScore >= 80
    ? 'The site already presents a relatively strong experience for older adults, but tightening weaker journeys should improve trust, task completion, and consistency across devices.'
    : scorecard.overallScore >= 70
      ? 'The site has a workable base, but current friction points are likely increasing hesitation, mis-clicks, reading effort, and drop-off in important journeys for older adults.'
      : 'The current experience is likely creating meaningful barriers for older adults in reading, navigation, and task completion, which can reduce trust and conversion in high-value journeys.';

  const topRecommendations = remediationRoadmap.length > 0
    ? remediationRoadmap.slice(0, 4).map((item) => item.action)
    : [
      'Review the weakest score category first and remove the most obvious barriers to reading, navigation, and interaction.',
      'Prioritize issues that affect core tasks before expanding into longer-term refinements.',
      'Retest after remediation to confirm that score improvements translate into a clearer user experience for older adults.',
    ];
  const perFindingGuidance = remediationRoadmap.slice(0, MAX_AI_FINDING_GUIDANCE).map((item) => ({
    auditId: item.auditId,
    title: item.title,
    explanation: item.whyItMatters,
    remediation: item.action,
    ...(item.wcagCriteria?.length ? { wcagCriteria: item.wcagCriteria } : {}),
  }));

  return {
    status: 'fallback',
    provider: 'local',
    generatedAt: new Date().toISOString(),
    headline,
    summary,
    businessImpact,
    prioritySummary: buildPrioritySummaryText(remediationRoadmap),
    topRecommendations,
    perFindingGuidance,
    stakeholderNote: 'This summary is intended to support prioritization and reporting. It does not by itself certify compliance, legal coverage, or accessibility conformance.',
  };
}

function buildPromptPayload(options: GenerateAuditAiReportOptions): string {
  const compactPayload = {
    url: options.url,
    audience: 'Older adults, especially 50+ users',
    isLiteVersion: Boolean(options.isLiteVersion),
    scorecard: {
      overallScore: options.scorecard.overallScore,
      riskTier: options.scorecard.riskTier,
      scoreStatus: options.scorecard.scoreStatus,
      pageCount: options.scorecard.pageCount,
      dimensions: (options.scorecard.dimensions || []).map((dimension) => ({
        label: dimension.label,
        score: dimension.score,
        issueCount: dimension.issueCount,
      })),
      evaluationDimensions: (options.scorecard.evaluationDimensions || []).map((dimension) => ({
        label: dimension.label,
        score: dimension.score,
        issueCount: dimension.issueCount,
      })),
      topIssues: (options.scorecard.topIssues || []).slice(0, 5).map((issue) => ({
        title: issue.title,
        score: issue.score,
        severity: issue.severity,
        auditSourceLabel: issue.auditSourceLabel,
        wcagCriteria: issue.wcagCriteria || [],
        wcagReferences: (issue.wcagReferences || []).map((reference) => ({
          criterion: reference.criterion,
          title: reference.title,
          level: reference.level,
          version: reference.version,
          principle: reference.principle,
        })),
      })),
      wcagSummary: options.scorecard.wcagSummary,
    },
    roadmap: options.remediationRoadmap.slice(0, MAX_AI_FINDING_GUIDANCE).map((item) => ({
      auditId: item.auditId,
      title: item.title,
      bucket: item.bucketLabel,
      impact: item.impact,
      effort: item.effort,
      dimension: item.dimensionLabel,
      evaluationDimension: item.evaluationDimensionLabel,
      wcagCriteria: item.wcagCriteria || [],
      action: item.action,
      whyItMatters: item.whyItMatters,
    })),
  };

  return JSON.stringify(compactPayload, null, 2);
}

function extractResponseText(payload: any): string {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part?.text === 'string' && part.text.trim()) {
          return part.text;
        }
      }
    }
  }
  return '';
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return '';
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeOpenAiReport(
  payload: OpenAiAuditReportPayload,
  fallback: AuditAiReport,
): AuditAiReport {
  const topRecommendations = limitRecommendationList(payload.topRecommendations);
  const perFindingGuidance = limitFindingGuidanceList(payload.perFindingGuidance, fallback.perFindingGuidance);

  return {
    status: 'generated',
    provider: 'openai',
    model: env.openAiModel,
    generatedAt: new Date().toISOString(),
    headline: sanitizeSentence(payload.headline, fallback.headline),
    summary: sanitizeSentence(payload.summary, fallback.summary),
    businessImpact: sanitizeSentence(payload.businessImpact, fallback.businessImpact),
    prioritySummary: sanitizeSentence(payload.prioritySummary, fallback.prioritySummary),
    topRecommendations: topRecommendations.length > 0 ? topRecommendations : fallback.topRecommendations,
    perFindingGuidance,
    stakeholderNote: sanitizeSentence(payload.stakeholderNote, fallback.stakeholderNote),
  };
}

async function requestOpenAiAuditReport(options: GenerateAuditAiReportOptions, fallback: AuditAiReport): Promise<AuditAiReport> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.openAiTimeoutMs);

  try {
    const systemPrompt = [
      'You are a senior accessibility analyst writing executive-level audit reports for the SilverSurfers platform, which evaluates websites for older-adult usability (50+ users).',
      'Write for a business stakeholder, not a developer. Tone: confident, specific, plainspoken.',
      'Ground every section in the actual scan data the user provides — reference the site URL, score, weakest dimensions, and named top issues. Do NOT use generic boilerplate.',
      'Do NOT claim certification, guaranteed compliance, or legal conformance.',
      '',
      'Return ONLY a single valid JSON object with EXACTLY these keys (no extras, no comments):',
      '  - "headline": one bold, specific sentence (max 14 words) capturing the overall state of THIS site.',
      '  - "summary": 3-4 full sentences. Reference the scored % and the strongest/weakest dimensions by name. Describe the experience an older adult would have on this site.',
      '  - "businessImpact": 3-4 full sentences. Connect the issues to concrete business outcomes — trust, task completion, conversion, brand perception, support load. Be specific to this site.',
      '  - "prioritySummary": 3-4 full sentences explaining HOW to sequence remediation (quick wins first, then medium, then heavy). Reference the roadmap balance.',
      '  - "topRecommendations": array of 4 to 6 strings. Each item is ONE complete actionable sentence (12-25 words) starting with a verb. Tie each recommendation to a real issue from the scan.',
      `  - "perFindingGuidance": array of up to ${MAX_AI_FINDING_GUIDANCE} objects, one for each roadmap item. Each object must include "auditId", "title", "explanation", "remediation", and optional "wcagCriteria". Keep explanation/remediation plain-language and specific to that finding.`,
      '  - "stakeholderNote": 2-3 sentences for sharing with non-technical stakeholders, including a clear next step.',
    ].join('\n');

    const userPrompt = [
      'Generate the executive AI report for this audit.',
      '',
      'Site context (use this directly in the writing):',
      describeSiteContext(options),
      '',
      'Full scan data (JSON):',
      buildPromptPayload(options),
    ].join('\n');

    const response = await fetch(`${env.openAiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openAiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`OpenAI API error (${response.status}): ${errorBody || response.statusText}`);
    }

    const payload = await response.json();
    const outputText = extractResponseText(payload);
    const jsonText = extractJsonObject(outputText);
    const finishReason = payload?.choices?.[0]?.finish_reason;

    let parsed: OpenAiAuditReportPayload;
    try {
      parsed = JSON.parse(jsonText) as OpenAiAuditReportPayload;
    } catch (parseError) {
      throw new Error(
        `Failed to parse model JSON (finish_reason=${finishReason}): ${parseError instanceof Error ? parseError.message : String(parseError)}. Preview: ${jsonText.slice(0, 400)}`,
      );
    }

    return normalizeOpenAiReport(parsed, fallback);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAuditAiReport(options: GenerateAuditAiReportOptions): Promise<AuditAiReport> {
  const fallback = buildFallbackAuditAiReport(options);

  if (!env.openAiApiKey) {
    return fallback;
  }

  try {
    return await requestOpenAiAuditReport(options, fallback);
  } catch (error) {
    aiReportingLogger.warn('OpenAI audit summary generation failed. Falling back to local narrative.', {
      url: options.url,
      model: env.openAiModel,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export function buildAuditAiReportMarkdown(aiReport: AuditAiReport, options: { url: string }): string {
  const lines = [
    '# AI Executive Summary',
    '',
    `- URL: ${options.url}`,
    `- Status: ${aiReport.status}`,
    `- Provider: ${aiReport.provider}`,
    ...(aiReport.model ? [`- Model: ${aiReport.model}`] : []),
    `- Generated At: ${aiReport.generatedAt}`,
    '',
    `## ${aiReport.headline}`,
    '',
    aiReport.summary,
    '',
    '## Business Impact',
    '',
    aiReport.businessImpact,
    '',
    '## Priority Summary',
    '',
    aiReport.prioritySummary,
    '',
    '## Top Recommendations',
    '',
    ...aiReport.topRecommendations.map((recommendation) => `- ${recommendation}`),
    '',
    '## Per-Finding Guidance',
    '',
    ...(aiReport.perFindingGuidance || []).flatMap((item) => [
      `### ${item.title}`,
      '',
      `- Audit ID: ${item.auditId}`,
      ...(item.wcagCriteria?.length ? [`- WCAG: ${item.wcagCriteria.join(', ')}`] : []),
      `- Explanation: ${item.explanation}`,
      `- Remediation: ${item.remediation}`,
      '',
    ]),
    '## Stakeholder Note',
    '',
    aiReport.stakeholderNote,
    '',
  ];

  return lines.join('\n');
}
