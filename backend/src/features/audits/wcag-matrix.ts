import type { AuditIssueSummary } from "./audit-scorecard.ts";
import {
    CRITERION_AUDIT_MAP,
    MANUAL_ONLY_CRITERIA,
    WCAG_CRITERIA_REGISTRY,
    type WcagEvidenceSource,
    type WcagMatrix,
    type WcagMatrixRow,
    type WcagMatrixSummary,
    type WcagPourPrinciple,
} from "./wcag-mapping.ts";

// Criteria where our scanner can detect violations via DOM inspection but cannot confirm a pass.
// When no violation is found, status becomes "needs-review" rather than "pass".
const PARTIAL_COVERAGE_CRITERIA: Record<string, string> = {
    "2.1.1": "DOM inspection detects elements removed from the tab order, but confirming that ALL functionality is operable by keyboard requires manual navigation testing.",
    "2.1.2": "Dialog close-button detection covers the most common trap pattern, but complex custom focus-management widgets may still trap keyboard users and require manual verification.",
};

// All A/AA criteria IDs in display order — excludes 3.1.5 (AAA only)
const AA_CRITERIA_ORDER: string[] = Object.keys(WCAG_CRITERIA_REGISTRY).filter(
    (id) => WCAG_CRITERIA_REGISTRY[id].level !== "AAA",
);

function resolveEvidenceSource(auditIds: string[]): WcagEvidenceSource {
    if (auditIds.some((id) => id.startsWith("axe-"))) return "axe-core";
    if (auditIds.some((id) => id.startsWith("ss-"))) return "silver-surfers";
    if (auditIds.length > 0) return "silver-surfers";
    return "none";
}

function collectAffectedElements(issues: AuditIssueSummary[]): string[] {
    const elements = new Set<string>();
    for (const issue of issues) {
        if (issue.displayValue) elements.add(issue.displayValue);
        if (issue.sourceUrl) elements.add(issue.sourceUrl);
    }
    return [...elements].slice(0, 10);
}

