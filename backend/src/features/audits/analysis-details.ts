import type { QueueReportStorage } from "../../infrastructure/queues/job-queue.ts";
import type { AuditAiReport } from "./ai-reporting.ts";
import type {
    AuditPrimaryDimensionKey,
    AuditPrimaryDimensionScore,
    AuditEvaluationDimensionKey,
    AuditEvaluationDimensionScore,
    AuditIssueSummary,
    AuditPlatformScore,
    AuditRiskTier,
    AuditIssueSourceType,
    AuditScorecard,
    AuditScoreStatus,
} from "./audit-scorecard.ts";
import type { FullAuditDevice, FullAuditScannerMode } from "./full-audit.helpers.ts";
import {
    buildAnalysisReportFileViews,
    normalizeStoredReportFiles,
    type AnalysisReportFileView,
    type StoredReportFile,
} from "./report-files.ts";
import { getCertificationEligibility, type CertificationEligibility } from "./certification-eligibility.ts";
import type { WcagPourPrinciple, WcagReference } from "./wcag-mapping.ts";

export type AnalysisStatus = "queued" | "processing" | "completed" | "completed_with_warnings" | "failed";
export type AnalysisEmailStatus = "pending" | "sending" | "sent" | "failed";
export type RemediationImpact = "high" | "medium" | "low";
export type RemediationEffort = "low" | "medium" | "high";
export type RemediationBucketKey = "quick-wins" | "medium-effort" | "high-effort";

export interface AnalysisRecordLike {
    _id?: string;
    taskId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    url?: string;
    planId?: string | null;
    device?: string | null;
    score?: number | null;
    scoreCard?: AuditScorecard;
    aiReport?: AuditAiReport;
    status?: string;
    emailStatus?: string;
    attachmentCount?: number;
    failureReason?: string;
    emailError?: string;
    reportDirectory?: string;
    reportStorage?: QueueReportStorage;
    reportFiles?: Array<StoredReportFile | Record<string, unknown>>;
    warnings?: string[];
    plannedTargetCount?: number;
    successfulTargetCount?: number;
    degradedTargetCount?: number;
    failedTargetCount?: number;
    scanTargets?: Array<{
        url: string;
        device: FullAuditDevice;
        isHomepage?: boolean;
        scanModeUsed: FullAuditScannerMode;
        status: "completed" | "failed";
        score?: number | null;
        failureReason?: string;
        errorCode?: string;
        statusCode?: number;
    }>;
    createdAt?: Date | string;
    updatedAt?: Date | string;
}

export interface AnalysisTargetView {
    url: string;
    device: FullAuditDevice;
    isHomepage: boolean;
    scanModeUsed: FullAuditScannerMode;
    status: "completed" | "failed";
    score?: number | null;
    failureReason?: string;
    errorCode?: string;
    statusCode?: number;
}

export interface AnalysisRemediationItem {
    id: string;
    auditId: string;
    title: string;
    dimensionKey: AuditPrimaryDimensionKey;
    dimensionLabel: string;
    evaluationDimensionKey?: AuditEvaluationDimensionKey;
    evaluationDimensionLabel?: string;
    severity: AuditRiskTier;
    currentScore: number;
    impact: RemediationImpact;
    effort: RemediationEffort;
    auditSourceType: AuditIssueSourceType;
    auditSourceLabel: string;
    wcagCriteria?: string[];
    wcagReferences?: WcagReference[];
    wcagPrinciples?: WcagPourPrinciple[];
    bucketKey: RemediationBucketKey;
    bucketLabel: string;
    action: string;
    whyItMatters: string;
    codeSnippet?: string;
    displayValue?: string;
    sourceUrl?: string;
}

export interface AnalysisRemediationBucket {
    key: RemediationBucketKey;
    label: string;
    description: string;
    itemCount: number;
    items: AnalysisRemediationItem[];
}

