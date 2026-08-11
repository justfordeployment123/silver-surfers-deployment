import { createHash } from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLib } from 'pdf-lib';

import { resolveBackendPath } from '../../config/paths.ts';
import { calculateSeniorFriendlinessScore as tsCalculateSeniorFriendlinessScore } from './scanner/scoring-logic.ts';
import { generateSeniorAccessibilityReport as tsGenerateSeniorAccessibilityReport } from './scanner/pdf-generator.js';
import { generateLiteAccessibilityReport as tsGenerateLiteAccessibilityReport } from './scanner/pdf-generator-lite.js';
import type { FullAuditDevice } from './full-audit.helpers.ts';
import type { AuditAiReport } from './ai-reporting.ts';
import { classifyRiskTier, classifyScoreStatus, type AuditScorecard } from './audit-scorecard.ts';
import type { WcagMatrix } from './wcag-matrix.ts';
import { describeWcagStandardLabel } from './wcag-mapping.ts';

export interface LitePdfResult {
  reportPath: string;
  score: string | number;
}

export interface SeniorPdfResult {
  reportPath: string;
  url: string;
  score: string | number;
}

export interface FullAuditPlatformReport {
  jsonReportPath: string;
  url: string;
  imagePaths: Record<string, never>;
  score: number | null;
}

export interface PlatformSummaryEntry {
  platform: string;
  score: number | null;
  /**
   * Number of pages this platform's average is based on. Used to weight the
   * executive-summary headline so it reproduces the same table it sits above
   * (Phase 6.1 / N1) instead of drifting from a differently-aggregated score.
   */
  pageCount?: number;
}

/**
 * Computes the executive-summary headline score as the page-weighted mean of
 * the platform rows actually rendered in the "Audit Summary" table, so the
 * big number at the top of the summary is always reproducible from the table
 * beneath it (Phase 6.1 / N1). Falls back to `fallbackScore` when no platform
 * rows carry a usable score (e.g. a caller that doesn't pass platformSummary).
 */
export function computeAggregatePlatformHeadline(
  platformSummary: PlatformSummaryEntry[] | undefined,
  fallbackScore: number,
): { score: number; simpleMean: number; weightedMean: number } {
  const scoredRows = (Array.isArray(platformSummary) ? platformSummary : []).filter(
    (entry): entry is PlatformSummaryEntry & { score: number } =>
      Boolean(entry) && typeof entry.score === 'number' && Number.isFinite(entry.score),
  );

  if (scoredRows.length === 0) {
    const fallback = Math.round(Number(fallbackScore) || 0);
    return { score: fallback, simpleMean: fallback, weightedMean: fallback };
  }

  const simpleMean = scoredRows.reduce((sum, row) => sum + row.score, 0) / scoredRows.length;
  const weightOf = (row: PlatformSummaryEntry): number => (Number(row.pageCount) > 0 ? Number(row.pageCount) : 1);
  const totalWeight = scoredRows.reduce((sum, row) => sum + weightOf(row), 0);
  const weightedSum = scoredRows.reduce((sum, row) => sum + row.score * weightOf(row), 0);
  const weightedMean = totalWeight > 0 ? weightedSum / totalWeight : simpleMean;

  return { score: Math.round(weightedMean), simpleMean, weightedMean };
}

function addFooterToPdfDocument(doc: InstanceType<typeof PDFDocument>, pageNumber: number): void {
  const pageHeight = doc.page.height;
  const footerY = pageHeight - 30;
  const pageWidth = doc.page.width;
  const leftMargin = 40;
  const rightMargin = pageWidth - 40;

  // The footer sits below pdfkit's bottom margin, and every text drawn there
  // makes pdfkit auto-append a blank page. Zero the bottom margin while the
  // footer is drawn so the document keeps exactly its intended page count.
  const bottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.strokeColor('#666666')
    .lineWidth(0.5)
    .moveTo(leftMargin, footerY - 5)
    .lineTo(rightMargin, footerY - 5)
    .stroke();

  doc.fontSize(9).font('RegularFont').fillColor('#666666')
    .text('SilverSurfers.ai', leftMargin, footerY, { width: 150, align: 'left' });

  doc.fontSize(9).font('RegularFont').fillColor('#666666')
    .text(String(pageNumber), pageWidth / 2, footerY, { width: 50, align: 'center' });

  doc.fontSize(9).font('RegularFont').fillColor('#666666')
    .text('Website Accessibility Audit Report', rightMargin - 200, footerY, { width: 200, align: 'right' });

  doc.page.margins.bottom = bottomMargin;
}

function getRoundedScoreValue(score: number | null | undefined): number | null {
  return score !== null && score !== undefined ? Math.round(score) : null;
}

function getPackageDisplayName(planType: string | undefined | null): string {
  const normalized = String(planType || '').trim().toLowerCase();
  if (normalized.includes('starter')) {
    return 'Starter';
  }
  if (normalized.includes('onetime') || normalized.includes('one-time') || normalized.includes('one_time')) {
    return 'One-Time';
  }
  if (normalized.includes('pro')) {
    return 'Pro';
  }
  return 'Pro';
}

function getReportLogoPaths(): string[] {
  return [
    resolveBackendPath('assets', 'Logo.png'),
    resolveBackendPath('reporting', 'assets', 'Logo.png'),
    resolveBackendPath('reporting', 'src', 'assets', 'Logo.png'),
    resolveBackendPath('backend-silver-surfers', 'assets', 'Logo.png'),
    resolveBackendPath('my-app', 'assets', 'Logo.png'),
    resolveBackendPath('src', 'assets', 'Logo.png'),
    path.join(process.cwd(), 'assets', 'Logo.png'),
    path.join(process.cwd(), 'src', 'assets', 'Logo.png'),
    path.join(process.cwd(), 'reporting', 'assets', 'Logo.png'),
    path.join(process.cwd(), 'reporting', 'src', 'assets', 'Logo.png'),
    path.join('/app', 'assets', 'Logo.png'),
    path.join('/app', 'src', 'assets', 'Logo.png'),
    path.join('/app', 'reporting', 'assets', 'Logo.png'),
    path.join('/app', 'reporting', 'src', 'assets', 'Logo.png'),
  ];
}

