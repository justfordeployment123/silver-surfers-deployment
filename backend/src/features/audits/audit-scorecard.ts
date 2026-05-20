import customConfigLite from "./scanner/custom-config-lite.js";
import customConfig from "./scanner/custom-config.js";
import {
    buildWcagSummary,
    resolveWcagReferencesForAudit,
    type WcagPourPrinciple,
    type WcagReference,
    type WcagSummary,
} from "./wcag-mapping.ts";

export type AuditRiskTier = "low" | "medium" | "high";
export type AuditScoreStatus = "pass" | "needs-improvement" | "fail";
export type AuditPrimaryDimensionKey = "visualClarity" | "cognitiveLoad" | "motorAccessibility" | "contentTrust";
export type AuditIssueSourceType = "wcag-aa" | "aging-heuristic" | "supporting-signal";
export type AuditEvaluationDimensionKey =
    | "technicalAccessibility"
    | "visualClarityDesign"
    | "cognitiveLoadComplexity"
    | "navigationArchitecture"
    | "contentReadability"
    | "interactionForms"
    | "trustSecuritySignals"
    | "mobileOptimization";

export interface AuditIssueSummary {
    auditId: string;
    title: string;
    description: string;
    score: number;
    weight: number;
    severity: AuditRiskTier;
    auditSourceType: AuditIssueSourceType;
    auditSourceLabel: string;
    wcagCriteria?: string[];
    wcagReferences?: WcagReference[];
    wcagPrinciples?: WcagPourPrinciple[];
    displayValue?: string;
    sourceUrl?: string;
}

export interface AuditPrimaryDimensionScore {
    key: AuditPrimaryDimensionKey;
    label: string;
    score: number;
    weight: number;
    issueCount: number;
    topIssues: AuditIssueSummary[];
}

export interface AuditEvaluationDimensionScore {
    key: AuditEvaluationDimensionKey;
    label: string;
    score: number;
    weight: number;
    issueCount: number;
    topIssues: AuditIssueSummary[];
}

export interface AuditPlatformScore {
    key: string;
    label: string;
    score: number;
    pageCount: number;
}

export interface AuditScorecard {
    methodologyVersion: string;
    categoryId: string;
    overallScore: number;
    riskTier: AuditRiskTier;
    scoreStatus: AuditScoreStatus;
    pageCount: number;
    evaluatedAt: string;
    dimensions: AuditPrimaryDimensionScore[];
    evaluationDimensions: AuditEvaluationDimensionScore[];
    topIssues: AuditIssueSummary[];
    platforms: AuditPlatformScore[];
    wcagSummary?: WcagSummary;
}

interface CategoryAuditRef {
    id: string;
    weight: number;
}

interface AuditIssueMetadata {
    auditSourceType: AuditIssueSourceType;
    auditSourceLabel: string;
    wcagCriteria?: string[];
}

interface LighthouseAuditResultLike {
    title?: string;
    description?: string;
    score?: number | null;
    displayValue?: string;
    axeTags?: unknown;
    details?: {
        items?: Array<{ axeTags?: unknown }>;
    };
    notApplicable?: boolean;
    notChecked?: boolean;
    scoreDisplayMode?: string;
}

interface LighthouseReportLike {
    audits?: Record<string, LighthouseAuditResultLike | undefined>;
    categories?: Record<string, { auditRefs?: Array<{ id?: string; weight?: number }> } | undefined>;
}

interface BuildAuditScorecardOptions {
    isLiteVersion?: boolean;
    pageUrl?: string;
}

interface BuildAggregateAuditScorecardOptions {
    categoryId?: string;
    pageCount?: number;
    platforms?: AuditPlatformScore[];
}

const SCORECARD_METHOD_VERSION = "silver-score-v1";
const FULL_CATEGORY_ID = "senior-friendly";
const LITE_CATEGORY_ID = "senior-friendly-lite";