export interface AnalysisDetailView {
    id?: string;
    taskId: string;
    url: string;
    email?: string;
    fullName?: string;
    planId?: string | null;
    device?: string | null;
    status: AnalysisStatus;
    emailStatus: AnalysisEmailStatus;
    score?: number | null;
    riskTier?: AuditRiskTier;
    scoreStatus?: AuditScoreStatus;
    pageCount: number;
    createdAt?: string;
    updatedAt?: string;
    failureReason?: string;
    emailError?: string;
    attachmentCount: number;
    plannedTargetCount: number;
    successfulTargetCount: number;
    degradedTargetCount: number;
    failedTargetCount: number;
    warnings: string[];
    scanTargets: AnalysisTargetView[];
    reportDirectory?: string;
    reportStorage?: QueueReportStorage;
    reportFiles: AnalysisReportFileView[];
    scorecard?: AuditScorecard;
    aiReport?: AuditAiReport;
    dimensions: AuditPrimaryDimensionScore[];
    evaluationDimensions: AuditEvaluationDimensionScore[];
    topIssues: AuditIssueSummary[];
    remediationRoadmap: AnalysisRemediationItem[];
    remediationBuckets: AnalysisRemediationBucket[];
    certificationEligibility?: CertificationEligibility;
}

interface RemediationTemplate {
    action: string;
    whyItMatters: string;
    effort: RemediationEffort;
    codeSnippet?: string;
}