function findExistingReportLogoPath(): string | null {
  for (const logoPath of getReportLogoPaths()) {
    try {
      if (fsSync.existsSync(logoPath)) {
        return logoPath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function drawReportLogo(
  doc: InstanceType<typeof PDFDocument>,
  options: { x: number; y: number; size: number; align?: 'left' | 'center' | 'right' },
): boolean {
  const logoPath = findExistingReportLogoPath();
  if (!logoPath) {
    return false;
  }

  try {
    const logoBuffer = fsSync.readFileSync(logoPath);
    doc.image(logoBuffer, options.x, options.y, {
      fit: [options.size, options.size],
      align: options.align || 'right',
    });
    return true;
  } catch {
    return false;
  }
}

function drawCenteredReportLogo(
  doc: InstanceType<typeof PDFDocument>,
  y: number,
  size: number,
): boolean {
  return drawReportLogo(doc, {
    x: (doc.page.width - size) / 2,
    y,
    size,
    align: 'center',
  });
}

function drawSummaryTable(
  doc: InstanceType<typeof PDFDocument>,
  rows: PlatformSummaryEntry[],
  options: {
    x: number;
    y: number;
    width: number;
  },
): number {
  if (!rows.length) {
    return options.y;
  }

  const headers = ['Platform', 'Average Score', 'Result'];
  const colWidths = [options.width * 0.45, options.width * 0.25, options.width * 0.30];
  const headerHeight = 28;
  const rowHeight = 22;
  let currentY = options.y;

  doc.roundedRect(options.x, currentY, options.width, headerHeight + (rows.length * rowHeight), 8).fill('#F8FAFC');
  doc.rect(options.x, currentY, options.width, headerHeight).fill('#3D5A80');
  doc.font('BoldFont').fontSize(10).fillColor('#FFFFFF');

  let currentX = options.x;
  headers.forEach((header, index) => {
    doc.text(header, currentX + 8, currentY + 9, {
      width: colWidths[index] - 16,
      align: index === 0 ? 'left' : 'center',
      lineBreak: false,
    });
    currentX += colWidths[index];
  });

  currentY += headerHeight;
  doc.font('RegularFont').fontSize(10);

  rows.forEach((row, index) => {
    const scoreValue = getRoundedScoreValue(row.score);
    const scoreText = scoreValue !== null ? `${scoreValue}%` : 'N/A';
    const status = getScoreStatus(row.score);
    if (index % 2 === 0) {
      doc.rect(options.x, currentY, options.width, rowHeight).fill('#FFFFFF');
    }

    currentX = options.x;
    doc.fillColor('#1F2937').text(row.platform, currentX + 8, currentY + 6, {
      width: colWidths[0] - 16,
      align: 'left',
      lineBreak: false,
      ellipsis: true,
    });
    currentX += colWidths[0];

    doc.fillColor('#1F2937').text(scoreText, currentX, currentY + 6, {
      width: colWidths[1],
      align: 'center',
      lineBreak: false,
    });
    currentX += colWidths[1];

    doc.fillColor(status.color).font('BoldFont').text(status.label, currentX, currentY + 6, {
      width: colWidths[2],
      align: 'center',
      lineBreak: false,
    });
    doc.font('RegularFont');

    doc.strokeColor('#E5E7EB').lineWidth(0.5)
      .moveTo(options.x, currentY + rowHeight)
      .lineTo(options.x + options.width, currentY + rowHeight)
      .stroke();
    currentY += rowHeight;
  });

  return currentY;
}

function drawCoverSummarySection(
  doc: InstanceType<typeof PDFDocument>,
  rows: PlatformSummaryEntry[],
  options: {
    x: number;
    y: number;
    width: number;
  },
): number {
  if (!rows.length) {
    return options.y;
  }

  const blockHeight = 72 + (rows.length * 22);
  doc.roundedRect(options.x, options.y, options.width, blockHeight, 10).fill('#F8FAFC');
  doc.font('BoldFont').fontSize(13).fillColor('#1E3A8A')
    .text('Audit Summary', options.x + 14, options.y + 12, { width: options.width - 28 });
  doc.font('RegularFont').fontSize(10).fillColor('#475569')
    .text('Platform scores included in this combined report.', options.x + 14, options.y + 30, { width: options.width - 28 });
  return drawSummaryTable(doc, rows, {
    x: options.x + 12,
    y: options.y + 48,
    width: options.width - 24,
  }) + 12;
}

export function getScoreStatus(score: number | null | undefined): {
  label: 'Pass' | 'Needs Improvement' | 'Fail' | 'N/A';
  color: string;
} {
  const roundedScore = getRoundedScoreValue(score);
  if (roundedScore === null) {
    return { label: 'N/A', color: '#6B7280' };
  }

  if (roundedScore >= 80) {
    return { label: 'Pass', color: '#10B981' };
  }

  if (roundedScore >= 70) {
    return { label: 'Needs Improvement', color: '#F59E0B' };
  }

  return { label: 'Fail', color: '#EF4444' };
}

const COMMON_SECOND_LEVEL_TLDS = new Set([
  'ac', 'co', 'com', 'edu', 'gov', 'net', 'org',
]);

const GENERIC_HOST_PREFIXES = new Set([
  'amp', 'app', 'blog', 'cdn', 'go', 'm', 'mobile', 'shop', 'store', 'support', 'www',
]);

function getBrandSegmentFromHostname(hostname: string): string {
  const parts = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .split('.')
    .filter(Boolean);

  if (parts.length === 0) {
    return hostname;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  const isCountryTld = last.length === 2;
  const usesSecondLevelTld = isCountryTld && COMMON_SECOND_LEVEL_TLDS.has(secondLast);
  const registrableIndex = usesSecondLevelTld ? parts.length - 3 : parts.length - 2;
  const candidate = parts[Math.max(0, registrableIndex)];

  if (GENERIC_HOST_PREFIXES.has(candidate) && parts.length > 1) {
    return parts[Math.max(0, registrableIndex - 1)] || candidate;
  }

  return candidate;
}

function titleCaseSiteName(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/([0-9]+)/g, ' $1')
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((word) => {
      if (!word) {
        return '';
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

export function extractSiteNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = urlObj.hostname.replace(/^www\./i, '');
    const name = titleCaseSiteName(getBrandSegmentFromHostname(hostname));

    return name || hostname;
  } catch {
    return 'Multiple Websites';
  }
}

export function getReportPageName(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    if (!pathname || pathname === '/') {
      return 'Home Page';
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return 'Home Page';
    }

    const lastPart = parts[parts.length - 1];
    return lastPart
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') + ' Page';
  } catch {
    try {
      const fallbackUrl = new URL(url);
      return `${fallbackUrl.hostname.replace('www.', '').split('.')[0]} Page`;
    } catch {
      return 'Page';
    }
  }
}

export async function generateLiteAccessibilityReport(
  inputFile: string,
  outputDirectory: string,
  options?: { wcagStandard?: string | null; conformanceLevel?: string | null },
): Promise<LitePdfResult> {
  return tsGenerateLiteAccessibilityReport(inputFile, outputDirectory, options);
}

export async function calculateSeniorFriendlinessScore(
  report: Record<string, unknown>,
  options?: {
    isLiteVersion?: boolean;
  },
): Promise<{ finalScore: number }> {
  return tsCalculateSeniorFriendlinessScore(report, options) as any;
}

export async function generateSeniorAccessibilityReport(options: {
  inputFile: string;
  url: string;
  email_address: string;
  device: FullAuditDevice;
  imagePaths: Record<string, never>;
  outputDir: string;
  formFactor: FullAuditDevice;
  planType: string;
  wcagMatrix?: WcagMatrix;
  wcagStandard?: string | null;
  conformanceLevel?: string | null;
}): Promise<SeniorPdfResult> {
  return tsGenerateSeniorAccessibilityReport(options);
}

export async function generateSummaryPDF(
  platformResults: Array<{ platform: string; score: number | null }>,
  outputPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
    });

    const writeStream = fsSync.createWriteStream(outputPath);
    doc.pipe(writeStream);

    doc.registerFont('RegularFont', 'Helvetica');
    doc.registerFont('BoldFont', 'Helvetica-Bold');

    let pageNumber = 1;
    doc.on('pageAdded', () => {
      pageNumber += 1;
    });

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1F2937')
      .text('Audit Summary Report', 40, 40, { align: 'center', width: 515 });

    doc.fontSize(11).font('Helvetica').fillColor('#6B7280')
      .text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, 40, 70, { align: 'center', width: 515 });

    let currentY = 110;
    const margin = 40;
    const pageWidth = 515;
    const headerHeight = 35;
    const rowHeight = 25;
    const footerHeight = 60;
    const headers = ['Platform', 'Average Score', 'Result'];
    const colWidths = [200, 160, 155];

    doc.rect(margin, currentY, pageWidth, headerHeight).fill('#6366F1');

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
    let x = margin;
    headers.forEach((header, index) => {
      doc.text(header, x + 10, currentY + 10, {
        width: colWidths[index] - 20,
        align: index === 0 ? 'left' : 'center',
      });
      x += colWidths[index];
    });

    currentY += headerHeight;
    doc.fontSize(10).font('Helvetica').fillColor('#1F2937');

    platformResults.forEach((result, index) => {
      if (currentY + rowHeight > doc.page.height - footerHeight) {
        addFooterToPdfDocument(doc, pageNumber);
        doc.addPage();
        currentY = margin;

        doc.rect(margin, currentY, pageWidth, headerHeight).fill('#6366F1');
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF');
        x = margin;
        headers.forEach((header, idx) => {
          doc.text(header, x + 10, currentY + 10, {
            width: colWidths[idx] - 20,
            align: idx === 0 ? 'left' : 'center',
          });
          x += colWidths[idx];
        });
        currentY += headerHeight;
      }

      if (index % 2 === 0) {
        doc.rect(margin, currentY, pageWidth, rowHeight).fill('#F9FAFB');
      }

      const platform = result.platform || 'Unknown';
      const scoreValue = getRoundedScoreValue(result.score);
      const scoreText = scoreValue !== null ? `${scoreValue}%` : 'N/A';
      const status = getScoreStatus(result.score);

      x = margin;
      doc.fillColor('#1F2937').text(platform, x + 10, currentY + 7, {
        width: colWidths[0] - 20,
        align: 'left',
      });
      x += colWidths[0];

      doc.fillColor('#1F2937').text(scoreText, x, currentY + 7, {
        width: colWidths[1],
        align: 'center',
      });
      x += colWidths[1];

      doc.fillColor(status.color).font('Helvetica-Bold').text(status.label, x, currentY + 7, {
        width: colWidths[2],
        align: 'center',
      });
      doc.font('Helvetica');

      doc.strokeColor('#E5E7EB').lineWidth(0.5)
        .moveTo(margin, currentY + rowHeight)
        .lineTo(margin + pageWidth, currentY + rowHeight)
        .stroke();

      currentY += rowHeight;
    });

    doc.end();
    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
  });
}

