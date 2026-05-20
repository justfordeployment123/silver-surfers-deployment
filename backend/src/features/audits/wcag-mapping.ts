export type WcagLevel = "A" | "AA" | "AAA";
export type WcagVersion = "2.0" | "2.1" | "2.2";
export type WcagPourPrinciple = "perceivable" | "operable" | "understandable" | "robust";
export type WcagReferenceSource = "axe-core" | "silver-surfers" | "scanner";

export interface WcagReference {
    criterion: string;
    title: string;
    level: WcagLevel;
    version: WcagVersion;
    principle: WcagPourPrinciple;
    guideline: string;
    url: string;
    source: WcagReferenceSource;
}

export interface WcagSummary {
    totalIssues: number;
    criteriaCount: number;
    byPrinciple: Record<WcagPourPrinciple, number>;
    byLevel: Record<WcagLevel, number>;
    criteria: WcagReference[];
}

interface AuditWithAxeTags {
    axeTags?: unknown;
    details?: {
        items?: Array<{ axeTags?: unknown }>;
    };
}

const WCAG_BASE_URL = "https://www.w3.org/WAI/WCAG22/Understanding";

const CRITERIA: Record<string, Omit<WcagReference, "source">> = {
    "1.1.1": ref("1.1.1", "Non-text Content", "A", "2.0", "perceivable", "Text Alternatives", "non-text-content"),
    "1.2.1": ref("1.2.1", "Audio-only and Video-only (Prerecorded)", "A", "2.0", "perceivable", "Time-based Media", "audio-only-and-video-only-prerecorded"),
    "1.2.2": ref("1.2.2", "Captions (Prerecorded)", "A", "2.0", "perceivable", "Time-based Media", "captions-prerecorded"),
    "1.2.3": ref("1.2.3", "Audio Description or Media Alternative (Prerecorded)", "A", "2.0", "perceivable", "Time-based Media", "audio-description-or-media-alternative-prerecorded"),
    "1.2.4": ref("1.2.4", "Captions (Live)", "AA", "2.0", "perceivable", "Time-based Media", "captions-live"),
    "1.2.5": ref("1.2.5", "Audio Description (Prerecorded)", "AA", "2.0", "perceivable", "Time-based Media", "audio-description-prerecorded"),
    "1.3.1": ref("1.3.1", "Info and Relationships", "A", "2.0", "perceivable", "Adaptable", "info-and-relationships"),
    "1.3.2": ref("1.3.2", "Meaningful Sequence", "A", "2.0", "perceivable", "Adaptable", "meaningful-sequence"),
    "1.3.3": ref("1.3.3", "Sensory Characteristics", "A", "2.0", "perceivable", "Adaptable", "sensory-characteristics"),
    "1.3.4": ref("1.3.4", "Orientation", "AA", "2.1", "perceivable", "Adaptable", "orientation"),
    "1.3.5": ref("1.3.5", "Identify Input Purpose", "AA", "2.1", "perceivable", "Adaptable", "identify-input-purpose"),
    "1.4.1": ref("1.4.1", "Use of Color", "A", "2.0", "perceivable", "Distinguishable", "use-of-color"),
    "1.4.2": ref("1.4.2", "Audio Control", "A", "2.0", "perceivable", "Distinguishable", "audio-control"),
    "1.4.3": ref("1.4.3", "Contrast (Minimum)", "AA", "2.0", "perceivable", "Distinguishable", "contrast-minimum"),
    "1.4.4": ref("1.4.4", "Resize Text", "AA", "2.0", "perceivable", "Distinguishable", "resize-text"),
    "1.4.5": ref("1.4.5", "Images of Text", "AA", "2.0", "perceivable", "Distinguishable", "images-of-text"),
    "1.4.10": ref("1.4.10", "Reflow", "AA", "2.1", "perceivable", "Distinguishable", "reflow"),
    "1.4.11": ref("1.4.11", "Non-text Contrast", "AA", "2.1", "perceivable", "Distinguishable", "non-text-contrast"),
    "1.4.12": ref("1.4.12", "Text Spacing", "AA", "2.1", "perceivable", "Distinguishable", "text-spacing"),
    "1.4.13": ref("1.4.13", "Content on Hover or Focus", "AA", "2.1", "perceivable", "Distinguishable", "content-on-hover-or-focus"),
    "2.1.1": ref("2.1.1", "Keyboard", "A", "2.0", "operable", "Keyboard Accessible", "keyboard"),
    "2.1.2": ref("2.1.2", "No Keyboard Trap", "A", "2.0", "operable", "Keyboard Accessible", "no-keyboard-trap"),
    "2.1.4": ref("2.1.4", "Character Key Shortcuts", "A", "2.1", "operable", "Keyboard Accessible", "character-key-shortcuts"),
    "2.2.1": ref("2.2.1", "Timing Adjustable", "A", "2.0", "operable", "Enough Time", "timing-adjustable"),
    "2.2.2": ref("2.2.2", "Pause, Stop, Hide", "A", "2.0", "operable", "Enough Time", "pause-stop-hide"),
    "2.3.1": ref("2.3.1", "Three Flashes or Below Threshold", "A", "2.0", "operable", "Seizures and Physical Reactions", "three-flashes-or-below-threshold"),
    "2.4.1": ref("2.4.1", "Bypass Blocks", "A", "2.0", "operable", "Navigable", "bypass-blocks"),
    "2.4.2": ref("2.4.2", "Page Titled", "A", "2.0", "operable", "Navigable", "page-titled"),
    "2.4.3": ref("2.4.3", "Focus Order", "A", "2.0", "operable", "Navigable", "focus-order"),
    "2.4.4": ref("2.4.4", "Link Purpose (In Context)", "A", "2.0", "operable", "Navigable", "link-purpose-in-context"),
    "2.4.5": ref("2.4.5", "Multiple Ways", "AA", "2.0", "operable", "Navigable", "multiple-ways"),
    "2.4.6": ref("2.4.6", "Headings and Labels", "AA", "2.0", "operable", "Navigable", "headings-and-labels"),
    "2.4.7": ref("2.4.7", "Focus Visible", "AA", "2.0", "operable", "Navigable", "focus-visible"),
    "2.4.11": ref("2.4.11", "Focus Not Obscured (Minimum)", "AA", "2.2", "operable", "Navigable", "focus-not-obscured-minimum"),
    "2.5.1": ref("2.5.1", "Pointer Gestures", "A", "2.1", "operable", "Input Modalities", "pointer-gestures"),
    "2.5.2": ref("2.5.2", "Pointer Cancellation", "A", "2.1", "operable", "Input Modalities", "pointer-cancellation"),
    "2.5.3": ref("2.5.3", "Label in Name", "A", "2.1", "operable", "Input Modalities", "label-in-name"),
    "2.5.4": ref("2.5.4", "Motion Actuation", "A", "2.1", "operable", "Input Modalities", "motion-actuation"),
    "2.5.7": ref("2.5.7", "Dragging Movements", "AA", "2.2", "operable", "Input Modalities", "dragging-movements"),
    "2.5.8": ref("2.5.8", "Target Size (Minimum)", "AA", "2.2", "operable", "Input Modalities", "target-size-minimum"),
    "3.1.1": ref("3.1.1", "Language of Page", "A", "2.0", "understandable", "Readable", "language-of-page"),
    "3.1.2": ref("3.1.2", "Language of Parts", "AA", "2.0", "understandable", "Readable", "language-of-parts"),
    "3.1.5": ref("3.1.5", "Reading Level", "AAA", "2.0", "understandable", "Readable", "reading-level"),
    "3.2.1": ref("3.2.1", "On Focus", "A", "2.0", "understandable", "Predictable", "on-focus"),
    "3.2.2": ref("3.2.2", "On Input", "A", "2.0", "understandable", "Predictable", "on-input"),
    "3.2.3": ref("3.2.3", "Consistent Navigation", "AA", "2.0", "understandable", "Predictable", "consistent-navigation"),
    "3.2.4": ref("3.2.4", "Consistent Identification", "AA", "2.0", "understandable", "Predictable", "consistent-identification"),
    "3.2.6": ref("3.2.6", "Consistent Help", "A", "2.2", "understandable", "Predictable", "consistent-help"),
    "3.3.1": ref("3.3.1", "Error Identification", "A", "2.0", "understandable", "Input Assistance", "error-identification"),
    "3.3.2": ref("3.3.2", "Labels or Instructions", "A", "2.0", "understandable", "Input Assistance", "labels-or-instructions"),
    "3.3.3": ref("3.3.3", "Error Suggestion", "AA", "2.0", "understandable", "Input Assistance", "error-suggestion"),
    "3.3.4": ref("3.3.4", "Error Prevention (Legal, Financial, Data)", "AA", "2.0", "understandable", "Input Assistance", "error-prevention-legal-financial-data"),
    "3.3.7": ref("3.3.7", "Redundant Entry", "A", "2.2", "understandable", "Input Assistance", "redundant-entry"),
    "3.3.8": ref("3.3.8", "Accessible Authentication (Minimum)", "AA", "2.2", "understandable", "Input Assistance", "accessible-authentication-minimum"),
    "4.1.1": ref("4.1.1", "Parsing", "A", "2.0", "robust", "Compatible", "parsing"),
    "4.1.2": ref("4.1.2", "Name, Role, Value", "A", "2.0", "robust", "Compatible", "name-role-value"),
    "4.1.3": ref("4.1.3", "Status Messages", "AA", "2.1", "robust", "Compatible", "status-messages"),
};

