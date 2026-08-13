import customConfigLite from "./scanner/custom-config-lite.js";
import customConfig from "./scanner/custom-config.js";
import {
    buildWcagSummary,
    resolveWcagReferencesForAudit,
    type WcagPourPrinciple,
    type WcagReference,
    type WcagSummary,
} from "./wcag-mapping.ts";
import { getRemediationTemplateTitle } from "./analysis-details.ts";

export type AuditRiskTier = "low" | "medium" | "high";
export type AuditScoreStatus = "pass" | "needs-improvement" | "fail";
export type AuditPrimaryDimensionKey = "visualClarity" | "cognitiveLoad" | "motorAccessibility" | "contentTrust";
export type AuditIssueSourceType = "wcag-a" | "wcag-aa" | "aging-heuristic" | "supporting-signal";
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
    /** Failing-element count captured from the audit's details.items (evidence parity). */
    elementCount?: number;
    /**
     * Number of distinct pages this audit failed on. Only set on aggregate
     * (site-level) topIssues (Phase 6.8 / N14) — a single-page scorecard's
     * issues always affect exactly one page, so the field is omitted there.
     */
    pagesAffected?: number;
    /**
     * Device profile this occurrence was observed under ("desktop" | "mobile" |
     * "tablet"). Stamped per page scorecard by the full-audit pipelines; absent
     * for callers that don't scan per device (quick scan, single-report scoring).
     */
    sourcePlatform?: string;
    /**
     * Distinct device profiles this audit failed under, across the whole site.
     * Only set on aggregate (site-level) topIssues (Phase 6.7c / N10c) and used
     * to tag a headline that no desktop scan can corroborate.
     */
    sourcePlatforms?: string[];
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
    issues: AuditIssueSummary[];
    platforms: AuditPlatformScore[];
    wcagSummary?: WcagSummary;
    notApplicableAuditIds: string[];
    manualReviewAuditIds: string[];
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
    axeImpact?: string;
}

interface LighthouseReportLike {
    audits?: Record<string, LighthouseAuditResultLike | undefined>;
    categories?: Record<string, { auditRefs?: Array<{ id?: string; weight?: number }> } | undefined>;
}