export async function generateAuditAiSummaryPdf(
  aiReport: AuditAiReport,
  options: {
    url: string;
    outputPath: string;
    title?: string;
    scorecard?: AuditScorecard;
    platformSummary?: PlatformSummaryEntry[];
    planType?: string;
    /**
     * Count of WCAG criteria flagged Fail across the same matrices the full
     * report ships (Phase 6.3 / N6). When omitted, falls back to the
     * scorecard's own (differently-computed) wcagSummary.criteriaCount.
     */
    wcagFlaggedCriteriaCount?: number;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const normalizedHeadline = String(aiReport?.headline || '').trim();
    const normalizedSummary = String(aiReport?.summary || '').trim();
    const normalizedBusinessImpact = String(aiReport?.businessImpact || '').trim();
    const normalizedPrioritySummary = String(aiReport?.prioritySummary || '').trim();
    const normalizedStakeholderNote = String(aiReport?.stakeholderNote || '').trim();
    const normalizeListText = (value: string): string => value
      .replace(/^\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const canonicalListText = (value: string): string => normalizeListText(value)
      .replace(/[.。]+$/g, '')
      .toLowerCase();
    const dedupeByKey = <T>(items: T[], getKey: (item: T) => string): T[] => {
      const seen = new Set<string>();
      const unique: T[] = [];
      for (const item of items) {
        const key = getKey(item);
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        unique.push(item);
      }
      return unique;
    };

    const normalizedRecommendations = Array.isArray(aiReport?.topRecommendations)
      ? dedupeByKey(
        aiReport.topRecommendations.map((item) => normalizeListText(String(item || ''))).filter(Boolean),
        canonicalListText,
      )
      : [];
    const normalizedFindingGuidance = Array.isArray(aiReport?.perFindingGuidance)
      ? dedupeByKey(aiReport.perFindingGuidance
        .map((item) => ({
          auditId: String(item?.auditId || '').trim(),
          title: normalizeListText(String(item?.title || '')),
          explanation: normalizeListText(String(item?.explanation || '')),
          remediation: normalizeListText(String(item?.remediation || '')),
          wcagCriteria: Array.isArray(item?.wcagCriteria)
            ? item.wcagCriteria.map((criterion) => String(criterion || '').trim()).filter(Boolean)
            : [],
        }))
        .filter((item) => item.auditId && item.title && item.explanation && item.remediation),
        (item) => [
          canonicalListText(item.title),
          canonicalListText(item.explanation),
          canonicalListText(item.remediation),
        ].join('|'),
      )
      : [];
    // Phase 6.4 / N7: weakest/strongest must name one of the eight evaluation
    // dimensions the full report actually prints — not the four-category
    // primary-dimension rollup, which uses names the full report never uses.
    // Dimensions excluded on every scored page (weight 0) are dropped so an
    // unevaluated "Excluded" component can never surface as "weakest".
    const normalizedDimensions = Array.isArray(options.scorecard?.evaluationDimensions)
      ? options.scorecard.evaluationDimensions
        .map((dimension) => ({
          label: String(dimension?.label || '').trim(),
          score: Number(dimension?.score || 0),
          weight: Number(dimension?.weight || 0),
        }))
        .filter((dimension) => dimension.label && dimension.weight > 0)
      : [];
    const normalizedTopIssues = Array.isArray(options.scorecard?.topIssues)
      ? dedupeByKey(options.scorecard.topIssues
        .map((issue) => ({
          title: String(issue?.title || '').trim(),
          wcagReferences: Array.isArray(issue?.wcagReferences) ? issue.wcagReferences : [],
          wcagCriteria: Array.isArray(issue?.wcagCriteria) ? issue.wcagCriteria : [],
        }))
        .filter((issue) => issue.title),
        (issue) => [
          canonicalListText(issue.title),
          (issue.wcagCriteria || []).join(','),
          (issue.wcagReferences || []).map((reference) => `${reference.criterion}:${reference.title}`).join(','),
        ].join('|'),
      )
      : [];

    // Phase 6.1 / N1: the headline score must always be reproducible from the
    // same platform table rendered below it, so compute it from that table
    // (page-weighted mean) instead of a separately-aggregated scorecard
    // number that can drift from what the reader sees. If the weighted and
    // simple means of the table disagree by more than a rounding point, the
    // table itself is inconsistent (e.g. wildly uneven per-platform page
    // counts) — refuse to ship a summary that contradicts its own numbers,
    // matching the PDF combiner's fail-loudly philosophy.
    const platformSummaryRows = Array.isArray(options.platformSummary)
      ? options.platformSummary.filter((entry) => entry && entry.platform)
      : [];
    let overallScore: number;
    let riskTierRaw: string;
    let scoreStatusRaw: string;
    if (options.scorecard) {
      const headline = computeAggregatePlatformHeadline(platformSummaryRows, Number(options.scorecard.overallScore || 0));
      if (platformSummaryRows.some((row) => typeof row.score === 'number') && Math.abs(headline.weightedMean - headline.simpleMean) > 1) {
        reject(new Error(
          `Executive summary headline for ${options.url} would read ${headline.score}%, which diverges from the `
          + `${headline.simpleMean.toFixed(1)}% mean of its own platform table by more than 1 point. `
          + 'Refusing to generate a self-contradictory summary.',
        ));
        return;
      }
      overallScore = headline.score;
      riskTierRaw = classifyRiskTier(overallScore);
      scoreStatusRaw = classifyScoreStatus(overallScore).replace(/-/g, ' ');
    } else {
      overallScore = 0;
      riskTierRaw = 'unknown';
      scoreStatusRaw = 'pending';
    }

    const doc = new PDFDocument({
      margins: { top: 56, bottom: 64, left: 48, right: 48 },
      size: 'A4',
    });

    const writeStream = fsSync.createWriteStream(options.outputPath);
    doc.pipe(writeStream);

    doc.registerFont('RegularFont', 'Helvetica');
    doc.registerFont('BoldFont', 'Helvetica-Bold');

    const pageMarginLeft = doc.page.margins.left;
    const pageMarginRight = doc.page.margins.right;
    const contentWidth = doc.page.width - pageMarginLeft - pageMarginRight;
    const generatedAt = new Date(aiReport.generatedAt);
    const generatedAtLabel = Number.isNaN(generatedAt.getTime())
      ? aiReport.generatedAt
      : generatedAt.toLocaleString();

    const riskPalette = (() => {
      if (overallScore >= 80) return { fill: '#DCFCE7', text: '#166534', accent: '#16A34A' };
      if (overallScore >= 70) return { fill: '#FEF3C7', text: '#92400E', accent: '#F59E0B' };
      return { fill: '#FEE2E2', text: '#991B1B', accent: '#DC2626' };
    })();

    const sectionPalette = {
      summary: '#3B82F6',
      business: '#8B5CF6',
      priority: '#F59E0B',
      recommendations: '#10B981',
      stakeholder: '#0EA5E9',
    };

    const renderHero = (): void => {
      const heroHeight = 110;
      const packageLabel = getPackageDisplayName(options.planType || 'pro');
      doc.save();
      doc.rect(0, 0, doc.page.width, heroHeight).fill('#0F172A');
      doc.fillColor('#FFFFFF').font('BoldFont').fontSize(22)
        .text(options.title || 'AI Executive Summary', pageMarginLeft, 28, { width: contentWidth });
      doc.font('RegularFont').fontSize(10).fillColor('#CBD5F5')
        .text(options.url, pageMarginLeft, 60, { width: contentWidth - 120, lineBreak: false, ellipsis: true });
      doc.font('BoldFont').fontSize(9).fillColor('#7DD3FC')
        .text(`Package: ${packageLabel}`, doc.page.width - pageMarginRight - 115, 60, { width: 115, align: 'right', lineBreak: false });
      doc.font('RegularFont').fontSize(9).fillColor('#94A3B8')
        .text(`Generated ${generatedAtLabel}  •  Source: ${aiReport.provider}${aiReport.model ? ` (${aiReport.model})` : ''}`,
          pageMarginLeft, 78, { width: contentWidth });
      doc.restore();
      doc.y = heroHeight + 18;
    };

    const renderScoreCard = (): void => {
      if (!options.scorecard) return;
      const cardTop = doc.y;
      const cardHeight = 112;
      const scoreBoxWidth = 130;
      const detailLabelWidth = 150;

      doc.save();
      doc.roundedRect(pageMarginLeft, cardTop, contentWidth, cardHeight, 8).fill('#F8FAFC');
      doc.roundedRect(pageMarginLeft, cardTop, scoreBoxWidth, cardHeight, 8).fill(riskPalette.fill);

      doc.fillColor(riskPalette.text).font('BoldFont').fontSize(36)
        .text(`${overallScore}%`, pageMarginLeft, cardTop + 22, { width: scoreBoxWidth, align: 'center' });
      doc.fillColor(riskPalette.text).font('BoldFont').fontSize(10)
        .text(riskTierRaw.toUpperCase() + ' RISK', pageMarginLeft, cardTop + 64, { width: scoreBoxWidth, align: 'center' });

      const detailX = pageMarginLeft + scoreBoxWidth + 18;
      const detailWidth = contentWidth - scoreBoxWidth - 30;
      const weakest = [...normalizedDimensions].sort((a, b) => a.score - b.score)[0];
      const strongest = [...normalizedDimensions].sort((a, b) => b.score - a.score)[0];
      // Phase 6.2 / N2: pageCount is the honest distinct-URL count (never
      // multiplied by device count) once the caller builds the scorecard from
      // buildAggregateAuditScorecard's pageCount option; see full-audit
      // pipelines. "Pages audited" therefore reads a truthful single number.
      const pageCount = Number(options.scorecard.pageCount || 0);
      const detailRows: Array<[string, string]> = [
        ['Status', scoreStatusRaw.replace(/\b\w/g, (c) => c.toUpperCase())],
        ['Pages audited', String(pageCount)],
      ];
      // Phase 6.3 / N6: prefer the count of Fail criteria unioned across the
      // same matrices the full report ships; only fall back to the
      // scorecard's own (differently-computed) summary when the caller
      // didn't supply one. typeof-check (not truthy) so a genuine 0 still
      // prints instead of silently hiding the row.
      const flaggedCount = typeof options.wcagFlaggedCriteriaCount === 'number'
        ? options.wcagFlaggedCriteriaCount
        : options.scorecard.wcagSummary?.criteriaCount;
      if (typeof flaggedCount === 'number') {
        detailRows.push(['WCAG criteria flagged', String(flaggedCount)]);
      }
      if (weakest) {
        detailRows.push(['Weakest area', `${weakest.label} (${Math.round(weakest.score)}%)`]);
      }
      if (strongest) {
        detailRows.push(['Strongest area', `${strongest.label} (${Math.round(strongest.score)}%)`]);
      }

      let rowY = cardTop + 14;
      detailRows.forEach(([label, value]) => {
        doc.font('RegularFont').fontSize(9).fillColor('#64748B')
          .text(label.toUpperCase(), detailX, rowY, { width: detailLabelWidth, lineBreak: false, ellipsis: true });
        doc.font('BoldFont').fontSize(10).fillColor('#0F172A')
          .text(value, detailX + detailLabelWidth, rowY, { width: detailWidth - detailLabelWidth, lineBreak: false, ellipsis: true });
        rowY += 17;
      });
      doc.restore();
      doc.y = cardTop + cardHeight + 6;

      // Phase 6.2/6.3 (N2, N6): spell out the honest page x device math and
      // the matrix scope in a caption beneath the fixed-width card, where a
      // full sentence can actually fit legibly.
      const deviceCount = platformSummaryRows.length;
      const pageDeviceAuditCount = platformSummaryRows.reduce((sum, row) => sum + (Number(row.pageCount) || 0), 0);
      if (deviceCount > 0 && pageDeviceAuditCount > 0) {
        const captionParts = [
          `Pages audited counts distinct URLs: ${pageCount} page${pageCount === 1 ? '' : 's'} x `
          + `${deviceCount} device${deviceCount === 1 ? '' : 's'} = ${pageDeviceAuditCount} page-device audits.`,
        ];
        if (typeof flaggedCount === 'number') {
          captionParts.push('WCAG criteria flagged is the union of failing criteria across all pages and devices in this audit.');
        }
        doc.font('RegularFont').fontSize(8).fillColor('#94A3B8')
          .text(captionParts.join(' '), pageMarginLeft, doc.y, { width: contentWidth });
        doc.y += 6;
      }
      doc.y += 12;
    };

    const renderAuditSummaryTable = (): void => {
      const summary = platformSummaryRows;
      if (summary.length === 0) return;

      const startY = doc.y;
      const rowHeight = 28;
      const headerHeight = 30;
      const colWidths = [contentWidth * 0.34, contentWidth * 0.28, contentWidth * 0.38];
      const tableHeight = headerHeight + (summary.length * rowHeight);
      const sectionHeight = 34 + tableHeight + 14;

      if (startY + sectionHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
      }

      const headingY = doc.y;
      doc.font('BoldFont').fontSize(14).fillColor(sectionPalette.summary)
        .text('Audit Summary', pageMarginLeft, headingY, { width: contentWidth });
      const underlineY = doc.y + 2;
      doc.save();
      doc.lineWidth(2).strokeColor(sectionPalette.summary)
        .moveTo(pageMarginLeft, underlineY).lineTo(pageMarginLeft + 36, underlineY).stroke();
      doc.restore();

      let tableY = underlineY + 12;
      doc.roundedRect(pageMarginLeft, tableY, contentWidth, tableHeight, 8).fill('#F8FAFC');
      doc.rect(pageMarginLeft, tableY, contentWidth, headerHeight).fill('#3B82F6');

      doc.font('BoldFont').fontSize(9).fillColor('#FFFFFF');
      let x = pageMarginLeft;
      doc.text('PLATFORM', x + 10, tableY + 10, { width: colWidths[0] - 20, lineBreak: false });
      x += colWidths[0];
      doc.text('AVERAGE SCORE', x + 10, tableY + 10, { width: colWidths[1] - 20, align: 'center', lineBreak: false });
      x += colWidths[1];
      doc.text('RESULT', x + 10, tableY + 10, { width: colWidths[2] - 20, align: 'center', lineBreak: false });

      tableY += headerHeight;
      summary.forEach((entry, index) => {
        const score = typeof entry.score === 'number' && Number.isFinite(entry.score) ? Math.round(entry.score) : null;
        const result = score == null
          ? 'Not Available'
          : score >= 80
            ? 'Pass'
            : score >= 70
              ? 'Needs Improvement'
              : 'Below Standard';
        const resultColor = score == null
          ? '#64748B'
          : score >= 80
            ? '#16A34A'
            : score >= 70
              ? '#F59E0B'
              : '#DC2626';

        if (index % 2 === 1) {
          doc.rect(pageMarginLeft, tableY, contentWidth, rowHeight).fill('#F1F5F9');
        }

        let cellX = pageMarginLeft;
        doc.font('BoldFont').fontSize(9).fillColor('#334155')
          .text(String(entry.platform), cellX + 10, tableY + 9, { width: colWidths[0] - 20, lineBreak: false, ellipsis: true });
        cellX += colWidths[0];
        doc.font('BoldFont').fontSize(9).fillColor('#0F172A')
          .text(score == null ? 'N/A' : `${score}%`, cellX + 10, tableY + 9, { width: colWidths[1] - 20, align: 'center', lineBreak: false });
        cellX += colWidths[1];
        doc.font('BoldFont').fontSize(9).fillColor(resultColor)
          .text(result, cellX + 10, tableY + 9, { width: colWidths[2] - 20, align: 'center', lineBreak: false, ellipsis: true });

        tableY += rowHeight;
      });

      doc.y = tableY + 18;
    };

    const renderSectionCard = (
      heading: string,
      accentColor: string,
      body: string | null,
      bullets: string[] | null,
      options: { showBulletDots?: boolean } = {},
    ): void => {
      const hasBody = !!(body && body.trim());
      const hasBullets = !!(bullets && bullets.length > 0);
      if (!hasBody && !hasBullets) return;

      const innerLeft = pageMarginLeft;
      const innerWidth = contentWidth;
      const headingY = doc.y;

      doc.font('BoldFont').fontSize(14).fillColor(accentColor)
        .text(heading, innerLeft, headingY, { width: innerWidth });

      const underlineY = doc.y + 2;
      doc.save();
      doc.lineWidth(2).strokeColor(accentColor)
        .moveTo(innerLeft, underlineY).lineTo(innerLeft + 36, underlineY).stroke();
      doc.restore();
      doc.y = underlineY + 8;

      if (hasBody) {
        doc.font('RegularFont').fontSize(11).fillColor('#334155')
          .text(body!.trim(), innerLeft, doc.y, { width: innerWidth, lineGap: 4 });
      }

      if (hasBullets) {
        if (hasBody) doc.moveDown(0.35);
        doc.font('RegularFont').fontSize(11).fillColor('#334155');
        bullets!.forEach((item) => {
          const lineY = doc.y;
          const showBulletDots = options.showBulletDots !== false;
          if (showBulletDots) {
            doc.save();
            doc.fillColor(accentColor).circle(innerLeft + 5, lineY + 6, 2.5).fill();
            doc.restore();
          }
          const textX = showBulletDots ? innerLeft + 16 : innerLeft;
          const textWidth = showBulletDots ? innerWidth - 16 : innerWidth;
          if (item.startsWith('Fix: ')) {
            doc.font('BoldFont').fillColor('#1E40AF')
              .text('Fix: ', textX, lineY, { continued: true, lineGap: 3 });
            doc.font('RegularFont').fillColor('#334155')
              .text(item.slice(5), { width: textWidth, lineGap: 3 });
          } else {
            doc.font('RegularFont').fillColor('#334155').text(item, textX, lineY, { width: textWidth, lineGap: 3 });
          }
          doc.moveDown(0.2);
        });
      }

      doc.moveDown(0.6);
    };

    const renderTopIssues = (): void => {
      if (normalizedTopIssues.length === 0) return;
      const issues = normalizedTopIssues.slice(0, 5);
      doc.font('BoldFont').fontSize(11).fillColor('#0F172A')
        .text('Highlighted issues from this scan:', pageMarginLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.25);
      doc.font('RegularFont').fontSize(10).fillColor('#475569');
      issues.forEach((issue, idx) => {
        const wcagLabels = issue.wcagReferences.length
          ? issue.wcagReferences.map((reference) =>
            `WCAG ${reference.criterion} ${reference.title} (Level ${reference.level}, ${reference.principle})`,
          )
          : issue.wcagCriteria.map((criterion) => `WCAG ${criterion}`);
        const suffix = wcagLabels.length ? ` - ${wcagLabels.join('; ')}` : '';
        doc.text(`${idx + 1}. ${issue.title}${suffix}`, pageMarginLeft + 6, doc.y, { width: contentWidth - 6, lineGap: 2 });
      });
      doc.moveDown(0.5);
    };

    renderHero();

    if (normalizedHeadline) {
      doc.font('BoldFont').fontSize(16).fillColor('#1D4ED8')
        .text(normalizedHeadline, pageMarginLeft, doc.y, { width: contentWidth });
      doc.moveDown(0.6);
    }

    renderScoreCard();
    renderAuditSummaryTable();
    renderTopIssues();

    renderSectionCard('Summary', sectionPalette.summary, normalizedSummary, null);
    renderSectionCard('Business Impact', sectionPalette.business, normalizedBusinessImpact, null);
    renderSectionCard('Priority Summary', sectionPalette.priority, normalizedPrioritySummary, null);
    renderSectionCard(
      'Top Recommendations',
      sectionPalette.recommendations,
      null,
      normalizedRecommendations.map((rec, i) => `${i + 1}. ${rec}`),
      { showBulletDots: false },
    );

    renderSectionCard(
      'Finding-Specific AI Guidance',
      '#14B8A6',
      null,
      normalizedFindingGuidance.slice(0, 20).flatMap((item, index) => {
        const wcag = item.wcagCriteria.length ? ` WCAG: ${item.wcagCriteria.join(', ')}.` : '';
        return [
          `${index + 1}. ${item.title}.${wcag} ${item.explanation}`,
          `Fix: ${item.remediation}`,
        ];
      }),
      { showBulletDots: false },
    );

    renderSectionCard('Stakeholder Note', sectionPalette.stakeholder, normalizedStakeholderNote, null);

    doc.end();
    writeStream.on('finish', () => resolve(options.outputPath));
    writeStream.on('error', reject);
  });
}

