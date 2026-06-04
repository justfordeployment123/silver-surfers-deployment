import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateSeniorFriendlinessScore,
  generateAuditAiSummaryPdf,
  generateLiteAccessibilityReport,
  generateSeniorAccessibilityReport,
  generateSummaryPDF,
  mergePDFsByPlatform,
} from './src/features/audits/report-generation.ts';
import {
  buildAggregateAuditScorecard,
  buildAuditScorecard,
} from './src/features/audits/audit-scorecard.ts';
import { buildRemediationRoadmap } from './src/features/audits/analysis-details.ts';
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

    const hash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
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
      score: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    };
  });
}

function buildPlatformScores(reportsByPlatform) {
  return Object.entries(reportsByPlatform).map(([device, reports]) => {
    const scores = reports
      .map((report) => report.score)
      .filter((score) => typeof score === 'number' && Number.isFinite(score));

    return {
      key: device,
      label: `${device.charAt(0).toUpperCase()}${device.slice(1)}`,
      score: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
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
  const scorecards = [];

  for (const [index, target] of (aggregate.targets || []).entries()) {
    if (!target?.success || !target.report) {
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
    });
    scorecards.push(scorecard);
    const reportEntry = {
      jsonReportPath,
      url,
      imagePaths: {},
      score: typeof scoreData?.finalScore === 'number' ? Math.round(scoreData.finalScore) : null,
      scoreCard: scorecard,
    };

    reportsByPlatform[device] ||= [];
    reportsByPlatform[device].push(reportEntry);

    if (isLiteVersion && planId !== 'pro' && planId !== 'onetime') {
      const litePdfResult = await generateLiteAccessibilityReport(jsonReportPath, outputDir);
      const expectedPdfPath = path.join(outputDir, buildFullAuditPdfFileName(url, device));
      if (litePdfResult?.reportPath && litePdfResult.reportPath !== expectedPdfPath) {
        await fs.copyFile(litePdfResult.reportPath, expectedPdfPath);
        await fs.unlink(litePdfResult.reportPath).catch(() => undefined);
      }
      continue;
    }

    await generateSeniorAccessibilityReport({
      inputFile: jsonReportPath,
      url,
      email_address: email,
      device,
      imagePaths: {},
      outputDir,
      formFactor: device,
      planType: planId,
    });
  }

  for (const [device, reports] of Object.entries(reportsByPlatform)) {
    const individualPdfPaths = (await listPdfFiles(outputDir))
      .filter((file) => file.filename.endsWith(`-${device}.pdf`))
      .map((file) => file.path);

    if (individualPdfPaths.length === 0) {
      continue;
    }

    await mergePDFsByPlatform({
      pdfPaths: individualPdfPaths,
      device,
      email_address: email,
      outputDir,
      reports,
      planType: planId,
    }).catch((error) => {
      console.warn(`Combined ${device} PDF merge failed: ${error?.message || error}`);
    });
  }

  const platformSummary = buildPlatformSummary(reportsByPlatform);
  if (platformSummary.length > 0) {
    await generateSummaryPDF(platformSummary, path.join(outputDir, 'audit-summary.pdf')).catch((error) => {
      console.warn(`Summary PDF generation failed: ${error?.message || error}`);
    });
  }

  let aiReport;
  if (scorecards.length > 0) {
    const aggregateScorecard = buildAggregateAuditScorecard(scorecards, {
      pageCount: scorecards.length,
      platforms: buildPlatformScores(reportsByPlatform),
    });
    aiReport = await generateAuditAiReport({
      url: safeText(aggregate.url, 'full-audit'),
      fullName,
      scorecard: aggregateScorecard,
      remediationRoadmap: buildRemediationRoadmap(aggregateScorecard),
    });

    await generateAuditAiSummaryPdf(aiReport, {
      url: safeText(aggregate.url, 'full-audit'),
      outputPath: path.join(outputDir, 'ai-executive-summary.pdf'),
      title: 'AI Executive Summary',
      scorecard: aggregateScorecard,
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
