import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateSeniorFriendlinessScore,
  crawlOrderForReportIndex,
  generateAuditAiSummaryPdf,
  generateCombinedPlatformReport,
  generateSeniorAccessibilityReport,
  humanizeAuditFailureReason,
  mergePDFsByPlatform,
} from './src/features/audits/report-generation.ts';
import {
  buildAggregateAuditScorecard,
  buildAuditScorecard,
} from './src/features/audits/audit-scorecard.ts';
import { buildWcagMatrix } from './src/features/audits/wcag-matrix.ts';
import { buildAggregateRemediationRoadmap } from './src/features/audits/analysis-details.ts';
import { generateAuditAiReport } from './src/features/audits/ai-reporting.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1] || fallback;
}

function safeText(value, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

function buildFullAuditPdfFileName(url, device) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = parsed.hostname.replace(/^www\./, '');
    let pathname = parsed.pathname.replace(/[^a-zA-Z0-9]/g, '_');
    if (pathname.length > 40) {
      pathname = `${pathname.slice(0, 40)}_`;
    }

    const hash = String(url.split('').reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0)).replace('-', '').slice(0, 8);
    return `${hostname}${pathname ? `_${pathname}` : ''}_${hash}-${device}.pdf`;
  } catch {
    return `report_${device}.pdf`;
  }
}

