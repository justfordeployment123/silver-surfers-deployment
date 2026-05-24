import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';

const precheckLogger = logger.child('feature:audits:precheck');

export interface CandidateUrlResult {
  input: string;
  candidateUrls: string[];
}

export interface PrecheckSuccessResult {
  ok: true;
  status?: number;
  finalUrl: string;
  redirected: boolean;
}

export interface PrecheckFailureResult {
  ok: false;
  error: string;
}

export type PrecheckResult = PrecheckSuccessResult | PrecheckFailureResult;

type FetchLike = typeof fetch;

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

// Returns true for apex domains like example.com or www.example.com.
// Returns false for subdomains like blog.example.com.
function isApexLikeHostname(hostname: string): boolean {
  const bare = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  const parts = bare.split('.');
  return parts.length === 2 && parts.every(p => p.length > 0);
}

function toCleanUrl(urlObj: URL): string {
  const s = urlObj.toString();
  // Strip trailing slash on root URLs to keep candidate strings clean
  return urlObj.pathname === '/' && !urlObj.search && !urlObj.hash
    ? s.replace(/\/$/, '')
    : s;
}

// Builds candidate URLs to try, including www / non-www variants for apex domains.
// Order: https-www, https-bare, http-www, http-bare (protocol variants omitted when explicit).
export function buildCandidateUrls(input: string | undefined): CandidateUrlResult {
  const raw = String(input || '').trim();
  if (!raw) return { input: raw, candidateUrls: [] };

  const hasProtocol = /^https?:\/\//i.test(raw);
  const cleaned = raw.replace(/^\w+:\/\//, '');
  const baseUrls = hasProtocol ? [raw] : [`https://${cleaned}`, `http://${cleaned}`];

  const candidates: string[] = [];
  const seen = new Set<string>();

  function add(url: string): void {
    if (!seen.has(url)) { candidates.push(url); seen.add(url); }
  }

  for (const base of baseUrls) {
    try {
      const parsed = new URL(base);
      const { hostname } = parsed;
      const isRoot = parsed.pathname === '/' && !parsed.search && !parsed.hash;

      if (isApexLikeHostname(hostname) && isRoot) {
        const bare = hostname.startsWith('www.') ? hostname.slice(4) : hostname;

        const wwwUrl = new URL(base);
        wwwUrl.hostname = `www.${bare}`;

        const noWwwUrl = new URL(base);
        noWwwUrl.hostname = bare;

        add(toCleanUrl(wwwUrl));
        add(toCleanUrl(noWwwUrl));
      } else {
        add(base);
      }
    } catch {
      add(base);
    }
  }

  return { input: raw, candidateUrls: candidates };
}

function classifyNetworkError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as NodeJS.ErrnoException)?.code;

  if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND')) {
    return 'Domain not found — check the URL is spelled correctly.';
  }
  if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
    return 'Server refused the connection.';
  }
  if (code === 'ECONNRESET' || msg.includes('ECONNRESET')) {
    return 'Connection was reset by the server.';
  }
  if ((error instanceof Error && error.name === 'AbortError') || msg.includes('ETIMEDOUT')) {
    return 'Request timed out.';
  }
  return msg;
}

function classifyHttpStatus(status: number): string | null {
  if (status === 502) return 'Bad Gateway (502) — the server is down or misconfigured.';
  if (status === 503) return 'Service Unavailable (503) — the server is temporarily down.';
  if (status === 504) return 'Gateway Timeout (504) — upstream server is not responding.';
  if (status === 521) return 'Web server is down (521).';
  if (status === 523) return 'Origin is unreachable (523).';
  return null;
}

async function runHttpPrecheck(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs = 10_000,
): Promise<PrecheckResult> {
  const { signal, cancel } = timeoutSignal(timeoutMs);

  try {
    let response = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal });

    // 405 = HEAD not allowed; 5xx = server error — retry with GET to confirm
    if (response.status === 405 || response.status >= 500) {
      response = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal });
    }

    const statusError = classifyHttpStatus(response.status);
    if (statusError) {
      return { ok: false, error: statusError };
    }

    return {
      ok: true,
      finalUrl: response.url || url,
      status: response.status,
      redirected: response.redirected,
    };
  } catch (error) {
    return { ok: false, error: classifyNetworkError(error) };
  } finally {
    cancel();
  }
}

async function runScannerPrecheck(
  url: string,
  fetchImpl: FetchLike,
): Promise<PrecheckResult> {
  const { signal, cancel } = timeoutSignal(60_000);

  try {
    precheckLogger.debug('Trying scanner-service precheck.', { url, scannerServiceUrl: env.scannerServiceUrl });

    const response = await fetchImpl(`${env.scannerServiceUrl}/precheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });

    const payload = await response.json().catch(() => undefined) as {
      success?: boolean;
      finalUrl?: string;
      status?: number;
      redirected?: boolean;
      error?: string;
    } | undefined;

    if (response.ok && payload?.success) {
      return {
        ok: true,
        finalUrl: payload.finalUrl || url,
        status: payload.status,
        redirected: Boolean(payload.redirected),
      };
    }

    return {
      ok: false,
      error: payload?.error || `Scanner precheck failed with status ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cancel();
  }
}

// Server errors from classifyHttpStatus — definitive, scanner won't help.
const SERVER_ERROR_RE = /\b(502|503|504|521|523)\b/;

// Checks if a single URL is reachable.
// Tries a fast Node.js HTTP check first; falls back to the Camoufox scanner
// service only for network/connection failures that could be bot-detection.
// Definitive server errors (502, 503, 504…) are returned immediately.
export async function precheckCandidateUrl(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<PrecheckResult> {
  const httpResult = await runHttpPrecheck(url, fetchImpl);
  if (httpResult.ok) {
    return httpResult;
  }

  if (SERVER_ERROR_RE.test(httpResult.error)) {
    return httpResult;
  }

  precheckLogger.debug('Direct HTTP precheck failed, trying scanner-service.', {
    url,
    error: httpResult.error,
  });

  return runScannerPrecheck(url, fetchImpl);
}