const REMEDIATION_TEMPLATES: Record<string, RemediationTemplate> = {
    "color-contrast": {
        action: "Increase text and control contrast so key content stays readable for older adults in low-vision and glare-heavy conditions.",
        whyItMatters: "Low contrast makes navigation and reading materially harder for aging users and increases abandonment risk.",
        effort: "medium",
        codeSnippet: `/* Before — contrast ratio ~2.9:1 (fails WCAG AA) */
.body-text { color: #999999; background: #ffffff; }

/* After — contrast ratio 7.0:1 (passes WCAG AA & AAA) */
.body-text { color: #595959; background: #ffffff; }`,
    },
    "text-font-audit": {
        action: "Increase base font sizes and strengthen typography hierarchy so body copy, labels, and helper text are easier to read.",
        whyItMatters: "Legible type improves comprehension and reduces cognitive strain for adults 50+.",
        effort: "medium",
        codeSnippet: `/* Before */
body { font-size: 12px; }
p, li { font-size: 13px; }

/* After — 16px minimum for senior-friendly readability */
body { font-size: 16px; }
p, li { font-size: 16px; }
h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }`,
    },
    viewport: {
        action: "Fix viewport and zoom handling so users can scale content without losing functionality or readability.",
        whyItMatters: "Older adults often depend on browser zoom to comfortably use a site.",
        effort: "low",
        codeSnippet: `<!-- Before — blocks user zoom -->
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">

<!-- After — allows user zoom up to 5× -->
<meta name="viewport" content="width=device-width, initial-scale=1">`,
    },
    "user-scalable-audit": {
        action: "Remove viewport restrictions that block pinch-to-zoom so older adults can enlarge content as needed.",
        whyItMatters: "Many older adults rely on pinch-to-zoom to read small text or interact with small targets. Blocking it removes a critical accessibility mechanism.",
        effort: "low",
        codeSnippet: `<!-- Before — blocks pinch-to-zoom -->
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">

<!-- After — allows pinch-to-zoom -->
<meta name="viewport" content="width=device-width, initial-scale=1">`,
    },
    "horizontal-scroll-audit": {
        action: "Fix content overflow so the entire page fits within the screen width without requiring horizontal scrolling.",
        whyItMatters: "Horizontal scrolling is disorienting and tiring on touch devices. Older adults may miss content or become confused when the page extends beyond the screen edge.",
        effort: "medium",
        codeSnippet: `/* Prevent overflow on common problem elements */
img, video, table, pre {
  max-width: 100%;
}

/* Contain the page root */
body {
  overflow-x: hidden;
}`,
    },
    "text-size-adjust-audit": {
        action: "Remove CSS that disables mobile text scaling to allow browsers to automatically adjust text size for readability.",
        whyItMatters: "Mobile browsers include automatic text sizing to make content readable on small screens. Disabling this via CSS removes a built-in accessibility aid that older adults depend on.",
        effort: "low",
        codeSnippet: `/* Before — disables text scaling */
html {
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
}

/* After — allows browser text scaling */
html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}`,
    },
    "cumulative-layout-shift": {
        action: "Reduce layout shifts by reserving space for dynamic content and stabilizing page loading behavior.",
        whyItMatters: "Unexpected movement causes disorientation and makes target acquisition harder.",
        effort: "medium",
        codeSnippet: `/* Reserve explicit dimensions for images and embeds */
img, video, iframe {
  width: 100%;
  aspect-ratio: 16 / 9; /* or use explicit height */
  height: auto;
}

/* Prevent ad or dynamic content causing shifts */
.ad-slot { min-height: 250px; }`,
    },
    "layout-brittle-audit": {
        action: "Simplify brittle layout patterns that break under zoom, larger text, or smaller screens.",
        whyItMatters: "Stable layouts are critical for older adults who rely on larger text and responsive behavior.",
        effort: "high",
        codeSnippet: `/* Before — fixed pixel layout breaks at zoom */
.container { width: 960px; overflow: hidden; }

/* After — fluid layout that reflows cleanly */
.container {
  width: 100%;
  max-width: 1200px;
  padding: 0 1rem;
  box-sizing: border-box;
}`,
    },
    "flesch-kincaid-audit": {
        action: "Rewrite dense content into clearer, shorter, more plain-language copy with simpler sentence structure.",
        whyItMatters: "Clear language lowers cognitive load and improves comprehension for a wider range of users.",
        effort: "medium",
        codeSnippet: `<!-- Before — complex sentence -->
<p>In order to facilitate the process of account registration, users are required to provide their personal identification details and relevant contact information.</p>

<!-- After — plain language, 8th grade or lower -->
<p>To create an account, enter your name and contact details.</p>`,
    },
    "heading-order": {
        action: "Fix heading structure so page sections follow a clear hierarchy and users can scan content quickly.",
        whyItMatters: "A predictable structure improves orientation and information findability.",
        effort: "low",
        codeSnippet: `<!-- Before — skipped heading levels -->
<h1>Welcome</h1>
<h3>Our Services</h3>  <!-- skipped h2 -->
<h5>Pricing</h5>       <!-- skipped h4 -->

<!-- After — logical hierarchy -->
<h1>Welcome</h1>
<h2>Our Services</h2>
<h3>Pricing</h3>`,
    },
    "dom-size": {
        action: "Reduce unnecessary page complexity and excessive DOM size to improve clarity and performance.",
        whyItMatters: "Overly complex pages increase cognitive load and can slow older devices.",
        effort: "high",
        codeSnippet: `// Use pagination or virtual scrolling instead of rendering all items
// Before — renders 500 rows at once
list.forEach(item => container.appendChild(createRow(item)));

// After — paginate to 20 items per page
const PAGE_SIZE = 20;
function renderPage(page) {
  const slice = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  slice.forEach(item => container.appendChild(createRow(item)));
}`,
    },
    "errors-in-console": {
        action: "Resolve frontend runtime errors that can break interactions, forms, or dynamic content.",
        whyItMatters: "Broken interactions directly damage trust and task completion.",
        effort: "medium",
        codeSnippet: `// Add error boundaries in React components
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <p>Something went wrong. Please try again.</p>;
    return this.props.children;
  }
}`,
    },
    "interactive-color-audit": {
        action: "Improve interactive state styling so links, buttons, and controls are clearly identifiable and consistent.",
        whyItMatters: "Clear interactive cues help older adults understand what can be clicked or tapped.",
        effort: "medium",
        codeSnippet: `/* Before — link looks like body text */
a { color: inherit; text-decoration: none; }

/* After — clearly identifiable interactive element */
a {
  color: #0057b8;
  text-decoration: underline;
}
a:hover, a:focus {
  color: #003d80;
  outline: 2px solid #0057b8;
  outline-offset: 2px;
}`,
    },
    "target-size": {
        action: "Increase tap and click target sizes for buttons, links, and controls across desktop and mobile flows.",
        whyItMatters: "Larger targets materially improve usability for people with reduced dexterity or precision.",
        effort: "medium",
        codeSnippet: `/* Before — too small for reliable tapping */
.btn { padding: 4px 8px; font-size: 12px; }

/* After — 44×44px minimum per WCAG 2.5.8 */
.btn {
  min-width: 44px;
  min-height: 44px;
  padding: 10px 20px;
  font-size: 16px;
}`,
    },
    "link-name": {
        action: "Replace vague link labels with descriptive text that explains the destination or action.",
        whyItMatters: "Descriptive links reduce confusion and improve navigation confidence.",
        effort: "low",
        codeSnippet: `<!-- Before — vague link text -->
<a href="/privacy">Click here</a>
<a href="/report">Read more</a>

<!-- After — descriptive text describes destination -->
<a href="/privacy">Read our privacy policy</a>
<a href="/report">Download your accessibility report</a>`,
    },
    "button-name": {
        action: "Ensure every button has a clear accessible name and visible action label.",
        whyItMatters: "Users need unambiguous calls to action to complete important tasks.",
        effort: "low",
        codeSnippet: `<!-- Before — icon-only button with no accessible name -->
<button><svg aria-hidden="true">...</svg></button>

<!-- After — accessible label for screen readers -->
<button aria-label="Close dialog">
  <svg aria-hidden="true">...</svg>
</button>

<!-- Or use visible text -->
<button>Close <svg aria-hidden="true">...</svg></button>`,
    },
    label: {
        action: "Add explicit form labels, instructions, and helper text for all important input fields.",
        whyItMatters: "Clear forms reduce errors and abandonment in high-friction journeys.",
        effort: "medium",
        codeSnippet: `<!-- Before — no label association -->
<input type="email" placeholder="Email address">

<!-- After — explicit label linked by htmlFor/id -->
<label for="email">Email address</label>
<input
  id="email"
  type="email"
  placeholder="e.g. name@example.com"
  autocomplete="email"
>`,
    },
    "total-blocking-time": {
        action: "Reduce long main-thread tasks and blocking scripts that delay user interaction.",
        whyItMatters: "Delays in interaction create frustration and make tasks feel unreliable.",
        effort: "high",
        codeSnippet: `// Move heavy computation off the main thread using a Web Worker
const worker = new Worker('/js/heavy-task.worker.js');
worker.postMessage({ data: largeDataSet });
worker.onmessage = (e) => renderResults(e.data);

// Or defer non-critical scripts
<script src="analytics.js" defer></script>`,
    },
    "is-on-https": {
        action: "Serve the full experience over HTTPS and remove insecure resource dependencies.",
        whyItMatters: "Security trust signals are essential for older adults sharing sensitive information.",
        effort: "medium",
        codeSnippet: `# nginx — redirect all HTTP to HTTPS
server {
  listen 80;
  server_name silversurfers.ai;
  return 301 https://$host$request_uri;
}

# Force HTTPS in HTML (meta refresh fallback)
<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">`,
    },
    "geolocation-on-start": {
        action: "Avoid requesting location or other intrusive permissions before users understand the benefit.",
        whyItMatters: "Premature permission prompts increase distrust and drop-off.",
        effort: "low",
        codeSnippet: `// Before — requests location immediately on page load
navigator.geolocation.getCurrentPosition(onSuccess, onError);

// After — only request when user explicitly asks for it
document.getElementById('find-near-me-btn').addEventListener('click', () => {
  navigator.geolocation.getCurrentPosition(onSuccess, onError);
});`,
    },
    "image-alt": {
        action: "Add descriptive alt text to all informational images so screen reader users and assistive technology can understand the content.",
        whyItMatters:
            "Missing alt text makes images invisible to assistive technology, which disproportionately affects older adults who use screen readers or voice browsers.",
        effort: "low",
        codeSnippet: `<!-- Before — missing alt text -->
<img src="hero.jpg">
<img src="chart.png">

<!-- After — descriptive alt for informational images -->
<img src="hero.jpg" alt="Doctor and patient reviewing a digital health chart together">

<!-- Decorative images should use empty alt so screen readers skip them -->
<img src="divider.png" alt="" role="presentation">`,
    },
    "focus-traps": {
        action: "Ensure keyboard focus is never trapped inside a component (modal, widget, or dialog) unless the user explicitly entered it, and provide a clear way to exit.",
        whyItMatters:
            "Keyboard-only users — including older adults who cannot use a mouse — become completely stuck on pages with focus traps.",
        effort: "medium",
        codeSnippet: `// On modal open — move focus to the dialog
modal.addEventListener('open', () => {
  modal.querySelector('[autofocus], button, [href], input').focus();
});

// On modal close — return focus to the element that triggered it
modal.addEventListener('close', () => {
  triggerButton.focus();
});

// Trap focus inside the dialog while open
modal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') modal.close();
});`,
    },
    bypass: {
        action: 'Add a "Skip to main content" link at the top of every page so keyboard users can bypass the navigation menu.',
        whyItMatters:
            "Without skip navigation, keyboard-only users must tab through every menu item on every page — an exhausting and frustrating experience for older adults.",
        effort: "low",
        codeSnippet: `<!-- Add as the very first element inside <body> -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<nav>...</nav>

<main id="main-content">
  <!-- Page content here -->
</main>

<!-- CSS: visible only on focus -->
.skip-link {
  position: absolute;
  left: -9999px;
  padding: 8px 16px;
  background: #000;
  color: #fff;
  font-size: 1rem;
  z-index: 9999;
}
.skip-link:focus { left: 0; top: 0; }`,
    },
    "line-spacing-audit": {
        action: "Increase line-height on body text, paragraphs, and list items to at least 1.5× the font size.",
        whyItMatters:
            "Tight line spacing strains the eyes of older adults and makes it harder to track from the end of one line to the start of the next.",
        effort: "low",
        codeSnippet: `/* Before — browser default ~1.2 line height */
p { font-size: 16px; line-height: 1.2; }

/* After — 1.5× minimum for senior accessibility */
p,
li,
dd,
label,
.body-text {
  font-size: 16px;
  line-height: 1.5; /* = 24px at 16px font size */
}`,
    },
    "autoplay-audit": {
        action: "Remove the autoplay attribute from all audio and video elements and give users a visible play button to start media on their own terms.",
        whyItMatters:
            "Unexpected sounds and moving video are disorienting and distressing for older adults, particularly those using screen readers or with cognitive sensitivities.",
        effort: "low",
        codeSnippet: `<!-- Before — autoplays and may lack captions -->
<video autoplay src="intro.mp4"></video>
<audio autoplay src="background.mp3"></audio>

<!-- After — user-controlled with captions -->
<video controls src="intro.mp4">
  <track kind="captions" src="intro.vtt" srclang="en" label="English">
  Your browser does not support HTML5 video.
</video>`,
    },
};