const PRIMARY_DIMENSION_LABELS: Record<AuditPrimaryDimensionKey, string> = {
    visualClarity: "Visual Clarity",
    cognitiveLoad: "Cognitive Load",
    motorAccessibility: "Motor Accessibility",
    contentTrust: "Content & Trust",
};

const PRIMARY_DIMENSION_WEIGHTS: Record<AuditPrimaryDimensionKey, number> = {
    visualClarity: 30,
    cognitiveLoad: 25,
    motorAccessibility: 25,
    contentTrust: 20,
};

const PRIMARY_DIMENSION_ORDER: AuditPrimaryDimensionKey[] = ["visualClarity", "cognitiveLoad", "motorAccessibility", "contentTrust"];

const EVALUATION_DIMENSION_LABELS: Record<AuditEvaluationDimensionKey, string> = {
    technicalAccessibility: "Technical Accessibility",
    visualClarityDesign: "Visual Clarity & Design",
    cognitiveLoadComplexity: "Cognitive Load & Complexity",
    navigationArchitecture: "Navigation & Information Architecture",
    contentReadability: "Content Readability & Plain Language",
    interactionForms: "Interaction & Forms",
    trustSecuritySignals: "Trust & Security Signals",
    mobileOptimization: "Mobile & Cross-Platform Optimization",
};

const EVALUATION_DIMENSION_ORDER: AuditEvaluationDimensionKey[] = [
    "technicalAccessibility",
    "visualClarityDesign",
    "cognitiveLoadComplexity",
    "navigationArchitecture",
    "contentReadability",
    "interactionForms",
    "trustSecuritySignals",
    "mobileOptimization",
];

const AUDIT_EVALUATION_DIMENSION_MAP: Record<string, AuditEvaluationDimensionKey> = {
    "color-contrast": "visualClarityDesign",
    "text-font-audit": "visualClarityDesign",
    viewport: "mobileOptimization",
    "cumulative-layout-shift": "visualClarityDesign",
    "layout-brittle-audit": "interactionForms",
    "flesch-kincaid-audit": "contentReadability",
    "heading-order": "navigationArchitecture",
    "dom-size": "cognitiveLoadComplexity",
    "errors-in-console": "technicalAccessibility",
    "interactive-color-audit": "visualClarityDesign",
    "target-size": "interactionForms",
    "link-name": "navigationArchitecture",
    "button-name": "technicalAccessibility",
    label: "technicalAccessibility",
    "largest-contentful-paint": "mobileOptimization",
    "total-blocking-time": "cognitiveLoadComplexity",
    "is-on-https": "trustSecuritySignals",
    "geolocation-on-start": "trustSecuritySignals",
    "image-alt": "technicalAccessibility",
    "focus-traps": "technicalAccessibility",
    bypass: "navigationArchitecture",
    "line-spacing-audit": "visualClarityDesign",
    "autoplay-audit": "cognitiveLoadComplexity",
};

const PRIMARY_DIMENSION_CONTRIBUTORS: Record<AuditPrimaryDimensionKey, AuditEvaluationDimensionKey[]> = {
    visualClarity: ["visualClarityDesign", "mobileOptimization"],
    cognitiveLoad: ["cognitiveLoadComplexity", "navigationArchitecture", "contentReadability"],
    motorAccessibility: ["interactionForms", "mobileOptimization"],
    contentTrust: ["technicalAccessibility", "contentReadability", "trustSecuritySignals"],
};

const DEFAULT_AUDIT_METADATA: AuditIssueMetadata = {
    auditSourceType: "supporting-signal",
    auditSourceLabel: "Supporting Signal",
};

const AUDIT_METADATA: Record<string, AuditIssueMetadata> = {
    "color-contrast": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.3"],
    },
    "target-size": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["2.5.8"],
    },
    "layout-brittle-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.12"],
    },
    "link-name": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["2.4.4"],
    },
    label: {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["3.3.2"],
    },
    "text-font-audit": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    "flesch-kincaid-audit": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    "interactive-color-audit": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    "heading-order": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    "geolocation-on-start": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    "image-alt": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.1.1"],
    },
    "focus-traps": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["2.1.2"],
    },
    bypass: {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["2.4.1"],
    },
    "line-spacing-audit": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    "autoplay-audit": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
};