const STATIC_AUDIT_MAPPINGS: Record<string, string[]> = {
    "color-contrast": ["1.4.3"],
    "target-size": ["2.5.8"],
    viewport: ["1.4.10"],
    "layout-brittle-audit": ["1.4.10", "1.4.12"],
    "line-spacing-audit": ["1.4.12"],
    "text-font-audit": ["1.4.4", "1.4.12"],
    "flesch-kincaid-audit": ["3.1.5"],
    "link-name": ["2.4.4"],
    "button-name": ["4.1.2", "2.5.3"],
    label: ["3.3.2", "1.3.1"],
    "heading-order": ["1.3.1", "2.4.6"],
    "image-alt": ["1.1.1"],
    "focus-traps": ["2.1.2"],
    bypass: ["2.4.1"],
    "interactive-color-audit": ["1.4.1", "1.4.11"],
    "autoplay-audit": ["1.4.2", "2.2.2"],
};

function ref(
    criterion: string,
    title: string,
    level: WcagLevel,
    version: WcagVersion,
    principle: WcagPourPrinciple,
    guideline: string,
    slug: string,
): Omit<WcagReference, "source"> {
    return {
        criterion,
        title,
        level,
        version,
        principle,
        guideline,
        url: `${WCAG_BASE_URL}/${slug}.html`,
    };
}

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function criterionFromAxeTag(tag: string): string | null {
    const match = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
    if (!match) {
        return null;
    }

    return `${match[1]}.${match[2]}.${Number(match[3])}`;
}