const ROADMAP_BUCKETS: Record<RemediationBucketKey, { label: string; description: string }> = {
    "quick-wins": {
        label: "Quick Wins",
        description: "Lower-effort improvements that can remove friction quickly and raise usability confidence fast.",
    },
    "medium-effort": {
        label: "Medium Effort",
        description: "Moderate implementation work with meaningful accessibility and usability payoff.",
    },
    "high-effort": {
        label: "High Effort",
        description: "Bigger redesign or engineering work that should be planned as a larger remediation phase.",
    },
};

function normalizeDate(value: Date | string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    return date.toISOString();
}

function normalizeStatus(value: string | undefined): AnalysisStatus {
    if (value === "processing" || value === "completed" || value === "completed_with_warnings" || value === "failed") {
        return value;
    }

    return "queued";
}

function normalizeEmailStatus(value: string | undefined): AnalysisEmailStatus {
    if (value === "sending" || value === "sent" || value === "failed") {
        return value;
    }

    return "pending";
}

function normalizeAiReport(report: AuditAiReport | undefined): AuditAiReport | undefined {
    if (!report) {
        return undefined;
    }

    return {
        ...report,
        generatedAt: normalizeDate(report.generatedAt) || new Date().toISOString(),
        topRecommendations: Array.isArray(report.topRecommendations)
            ? report.topRecommendations.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
        perFindingGuidance: Array.isArray(report.perFindingGuidance)
            ? report.perFindingGuidance
                  .map((item) => ({
                      auditId: String(item?.auditId || "").trim(),
                      title: String(item?.title || "").trim(),
                      explanation: String(item?.explanation || "").trim(),
                      remediation: String(item?.remediation || "").trim(),
                      wcagCriteria: Array.isArray(item?.wcagCriteria)
                          ? item.wcagCriteria.map((criterion) => String(criterion || "").trim()).filter(Boolean)
                          : [],
                  }))
                  .filter((item) => item.auditId && item.title && item.explanation && item.remediation)
            : [],
    };
}