function roundScore(value: number): number {
    return Math.round(value * 100) / 100;
}

function clampAuditScore(value: number | null | undefined): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(1, Number(value)));
}

function classifyScoreStatus(overallScore: number): AuditScoreStatus {
    if (overallScore >= 80) {
        return "pass";
    }

    if (overallScore >= 70) {
        return "needs-improvement";
    }

    return "fail";
}

function classifyRiskTier(overallScore: number): AuditRiskTier {
    if (overallScore >= 80) {
        return "low";
    }

    if (overallScore >= 70) {
        return "medium";
    }

    return "high";
}

function classifyIssueSeverity(score: number): AuditRiskTier {
    if (score >= 0.9) {
        return "low";
    }

    if (score >= 0.7) {
        return "medium";
    }

    return "high";
}

function getCategoryAuditRefs(categoryId: string): CategoryAuditRef[] {
    const source = categoryId === LITE_CATEGORY_ID ? customConfigLite : customConfig;
    // @ts-ignore
    const category = source?.categories?.[categoryId];

    if (!category?.auditRefs || !Array.isArray(category.auditRefs)) {
        return [];
    }

    return category.auditRefs
        .map((auditRef: any) => ({
            id: String(auditRef.id || ""),
            weight: Number(auditRef.weight) || 0,
        }))
        .filter((auditRef: any) => auditRef.id && auditRef.weight > 0);
}

function getReportCategoryAuditRefs(report: LighthouseReportLike, categoryId: string): CategoryAuditRef[] {
    const category = report?.categories?.[categoryId];
    if (!category?.auditRefs || !Array.isArray(category.auditRefs)) {
        return [];
    }

    return category.auditRefs
        .map((auditRef: any) => ({
            id: String(auditRef.id || ""),
            weight: Number(auditRef.weight) || 0,
        }))
        .filter((auditRef: CategoryAuditRef) => auditRef.id && auditRef.weight > 0);
}

function getEvaluationDimensionKey(auditId: string): AuditEvaluationDimensionKey {
    return AUDIT_EVALUATION_DIMENSION_MAP[auditId] || "technicalAccessibility";
}

function getAuditMetadata(auditId: string): AuditIssueMetadata {
    return AUDIT_METADATA[auditId] || DEFAULT_AUDIT_METADATA;
}

function createEmptyPrimaryDimensionScore(key: AuditPrimaryDimensionKey): AuditPrimaryDimensionScore {
    return {
        key,
        label: PRIMARY_DIMENSION_LABELS[key],
        score: 0,
        weight: PRIMARY_DIMENSION_WEIGHTS[key],
        issueCount: 0,
        topIssues: [],
    };
}

function createEmptyEvaluationDimensionScore(key: AuditEvaluationDimensionKey): AuditEvaluationDimensionScore {
    return {
        key,
        label: EVALUATION_DIMENSION_LABELS[key],
        score: 0,
        weight: 0,
        issueCount: 0,
        topIssues: [],
    };
}

function sortIssues(issues: AuditIssueSummary[]): AuditIssueSummary[] {
    return [...issues].sort((left, right) => {
        if (left.score !== right.score) {
            return left.score - right.score;
        }

        if (left.weight !== right.weight) {
            return right.weight - left.weight;
        }

        return left.auditId.localeCompare(right.auditId);
    });
}

function dedupeIssues(issues: AuditIssueSummary[]): AuditIssueSummary[] {
    const unique = new Map<string, AuditIssueSummary>();

    for (const issue of sortIssues(issues)) {
        const key = `${issue.auditId}::${issue.sourceUrl || ""}`;
        if (!unique.has(key)) {
            unique.set(key, issue);
        }
    }

    return [...unique.values()];
}