interface BuildAuditScorecardOptions {
    isLiteVersion?: boolean;
    pageUrl?: string;
    /** Device profile this report was captured under ("desktop" | "mobile" | "tablet"). */
    platform?: string;
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

const EVALUATION_DIMENSION_PRD_WEIGHTS: Record<AuditEvaluationDimensionKey, number> = {
    technicalAccessibility: 10,      // was 6.67  — axe violations genuinely vary
    visualClarityDesign: 22,         // was 15    — contrast and CLS genuinely vary
    cognitiveLoadComplexity: 6.25,   // was 8.33  — small reduction
    navigationArchitecture: 12.5,    // was 8.33  — Navigation ranged 50–100 across sites
    contentReadability: 12.92,       // was 15    — often notApplicable; slight reduction
    interactionForms: 17.5,          // was 12.5  — form labels, target size matter for seniors
    trustSecuritySignals: 3.33,      // was 6.67  — HTTPS is near-universal; halved
    mobileOptimization: 15.5,        // was 27.5  — 4 binary viewport checks rarely fail
};

const AUDIT_EVALUATION_DIMENSION_MAP: Record<string, AuditEvaluationDimensionKey> = {
    "color-contrast": "visualClarityDesign",
    "text-font-audit": "visualClarityDesign",
    viewport: "mobileOptimization",
    "user-scalable-audit": "mobileOptimization",
    "horizontal-scroll-audit": "mobileOptimization",
    "text-size-adjust-audit": "mobileOptimization",
    "cumulative-layout-shift": "visualClarityDesign",
    "layout-brittle-audit": "visualClarityDesign",
    "flesch-kincaid-audit": "contentReadability",
    "heading-order": "navigationArchitecture",
    "dom-size": "cognitiveLoadComplexity",
    "errors-in-console": "technicalAccessibility",
    "interactive-color-audit": "visualClarityDesign",
    "target-size": "interactionForms",
    "link-name": "navigationArchitecture",
    "button-name": "technicalAccessibility",
    label: "interactionForms",
    "total-blocking-time": "cognitiveLoadComplexity",
    "is-on-https": "trustSecuritySignals",
    "geolocation-on-start": "trustSecuritySignals",
    "mixed-content-audit": "trustSecuritySignals",
    "form-action-security-audit": "trustSecuritySignals",
    "third-party-surface-audit": "trustSecuritySignals",
    "trust-markers-audit": "trustSecuritySignals",
    "image-alt": "technicalAccessibility",
    "focus-traps": "technicalAccessibility",
    bypass: "navigationArchitecture",
    "line-spacing-audit": "visualClarityDesign",
    "autoplay-audit": "cognitiveLoadComplexity",
    "ss-orientation-audit": "mobileOptimization",
    "text-spacing-audit": "mobileOptimization",
};

const PRIMARY_DIMENSION_CONTRIBUTORS: Record<
    AuditPrimaryDimensionKey,
    Array<{ key: AuditEvaluationDimensionKey; weight: number }>
> = {
    // Primary dimension totals are unchanged (30/25/25/20).
    // Sub-weights shifted toward dimensions that actually vary across sites.
    visualClarity: [
        { key: "visualClarityDesign", weight: 22 },    // was 15 — contrast+CLS vary
        { key: "mobileOptimization", weight: 8 },       // was 15 — viewport checks rarely fail
    ],
    cognitiveLoad: [
        { key: "cognitiveLoadComplexity", weight: 6.25 },  // was 8.33
        { key: "navigationArchitecture", weight: 12.5 },   // was 8.33 — nav genuinely varies
        { key: "contentReadability", weight: 6.25 },       // was 8.34 — often notApplicable
    ],
    motorAccessibility: [
        { key: "interactionForms", weight: 17.5 },     // was 12.5 — labels+target size matter
        { key: "mobileOptimization", weight: 7.5 },    // was 12.5
    ],
    contentTrust: [
        { key: "technicalAccessibility", weight: 10 },   // was 6.67 — axe violations vary
        { key: "contentReadability", weight: 6.67 },     // unchanged
        { key: "trustSecuritySignals", weight: 3.33 },   // was 6.66 — HTTPS near-universal
    ],
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
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.4.4"],
    },
    "button-name": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["4.1.2", "2.5.3"],
    },
    label: {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["1.3.1", "3.3.2"],
    },
    "label-content-name-mismatch": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.5.3"],
    },
    "axe-label-content-name-mismatch": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.5.3"],
    },
    "color-contrast-enhanced": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.11"],
    },
    "axe-color-contrast-enhanced": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.11"],
    },
    "horizontal-scroll-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.10"],
    },
    // Phase 9.1 standing check (F11): viewport is wired into WCAG 1.4.10
    // (Reflow, AA) via wcag-mapping.ts's STATIC_AUDIT_MAPPINGS, which
    // independently drives issue.wcagCriteria and the WCAG matrix — but had
    // no entry here, so it silently fell back to the generic "Supporting
    // Signal" badge on a genuinely WCAG-mapped issue.
    viewport: {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.10"],
    },
    "text-spacing-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.12"],
    },
    "user-scalable-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.4"],
    },
    // Phase 9.1 standing check (F11): text-font-audit is already wired into
    // two real WCAG AA criteria (1.4.4 Resize Text, 1.4.12 Text Spacing) via
    // wcag-mapping.ts's STATIC_AUDIT_MAPPINGS/CRITERION_AUDIT_MAP, which
    // independently drives issue.wcagCriteria and the WCAG matrix. It was
    // previously badged "Aging Heuristic" (a house signal implying no WCAG
    // claim) while simultaneously producing real WCAG matrix rows — exactly
    // the badge/mapping mismatch F11 fixed for other audits. Badged to match
    // the mapping that's already live, same as layout-brittle-audit and
    // text-spacing-audit (both also mapped to 1.4.12).
    "text-font-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.4", "1.4.12"],
    },
    "flesch-kincaid-audit": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    // Phase 9.1 standing check (F11): interactive-color-audit is wired into
    // two WCAG criteria at different levels — 1.4.1 Use of Color (A) and
    // 1.4.11 Non-text Contrast (AA) — via wcag-mapping.ts's
    // STATIC_AUDIT_MAPPINGS. Badged with the stricter (AA) of the two,
    // same badge/mapping mismatch as text-font-audit and viewport above.
    "interactive-color-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.1", "1.4.11"],
    },
    // Phase 9.1 standing check (F11): heading-order is wired into WCAG 1.3.1
    // (Info and Relationships, A) and 2.4.6 (Headings and Labels, AA);
    // badged with the stricter (AA) of the two.
    "heading-order": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.3.1", "2.4.6"],
    },
    "geolocation-on-start": {
        auditSourceType: "aging-heuristic",
        auditSourceLabel: "Aging Heuristic",
    },
    "image-alt": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["1.1.1"],
    },
    "focus-traps": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.1.2"],
    },
    bypass: {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.4.1"],
    },
    // Phase 9.1 standing check (F11): line-spacing-audit is wired into WCAG
    // 1.4.12 (Text Spacing, AA) via wcag-mapping.ts's STATIC_AUDIT_MAPPINGS,
    // same badge/mapping mismatch as the others fixed in this pass.
    "line-spacing-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.12"],
    },
    // Phase 9.1 standing check (F11): autoplay-audit is wired into WCAG
    // 1.4.2 (Audio Control, A) and 2.2.2 (Pause, Stop, Hide, A) via
    // wcag-mapping.ts's STATIC_AUDIT_MAPPINGS, same badge/mapping mismatch
    // as the others fixed in this pass.
    "autoplay-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["1.4.2", "2.2.2"],
    },
    // Phase 9.1 standing check (F11): the entire "ss-" custom audit family
    // is wired into real WCAG criteria via wcag-mapping.ts's
    // STATIC_AUDIT_MAPPINGS/CRITERION_AUDIT_MAP (which independently drives
    // issue.wcagCriteria and the WCAG matrix rows these audits produce), but
    // none of them had an entry here — every one silently fell back to the
    // generic "Supporting Signal" badge despite genuinely mapping to WCAG.
    // Badge levels below are the strictest of each audit's own criteria.
    "ss-orientation-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.3.4"],
    },
    "ss-input-purpose-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.3.5"],
    },
    "ss-use-of-color-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["1.4.1"],
    },
    "ss-non-text-contrast-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.11"],
    },
    "ss-hover-focus-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["1.4.13"],
    },
    "ss-keyboard-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.1.1"],
    },
    "ss-no-keyboard-trap-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.1.2"],
    },
    "ss-timing-adjustable-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.2.1"],
    },
    "ss-pause-stop-hide-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.2.2"],
    },
    "ss-focus-order-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.4.3"],
    },
    "ss-focus-visible-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["2.4.7"],
    },
    "ss-focus-not-obscured-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["2.4.11"],
    },
    "ss-label-in-name-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["2.5.3"],
    },
    "ss-on-focus-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["3.2.1"],
    },
    "ss-on-input-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["3.2.2"],
    },
    "ss-consistent-navigation-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["3.2.3"],
    },
    "ss-consistent-help-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["3.2.6"],
    },
    "ss-error-identification-audit": {
        auditSourceType: "wcag-a",
        auditSourceLabel: "WCAG A",
        wcagCriteria: ["3.3.1"],
    },
    "ss-status-messages-audit": {
        auditSourceType: "wcag-aa",
        auditSourceLabel: "WCAG AA",
        wcagCriteria: ["4.1.3"],
    },
};