function getImpact(issue: AuditIssueSummary): RemediationImpact {
    if (issue.severity === "high" || issue.weight >= 8) {
        return "high";
    }

    if (issue.severity === "medium" || issue.weight >= 4) {
        return "medium";
    }

    return "low";
}

function getFallbackEffort(issue: AuditIssueSummary): RemediationEffort {
    if (issue.weight >= 8) {
        return "high";
    }

    if (issue.weight >= 4) {
        return "medium";
    }

    return "low";
}

function getTemplate(issue: AuditIssueSummary): RemediationTemplate {
    return (
        REMEDIATION_TEMPLATES[issue.auditId] || {
            action: "Review this failing audit and implement a code or content fix that removes the accessibility barrier for older adults.",
            whyItMatters: "This issue is contributing to a lower Silver Score and a weaker user experience for the 50+ audience.",
            effort: getFallbackEffort(issue),
        }
    );
}

function getIssueIdentity(issue: Pick<AuditIssueSummary, "auditId" | "sourceUrl">): string {
    return `${issue.auditId}:${issue.sourceUrl || ""}`;
}

function getRemediationBucket(effort: RemediationEffort): RemediationBucketKey {
    if (effort === "low") {
        return "quick-wins";
    }

    if (effort === "high") {
        return "high-effort";
    }

    return "medium-effort";
}