function buildPrimaryDimensions(evaluationDimensions: AuditEvaluationDimensionScore[]): {
    dimensions: AuditPrimaryDimensionScore[];
    overallScore: number;
} {
    const evaluationByKey = new Map<AuditEvaluationDimensionKey, AuditEvaluationDimensionScore>(
        evaluationDimensions.map((dimension) => [dimension.key, dimension]),
    );

    let overallWeightedScore = 0;
    let overallWeight = 0;

    const dimensions = PRIMARY_DIMENSION_ORDER.map((primaryKey) => {
        const contributors = PRIMARY_DIMENSION_CONTRIBUTORS[primaryKey]
            .map((dimensionKey) => evaluationByKey.get(dimensionKey))
            .filter((dimension): dimension is AuditEvaluationDimensionScore => Boolean(dimension));

        const contributorWeight = contributors.reduce((sum, dimension) => sum + (Number(dimension.weight) || 0), 0);
        const score =
            contributorWeight > 0
                ? roundScore(contributors.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / contributorWeight)
                : 0;

        if (contributorWeight > 0) {
            overallWeightedScore += score * PRIMARY_DIMENSION_WEIGHTS[primaryKey];
            overallWeight += PRIMARY_DIMENSION_WEIGHTS[primaryKey];
        }

        return {
            key: primaryKey,
            label: PRIMARY_DIMENSION_LABELS[primaryKey],
            score,
            weight: PRIMARY_DIMENSION_WEIGHTS[primaryKey],
            issueCount: contributors.reduce((sum, dimension) => sum + (dimension.issueCount || 0), 0),
            topIssues: dedupeIssues(contributors.flatMap((dimension) => dimension.topIssues || [])).slice(0, 3),
        };
    });

    return {
        dimensions,
        overallScore: overallWeight > 0 ? roundScore(overallWeightedScore / overallWeight) : 0,
    };
}