export interface MissingMergePage {
  url: string;
  reason: string;
  /** Index of the page in the original crawl sequence; used to re-insert the
   * gap page at its truthful position. Pages without an order are appended. */
  order?: number;
}

export type OrderedMergePage =
  | { kind: 'report'; report: FullAuditPlatformReport; pdfPath: string }
  | { kind: 'gap'; url: string; reason: string };

export interface AssembledMergeReportPage {
  kind: 'report';
  report: FullAuditPlatformReport;
  pdfPath: string;
  pageCount: number;
}

export interface AssembledMergeGapPage {
  kind: 'gap';
  url: string;
  reason: string;
}

export type AssembledMergePage = AssembledMergeReportPage | AssembledMergeGapPage;

/**
 * Maps a failed scan target to a short human-readable reason, used for gap
 * pages and the combined-report cover note.
 */
export function humanizeAuditFailureReason(options: { errorCode?: string | null; error?: string | null }): string {
  const { errorCode, error } = options;
  switch (errorCode) {
    case 'PAGE_NOT_FOUND':
      return 'page not found (HTTP 404)';
    case 'PAGE_HTTP_ERROR':
      return 'an HTTP error response';
    case 'NON_HTML':
      return 'non-HTML content';
    case 'NO_AUDITABLE_CONTENT':
      return 'insufficient auditable content';
    default:
      break;
  }

  const message = String(error || '').toLowerCase();
  if (/(bot|captcha|shieldsquare|radware|verify you are a human|access to this page has been blocked)/.test(message)) {
    return 'bot protection';
  }
  if (/404|not found/.test(message)) {
    return 'page not found (HTTP 404)';
  }
  if (/empty|stub|insufficient auditable content/.test(message)) {
    return 'insufficient auditable content';
  }
  if (/timeout|timed out/.test(message)) {
    return 'a scan timeout';
  }
  return 'a scan error';
}