function rankImpact(impact: RemediationImpact): number {
    if (impact === "high") {
        return 0;
    }

    if (impact === "medium") {
        return 1;
    }

    return 2;
}

function rankEffort(effort: RemediationEffort): number {
    if (effort === "low") {
        return 0;
    }

    if (effort === "medium") {
        return 1;
    }

    return 2;
}

function rankBucket(bucket: RemediationBucketKey): number {
    if (bucket === "quick-wins") {
        return 0;
    }

    if (bucket === "medium-effort") {
        return 1;
    }

    return 2;
}

function buildEvaluationDimensionLookup(
    scorecard: AuditScorecard | undefined,
): Map<string, { key: AuditEvaluationDimensionKey; label: string }> {
    const lookup = new Map<string, { key: AuditEvaluationDimensionKey; label: string }>();

    for (const dimension of scorecard?.evaluationDimensions || []) {
        for (const issue of dimension.topIssues || []) {
            lookup.set(getIssueIdentity(issue), {
                key: dimension.key,
                label: dimension.label,
            });
        }
    }

    return lookup;
}

export function buildRemediationRoadmap(scorecard: AuditScorecard | undefined): AnalysisRemediationItem[] {
    const scoreDimensions = scorecard?.dimensions || [];
    if (!scoreDimensions.length) {
        return [];
    }

    const items = new Map<string, AnalysisRemediationItem>();
    const evaluationDimensionLookup = buildEvaluationDimensionLookup(scorecard);

    for (const dimension of scoreDimensions) {
        for (const issue of dimension.topIssues || []) {
            const dedupeKey = getIssueIdentity(issue);
            if (items.has(dedupeKey)) {
                continue;
            }

            const template = getTemplate(issue);
            const impact = getImpact(issue);
            const bucketKey = getRemediationBucket(template.effort);
            const evaluationDimension = evaluationDimensionLookup.get(dedupeKey);

            items.set(dedupeKey, {
                id: dedupeKey,
                auditId: issue.auditId,
                title: issue.title,
                dimensionKey: dimension.key,
                dimensionLabel: dimension.label,
                ...(evaluationDimension
                    ? {
                          evaluationDimensionKey: evaluationDimension.key,
                          evaluationDimensionLabel: evaluationDimension.label,
                      }
                    : {}),
                severity: issue.severity,
                currentScore: issue.score,
                impact,
                effort: template.effort,
                auditSourceType: issue.auditSourceType,
                auditSourceLabel: issue.auditSourceLabel,
                ...(issue.wcagCriteria?.length ? { wcagCriteria: issue.wcagCriteria } : {}),
                ...(issue.wcagReferences?.length ? { wcagReferences: issue.wcagReferences } : {}),
                ...(issue.wcagPrinciples?.length ? { wcagPrinciples: issue.wcagPrinciples } : {}),
                bucketKey,
                bucketLabel: ROADMAP_BUCKETS[bucketKey].label,
                action: template.action,
                whyItMatters: template.whyItMatters,
                ...(template.codeSnippet ? { codeSnippet: template.codeSnippet } : {}),
                ...(issue.displayValue ? { displayValue: issue.displayValue } : {}),
                ...(issue.sourceUrl ? { sourceUrl: issue.sourceUrl } : {}),
            });
        }
    }

    return [...items.values()]
        .sort((left, right) => {
            if (rankBucket(left.bucketKey) !== rankBucket(right.bucketKey)) {
                return rankBucket(left.bucketKey) - rankBucket(right.bucketKey);
            }

            if (rankImpact(left.impact) !== rankImpact(right.impact)) {
                return rankImpact(left.impact) - rankImpact(right.impact);
            }

            if (rankEffort(left.effort) !== rankEffort(right.effort)) {
                return rankEffort(left.effort) - rankEffort(right.effort);
            }

            return left.currentScore - right.currentScore;
        })
        .slice(0, 20);
}