function roundScore(value: number): number {
    return Math.round(value);
}

function clampAuditScore(value: number | null | undefined): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(1, Number(value)));
}

export function classifyScoreStatus(overallScore: number): AuditScoreStatus {
    if (overallScore >= 80) {
        return "pass";
    }

    if (overallScore >= 70) {
        return "needs-improvement";
    }

    return "fail";
}

export function classifyRiskTier(overallScore: number): AuditRiskTier {
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

function getAxeAuditWeight(audit: LighthouseAuditResultLike | undefined): number {
    switch (String(audit?.axeImpact || "").toLowerCase()) {
        case "critical":
            return 5;
        case "serious":
            return 4;
        case "moderate":
            return 3;
        case "minor":
            return 1;
        default:
            return 3;
    }
}

function appendDynamicAxeAuditRefs(auditRefs: CategoryAuditRef[], audits: Record<string, LighthouseAuditResultLike | undefined>): CategoryAuditRef[] {
    const refsById = new Map(auditRefs.map((auditRef) => [auditRef.id, auditRef]));

    for (const [auditId, audit] of Object.entries(audits)) {
        if (!auditId.startsWith("axe-") || refsById.has(auditId)) {
            continue;
        }
        if (auditId === "axe-core") {
            continue;
        }
        const canonicalAuditId = auditId.slice("axe-".length);
        if (refsById.has(canonicalAuditId)) {
            continue;
        }
        if (!audit || audit.notApplicable || audit.notChecked || audit.scoreDisplayMode === "notApplicable" || audit.scoreDisplayMode === "notChecked") {
            continue;
        }
        refsById.set(auditId, {
            id: auditId,
            weight: getAxeAuditWeight(audit),
        });
    }

    return [...refsById.values()];
}

function getDimensionFromWcagCriterion(criterion: string): AuditEvaluationDimensionKey | null {
    if (/^1\.1\./.test(criterion) || /^1\.3\.[1235]/.test(criterion) || /^2\.1\./.test(criterion) || /^4\.1\./.test(criterion)) {
        return "technicalAccessibility";
    }
    if (/^1\.4\.(3|4|11|12|13)$/.test(criterion)) {
        return "visualClarityDesign";
    }
    if (/^1\.3\.4$/.test(criterion) || /^1\.4\.10$/.test(criterion)) {
        return "mobileOptimization";
    }
    if (/^2\.2\./.test(criterion) || /^3\.2\./.test(criterion)) {
        return "cognitiveLoadComplexity";
    }
    if (/^2\.4\./.test(criterion)) {
        return "navigationArchitecture";
    }
    if (/^3\.1\./.test(criterion)) {
        return "contentReadability";
    }
    if (/^2\.5\./.test(criterion) || /^3\.3\./.test(criterion)) {
        return "interactionForms";
    }

    return null;
}

function getEvaluationDimensionKey(auditId: string, audit?: LighthouseAuditResultLike): AuditEvaluationDimensionKey {
    const staticKey = AUDIT_EVALUATION_DIMENSION_MAP[auditId];
    if (staticKey) {
        return staticKey;
    }

    if (auditId === "axe-button-name") {
        return "technicalAccessibility";
    }

    const wcagReferences = resolveWcagReferencesForAudit(auditId, audit);
    for (const reference of wcagReferences) {
        const inferred = getDimensionFromWcagCriterion(reference.criterion);
        if (inferred) {
            return inferred;
        }
    }

    return "technicalAccessibility";
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

// Minimum distinct pages an issue must affect to headline ahead of a
// narrower one when both are otherwise comparable (Phase 6.8 / N14) — a
// two-mention finding in a 1,132-page report shouldn't outrank something
// that recurs sitewide just because its single occurrence scored lower.
const MIN_PAGES_TO_HEADLINE = 2;

/**
 * Ranks the site-wide top issues by breadth (distinct pages affected) x
 * severity, not a single page's raw score (Phase 6.8 / N14). Also collapses
 * the input to one entry per audit id (Phase 6.6 / N9 — the prior
 * score-only sort could surface the same audit from several pages as
 * separate "top issues", producing duplicate titles in the summary
 * sentence) and then to one entry per WCAG criterion (Phase 6.7b / N10 — two
 * different audits mapped to the same criterion must not both headline).
 * `issues` is expected to already be deduped by `auditId::sourceUrl`
 * (i.e. one entry per audit per page), which is what feeds this from
 * `buildAggregateAuditScorecard`.
 */
/**
 * Distinct device profiles each audit id failed under, derived from the
 * COMPLETE pre-dedupe issue set (Phase 6.7c / N10c). It must be computed before
 * `dedupeIssues`, whose `auditId::sourceUrl` key collapses the desktop and
 * mobile occurrences of the same audit on the same page into one row — reading
 * platforms after that step would report a cross-platform issue as
 * single-platform depending purely on sort order.
 */
function collectPlatformsByAuditId(issues: AuditIssueSummary[]): Map<string, Set<string>> {
    const platformsByAuditId = new Map<string, Set<string>>();
    for (const issue of issues) {
        const platform = typeof issue?.sourcePlatform === "string" ? issue.sourcePlatform.trim() : "";
        if (!platform) continue;
        const platforms = platformsByAuditId.get(issue.auditId) || new Set<string>();
        platforms.add(platform.toLowerCase());
        platformsByAuditId.set(issue.auditId, platforms);
    }
    return platformsByAuditId;
}

function buildBreadthRankedTopIssues(
    issues: AuditIssueSummary[],
    limit: number,
    platformsByAuditId?: Map<string, Set<string>>,
): AuditIssueSummary[] {
    const byAuditId = new Map<string, AuditIssueSummary[]>();
    for (const issue of issues) {
        const list = byAuditId.get(issue.auditId) || [];
        list.push(issue);
        byAuditId.set(issue.auditId, list);
    }

    const candidates = [...byAuditId.entries()].map(([auditId, occurrences]) => {
        const pageUrls = new Set(occurrences.map((occurrence) => occurrence.sourceUrl).filter(Boolean));
        const pagesAffected = pageUrls.size || occurrences.length;
        // Worst-scoring occurrence stands in for the audit as a whole.
        const representative = sortIssues(occurrences)[0];
        const impact = Math.max(0, 100 - representative.score);

        // Prefer the pre-dedupe attribution when the caller supplies it; fall
        // back to whatever survives on these occurrences so a caller that
        // doesn't pass the map still gets correct (if narrower) platforms.
        const platforms = platformsByAuditId?.get(auditId)
            || collectPlatformsByAuditId(occurrences).get(auditId);
        const sourcePlatforms = platforms && platforms.size > 0 ? [...platforms].sort() : undefined;

        return {
            auditId,
            pagesAffected,
            breadthRank: pagesAffected * impact,
            criterion: representative.wcagCriteria?.[0],
            issue: {
                ...representative,
                pagesAffected,
                ...(sourcePlatforms ? { sourcePlatforms } : {}),
            } as AuditIssueSummary,
        };
    });

    candidates.sort((left, right) => {
        const leftQualifies = left.pagesAffected >= MIN_PAGES_TO_HEADLINE;
        const rightQualifies = right.pagesAffected >= MIN_PAGES_TO_HEADLINE;
        if (leftQualifies !== rightQualifies) {
            return leftQualifies ? -1 : 1;
        }
        if (left.breadthRank !== right.breadthRank) {
            return right.breadthRank - left.breadthRank;
        }
        // Equal breadth and impact: fall back to the audit's own dimension
        // weight (heavier-weighted audits headline first), matching the
        // pre-6.8 single-page tie-break (sortIssues) so equally-ranked
        // single-occurrence issues keep a stable, meaningful order.
        if (left.issue.weight !== right.issue.weight) {
            return right.issue.weight - left.issue.weight;
        }
        return left.auditId.localeCompare(right.auditId);
    });

    // One headline slot per WCAG criterion — keep the first (highest-ranked)
    // audit for a criterion already covered by an earlier, better-ranked one.
    const seenCriteria = new Set<string>();
    const deduped: AuditIssueSummary[] = [];
    for (const candidate of candidates) {
        if (candidate.criterion) {
            if (seenCriteria.has(candidate.criterion)) {
                continue;
            }
            seenCriteria.add(candidate.criterion);
        }
        deduped.push(candidate.issue);
        if (deduped.length >= limit) {
            break;
        }
    }

    return deduped;
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
            .map((contributor) => ({
                ...contributor,
                dimension: evaluationByKey.get(contributor.key),
            }))
            .filter((contributor): contributor is { key: AuditEvaluationDimensionKey; weight: number; dimension: AuditEvaluationDimensionScore } =>
                Boolean(contributor.dimension) && Number(contributor.dimension.weight) > 0,
            );

        const contributorWeight = contributors.reduce((sum, contributor) => sum + contributor.weight, 0);
        const score =
            contributorWeight > 0
                ? roundScore(
                      contributors.reduce((sum, contributor) => sum + contributor.dimension.score * contributor.weight, 0) /
                          contributorWeight,
                  )
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
            issueCount: contributors.reduce((sum, contributor) => sum + (contributor.dimension.issueCount || 0), 0),
            topIssues: dedupeIssues(contributors.flatMap((contributor) => contributor.dimension.topIssues || [])).slice(0, 3),
        };
    });

    // Phase 10 (N5 residual): the overall score is taken from the *same*
    // buildScoreBreakdown() the report prints as its "Detailed Score
    // Breakdown" table, so the headline is literally the table's own
    // arithmetic and a reader can always reproduce it with a calculator.
    //
    // The two used to be computed independently: this function renormalised
    // within each of the 4 primary categories, while the printed table
    // renormalised the 8 PRD weights globally. Those agree while all 8
    // dimensions are active, but diverge as soon as one is Excluded (the
    // redlobster case) — up to 4 points apart, with the table visibly
    // failing to add up to the headline above it.
    //
    // overallWeightedScore/overallWeight are still computed above because the
    // per-primary renormalisation they perform is what gives each of the 4
    // primary dimensions its own displayed score.
    void overallWeightedScore;
    void overallWeight;

    return {
        dimensions,
        overallScore: buildScoreBreakdown(evaluationDimensions).finalScore,
    };
}

