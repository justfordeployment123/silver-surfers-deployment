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
import type { AuditScorecard } from './audit-scorecard.ts';

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

function addFooterToPdfDocument(doc: InstanceType<typeof PDFDocument>, pageNumber: number): void {
  const pageHeight = doc.page.height;
  const footerY = pageHeight - 30;
  const pageWidth = doc.page.width;
  const leftMargin = 40;
  const rightMargin = pageWidth - 40;

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

export function extractSiteNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    let hostname = urlObj.hostname.replace(/^www\./, '');
    let name = hostname.split('.')[0];
    name = name.replace(/([A-Z])/g, ' $1').replace(/([0-9]+)/g, ' $1');
    name = name.replace(/[-_]/g, ' ');
    name = name.split(' ').map((word) => {
      if (!word) {
        return '';
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ').trim();

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
): Promise<LitePdfResult> {
  return tsGenerateLiteAccessibilityReport(inputFile, outputDirectory);
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
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const normalizedHeadline = String(aiReport?.headline || '').trim();
    const normalizedSummary = String(aiReport?.summary || '').trim();
    const normalizedBusinessImpact = String(aiReport?.businessImpact || '').trim();
    const normalizedPrioritySummary = String(aiReport?.prioritySummary || '').trim();
    const normalizedStakeholderNote = String(aiReport?.stakeholderNote || '').trim();
    const normalizedRecommendations = Array.isArray(aiReport?.topRecommendations)
      ? aiReport.topRecommendations.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const normalizedFindingGuidance = Array.isArray(aiReport?.perFindingGuidance)
      ? aiReport.perFindingGuidance
        .map((item) => ({
          auditId: String(item?.auditId || '').trim(),
          title: String(item?.title || '').trim(),
          explanation: String(item?.explanation || '').trim(),
          remediation: String(item?.remediation || '').trim(),
          wcagCriteria: Array.isArray(item?.wcagCriteria)
            ? item.wcagCriteria.map((criterion) => String(criterion || '').trim()).filter(Boolean)
            : [],
        }))
        .filter((item) => item.auditId && item.title && item.explanation && item.remediation)
      : [];
    const normalizedDimensions = Array.isArray(options.scorecard?.dimensions)
      ? options.scorecard.dimensions
        .map((dimension) => ({
          label: String(dimension?.label || '').trim(),
          score: Number(dimension?.score || 0),
        }))
        .filter((dimension) => dimension.label)
      : [];
    const normalizedTopIssues = Array.isArray(options.scorecard?.topIssues)
      ? options.scorecard.topIssues
        .map((issue) => ({
          title: String(issue?.title || '').trim(),
          wcagReferences: Array.isArray(issue?.wcagReferences) ? issue.wcagReferences : [],
          wcagCriteria: Array.isArray(issue?.wcagCriteria) ? issue.wcagCriteria : [],
        }))
        .filter((issue) => issue.title)
      : [];

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
    const overallScore = Math.round(Number(options.scorecard?.overallScore || 0));
    const riskTierRaw = String(options.scorecard?.riskTier || 'unknown').toLowerCase();
    const scoreStatusRaw = String(options.scorecard?.scoreStatus || 'pending').replace(/-/g, ' ');
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
      doc.save();
      doc.rect(0, 0, doc.page.width, heroHeight).fill('#0F172A');
      doc.fillColor('#FFFFFF').font('BoldFont').fontSize(22)
        .text(options.title || 'AI Executive Summary', pageMarginLeft, 28, { width: contentWidth });
      doc.font('RegularFont').fontSize(10).fillColor('#CBD5F5')
        .text(options.url, pageMarginLeft, 60, { width: contentWidth, lineBreak: false, ellipsis: true });
      doc.font('RegularFont').fontSize(9).fillColor('#94A3B8')
        .text(`Generated ${generatedAtLabel}  •  Source: ${aiReport.provider}${aiReport.model ? ` (${aiReport.model})` : ''}`,
          pageMarginLeft, 78, { width: contentWidth });
      doc.restore();
      doc.y = heroHeight + 18;
    };

    const renderScoreCard = (): void => {
      if (!options.scorecard) return;
      const cardTop = doc.y;
      const cardHeight = 96;
      const scoreBoxWidth = 130;

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
      const detailRows: Array<[string, string]> = [
        ['Status', scoreStatusRaw.replace(/\b\w/g, (c) => c.toUpperCase())],
        ['Pages audited', String(Number(options.scorecard.pageCount || 0))],
      ];
      if (options.scorecard.wcagSummary?.criteriaCount) {
        detailRows.push(['WCAG criteria flagged', String(options.scorecard.wcagSummary.criteriaCount)]);
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
          .text(label.toUpperCase(), detailX, rowY, { width: 110, lineBreak: false });
        doc.font('BoldFont').fontSize(10).fillColor('#0F172A')
          .text(value, detailX + 110, rowY, { width: detailWidth - 110, lineBreak: false, ellipsis: true });
        rowY += 16;
      });
      doc.restore();
      doc.y = cardTop + cardHeight + 18;
    };

    const renderSectionCard = (
      heading: string,
      accentColor: string,
      body: string | null,
      bullets: string[] | null,
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
          doc.save();
          doc.fillColor(accentColor).circle(innerLeft + 5, lineY + 6, 2.5).fill();
          doc.restore();
          doc.fillColor('#334155').text(item, innerLeft + 16, lineY, { width: innerWidth - 16, lineGap: 3 });
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
    renderTopIssues();

    renderSectionCard('Summary', sectionPalette.summary, normalizedSummary, null);
    renderSectionCard('Business Impact', sectionPalette.business, normalizedBusinessImpact, null);
    renderSectionCard('Priority Summary', sectionPalette.priority, normalizedPrioritySummary, null);
    renderSectionCard(
      'Top Recommendations',
      sectionPalette.recommendations,
      null,
      normalizedRecommendations.map((rec, i) => `${i + 1}. ${rec}`),
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
    );

    renderSectionCard('Stakeholder Note', sectionPalette.stakeholder, normalizedStakeholderNote, null);

    doc.end();
    writeStream.on('finish', () => resolve(options.outputPath));
    writeStream.on('error', reject);
  });
}