export function buildRemediationBuckets(items: AnalysisRemediationItem[]): AnalysisRemediationBucket[] {
    return (Object.keys(ROADMAP_BUCKETS) as RemediationBucketKey[])
        .map((bucketKey) => {
            const bucketItems = items
                .filter((item) => item.bucketKey === bucketKey)
                .sort((left, right) => {
                    if (rankImpact(left.impact) !== rankImpact(right.impact)) {
                        return rankImpact(left.impact) - rankImpact(right.impact);
                    }

                    return left.currentScore - right.currentScore;
                });

            return {
                key: bucketKey,
                label: ROADMAP_BUCKETS[bucketKey].label,
                description: ROADMAP_BUCKETS[bucketKey].description,
                itemCount: bucketItems.length,
                items: bucketItems,
            };
        })
        .filter((bucket) => bucket.itemCount > 0);
}

export function buildAnalysisDetail(record: AnalysisRecordLike): AnalysisDetailView {
    const fullName = [record.firstName, record.lastName].filter(Boolean).join(" ").trim() || undefined;
    const scorecard = record.scoreCard;
    const aiReport = normalizeAiReport(record.aiReport);
    const normalizedReportFiles = buildAnalysisReportFileViews(
        normalizeStoredReportFiles((record.reportFiles || []) as StoredReportFile[]),
    );
    const remediationRoadmap = buildRemediationRoadmap(scorecard);

    return {
        ...(record._id ? { id: String(record._id) } : {}),
        taskId: String(record.taskId || ""),
        url: String(record.url || ""),
        ...(record.email ? { email: String(record.email) } : {}),
        ...(fullName ? { fullName } : {}),
        ...(record.planId !== undefined ? { planId: record.planId } : {}),
        ...(record.device !== undefined ? { device: record.device } : {}),
        status: normalizeStatus(record.status),
        emailStatus: normalizeEmailStatus(record.emailStatus),
        ...(record.score !== undefined ? { score: record.score } : {}),
        ...(scorecard?.riskTier ? { riskTier: scorecard.riskTier } : {}),
        ...(scorecard?.scoreStatus ? { scoreStatus: scorecard.scoreStatus } : {}),
        pageCount: Number(scorecard?.pageCount || record.successfulTargetCount || 0),
        ...(normalizeDate(record.createdAt) ? { createdAt: normalizeDate(record.createdAt) } : {}),
        ...(normalizeDate(record.updatedAt) ? { updatedAt: normalizeDate(record.updatedAt) } : {}),
        ...(record.failureReason ? { failureReason: record.failureReason } : {}),
        ...(record.emailError ? { emailError: record.emailError } : {}),
        attachmentCount: Number(record.attachmentCount || 0),
        plannedTargetCount: Number(record.plannedTargetCount || 0),
        successfulTargetCount: Number(record.successfulTargetCount || 0),
        degradedTargetCount: Number(record.degradedTargetCount || 0),
        failedTargetCount: Number(record.failedTargetCount || 0),
        warnings: Array.isArray(record.warnings) ? record.warnings.map((warning) => String(warning || "").trim()).filter(Boolean) : [],
        scanTargets: Array.isArray(record.scanTargets)
            ? record.scanTargets.map((target) => ({
                  url: String(target.url || ""),
                  device: (target.device || "desktop") as FullAuditDevice,
                  isHomepage: Boolean(target.isHomepage),
                  scanModeUsed: (target.scanModeUsed || "full") as FullAuditScannerMode,
                  status: target.status === "failed" ? "failed" : "completed",
                  ...(target.score !== undefined ? { score: target.score } : {}),
                  ...(target.failureReason ? { failureReason: String(target.failureReason) } : {}),
                  ...(target.errorCode ? { errorCode: String(target.errorCode) } : {}),
                  ...(target.statusCode !== undefined ? { statusCode: Number(target.statusCode) } : {}),
              }))
            : [],
        ...(record.reportDirectory ? { reportDirectory: record.reportDirectory } : {}),
        ...(record.reportStorage ? { reportStorage: record.reportStorage } : {}),
        reportFiles: normalizedReportFiles,
        ...(scorecard ? { scorecard } : {}),
        ...(aiReport ? { aiReport } : {}),
        dimensions: scorecard?.dimensions || [],
        evaluationDimensions: scorecard?.evaluationDimensions || [],
        topIssues: scorecard?.topIssues || [],
        remediationRoadmap,
        remediationBuckets: buildRemediationBuckets(remediationRoadmap),
        ...(scorecard?.overallScore !== undefined ? { certificationEligibility: getCertificationEligibility(scorecard.overallScore) } : {}),
    };
}