export function buildAuditScorecard(report: LighthouseReportLike, options: BuildAuditScorecardOptions = {}): AuditScorecard {
    const categoryId = options.isLiteVersion ? LITE_CATEGORY_ID : FULL_CATEGORY_ID;
    const auditRefs = getReportCategoryAuditRefs(report, categoryId);
    const audits = report?.audits || {};
    const resolvedAuditRefs = appendDynamicAxeAuditRefs(auditRefs.length > 0 ? auditRefs : getCategoryAuditRefs(categoryId), audits);

    const evaluationIssues = new Map<AuditEvaluationDimensionKey, AuditIssueSummary[]>();
    const evaluationWeightedScores = new Map<AuditEvaluationDimensionKey, number>();
    const evaluationWeights = new Map<AuditEvaluationDimensionKey, number>();
    const evaluationIssueCounts = new Map<AuditEvaluationDimensionKey, number>();
    const notApplicableAuditIds: string[] = [];
    const manualReviewAuditIds: string[] = [];

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

        if (audit && (audit.notApplicable === true || audit.scoreDisplayMode === "notApplicable")) {
            notApplicableAuditIds.push(auditRef.id);
        }
        if (audit && audit.scoreDisplayMode === "manual") {
            manualReviewAuditIds.push(auditRef.id);
        }

        if (isExcluded) {
            continue;
        }

        const score = clampAuditScore(audit?.score);
        const evaluationKey = getEvaluationDimensionKey(auditRef.id, audit);
        const metadata = getAuditMetadata(auditRef.id);

        evaluationWeightedScores.set(evaluationKey, (evaluationWeightedScores.get(evaluationKey) || 0) + score * auditRef.weight);
        evaluationWeights.set(evaluationKey, (evaluationWeights.get(evaluationKey) || 0) + auditRef.weight);

        if (score < 0.999) {
            const detailItems = audit?.details?.items;
            const elementCount = Array.isArray(detailItems) ? detailItems.length : 0;
            const wcagReferences = resolveWcagReferencesForAudit(auditRef.id, audit);
            const wcagCriteria = wcagReferences.map((reference) => reference.criterion);
            const wcagPrinciples = [...new Set(wcagReferences.map((reference) => reference.principle))];
            const axeLevel = wcagReferences[0]?.level;
            const issueMetadata =
                auditRef.id.startsWith("axe-") && wcagReferences.length
                    ? axeLevel === "A"
                        ? { auditSourceType: "wcag-a" as const, auditSourceLabel: "WCAG A" }
                        : { auditSourceType: "wcag-aa" as const, auditSourceLabel: "WCAG AA" }
                    : metadata;

            evaluationIssueCounts.set(evaluationKey, (evaluationIssueCounts.get(evaluationKey) || 0) + 1);
            evaluationIssues.get(evaluationKey)?.push({
                auditId: auditRef.id,
                title: getRemediationTemplateTitle(auditRef.id) || audit?.title || auditRef.id,
                description: audit?.description || "",
                score: roundScore(score * 100),
                weight: auditRef.weight,
                severity: classifyIssueSeverity(score),
                auditSourceType: issueMetadata.auditSourceType,
                auditSourceLabel: issueMetadata.auditSourceLabel,
                ...(wcagCriteria.length ? { wcagCriteria } : {}),
                ...(wcagReferences.length ? { wcagReferences } : {}),
                ...(wcagPrinciples.length ? { wcagPrinciples } : {}),
                ...(audit?.displayValue ? { displayValue: audit.displayValue } : {}),
                ...(elementCount > 0 ? { elementCount } : {}),
                ...(options.pageUrl ? { sourceUrl: options.pageUrl } : {}),
                ...(options.platform ? { sourcePlatform: options.platform } : {}),
            });
        }
    }

    const evaluationDimensions = EVALUATION_DIMENSION_ORDER.map((evaluationKey) => {
        const weight = evaluationWeights.get(evaluationKey) || 0;
        const weightedScore = evaluationWeightedScores.get(evaluationKey) || 0;
        const score = weight > 0 ? roundScore((weightedScore / weight) * 100) : 0;
        const prdWeight = EVALUATION_DIMENSION_PRD_WEIGHTS[evaluationKey];

        return {
            key: evaluationKey,
            label: EVALUATION_DIMENSION_LABELS[evaluationKey],
            score,
            weight: weight > 0 ? prdWeight : 0,
            issueCount: evaluationIssueCounts.get(evaluationKey) || 0,
            topIssues: sortIssues(evaluationIssues.get(evaluationKey) || []).slice(0, 3),
        };
    });

    const primaryScores = buildPrimaryDimensions(evaluationDimensions);
    const allIssues = dedupeIssues([...evaluationIssues.values()].flat());
    const topIssues = sortIssues(allIssues).slice(0, 5);

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
        issues: allIssues,
        platforms: [],
        wcagSummary: buildWcagSummary(allIssues),
        notApplicableAuditIds,
        manualReviewAuditIds,
    };
}