export async function mergePDFsByPlatform(options: {
  pdfPaths: string[];
  device: FullAuditDevice;
  email_address: string;
  outputDir: string;
  reports: FullAuditPlatformReport[];
  planType: string;
}): Promise<string> {
  const { pdfPaths, device, email_address, outputDir, reports, planType } = options;
  if (!pdfPaths || pdfPaths.length === 0) {
    throw new Error('No PDF paths provided for merging');
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
  const baseUrl = reports[0]?.url || 'website';
  const siteName = extractSiteNameFromUrl(baseUrl);

  titleDoc.rect(0, 0, titleDoc.page.width, titlePageHeight).fill('#FFFFFF');

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

  const possibleLogoPaths = [
    resolveBackendPath('assets', 'Logo.png'),
    resolveBackendPath('backend-silver-surfers', 'assets', 'Logo.png'),
    resolveBackendPath('my-app', 'assets', 'Logo.png'),
    resolveBackendPath('src', 'assets', 'Logo.png'),
  ];

  const logoX = titleDoc.page.width - 180;
  const logoY = titlePageHeight - 150;
  const logoSize = 120;
  for (const logoPath of possibleLogoPaths) {
    try {
      if (fsSync.existsSync(logoPath)) {
        titleDoc.image(logoPath, logoX, logoY, {
          fit: [logoSize, logoSize],
          align: 'right',
        });
        break;
      }
    } catch {
      continue;
    }
  }

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
  const avgScore = reports.length > 0
    ? reports.reduce((sum, report) => sum + (report.score || 0), 0) / reports.length
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
      width: contentWidth - 30,
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
    .text(`Pages audited: ${reports.length}`, coverMargin + 60, coverY + 25, { width: coverWidth - 120 });
  coverDoc.fontSize(11).font('RegularFont').fillColor('#2C3E50')
    .text(`Package: ${packageText}`, coverMargin + 60, coverY + 50, { width: coverWidth - 120 });
  addFooterToPdfDocument(coverDoc, 2);
  coverDoc.end();

  await new Promise<void>((resolve, reject) => {
    coverStream.on('finish', resolve);
    coverStream.on('error', reject);
  });

  const pageCounts: number[] = [];
  const validPdfPaths: string[] = [];
  const validReports: FullAuditPlatformReport[] = [];
  for (let index = 0; index < pdfPaths.length; index += 1) {
    const pdfPath = pdfPaths[index];
    const report = reports[index];
    if (!report) {
      continue;
    }

    try {
      if (!await fs.access(pdfPath).then(() => true).catch(() => false)) {
        continue;
      }

      const pdfBytes = await fs.readFile(pdfPath);
      const pdfDoc = await PDFLib.load(pdfBytes);
      pageCounts.push(pdfDoc.getPageCount());
      validPdfPaths.push(pdfPath);
      validReports.push(report);
    } catch {
      continue;
    }
  }

  const tocEntries = [];
  let currentPageNumber = 4;
  for (let index = 0; index < validReports.length; index += 1) {
    const report = validReports[index];
    const scoreText = report.score !== null && report.score !== undefined ? `${Math.round(report.score)}%` : 'N/A';
    const actualPageCount = pageCounts[index] > 1 ? pageCounts[index] - 1 : 0;
    tocEntries.push({
      pageName: getReportPageName(report.url),
      score: scoreText,
      startPage: currentPageNumber,
      pageCount: actualPageCount,
    });
    currentPageNumber += actualPageCount;
  }

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

  const tocPagePath = path.join(outputDir, `toc-${device}-${Date.now()}.pdf`);
  const tocDoc = new PDFDocument({ margin: 40, size: 'A4' });
  const tocStream = fsSync.createWriteStream(tocPagePath);
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

  tocEntries.forEach((entry, index) => {
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

  const tocBytes = await fs.readFile(tocPagePath);
  const tocDocLib = await PDFLib.load(tocBytes);
  const [tocPage] = await mergedPdf.copyPages(tocDocLib, [0]);
  mergedPdf.addPage(tocPage);
  await fs.unlink(tocPagePath).catch(() => undefined);

  for (let index = 0; index < validPdfPaths.length; index += 1) {
    const pdfPath = validPdfPaths[index];
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFLib.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    if (pageCount > 1) {
      const pageIndices = Array.from({ length: pageCount - 1 }, (_value, pageIndex) => pageIndex + 1);
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
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
}): Promise<string> {
  const { reports, device, email_address, outputDir, planType } = options;
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
  currentY += 40;

  const avgScore = reports.length > 0
    ? reports.reduce((sum, report) => sum + (report.score || 0), 0) / reports.length
    : 0;
  doc.fontSize(16).font('BoldFont').fillColor('#3498DB')
    .text(`Average Score: ${Math.round(avgScore)}%`, margin, currentY, { width: pageWidth, align: 'center' });
  currentY += 40;

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