function collectAxeTags(audit: AuditWithAxeTags | undefined): string[] {
    const tags = new Set<string>();
    const addTags = (value: unknown) => {
        if (!Array.isArray(value)) {
            return;
        }
        for (const tag of value) {
            if (typeof tag === "string") {
                tags.add(tag);
            }
        }
    };

    addTags(audit?.axeTags);
    for (const item of audit?.details?.items || []) {
        addTags(item.axeTags);
    }

    return [...tags];
}

export function getWcagReference(criterion: string, source: WcagReferenceSource): WcagReference | null {
    const reference = CRITERIA[criterion];
    if (!reference) {
        return null;
    }

    return { ...reference, source };
}

export function resolveWcagReferencesForAudit(auditId: string, audit?: AuditWithAxeTags): WcagReference[] {
    const staticCriteria = STATIC_AUDIT_MAPPINGS[auditId] || [];
    const axeCriteria = collectAxeTags(audit)
        .map(criterionFromAxeTag)
        .filter((criterion): criterion is string => Boolean(criterion));

    const references = new Map<string, WcagReference>();
    for (const criterion of uniqueStrings(staticCriteria)) {
        const reference = getWcagReference(criterion, "silver-surfers");
        if (reference) {
            references.set(reference.criterion, reference);
        }
    }

    for (const criterion of uniqueStrings(axeCriteria)) {
        const reference = getWcagReference(criterion, "axe-core");
        if (reference) {
            references.set(reference.criterion, reference);
        }
    }

    return [...references.values()].sort((left, right) => left.criterion.localeCompare(right.criterion, undefined, { numeric: true }));
}

export function buildWcagSummary(issues: Array<{ wcagReferences?: WcagReference[] }>): WcagSummary {
    const referencesByCriterion = new Map<string, WcagReference>();
    const byPrinciple: Record<WcagPourPrinciple, number> = {
        perceivable: 0,
        operable: 0,
        understandable: 0,
        robust: 0,
    };
    const byLevel: Record<WcagLevel, number> = {
        A: 0,
        AA: 0,
        AAA: 0,
    };

    for (const issue of issues) {
        const issuePrinciples = new Set<WcagPourPrinciple>();
        const issueLevels = new Set<WcagLevel>();
        for (const reference of issue.wcagReferences || []) {
            referencesByCriterion.set(reference.criterion, reference);
            issuePrinciples.add(reference.principle);
            issueLevels.add(reference.level);
        }
        for (const principle of issuePrinciples) {
            byPrinciple[principle] += 1;
        }
        for (const level of issueLevels) {
            byLevel[level] += 1;
        }
    }

    return {
        totalIssues: issues.length,
        criteriaCount: referencesByCriterion.size,
        byPrinciple,
        byLevel,
        criteria: [...referencesByCriterion.values()].sort((left, right) =>
            left.criterion.localeCompare(right.criterion, undefined, { numeric: true }),
        ),
    };
}
