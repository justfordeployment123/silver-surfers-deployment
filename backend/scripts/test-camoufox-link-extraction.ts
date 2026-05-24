import { env } from '../src/config/env.ts';

const [, , rawUrl, rawMaxLinks, rawMaxDepth] = process.argv;

if (!rawUrl) {
  console.error('Usage: node --import ./scripts/register-typescript-loader.mjs scripts/test-camoufox-link-extraction.ts <url> [maxLinks] [maxDepth]');
  process.exit(1);
}

const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
const maxLinks = Math.max(1, Math.min(Number(rawMaxLinks) || 50, 200));
const maxDepth = Math.max(0, Math.min(Number(rawMaxDepth) || 1, 3));
const endpoint = `${env.scannerServiceUrl}/extract-links`;
const timeoutMs = Math.max(45_000, Math.min(240_000, Number(process.env.SCANNER_LINK_EXTRACTION_TEST_TIMEOUT_MS) || 180_000));

console.log(`Scanner : ${env.scannerServiceUrl}`);
console.log(`Endpoint: ${endpoint}`);
console.log(`URL     : ${url}`);
console.log(`maxLinks: ${maxLinks}`);
console.log(`maxDepth: ${maxDepth}`);
console.log(`timeout : ${timeoutMs}ms`);
console.log('');

const startedAt = Date.now();
let response: Response;
try {
  response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      url,
      maxLinks,
      maxDepth,
      delayMs: 500,
    }),
  });
} catch (error) {
  console.error(`Request failed after ${Date.now() - startedAt}ms.`);
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error('If the scanner is still busy, restart it or lower maxDepth/maxLinks. You can also set SCANNER_LINK_EXTRACTION_TEST_TIMEOUT_MS.');
  process.exit(1);
}

const text = await response.text();
let payload: unknown;
try {
  payload = JSON.parse(text);
} catch {
  payload = text;
}

console.log(`Status  : ${response.status}`);
console.log(`Time    : ${Date.now() - startedAt}ms`);
console.log('');

if (!response.ok || typeof payload !== 'object' || payload === null) {
  console.dir(payload, { depth: null });
  process.exit(response.ok ? 0 : 1);
}

const result = payload as {
  success?: boolean;
  finalUrl?: string;
  links?: string[];
  error?: string;
};

console.log(`Success : ${Boolean(result.success)}`);
if (result.finalUrl) console.log(`Final   : ${result.finalUrl}`);
if (result.error) console.log(`Error   : ${result.error}`);
console.log(`Links   : ${result.links?.length ?? 0}`);
console.log('');

for (const [index, link] of (result.links ?? []).entries()) {
  console.log(`${String(index + 1).padStart(2, '0')}. ${link}`);
}