async function writeJsonReport(report, outputDir, index, device) {
  const jsonPath = path.join(outputDir, `report-${device}-${Date.now()}-${index}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  return jsonPath;
}

function buildPlatformSummary(reportsByPlatform) {
  return Object.entries(reportsByPlatform).map(([device, reports]) => {
    const scores = reports
      .map((report) => report.score)
      .filter((score) => typeof score === 'number' && Number.isFinite(score));

    return {
      platform: `${device.charAt(0).toUpperCase()}${device.slice(1)}`,
      score: scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
      // Phase 6.1 / N1: weight for the executive-summary headline so it
      // reproduces the page-weighted mean of this same table.
      pageCount: scores.length,
    };
  });
}

// Phase 8.3 (F13/N11): per-device page list backing the platform averages,
// rendered as an appendix in the exec summary so every Mobile/Tablet number
// is reproducible from the summary itself even when the combined per-device
// PDF isn't attached to a given delivery.
function buildPlatformPageDetail(reportsByPlatform) {
  return Object.entries(reportsByPlatform).map(([device, reports]) => ({
    platform: `${device.charAt(0).toUpperCase()}${device.slice(1)}`,
    pages: reports.map((report) => ({ url: report.url, score: report.score ?? null })),
  }));
}

function buildPlatformScores(reportsByPlatform) {
  return Object.entries(reportsByPlatform).map(([device, reports]) => {
    const scores = reports
      .map((report) => report.score)
      .filter((score) => typeof score === 'number' && Number.isFinite(score));

    return {
      key: device,
      label: `${device.charAt(0).toUpperCase()}${device.slice(1)}`,
      score: scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      pageCount: reports.length,
    };
  });
}

async function listPdfFiles(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        const stats = await fs.stat(fullPath);
        files.push({
          filename: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
          path: fullPath,
          size: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        });
      }
    }
  }

  await walk(rootDir);
  return files;
}

async function main() {
  const aggregatePath = readArg('aggregate');
  const outputDir = readArg('output-dir');
  const manifestPath = readArg('manifest');
  const email = readArg('email', 'unknown-client');
  const planId = readArg('plan-id', 'pro');
  const fullName = readArg('full-name', 'Valued Customer');

  if (!aggregatePath || !outputDir || !manifestPath) {
    throw new Error('--aggregate, --output-dir, and --manifest are required.');
  }

  await fs.mkdir(outputDir, { recursive: true });

  const aggregate = JSON.parse(await fs.readFile(aggregatePath, 'utf8'));
  const reportsByPlatform = {};
  const missingPagesByPlatform = {};
  const scorecards = [];
  const pdfQueue = [];
  // Phase 8.2 (F13/N11): merge/fallback failures used to be swallowed by a
  // bare console.error with no fallback attempt, so a device (typically
  // mobile/tablet) could silently ship nothing while desktop succeeded.
  // Collected here and written into the manifest so the caller can see it.
  const warnings = [];
  // Phase 6.2 / N2, N15: distinct page URLs, kept separate from
  // scorecards.length (one entry per page x device) so "Pages audited" never
  // triples the real page count.
  const uniquePageUrls = new Set();
  // Phase 6.3 / N6: union of Fail criteria across every per-page matrix this
  // report actually ships, so the exec summary's flagged count always
  // recomputes from the same matrices the full report prints.
  const flaggedCriteria = new Set();

  // Phase 1: collect scan data and build scorecards (no PDF generation yet)
  for (const [index, target] of (aggregate.targets || []).entries()) {
    if (!target?.success || !target.report) {
      // Failed targets become honest gap pages at their crawl position so the
      // combined report discloses what could not be audited (e.g. bot protection).
      const device = safeText(target?.device, 'desktop');
      const url = safeText(target?.url, aggregate.url || 'unknown-url');
      const deviceOrder = (reportsByPlatform[device]?.length ?? 0) + (missingPagesByPlatform[device]?.length ?? 0);
      (missingPagesByPlatform[device] ||= []).push({
        url,
        reason: humanizeAuditFailureReason({ errorCode: target?.errorCode, error: target?.error }),
        order: deviceOrder,
      });
      continue;
    }

    const device = safeText(target.device, 'desktop');
    const url = safeText(target.url, aggregate.url || 'unknown-url');
    const isLiteVersion = Boolean(target.isLiteVersion);
    const jsonReportPath = await writeJsonReport(target.report, outputDir, index, device);
    const scoreData = await calculateSeniorFriendlinessScore(target.report, { isLiteVersion });
    const scorecard = buildAuditScorecard(target.report, {
      pageUrl: url,
      isLiteVersion,
      // Phase 6.7c / N10c: device attribution for every issue this page yields.
      platform: device,
    });
    scorecards.push(scorecard);
    uniquePageUrls.add(url);

    // Build a per-page WCAG matrix from this page's own scorecard so each PDF
    // shows accurate issue counts for that page, not site-wide totals.
    const pageWcagMatrix = buildWcagMatrix(
      scorecard.issues,
      scorecard.notApplicableAuditIds,
      scorecard.manualReviewAuditIds,
    );
    for (const row of pageWcagMatrix) {
      if (row.status === 'fail') {
        flaggedCriteria.add(row.criterion);
      }
    }

    const reportEntry = {
      jsonReportPath,
      url,
      imagePaths: {},
      score: typeof scoreData?.finalScore === 'number' ? Math.round(scoreData.finalScore) : null,
      scoreCard: scorecard,
    };

    reportsByPlatform[device] ||= [];
    reportsByPlatform[device].push(reportEntry);

    pdfQueue.push({ jsonReportPath, url, device, wcagMatrix: pageWcagMatrix });
  }

  // Phase 3: generate PDFs using each page's own wcagMatrix.
  // Capture the returned reportPath so we can pair each PDF with its report entry
  // by crawl order rather than by filesystem listing order (which is alphabetical
  // and causes label mismatches when pages are dropped or reordered).
  console.log(`[P1A-v4] Phase3 start: queue=${pdfQueue.length} scorecards=${scorecards.length}`);
  for (let _pdfIdx = 0; _pdfIdx < pdfQueue.length; _pdfIdx++) {
    const entry = pdfQueue[_pdfIdx];
    const { jsonReportPath, url, device, wcagMatrix: pageWcagMatrix } = entry;
    console.log(`[P1A-v4] PDF ${_pdfIdx + 1}/${pdfQueue.length} device=${device} wcag=${pageWcagMatrix?.length ?? 0}r`);
    const pdfResult = await generateSeniorAccessibilityReport({
      inputFile: jsonReportPath,
      url,
      email_address: email,
      device,
      imagePaths: {},
      outputDir,
      formFactor: device,
      planType: planId,
      wcagMatrix: pageWcagMatrix,
    });
    if (pdfResult?.reportPath) {
      entry.outputPdfPath = pdfResult.reportPath;
    }
  }

  for (const [device, reports] of Object.entries(reportsByPlatform)) {
    // Build aligned (pdfPath, report) pairs using the queue's crawl order.
    // This guarantees pdfPaths[i] and reports[i] always describe the same page.
    // Pages whose PDF generation failed (no outputPdfPath) become explicit gap
    // pages at their original crawl position instead of being silently dropped.
    const deviceQueue = pdfQueue.filter((e) => e.device === device);
    const scanGaps = missingPagesByPlatform[device] || [];
    const scanGapOrders = scanGaps.map((gap) => gap.order ?? Number.MAX_SAFE_INTEGER).sort((a, b) => a - b);
    const successfulPairs = [];
    const missingPages = [...scanGaps];
    deviceQueue.forEach((entry, i) => {
      const report = reports[i];
      if (entry.outputPdfPath && report) {
        successfulPairs.push({ pdfPath: entry.outputPdfPath, report });
      } else {
        missingPages.push({
          url: entry.url,
          reason: 'a PDF generation error',
          order: crawlOrderForReportIndex(i, scanGapOrders),
        });
      }
    });

    if (successfulPairs.length === 0) {
      continue;
    }

    try {
      await mergePDFsByPlatform({
        pdfPaths: successfulPairs.map((p) => p.pdfPath),
        device,
        email_address: email,
        outputDir,
        reports: successfulPairs.map((p) => p.report),
        missingPages,
        planType: planId,
        platformSummary: buildPlatformSummary(reportsByPlatform),
      });
    } catch (mergeError) {
      // Phase 8.2 (F13/N11): a merge failure (e.g. Phase 1's dedup-hash
      // guard tripping on near-identical mobile/tablet pages) used to mean
      // that device silently shipped nothing while desktop succeeded, with
      // only a bare console.error nobody downstream could see. Now: log
      // loudly with full context, attempt the same honest-fallback summary
      // PDF the TS pipeline falls back to, and record a warning either way
      // so the caller (and eventually the client-facing record) can tell
      // the device came up short instead of silently vanishing.
      const mergeErrorMessage = mergeError?.message || String(mergeError);
      console.error(`Combined ${device} PDF merge failed: ${mergeErrorMessage}`, {
        reportUrls: successfulPairs.map((p) => p.report.url),
        missingPageUrls: missingPages.map((p) => p.url),
      });
      warnings.push(`Combined ${device} report merge failed (${mergeErrorMessage}); a fallback summary PDF was substituted.`);

      try {
        await generateCombinedPlatformReport({
          reports,
          device,
          email_address: email,
          outputDir,
          planType: planId,
          individualPdfPaths: successfulPairs.map((p) => p.pdfPath),
          platformSummary: buildPlatformSummary(reportsByPlatform),
        });
      } catch (summaryError) {
        const summaryErrorMessage = summaryError?.message || String(summaryError);
        console.error(`Fallback combined ${device} PDF generation also failed: ${summaryErrorMessage}`);
        warnings.push(`Combined ${device} report could not be generated at all (${summaryErrorMessage}).`);
      }
    }
  }

  let aiReport;
  if (scorecards.length > 0) {
    const aggregateScorecard = buildAggregateAuditScorecard(scorecards, {
      // Phase 6.2 / N2, N15: honest distinct-URL count, not one entry per
      // page x device.
      pageCount: uniquePageUrls.size || scorecards.length,
      platforms: buildPlatformScores(reportsByPlatform),
    });
    aiReport = await generateAuditAiReport({
      url: safeText(aggregate.url, 'full-audit'),
      fullName,
      scorecard: aggregateScorecard,
      // Phase 6.5 / N8: union each page's own recommendation objects — the
      // same ones rendered into that page's "Priority Recommendations"
      // section — deduplicated by rule id, instead of the aggregate
      // scorecard's already-capped, cross-page top-issue lists.
      remediationRoadmap: buildAggregateRemediationRoadmap(scorecards),
    });

    await generateAuditAiSummaryPdf(aiReport, {
      url: safeText(aggregate.url, 'full-audit'),
      outputPath: path.join(outputDir, 'ai-executive-summary.pdf'),
      title: 'AI Executive Summary',
      scorecard: aggregateScorecard,
      platformSummary: buildPlatformSummary(reportsByPlatform),
      // Phase 6.3 / N6: union of Fail criteria across every per-page matrix
      // this report ships.
      wcagFlaggedCriteriaCount: flaggedCriteria.size,
      // Phase 8.3 (F13/N11): per-device page detail appendix.
      platformPageDetail: buildPlatformPageDetail(reportsByPlatform),
    }).catch((error) => {
      console.warn(`AI executive summary PDF generation failed: ${error?.message || error}`);
    });
  }

  for (const file of await fs.readdir(outputDir)) {
    if (file.toLowerCase().endsWith('.json')) {
      await fs.unlink(path.join(outputDir, file)).catch(() => undefined);
    }
  }

  const files = await listPdfFiles(outputDir);
  await fs.writeFile(manifestPath, JSON.stringify({
    success: files.length > 0,
    outputDir,
    files,
    ...(aiReport ? { aiReport } : {}),
    // Phase 8.2 (F13/N11): surfaced so the caller can see a per-device
    // report fell back or failed instead of it silently vanishing.
    ...(warnings.length > 0 ? { warnings } : {}),
  }, null, 2), 'utf8');
}

main().catch(async (error) => {
  const manifestPath = readArg('manifest');
  if (manifestPath) {
    await fs.writeFile(manifestPath, JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2), 'utf8').catch(() => undefined);
  }
  console.error(error);
  process.exitCode = 1;
});