export function buildAuditScorecard(report: LighthouseReportLike, options: BuildAuditScorecardOptions = {}): AuditScorecard {
    const categoryId = options.isLiteVersion ? LITE_CATEGORY_ID : FULL_CATEGORY_ID;
    const auditRefs = getReportCategoryAuditRefs(report, categoryId);
    const resolvedAuditRefs = auditRefs.length > 0 ? auditRefs : getCategoryAuditRefs(categoryId);
    const audits = report?.audits || {};

    const evaluationIssues = new Map<AuditEvaluationDimensionKey, AuditIssueSummary[]>();
    const evaluationWeightedScores = new Map<AuditEvaluationDimensionKey, number>();
    const evaluationWeights = new Map<AuditEvaluationDimensionKey, number>();
    const evaluationIssueCounts = new Map<AuditEvaluationDimensionKey, number>();

    for (const key of EVALUATION_DIMENSION_ORDER) {
        evaluationIssues.set(key, []);
        evaluationWeightedScores.set(key, 0);
        evaluationWeights.set(key, 0);
        evaluationIssueCounts.set(key, 0);
    }

    for (const auditRef of resolvedAuditRefs) {
        const audit = audits[auditRef.id];
        const isExcluded =
            !audit
            || audit.notApplicable === true
            || audit.notChecked === true
            || audit.scoreDisplayMode === "notApplicable"
            || audit.scoreDisplayMode === "notChecked"
            || audit.scoreDisplayMode === "manual";

        if (isExcluded) {
            continue;
        }

        const score = clampAuditScore(audit?.score);
        const evaluationKey = getEvaluationDimensionKey(auditRef.id);
        const metadata = getAuditMetadata(auditRef.id);

        evaluationWeightedScores.set(evaluationKey, (evaluationWeightedScores.get(evaluationKey) || 0) + score * auditRef.weight);
        evaluationWeights.set(evaluationKey, (evaluationWeights.get(evaluationKey) || 0) + auditRef.weight);

        if (score < 0.999) {
            const wcagReferences = resolveWcagReferencesForAudit(auditRef.id, audit);
            const wcagCriteria = wcagReferences.map((reference) => reference.criterion);
            const wcagPrinciples = [...new Set(wcagReferences.map((reference) => reference.principle))];

            evaluationIssueCounts.set(evaluationKey, (evaluationIssueCounts.get(evaluationKey) || 0) + 1);
            evaluationIssues.get(evaluationKey)?.push({
                auditId: auditRef.id,
                title: audit?.title || auditRef.id,
                description: audit?.description || "",
                score: roundScore(score * 100),
                weight: auditRef.weight,
                severity: classifyIssueSeverity(score),
                auditSourceType: metadata.auditSourceType,
                auditSourceLabel: metadata.auditSourceLabel,
                ...(wcagCriteria.length ? { wcagCriteria } : {}),
                ...(wcagReferences.length ? { wcagReferences } : {}),
                ...(wcagPrinciples.length ? { wcagPrinciples } : {}),
                ...(audit?.displayValue ? { displayValue: audit.displayValue } : {}),
                ...(options.pageUrl ? { sourceUrl: options.pageUrl } : {}),
            });
        }
    }

    const evaluationDimensions = EVALUATION_DIMENSION_ORDER.map((evaluationKey) => {
        const weight = evaluationWeights.get(evaluationKey) || 0;
        const weightedScore = evaluationWeightedScores.get(evaluationKey) || 0;
        const score = weight > 0 ? roundScore((weightedScore / weight) * 100) : 0;

        return {
            key: evaluationKey,
            label: EVALUATION_DIMENSION_LABELS[evaluationKey],
            score,
            weight,
            issueCount: evaluationIssueCounts.get(evaluationKey) || 0,
            topIssues: sortIssues(evaluationIssues.get(evaluationKey) || []).slice(0, 3),
        };
    });

    const primaryScores = buildPrimaryDimensions(evaluationDimensions);
    const topIssues = dedupeIssues(evaluationDimensions.flatMap((dimension) => dimension.topIssues || [])).slice(0, 5);
    const allIssues = dedupeIssues(evaluationDimensions.flatMap((dimension) => dimension.topIssues || []));

    return {
        methodologyVersion: SCORECARD_METHOD_VERSION,
        categoryId,
        overallScore: primaryScores.overallScore,
        riskTier: classifyRiskTier(primaryScores.overallScore),
        scoreStatus: classifyScoreStatus(primaryScores.overallScore),
        pageCount: 1,
        evaluatedAt: new Date().toISOString(),
        dimensions: primaryScores.dimensions,
        evaluationDimensions,
        topIssues,
        platforms: [],
        wcagSummary: buildWcagSummary(allIssues),
    };
}