/**
 * Converts an index within the successfully scanned reports array into the
 * original crawl sequence, given the (ascending) crawl positions of the pages
 * that failed at scan time. PDF-generation failures use this to keep gap
 * pages at their truthful position.
 */
export function crawlOrderForReportIndex(reportIndex: number, scanGapOrders: number[]): number {
  let crawlOrder = reportIndex;
  for (const gapOrder of scanGapOrders) {
    if (gapOrder <= crawlOrder) {
      crawlOrder += 1;
    }
  }
  return crawlOrder;
}

/**
 * Rebuilds the original crawl sequence from the successfully generated pages
 * and the pages that failed. `reports`/`pdfPaths` hold only successful pages
 * in crawl order; `missingPages` entries carry their original crawl index in
 * `order` and are slotted back into that position. Entries without a usable
 * order (and any overflow) are appended so no page is ever dropped silently.
 */
export function orderMergePages(
  reports: FullAuditPlatformReport[],
  pdfPaths: string[],
  missingPages: MissingMergePage[] = [],
): OrderedMergePage[] {
  const totalSlots = reports.length + missingPages.length;
  const positionedGaps = new Map<number, MissingMergePage>();
  const unpositionedGaps: MissingMergePage[] = [];
  for (const missing of missingPages) {
    const order = missing.order;
    if (typeof order === 'number'
      && Number.isInteger(order)
      && order >= 0
      && order < totalSlots
      && !positionedGaps.has(order)) {
      positionedGaps.set(order, missing);
    } else {
      unpositionedGaps.push(missing);
    }
  }

  const ordered: OrderedMergePage[] = [];
  let reportCursor = 0;
  for (let slot = 0; slot < totalSlots; slot += 1) {
    const gap = positionedGaps.get(slot);
    if (gap) {
      ordered.push({ kind: 'gap', url: gap.url, reason: gap.reason });
      continue;
    }
    if (reportCursor < reports.length) {
      ordered.push({ kind: 'report', report: reports[reportCursor], pdfPath: pdfPaths[reportCursor] });
      reportCursor += 1;
    }
  }
  for (; reportCursor < reports.length; reportCursor += 1) {
    ordered.push({ kind: 'report', report: reports[reportCursor], pdfPath: pdfPaths[reportCursor] });
  }
  for (const gap of unpositionedGaps) {
    ordered.push({ kind: 'gap', url: gap.url, reason: gap.reason });
  }
  return ordered;
}

/** Renders a single honest "could not be audited" page and returns its path. */
export async function renderGapPage(options: {
  url: string;
  reason: string;
  outputDir: string;
  device: FullAuditDevice;
}): Promise<string> {
  const { url, reason, outputDir, device } = options;
  const gapPagePath = path.join(
    outputDir,
    `gap-${device}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`,
  );
  const gapDoc = new PDFDocument({ margin: 40, size: 'A4' });
  const gapStream = fsSync.createWriteStream(gapPagePath);
  gapDoc.pipe(gapStream);
  gapDoc.registerFont('RegularFont', 'Helvetica');
  gapDoc.registerFont('BoldFont', 'Helvetica-Bold');

  const gapMargin = 40;
  const gapWidth = 515;

  gapDoc.rect(0, 0, gapDoc.page.width, 50).fill('#1E3A8A');
  gapDoc.fontSize(16).font('BoldFont').fillColor('#FFFFFF')
    .text('Page Could Not Be Audited', gapMargin, 15, { width: gapWidth, align: 'left' });

  let gapY = 140;
  gapDoc.fontSize(20).font('BoldFont').fillColor('#2C3E50')
    .text('This page could not be audited', gapMargin, gapY, { width: gapWidth, align: 'center' });
  gapY += 60;
  gapDoc.fontSize(13).font('BoldFont').fillColor('#2C3E50')
    .text(getReportPageName(url), gapMargin, gapY, { width: gapWidth, align: 'center' });
  gapY += 30;
  gapDoc.fontSize(10).font('RegularFont').fillColor('#6B7280')
    .text(url, gapMargin, gapY, { width: gapWidth, align: 'center' });
  gapY += 50;
  gapDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text(`Reason: ${reason}`, gapMargin, gapY, { width: gapWidth, align: 'center' });
  gapY += 50;
  gapDoc.fontSize(10).font('RegularFont').fillColor('#6B7280')
    .text(
      new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      gapMargin,
      gapY,
      { width: gapWidth, align: 'center' },
    );

  gapDoc.end();
  await new Promise<void>((resolve, reject) => {
    gapStream.on('finish', resolve);
    gapStream.on('error', reject);
  });
  return gapPagePath;
}

/**
 * Builds the cover-page note for unaudited pages. When every gap shares one
 * cause (e.g. bot protection), the note names it explicitly.
 */
export function buildGapCoverLine(auditedCount: number, gapPages: AssembledMergeGapPage[]): string {
  const totalCount = auditedCount + gapPages.length;
  const reasonCounts = new Map<string, number>();
  for (const gap of gapPages) {
    reasonCounts.set(gap.reason, (reasonCounts.get(gap.reason) ?? 0) + 1);
  }
  const [dominantReason, dominantCount] = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const pagesWord = totalCount === 1 ? 'page' : 'pages';
  const auditedWord = auditedCount === 1 ? 'page' : 'pages';
  if (dominantReason && dominantCount === gapPages.length) {
    return `${gapPages.length} of ${totalCount} ${pagesWord} could not be audited due to ${dominantReason}; results below cover ${auditedCount} ${auditedWord}.`;
  }
  return `${gapPages.length} of ${totalCount} ${pagesWord} could not be audited; see the Table of Contents for details.`;
}