export function buildWcagMatrix(issues: AuditIssueSummary[], notApplicableAuditIds: string[] = [], manualReviewAuditIds: string[] = []): WcagMatrix {
    const notApplicableSet = new Set(notApplicableAuditIds);
    const manualReviewSet = new Set(manualReviewAuditIds);

    // Build a map of failed criterion ID → matching issues
    const failedCriteriaMap = new Map<string, AuditIssueSummary[]>();

    for (const issue of issues) {
        for (const criterion of issue.wcagCriteria || []) {
            const existing = failedCriteriaMap.get(criterion) || [];
            existing.push(issue);
            failedCriteriaMap.set(criterion, existing);
        }
    }

    return AA_CRITERIA_ORDER.map((criterion): WcagMatrixRow => {
        const def = WCAG_CRITERIA_REGISTRY[criterion];

        // 4.1.1 (Parsing) was removed from WCAG 2.2 — mark not-applicable
        if (criterion === "4.1.1") {
            return {
                criterion,
                title: def.title,
                level: def.level,
                principle: def.principle,
                status: "not-applicable",
                evidenceSource: "none",
                affectedElements: [],
                issueCount: 0,
                remediationGuidance: "",
                manualReviewRequired: false,
                manualReviewReason: "This criterion was removed from WCAG 2.2 and is no longer applicable.",
            };
        }

        // Manual-only criteria
        if (MANUAL_ONLY_CRITERIA[criterion]) {
            return {
                criterion,
                title: def.title,
                level: def.level,
                principle: def.principle,
                status: "needs-review",
                evidenceSource: "manual-only",
                affectedElements: [],
                issueCount: 0,
                remediationGuidance: "",
                manualReviewRequired: true,
                manualReviewReason: MANUAL_ONLY_CRITERIA[criterion],
            };
        }

        // Failed — at least one issue references this criterion
        if (failedCriteriaMap.has(criterion)) {
            const matchingIssues = failedCriteriaMap.get(criterion)!;
            const auditIds = matchingIssues.map((i) => i.auditId);
            return {
                criterion,
                title: def.title,
                level: def.level,
                principle: def.principle,
                status: "fail",
                evidenceSource: resolveEvidenceSource(auditIds),
                affectedElements: collectAffectedElements(matchingIssues),
                issueCount: matchingIssues.length,
                remediationGuidance: "",
                manualReviewRequired: false,
            };
        }

        // Pass or not-applicable depending on whether any audits cover this criterion.
        // Partial-coverage criteria: scanner can flag violations but cannot confirm a clean pass —
        // return needs-review so the client knows manual verification is still required.
        const mappedAuditIds = CRITERION_AUDIT_MAP[criterion] || [];
        if (mappedAuditIds.length > 0) {
            // If every mapped audit explicitly returned notApplicable, the criterion doesn't apply
            if (notApplicableSet.size > 0 && mappedAuditIds.every((id) => notApplicableSet.has(id))) {
                return {
                    criterion,
                    title: def.title,
                    level: def.level,
                    principle: def.principle,
                    status: "not-applicable",
                    evidenceSource: resolveEvidenceSource(mappedAuditIds),
                    affectedElements: [],
                    issueCount: 0,
                    remediationGuidance: "",
                    manualReviewRequired: false,
                };
            }

            // If any mapped audit returned "manual" the scanner flagged a risk but cannot auto-confirm —
            // surface as needs-review rather than silently passing.
            if (mappedAuditIds.some((id) => manualReviewSet.has(id))) {
                return {
                    criterion,
                    title: def.title,
                    level: def.level,
                    principle: def.principle,
                    status: "needs-review",
                    evidenceSource: resolveEvidenceSource(mappedAuditIds),
                    affectedElements: [],
                    issueCount: 0,
                    remediationGuidance: "",
                    manualReviewRequired: true,
                    manualReviewReason: "The scanner detected a potential issue that requires manual verification to confirm.",
                };
            }

            if (PARTIAL_COVERAGE_CRITERIA[criterion]) {
                return {
                    criterion,
                    title: def.title,
                    level: def.level,
                    principle: def.principle,
                    status: "needs-review",
                    evidenceSource: resolveEvidenceSource(mappedAuditIds),
                    affectedElements: [],
                    issueCount: 0,
                    remediationGuidance: "",
                    manualReviewRequired: true,
                    manualReviewReason: PARTIAL_COVERAGE_CRITERIA[criterion],
                };
            }
            return {
                criterion,
                title: def.title,
                level: def.level,
                principle: def.principle,
                status: "pass",
                evidenceSource: resolveEvidenceSource(mappedAuditIds),
                affectedElements: [],
                issueCount: 0,
                remediationGuidance: "",
                manualReviewRequired: false,
            };
        }

        return {
            criterion,
            title: def.title,
            level: def.level,
            principle: def.principle,
            status: "not-applicable",
            evidenceSource: "none",
            affectedElements: [],
            issueCount: 0,
            remediationGuidance: "",
            manualReviewRequired: false,
        };
    });
}

export function buildWcagMatrixSummary(matrix: WcagMatrix): WcagMatrixSummary {
    const byPrinciple: Record<WcagPourPrinciple, number> = {
        perceivable: 0,
        operable: 0,
        understandable: 0,
        robust: 0,
    };

    let passed = 0;
    let failed = 0;
    let needsReview = 0;
    let notApplicable = 0;

    for (const row of matrix) {
        if (row.status === "fail") {
            failed += 1;
            byPrinciple[row.principle] += 1;
        } else if (row.status === "pass") {
            passed += 1;
        } else if (row.status === "needs-review") {
            needsReview += 1;
        } else {
            notApplicable += 1;
        }
    }

    return {
        totalCriteria: matrix.length,
        passed,
        failed,
        needsReview,
        notApplicable,
        byPrinciple,
    };
}