export function buildAggregateAuditScorecard(
    scorecards: AuditScorecard[],
    options: BuildAggregateAuditScorecardOptions = {},
): AuditScorecard {
    if (!scorecards.length) {
        const emptyEvaluationDimensions = EVALUATION_DIMENSION_ORDER.map((key) => createEmptyEvaluationDimensionScore(key));
        const primaryScores = buildPrimaryDimensions(emptyEvaluationDimensions);

        return {
            methodologyVersion: SCORECARD_METHOD_VERSION,
            categoryId: options.categoryId || FULL_CATEGORY_ID,
            overallScore: 0,
            riskTier: "high",
            scoreStatus: "fail",
            pageCount: options.pageCount || 0,
            evaluatedAt: new Date().toISOString(),
            dimensions: primaryScores.dimensions,
            evaluationDimensions: emptyEvaluationDimensions,
            topIssues: [],
            platforms: options.platforms || [],
            wcagSummary: buildWcagSummary([]),
        };
    }

    const primaryDimensionScores = new Map<AuditPrimaryDimensionKey, number[]>();
    const primaryDimensionIssues = new Map<AuditPrimaryDimensionKey, AuditIssueSummary[]>();
    const evaluationDimensionScores = new Map<AuditEvaluationDimensionKey, number[]>();
    const evaluationDimensionIssues = new Map<AuditEvaluationDimensionKey, AuditIssueSummary[]>();
    const evaluationDimensionWeights = new Map<AuditEvaluationDimensionKey, number>();

    for (const key of PRIMARY_DIMENSION_ORDER) {
        primaryDimensionScores.set(key, []);
        primaryDimensionIssues.set(key, []);
    }

    for (const key of EVALUATION_DIMENSION_ORDER) {
        evaluationDimensionScores.set(key, []);
        evaluationDimensionIssues.set(key, []);
        evaluationDimensionWeights.set(key, 0);
    }

    let pageCount = 0;

    for (const scorecard of scorecards) {
        pageCount += Number(scorecard.pageCount) || 1;

        for (const dimension of scorecard.dimensions || []) {
            primaryDimensionScores.get(dimension.key)?.push(Number(dimension.score) || 0);
            primaryDimensionIssues.get(dimension.key)?.push(...(Array.isArray(dimension.topIssues) ? dimension.topIssues : []));
        }

        for (const evaluationDimension of scorecard.evaluationDimensions || []) {
            evaluationDimensionScores.get(evaluationDimension.key)?.push(Number(evaluationDimension.score) || 0);
            evaluationDimensionIssues
                .get(evaluationDimension.key)
                ?.push(...(Array.isArray(evaluationDimension.topIssues) ? evaluationDimension.topIssues : []));
            evaluationDimensionWeights.set(evaluationDimension.key, Number(evaluationDimension.weight) || 0);
        }
    }

    const evaluationDimensions = EVALUATION_DIMENSION_ORDER.map((evaluationKey) => {
        const scores = evaluationDimensionScores.get(evaluationKey) || [];
        const score = scores.length ? roundScore(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;

        return {
            key: evaluationKey,
            label: EVALUATION_DIMENSION_LABELS[evaluationKey],
            score,
            weight: evaluationDimensionWeights.get(evaluationKey) || 0,
            issueCount: (evaluationDimensionIssues.get(evaluationKey) || []).length,
            topIssues: dedupeIssues(evaluationDimensionIssues.get(evaluationKey) || []).slice(0, 3),
        };
    });

    const primaryScores = buildPrimaryDimensions(evaluationDimensions);
    const dimensions = PRIMARY_DIMENSION_ORDER.map((primaryKey) => {
        const existing =
            primaryScores.dimensions.find((dimension) => dimension.key === primaryKey) || createEmptyPrimaryDimensionScore(primaryKey);
        const issueCount = (primaryDimensionIssues.get(primaryKey) || []).length;

        return {
            ...existing,
            issueCount,
            topIssues: dedupeIssues(primaryDimensionIssues.get(primaryKey) || []).slice(0, 3),
        };
    });

    const overallScore = roundScore(
        dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) /
            dimensions.reduce((sum, dimension) => sum + dimension.weight, 0),
    );

    const topIssues = dedupeIssues(evaluationDimensions.flatMap((dimension) => dimension.topIssues || [])).slice(0, 5);
    const allIssues = dedupeIssues(evaluationDimensions.flatMap((dimension) => dimension.topIssues || []));

    return {
        methodologyVersion: SCORECARD_METHOD_VERSION,
        categoryId: options.categoryId || scorecards[0].categoryId || FULL_CATEGORY_ID,
        overallScore,
        riskTier: classifyRiskTier(overallScore),
        scoreStatus: classifyScoreStatus(overallScore),
        pageCount: options.pageCount || pageCount,
        evaluatedAt: new Date().toISOString(),
        dimensions,
        evaluationDimensions,
        topIssues,
        platforms: options.platforms || [],
        wcagSummary: buildWcagSummary(allIssues),
    };
}