/**
 * Builds the TOC rows for the assembled body. Gap pages always render with an
 * honest 'N/A' score and occupy exactly one page.
 */
export function buildMergeTocEntries(
  pages: AssembledMergePage[],
): Array<{ pageName: string; score: string; actualPageCount: number }> {
  return pages.map((page) => {
    if (page.kind === 'gap') {
      return { pageName: getReportPageName(page.url), score: 'N/A', actualPageCount: 1 };
    }
    return {
      pageName: getReportPageName(page.report.url),
      score: page.report.score !== null && page.report.score !== undefined
        ? `${Math.round(page.report.score)}%`
        : 'N/A',
      actualPageCount: page.pageCount > 1 ? page.pageCount - 1 : 0,
    };
  });
}

export async function mergePDFsByPlatform(options: {
  pdfPaths: string[];
  device: FullAuditDevice;
  email_address: string;
  outputDir: string;
  reports: FullAuditPlatformReport[];
  planType: string;
  platformSummary?: PlatformSummaryEntry[];
  missingPages?: MissingMergePage[];
}): Promise<string> {
  const { pdfPaths, device, email_address, outputDir, reports, planType, platformSummary = [], missingPages = [] } = options;
  if (!pdfPaths || pdfPaths.length === 0) {
    throw new Error('No PDF paths provided for merging');
  }

  // Rebuild the original crawl sequence: `reports`/`pdfPaths` hold only the
  // successfully generated pages in crawl order, while `missingPages` brings
  // the failed pages back in at their truthful positions. Every body PDF is
  // then validated; unreadable files degrade to gap pages, and byte-identical
  // files abort the merge because they mean two pages resolved to one PDF.
  const orderedPages = orderMergePages(reports, pdfPaths, missingPages);
  const assembledPages: AssembledMergePage[] = [];
  const seenPdfHashes = new Map<string, string>();
  for (const page of orderedPages) {
    if (page.kind === 'gap') {
      assembledPages.push(page);
      continue;
    }

    const { report, pdfPath } = page;
    const pdfExists = pdfPath
      ? await fs.access(pdfPath).then(() => true).catch(() => false)
      : false;
    if (!pdfExists) {
      assembledPages.push({
        kind: 'gap',
        url: report.url,
        reason: 'The individual report file was missing when the combined PDF was assembled.',
      });
      continue;
    }

    let pdfBytes: Buffer;
    let pageCount: number;
    try {
      pdfBytes = await fs.readFile(pdfPath);
      pageCount = (await PDFLib.load(pdfBytes)).getPageCount();
    } catch {
      assembledPages.push({
        kind: 'gap',
        url: report.url,
        reason: 'The individual report file could not be read when the combined PDF was assembled.',
      });
      continue;
    }

    const pdfHash = createHash('sha256').update(pdfBytes).digest('hex');
    const duplicateUrl = seenPdfHashes.get(pdfHash);
    if (duplicateUrl) {
      throw new Error(
        `Duplicate individual report detected while assembling the combined ${device} PDF: "${report.url}" is byte-identical to "${duplicateUrl}".`,
      );
    }
    seenPdfHashes.set(pdfHash, report.url);

    assembledPages.push({ kind: 'report', report, pdfPath, pageCount });
  }

  const reportPages = assembledPages.filter((page): page is AssembledMergeReportPage => page.kind === 'report');
  const gapPages = assembledPages.filter((page): page is AssembledMergeGapPage => page.kind === 'gap');
  const gapPageCount = gapPages.length;
  if (reportPages.length === 0) {
    throw new Error('No readable individual PDF reports available for merging');
  }

  const deviceCapitalized = device.charAt(0).toUpperCase() + device.slice(1);
  const packageText = getPackageDisplayName(planType);
  const outputPath = path.join(outputDir, `combined-${device}-report.pdf`);
  const mergedPdf = await PDFLib.create();

  const titlePagePath = path.join(outputDir, `title-${device}-${Date.now()}.pdf`);
  const titleDoc = new PDFDocument({ margin: 40, size: 'A4' });
  const titleStream = fsSync.createWriteStream(titlePagePath);
  titleDoc.pipe(titleStream);
  titleDoc.registerFont('RegularFont', 'Helvetica');
  titleDoc.registerFont('BoldFont', 'Helvetica-Bold');

  const titleMargin = 40;
  const titlePageWidth = 515;
  const titlePageHeight = titleDoc.page.height;
  const baseUrl = reportPages[0]?.report.url || reports[0]?.url || 'website';
  const siteName = extractSiteNameFromUrl(baseUrl);

  titleDoc.rect(0, 0, titleDoc.page.width, titlePageHeight).fill('#FFFFFF');
  drawCenteredReportLogo(titleDoc, 56, 96);

  const titleY = titlePageHeight * 0.35;
  const titleWidth = titlePageWidth;

  titleDoc.fontSize(36).font('BoldFont').fillColor('#2C3E50')
    .text('SilverSurfers', titleMargin, titleY, { width: titleWidth, align: 'center' });
  titleDoc.fontSize(28).font('BoldFont').fillColor('#2C3E50')
    .text('Website', titleMargin, titleY + 50, { width: titleWidth, align: 'center' });
  titleDoc.fontSize(28).font('BoldFont').fillColor('#2C3E50')
    .text('Accessibility', titleMargin, titleY + 90, { width: titleWidth, align: 'center' });
  titleDoc.fontSize(28).font('BoldFont').fillColor('#2C3E50')
    .text('Audit Report', titleMargin, titleY + 130, { width: titleWidth, align: 'center' });

  const preparedY = titlePageHeight - 120;
  titleDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text('Prepared for', titleMargin, preparedY);
  titleDoc.fontSize(13).font('BoldFont').fillColor('#2C3E50')
    .text(siteName, titleMargin, preparedY + 18, { width: 200 });
  titleDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text('Package', titleMargin, preparedY + 40);
  titleDoc.fontSize(13).font('BoldFont').fillColor('#2C3E50')
    .text(packageText, titleMargin, preparedY + 58, { width: 200 });
  titleDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text('on', titleMargin, preparedY + 82);
  titleDoc.fontSize(13).font('BoldFont').fillColor('#2C3E50')
    .text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), titleMargin, preparedY + 100, { width: 200 });

  const logoX = titleDoc.page.width - 180;
  const logoY = titlePageHeight - 150;
  const logoSize = 120;
  drawReportLogo(titleDoc, { x: logoX, y: logoY, size: logoSize });

  drawCoverSummarySection(titleDoc, platformSummary.length > 0 ? platformSummary : reportPages.map((page) => ({
    platform: getReportPageName(page.report.url),
    score: page.report.score,
  })), {
    x: titleMargin,
    y: titleY + 190,
    width: titlePageWidth,
  });

  titleDoc.end();
  await new Promise<void>((resolve, reject) => {
    titleStream.on('finish', resolve);
    titleStream.on('error', reject);
  });

  const coverPagePath = path.join(outputDir, `cover-${device}-${Date.now()}.pdf`);
  const coverDoc = new PDFDocument({ margin: 40, size: 'A4' });
  const coverStream = fsSync.createWriteStream(coverPagePath);
  coverDoc.pipe(coverStream);
  coverDoc.registerFont('RegularFont', 'Helvetica');
  coverDoc.registerFont('BoldFont', 'Helvetica-Bold');

  const coverMargin = 40;
  const coverWidth = 515;
  const avgScore = reportPages.length > 0
    ? reportPages.reduce((sum, page) => sum + (page.report.score || 0), 0) / reportPages.length
    : 0;
  const roundedScore = Math.round(avgScore);
  const isPassing = avgScore >= 80;

  const headerHeight = 50;
  coverDoc.rect(0, 0, coverDoc.page.width, headerHeight).fill('#1E3A8A');
  coverDoc.fontSize(16).font('BoldFont').fillColor('#FFFFFF')
    .text(`Website Accessibility Audit Report – (${deviceCapitalized})`, coverMargin, 15, {
      width: coverWidth,
      align: 'left',
    });

  const separatorY = headerHeight;
  coverDoc.strokeColor('#FFFFFF').lineWidth(1)
    .moveTo(0, separatorY)
    .lineTo(coverDoc.page.width, separatorY)
    .stroke();
  coverDoc.strokeColor('#DC3545').lineWidth(0.5)
    .moveTo(0, separatorY + 1)
    .lineTo(coverDoc.page.width, separatorY + 1)
    .stroke();

  const contentStartY = separatorY + 2;
  const contentHeight = 200;
  const contentMargin = 20;
  const contentX = contentMargin;
  const contentWidth = coverDoc.page.width - (contentMargin * 2);

  coverDoc.rect(contentX, contentStartY, contentWidth, contentHeight).fill('#FFE5E5');
  coverDoc.rect(contentX, contentStartY, contentWidth, contentHeight)
    .strokeColor('#DC3545')
    .lineWidth(1)
    .stroke();

  coverDoc.fontSize(14).font('BoldFont').fillColor('#000000')
    .text(`Overall Accessibility Score (${deviceCapitalized})`, contentX + 15, contentStartY + 15, {
      width: contentWidth - 170,
    });

  coverDoc.fontSize(11).font('BoldFont').fillColor('#2C3E50')
    .text(`Package: ${packageText}`, contentX + contentWidth - 150, contentStartY + 17, {
      width: 135,
      align: 'right',
    });

  const scoreColor = roundedScore >= 80 ? '#28A745' : roundedScore >= 70 ? '#FD7E14' : '#DC3545';
  coverDoc.fontSize(72).font('BoldFont').fillColor(scoreColor)
    .text(`${roundedScore}%`, contentX, contentStartY + 50, { width: contentWidth, align: 'center' });

  if (isPassing) {
    coverDoc.fontSize(12).font('BoldFont').fillColor('#28A745')
      .text('PASS: Meets Recommended Standard', contentX, contentStartY + 140, { width: contentWidth, align: 'center' });
  } else {
    coverDoc.fontSize(12).font('BoldFont').fillColor('#DC3545')
      .text('WARNING: Below Recommended Standard', contentX, contentStartY + 140, { width: contentWidth, align: 'center' });
  }

  coverDoc.fontSize(10).font('RegularFont').fillColor('#000000')
    .text('Minimum recommended score: 80%', contentX, contentStartY + 160, { width: contentWidth, align: 'center' });

  const coverY = contentStartY + contentHeight + 30;
  coverDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text(`Report prepared for: ${email_address}`, coverMargin + 60, coverY);
  coverDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text(`Pages audited: ${reportPages.length}`, coverMargin + 60, coverY + 25, { width: coverWidth - 120 });
  if (gapPageCount > 0) {
    coverDoc.fontSize(11).font('RegularFont').fillColor('#B45309')
      .text(
        buildGapCoverLine(reportPages.length, gapPages),
        coverMargin + 60,
        coverY + 50,
        { width: coverWidth - 120 },
      );
  }
  coverDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text(`Package: ${packageText}`, coverMargin + 60, coverY + (gapPageCount > 0 ? 75 : 50), { width: coverWidth - 120 });
  addFooterToPdfDocument(coverDoc, 2);
  coverDoc.end();

  await new Promise<void>((resolve, reject) => {
    coverStream.on('finish', resolve);
    coverStream.on('error', reject);
  });

  // ── TOC: two-pass rendering ──────────────────────────────────────────────
  // Collect page names, scores, and per-report page counts independently of
  // the final TOC page numbers. We can't pre-compute how many pages the TOC
  // will occupy without rendering it, so we do two passes: the first render
  // uses placeholder page numbers and gives us the actual TOC page count; the
  // second render uses the corrected numbers.
  const tocEntryData = buildMergeTocEntries(assembledPages);

  const renderToc = async (
    entries: Array<{ pageName: string; score: string; startPage: number }>,
    filePath: string,
  ): Promise<void> => {
    const tocDoc = new PDFDocument({ margin: 40, size: 'A4' });
    const tocStream = fsSync.createWriteStream(filePath);
    tocDoc.pipe(tocStream);
    tocDoc.registerFont('RegularFont', 'Helvetica');
    tocDoc.registerFont('BoldFont', 'Helvetica-Bold');

    let tocY = 40;
    const tocMargin = 40;
    const tocWidth = 515;
    const tocHeaderHeight = 35;
    const tocRowHeight = 28;
    const colWidths = [320, 100, 95];

    tocDoc.fontSize(24).font('BoldFont').fillColor('#2C3E50')
      .text('Table of Contents', tocMargin, tocY, { width: tocWidth, align: 'center' });
    tocY += 50;

    const drawTocHeader = () => {
      tocDoc.rect(tocMargin, tocY, tocWidth, tocHeaderHeight).fill('#6366F1');
      tocDoc.fontSize(12).font('BoldFont').fillColor('#FFFFFF');
      let x = tocMargin;
      tocDoc.text('Page', x + 15, tocY + 12, { width: colWidths[0] - 30, align: 'left' });
      x += colWidths[0];
      tocDoc.text('Score', x, tocY + 12, { width: colWidths[1], align: 'center' });
      x += colWidths[1];
      tocDoc.text('Page #', x, tocY + 12, { width: colWidths[2], align: 'center' });
      tocY += tocHeaderHeight + 5;
    };

    drawTocHeader();
    tocDoc.fontSize(11).font('RegularFont').fillColor('#1F2937');

    entries.forEach((entry, index) => {
      if (tocY + tocRowHeight > tocDoc.page.height - 60) {
        tocDoc.addPage();
        tocY = tocMargin;
        drawTocHeader();
      }

      if (index % 2 === 0) {
        tocDoc.rect(tocMargin, tocY, tocWidth, tocRowHeight).fill('#F9FAFB');
      }

      let x = tocMargin;
      tocDoc.fillColor('#1F2937').text(entry.pageName, x + 15, tocY + 8, {
        width: colWidths[0] - 30,
        align: 'left',
      });
      x += colWidths[0];

      const status = entry.score === 'N/A' ? { color: '#6B7280' } : getScoreStatus(Number.parseFloat(entry.score));
      tocDoc.fillColor(status.color).font('BoldFont').text(entry.score, x, tocY + 8, {
        width: colWidths[1],
        align: 'center',
      });
      tocDoc.font('RegularFont');
      x += colWidths[1];

      tocDoc.fillColor('#3498DB').font('BoldFont').text(`${entry.startPage}`, x, tocY + 8, {
        width: colWidths[2],
        align: 'center',
      });
      tocDoc.font('RegularFont');

      tocDoc.strokeColor('#E5E7EB').lineWidth(0.5)
        .moveTo(tocMargin, tocY + tocRowHeight)
        .lineTo(tocMargin + tocWidth, tocY + tocRowHeight)
        .stroke();

      tocY += tocRowHeight;
    });

    addFooterToPdfDocument(tocDoc, 3);
    tocDoc.end();

    await new Promise<void>((resolve, reject) => {
      tocStream.on('finish', resolve);
      tocStream.on('error', reject);
    });
  };

  // Pass 1: render with placeholder page numbers to measure actual TOC page count.
  const tocPass1Path = path.join(outputDir, `toc-pass1-${device}-${Date.now()}.pdf`);
  await renderToc(
    tocEntryData.map((e) => ({ pageName: e.pageName, score: e.score, startPage: 0 })),
    tocPass1Path,
  );
  const actualTocPageCount = (await PDFLib.load(await fs.readFile(tocPass1Path))).getPageCount();
  await fs.unlink(tocPass1Path).catch(() => undefined);

  // Pass 2: assign correct page numbers and render the final TOC.
  // title(1) + cover(1) + toc(actualTocPageCount) → first report starts here
  let currentPageNumber = 2 + actualTocPageCount + 1;
  const tocEntries = tocEntryData.map((e) => {
    const entry = { pageName: e.pageName, score: e.score, startPage: currentPageNumber };
    currentPageNumber += e.actualPageCount;
    return entry;
  });

  const tocPagePath = path.join(outputDir, `toc-${device}-${Date.now()}.pdf`);
  await renderToc(tocEntries, tocPagePath);

  // ── Merge: title → cover → TOC → individual report pages ─────────────────
  const titleBytes = await fs.readFile(titlePagePath);
  const titleDocLib = await PDFLib.load(titleBytes);
  const [titlePage] = await mergedPdf.copyPages(titleDocLib, [0]);
  mergedPdf.addPage(titlePage);
  await fs.unlink(titlePagePath).catch(() => undefined);

  const coverBytes = await fs.readFile(coverPagePath);
  const coverDocLib = await PDFLib.load(coverBytes);
  const [coverPage] = await mergedPdf.copyPages(coverDocLib, [0]);
  mergedPdf.addPage(coverPage);
  await fs.unlink(coverPagePath).catch(() => undefined);

  const tocBytes = await fs.readFile(tocPagePath);
  const tocDocLib = await PDFLib.load(tocBytes);
  const allTocPageIndices = Array.from({ length: tocDocLib.getPageCount() }, (_, i) => i);
  const allTocPages = await mergedPdf.copyPages(tocDocLib, allTocPageIndices);
  for (const p of allTocPages) mergedPdf.addPage(p);
  await fs.unlink(tocPagePath).catch(() => undefined);

  for (const page of assembledPages) {
    if (page.kind === 'gap') {
      const gapPagePath = await renderGapPage({
        url: page.url,
        reason: page.reason,
        outputDir,
        device,
      });
      try {
        const gapBytes = await fs.readFile(gapPagePath);
        const gapDocLib = await PDFLib.load(gapBytes);
        const [gapPage] = await mergedPdf.copyPages(gapDocLib, [0]);
        mergedPdf.addPage(gapPage);
      } finally {
        await fs.unlink(gapPagePath).catch(() => undefined);
      }
      continue;
    }

    const pdfBytes = await fs.readFile(page.pdfPath);
    const pdfDoc = await PDFLib.load(pdfBytes);

    if (page.pageCount > 1) {
      const pageIndices = Array.from({ length: page.pageCount - 1 }, (_value, pageIndex) => pageIndex + 1);
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((copiedPage) => mergedPdf.addPage(copiedPage));
    }
  }

  // Post-conditions: the TOC must describe exactly the assembled body, and the
  // merged page count must match the TOC's page-number arithmetic.
  if (tocEntries.length !== reportPages.length + gapPageCount) {
    throw new Error(
      `Combined ${device} PDF assembly mismatch: TOC has ${tocEntries.length} entries but the body contains ${reportPages.length} reports and ${gapPageCount} gap pages.`,
    );
  }
  const expectedMergedPageCount = 2 + actualTocPageCount
    + tocEntryData.reduce((sum, entry) => sum + entry.actualPageCount, 0);
  if (mergedPdf.getPageCount() !== expectedMergedPageCount) {
    throw new Error(
      `Combined ${device} PDF assembly mismatch: expected ${expectedMergedPageCount} pages from the TOC arithmetic but the merged document has ${mergedPdf.getPageCount()}.`,
    );
  }

  const mergedPdfBytes = await mergedPdf.save();
  await fs.writeFile(outputPath, mergedPdfBytes);
  return outputPath;
}

