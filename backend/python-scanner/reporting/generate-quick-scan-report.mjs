import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) {
    return fallback;
  }

  return process.argv[index + 1] || fallback;
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

async function loadReportGenerator() {
  const candidates = [
    path.join(scriptDir, 'src/features/audits/report-generation.ts'),
    path.join(process.cwd(), 'src/features/audits/report-generation.ts'),
    path.resolve(scriptDir, '../../src/features/audits/report-generation.ts'),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return import(pathToFileURL(candidate).href);
    } catch {
      // Try the next known scanner/reporting layout.
    }
  }

  throw new Error('Unable to locate report-generation.ts for quick scan report generation.');
}

async function main() {
  const reportPath = readArg('report');
  const outputDir = readArg('output-dir');
  const manifestPath = readArg('manifest');
  const scoreArg = readArg('score');

  if (!reportPath || !outputDir || !manifestPath) {
    throw new Error('--report, --output-dir, and --manifest are required.');
  }

  await fs.mkdir(outputDir, { recursive: true });
  const { generateLiteAccessibilityReport } = await loadReportGenerator();
  const score = Number.parseFloat(scoreArg);
  await generateLiteAccessibilityReport(reportPath, outputDir, {
    canonicalScore: Number.isFinite(score) ? score : undefined,
  });

  const files = await listPdfFiles(outputDir);
  await fs.writeFile(manifestPath, JSON.stringify({
    success: files.length > 0,
    outputDir,
    files,
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