export interface ScoreBreakdownRow {
    key: string;
    name: string;
    /** Integer percent; null when the dimension is excluded. */
    score: number | null;
    /** Printed one-decimal weight; 0 when the dimension is excluded. */
    weight: number;
    /** Printed one-decimal weighted contribution; null when excluded. */
    weighted: number | null;
}

export interface ScoreBreakdown {
    rows: ScoreBreakdownRow[];
    /** Sum of the printed weights — always 100.0 when any dimension is active. */
    totalWeight: number;
    /** Sum of the printed weighted cells. */
    totalWeighted: number;
    /** round(totalWeighted / totalWeight * 100) — the table's own arithmetic. */
    finalScore: number;
}

/**
 * Builds the printable "Detailed Score Breakdown" rows from the scorecard's
 * evaluation dimensions. Every printed number derives from the same source so
 * the table self-checks in front of the reader: each Weighted cell equals the
 * printed Score x the printed Weight (rounded at display precision), and both
 * columns sum to the printed totals. Each active dimension prints its true
 * PRD weight to one decimal; when any dimension is excluded, the remaining
 * true weights are renormalized to sum 100 before printing.
 */
export function buildScoreBreakdown(
    dimensions: Array<Pick<AuditEvaluationDimensionScore, "key" | "label" | "score" | "weight">>,
): ScoreBreakdown {
    const round1 = (value: number): number => Math.round(value * 10) / 10;

    const activeDimensions = dimensions.filter((dimension) => Number(dimension.weight) > 0);
    const trueWeightSum = activeDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);

    const printedWeights = new Map<string, number>();
    for (const dimension of activeDimensions) {
        const trueWeight = trueWeightSum > 0 ? (dimension.weight / trueWeightSum) * 100 : 0;
        printedWeights.set(dimension.key, round1(trueWeight));
    }

    // Keep the printed weight column summing to exactly 100.0: fold any
    // rounding drift into the largest active dimension's printed weight.
    const printedWeightSum = [...printedWeights.values()].reduce((sum, weight) => sum + weight, 0);
    const drift = round1(100 - printedWeightSum);
    if (Math.abs(drift) >= 0.05 && activeDimensions.length > 0) {
        const largest = activeDimensions.reduce((a, b) => (a.weight >= b.weight ? a : b));
        printedWeights.set(largest.key, round1((printedWeights.get(largest.key) ?? 0) + drift));
    }

    const rows: ScoreBreakdownRow[] = dimensions.map((dimension) => {
        const weight = printedWeights.get(dimension.key) ?? 0;
        if (weight <= 0) {
            return { key: dimension.key, name: dimension.label, score: null, weight: 0, weighted: null };
        }
        const score = Math.round(dimension.score);
        return {
            key: dimension.key,
            name: dimension.label,
            score,
            weight,
            weighted: round1((score * weight) / 100),
        };
    });

    const totalWeight = round1(rows.reduce((sum, row) => sum + row.weight, 0));
    const totalWeighted = round1(rows.reduce((sum, row) => sum + (row.weighted ?? 0), 0));
    const finalScore = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) : 0;

    return { rows, totalWeight, totalWeighted, finalScore };
}