export async function generateCombinedPlatformReport(options: {
  reports: FullAuditPlatformReport[];
  device: FullAuditDevice;
  email_address: string;
  outputDir: string;
  planType: string;
  individualPdfPaths: string[];
  platformSummary?: PlatformSummaryEntry[];
  wcagStandard?: string | null;
  conformanceLevel?: string | null;
}): Promise<string> {
  const { reports, device, email_address, outputDir, planType, platformSummary = [], wcagStandard, conformanceLevel } = options;
  if (!reports || reports.length === 0) {
    throw new Error('No reports provided for combined PDF generation');
  }

  const deviceCapitalized = device.charAt(0).toUpperCase() + device.slice(1);
  const packageText = getPackageDisplayName(planType);
  const outputPath = path.join(outputDir, `combined-${device}-report.pdf`);

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
  });

  const writeStream = fsSync.createWriteStream(outputPath);
  doc.pipe(writeStream);
  doc.registerFont('RegularFont', 'Helvetica');
  doc.registerFont('BoldFont', 'Helvetica-Bold');

  let currentY = 40;
  const margin = 40;
  const pageWidth = 515;

  doc.fontSize(28).font('BoldFont').fillColor('#2C3E50')
    .text(`Combined ${deviceCapitalized} Audit Report`, margin, currentY, { width: pageWidth, align: 'center' });
  drawReportLogo(doc, { x: doc.page.width - 180, y: 50, size: 120 });
  currentY += 60;

  doc.fontSize(14).font('RegularFont').fillColor('#7F8C8D')
    .text(`Generated for: ${email_address}`, margin, currentY, { width: pageWidth, align: 'center' });
  currentY += 30;

  doc.fontSize(12).font('RegularFont').fillColor('#7F8C8D')
    .text(`Platform: ${deviceCapitalized}`, margin, currentY, { width: pageWidth, align: 'center' });
  currentY += 20;

  doc.fontSize(12).font('RegularFont').fillColor('#7F8C8D')
    .text(`Package: ${packageText}`, margin, currentY, { width: pageWidth, align: 'center' });
  currentY += 20;

  doc.fontSize(12).font('RegularFont').fillColor('#7F8C8D')
    .text(`Total Pages Audited: ${reports.length}`, margin, currentY, { width: pageWidth, align: 'center' });
  currentY += 20;

  doc.fontSize(12).font('RegularFont').fillColor('#7F8C8D')
    .text(`Evaluated against: ${describeWcagStandardLabel(wcagStandard, conformanceLevel)}`, margin, currentY, { width: pageWidth, align: 'center' });
  currentY += 40;

  const avgScore = reports.length > 0
    ? reports.reduce((sum, report) => sum + (report.score || 0), 0) / reports.length
    : 0;
  doc.fontSize(16).font('BoldFont').fillColor('#3498DB')
    .text(`Average Score: ${Math.round(avgScore)}%`, margin, currentY, { width: pageWidth, align: 'center' });
  currentY += 40;

  currentY = drawCoverSummarySection(doc, platformSummary.length > 0 ? platformSummary : reports.map((report) => ({
    platform: getReportPageName(report.url),
    score: report.score,
  })), {
    x: margin,
    y: currentY,
    width: pageWidth,
  });

  doc.fontSize(11).font('RegularFont').fillColor('#95A5A6')
    .text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}`, margin, currentY, { width: pageWidth, align: 'center' });

  doc.addPage();
  currentY = margin;
  doc.fontSize(20).font('BoldFont').fillColor('#2C3E50')
    .text('Pages Summary', margin, currentY, { width: pageWidth });
  currentY += 30;
  doc.fontSize(12).font('RegularFont').fillColor('#7F8C8D')
    .text(`Package: ${packageText}`, margin, currentY, { width: pageWidth });
  currentY += 30;

  const headerHeight = 30;
  const rowHeight = 25;
  const colWidths = [50, 280, 90, 95];

  const drawHeader = () => {
    doc.rect(margin, currentY, pageWidth, headerHeight).fill('#6366F1');
    doc.fontSize(11).font('BoldFont').fillColor('#FFFFFF');
    let x = margin;
    doc.text('#', x + 10, currentY + 10, { width: colWidths[0] - 20, align: 'center' });
    x += colWidths[0];
    doc.text('Page URL', x + 10, currentY + 10, { width: colWidths[1] - 20, align: 'left' });
    x += colWidths[1];
    doc.text('Score', x + 10, currentY + 10, { width: colWidths[2] - 20, align: 'center' });
    x += colWidths[2];
    doc.text('Status', x + 10, currentY + 10, { width: colWidths[3] - 20, align: 'center' });
    currentY += headerHeight;
  };

  drawHeader();
  doc.fontSize(10).font('RegularFont').fillColor('#1F2937');

  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index];

    if (currentY + rowHeight > doc.page.height - 60) {
      doc.addPage();
      currentY = margin;
      drawHeader();
    }

    if (index % 2 === 0) {
      doc.rect(margin, currentY, pageWidth, rowHeight).fill('#F9FAFB');
    }

    let x = margin;
    doc.fillColor('#1F2937').text(`${index + 1}`, x + 10, currentY + 7, {
      width: colWidths[0] - 20,
      align: 'center',
    });
    x += colWidths[0];

    let displayUrl = report.url;
    try {
      const urlObj = new URL(report.url);
      displayUrl = (urlObj.pathname || urlObj.hostname).substring(0, 50);
    } catch {
      displayUrl = report.url.substring(0, 50);
    }

    doc.fillColor('#1F2937').text(displayUrl, x + 10, currentY + 7, {
      width: colWidths[1] - 20,
      align: 'left',
    });
    x += colWidths[1];

    const scoreText = report.score !== null && report.score !== undefined ? `${Math.round(report.score)}%` : 'N/A';
    doc.fillColor('#1F2937').text(scoreText, x, currentY + 7, {
      width: colWidths[2],
      align: 'center',
    });
    x += colWidths[2];

    const status = getScoreStatus(report.score);
    doc.fillColor(status.color).font('BoldFont').text(status.label, x, currentY + 7, {
      width: colWidths[3],
      align: 'center',
    });
    doc.font('RegularFont');

    doc.strokeColor('#E5E7EB').lineWidth(0.5)
      .moveTo(margin, currentY + rowHeight)
      .lineTo(margin + pageWidth, currentY + rowHeight)
      .stroke();

    currentY += rowHeight;
  }

  if (currentY > doc.page.height - 100) {
    doc.addPage();
    currentY = margin;
  }

  currentY += 30;
  doc.fontSize(12).font('BoldFont').fillColor('#34495E')
    .text('Detailed Reports', margin, currentY, { width: pageWidth });
  currentY += 25;

  doc.fontSize(10).font('RegularFont').fillColor('#4B5563')
    .text('Individual detailed audit reports for each page have been generated separately. Each detailed report contains:', margin, currentY, { width: pageWidth, lineGap: 5 });
  currentY += 40;

  const details = [
    'Complete score calculation breakdown',
    'Category-by-category audit summary',
    'Detailed findings for each audit',
    'Specific recommendations for improvements',
  ];

  details.forEach((detail) => {
    doc.fontSize(10).font('RegularFont').fillColor('#4B5563')
      .text(`• ${detail}`, margin + 20, currentY, { width: pageWidth - 40 });
    currentY += 20;
  });

  doc.end();
  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
  });
}