/**
 * Page-weighted mean of the per-device platform averages — the single
 * canonical "overall score" for a multi-page/multi-device audit (Phase 6.1
 * / N1: the headline must be reproducible from the platform table printed
 * beneath it). Exported so the scorecard, the executive-summary PDF and the
 * dashboard all round the identical number instead of each deriving its own.
 * Returns null when no platform row carries a usable score.
 */
export function computePlatformWeightedScore(
    platforms: Array<{ score?: number | null; pageCount?: number }> | undefined,
): number | null {
    const scored = (platforms || []).filter(
        (platform): platform is { score: number; pageCount?: number } =>
            Boolean(platform) && typeof platform.score === "number" && Number.isFinite(platform.score),
    );
    if (scored.length === 0) {
        return null;
    }

    const weightOf = (platform: { pageCount?: number }): number =>
        Number(platform.pageCount) > 0 ? Number(platform.pageCount) : 1;
    const totalWeight = scored.reduce((sum, platform) => sum + weightOf(platform), 0);
    if (totalWeight <= 0) {
        return null;
    }

    return Math.round(scored.reduce((sum, platform) => sum + platform.score * weightOf(platform), 0) / totalWeight);
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
            issues: [],
            platforms: options.platforms || [],
            wcagSummary: buildWcagSummary([]),
            notApplicableAuditIds: [],
            manualReviewAuditIds: [],
        };
    }

    const primaryDimensionScores = new Map<AuditPrimaryDimensionKey, number[]>();
    const primaryDimensionIssues = new Map<AuditPrimaryDimensionKey, AuditIssueSummary[]>();
    const evaluationDimensionScores = new Map<AuditEvaluationDimensionKey, number[]>();
    const evaluationDimensionIssues = new Map<AuditEvaluationDimensionKey, AuditIssueSummary[]>();
    // Phase 10 (N7 residual): a dimension counts as active site-wide if *any*
    // page actually evaluated it, and its weight is then the PRD constant —
    // not whatever the last-iterated page happened to report, which made the
    // aggregate weight depend on page ordering rather than on the data.
    const evaluationDimensionActive = new Map<AuditEvaluationDimensionKey, boolean>();
    const evaluationDimensionIssueCounts = new Map<AuditEvaluationDimensionKey, number>();

    for (const key of PRIMARY_DIMENSION_ORDER) {
        primaryDimensionScores.set(key, []);
        primaryDimensionIssues.set(key, []);
    }

    for (const key of EVALUATION_DIMENSION_ORDER) {
        evaluationDimensionScores.set(key, []);
        evaluationDimensionIssues.set(key, []);
        evaluationDimensionActive.set(key, false);
        evaluationDimensionIssueCounts.set(key, 0);
    }

    let pageCount = 0;

    for (const scorecard of scorecards) {
        pageCount += Number(scorecard.pageCount) || 1;

        for (const dimension of scorecard.dimensions || []) {
            primaryDimensionScores.get(dimension.key)?.push(Number(dimension.score) || 0);
            primaryDimensionIssues.get(dimension.key)?.push(...(Array.isArray(dimension.topIssues) ? dimension.topIssues : []));
        }

        for (const evaluationDimension of scorecard.evaluationDimensions || []) {
            // Phase 10 (N7 residual): only pages that actually evaluated this
            // dimension contribute to its average. A page that reported it Not
            // Applicable carries score 0 / weight 0, and averaging that 0 in
            // dragged the site-wide component below every per-page value the
            // full report prints (e.g. one scored page at 60% + one N/A page
            // printed 30% in the executive summary).
            if ((Number(evaluationDimension.weight) || 0) > 0) {
                evaluationDimensionScores.get(evaluationDimension.key)?.push(Number(evaluationDimension.score) || 0);
                evaluationDimensionActive.set(evaluationDimension.key, true);
            }
            evaluationDimensionIssues
                .get(evaluationDimension.key)
                ?.push(...(Array.isArray(evaluationDimension.topIssues) ? evaluationDimension.topIssues : []));
            evaluationDimensionIssueCounts.set(
                evaluationDimension.key,
                (evaluationDimensionIssueCounts.get(evaluationDimension.key) || 0) + (Number(evaluationDimension.issueCount) || 0),
            );
        }
    }

    const evaluationDimensions = EVALUATION_DIMENSION_ORDER.map((evaluationKey) => {
        const scores = evaluationDimensionScores.get(evaluationKey) || [];
        const score = scores.length ? roundScore(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;

        return {
            key: evaluationKey,
            label: EVALUATION_DIMENSION_LABELS[evaluationKey],
            score,
            weight: evaluationDimensionActive.get(evaluationKey) ? EVALUATION_DIMENSION_PRD_WEIGHTS[evaluationKey] : 0,
            // True total across pages, not the length of the capped per-page
            // topIssues lists this map collects for display.
            issueCount: evaluationDimensionIssueCounts.get(evaluationKey) || 0,
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

    // Phase 10 (N1 residual): one canonical overall score for the whole audit.
    // When platform rows are supplied it is the page-weighted mean of those
    // rows — the exact number the executive summary prints as its headline and
    // renders in the table beneath it — so the PDF headline, the stored
    // record.score shown in the dashboard, and scoreCard.overallScore can no
    // longer be three different numbers for the same scan (previously up to 8
    // points apart). With no platform rows (e.g. a per-device aggregate) it
    // falls back to the breakdown-table arithmetic used for a single page.
    const overallScore = computePlatformWeightedScore(options.platforms) ?? primaryScores.overallScore;

    // Phase 10 (F1 residual): the site-wide issue set is collected from each
    // page's COMPLETE `issues` array, not from its evaluationDimensions'
    // topIssues — those are capped at 3 per dimension for display, so from the
    // 4th failing audit in any one dimension the rest were silently dropped.
    // Everything downstream reads this list (the WCAG matrix stamped on every
    // page of the full report, wcagSummary, and the executive summary's
    // flagged-criteria count), so the cap made the matrix print "Pass" for
    // criteria the same page's own evidence section showed failing.
    // Falls back to the dimension-collected lists for callers that hand us
    // scorecards without a populated `issues` array.
    const collectedPageIssues = scorecards.flatMap((scorecard) =>
        Array.isArray(scorecard.issues) ? scorecard.issues : [],
    );
    const sourceIssues = collectedPageIssues.length > 0
        ? collectedPageIssues
        : [...evaluationDimensionIssues.values()].flat();
    // Phase 6.7c / N10c: platform attribution comes off the full pre-dedupe set.
    const platformsByAuditId = collectPlatformsByAuditId(sourceIssues);
    const allIssues = dedupeIssues(sourceIssues);
    // Phase 6.8/6.6/6.7b (N14, N9, N10b): breadth-ranked, one headline per
    // audit id and per WCAG criterion — see buildBreadthRankedTopIssues.
    const topIssues = buildBreadthRankedTopIssues(allIssues, 5, platformsByAuditId);

    // An audit is notApplicable at aggregate level only if every page said so (intersection)
    const notApplicableSets = scorecards.map((sc) => new Set(sc.notApplicableAuditIds || []));
    const firstSet = notApplicableSets[0] || new Set<string>();
    const notApplicableAuditIds = [...firstSet].filter((id) => notApplicableSets.every((set) => set.has(id)));

    // An audit needs manual review at aggregate level if ANY page flagged it (union)
    const manualReviewAuditIds = [...new Set(scorecards.flatMap((sc) => sc.manualReviewAuditIds || []))];

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
        issues: allIssues,
        platforms: options.platforms || [],
        wcagSummary: buildWcagSummary(allIssues),
        notApplicableAuditIds,
        manualReviewAuditIds,
    };
}
