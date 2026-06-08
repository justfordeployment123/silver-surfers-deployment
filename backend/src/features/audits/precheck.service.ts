import { lookup } from 'node:dns/promises';
import net from 'node:net';

import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';

const precheckLogger = logger.child('feature:audits:precheck');

export interface CandidateUrlResult {
  input: string;
  candidateUrls: string[];
}

export interface PrecheckSuccessResult {
  ok: true;
  accessible: boolean;
  status?: number;
  finalUrl: string;
  redirected: boolean;
  finalState?: 'PASS' | 'PROTECTED' | 'PARTIAL';
  checkStatus?: 'HEALTHY' | 'PROTECTED' | 'TCP_REACHABLE' | 'SSL_ERROR' | 'SERVER_ERROR' | 'UNKNOWN_HTTP_RESPONSE';
  health?: 'OK' | 'PROTECTED' | 'SSL_ERROR' | 'HTTP_ERROR';
  reason?: string;
}

export interface PrecheckFailureResult {
  ok: false;
  error: string;
  checkStatus?: 'NOT_REACHABLE' | 'NOT_FOUND' | 'SERVER_ERROR' | 'REDIRECTED_DOMAIN_MISMATCH' | 'UNKNOWN_HTTP_RESPONSE';
}

export type PrecheckResult = PrecheckSuccessResult | PrecheckFailureResult;

type FetchLike = typeof fetch;
type TcpProbe = (url: string, timeoutMs: number) => Promise<boolean>;

interface PrecheckOptions {
  tcpProbe?: TcpProbe;
  scannerFallback?: boolean;
}

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
  return parts.length === 2 && parts.every((part) => part.length > 0);
}

function toCleanUrl(urlObj: URL): string {
  const value = urlObj.toString();
  return urlObj.pathname === '/' && !urlObj.search && !urlObj.hash
    ? value.replace(/\/$/, '')
    : value;
}

// Builds candidate URLs to try, including www / non-www variants for apex domains.
// Order: https-www, https-bare, http-www, http-bare.
export function buildCandidateUrls(input: string | undefined): CandidateUrlResult {
  const raw = String(input || '').trim();
  if (!raw) return { input: raw, candidateUrls: [] };

  const hasProtocol = /^https?:\/\//i.test(raw);
  const cleaned = raw.replace(/^\w+:\/\//, '');
  const baseUrls = hasProtocol ? [raw] : [`https://${cleaned}`, `http://${cleaned}`];

  const candidates: string[] = [];
  const seen = new Set<string>();

  function add(url: string): void {
    if (!seen.has(url)) {
      candidates.push(url);
      seen.add(url);
    }
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

function extractErrorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code
    || ((error as { cause?: NodeJS.ErrnoException })?.cause?.code);
}

function classifyNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = extractErrorCode(error);

  if (code === 'ENOTFOUND' || message.includes('ENOTFOUND')) {
    return 'Domain not found - check the URL is spelled correctly.';
  }
  if (code === 'ECONNREFUSED' || message.includes('ECONNREFUSED')) {
    return 'Server refused the connection.';
  }
  if (code === 'ECONNRESET' || message.includes('ECONNRESET')) {
    return 'Connection was reset by the server.';
  }
  if ((error instanceof Error && error.name === 'AbortError') || message.includes('ETIMEDOUT')) {
    return 'Request timed out.';
  }
  return message;
}

function buildBrowserLikeHeaders(): HeadersInit {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

function isBotProtectionStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429;
}

function comparableHostname(value: string): string {
  return value.toLowerCase().replace(/^www\./, '');
}

function hasSameRedirectHostname(inputUrl: string, finalUrl: string): boolean {
  try {
    const input = new URL(inputUrl);
    const final = new URL(finalUrl);
    return comparableHostname(input.hostname) === comparableHostname(final.hostname);
  } catch {
    return false;
  }
}

function isRootCandidateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/' && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

async function readResponsePreview(response: Response): Promise<string> {
  try {
    return (await response.clone().text()).slice(0, 20_000).toLowerCase();
  } catch {
    return '';
  }
}

function hasBotProtectionSignals(response: Response, bodyPreview: string): boolean {
  const server = response.headers.get('server')?.toLowerCase() || '';
  const via = response.headers.get('via')?.toLowerCase() || '';
  const setCookie = response.headers.get('set-cookie')?.toLowerCase() || '';
  const headerNames = new Set([...response.headers.keys()].map((name) => name.toLowerCase()));

  return [
    bodyPreview.includes('akamai'),
    bodyPreview.includes('access denied'),
    bodyPreview.includes('bot'),
    bodyPreview.includes('captcha'),
    bodyPreview.includes('cloudflare'),
    bodyPreview.includes('datadome'),
    bodyPreview.includes('perimeterx'),
    server.includes('cloudflare'),
    server.includes('akamai'),
    via.includes('akamai'),
    setCookie.includes('datadome'),
    setCookie.includes('px'),
    headerNames.has('x-akamai-session-info'),
    headerNames.has('akamai-origin-hop'),
    headerNames.has('cf-ray'),
    headerNames.has('x-datadome'),
  ].some(Boolean);
}

async function classifyHttpResponse(response: Response, url: string): Promise<PrecheckResult> {
  const finalUrl = response.url || url;
  const base = {
    finalUrl,
    status: response.status,
    redirected: response.redirected,
  };

  if (response.redirected && !hasSameRedirectHostname(url, finalUrl)) {
    return {
      ok: false,
      error: `URL redirected to a different domain (${new URL(finalUrl).hostname}). Please check the website URL.`,
      checkStatus: 'REDIRECTED_DOMAIN_MISMATCH',
    };
  }

  if (response.status >= 200 && response.status < 400) {
    return {
      ok: true,
      accessible: true,
      ...base,
      finalState: 'PASS',
      checkStatus: 'HEALTHY',
      health: 'OK',
      reason: 'Website responded successfully.',
    };
  }

  const bodyPreview = await readResponsePreview(response);
  const protectedResponse = isBotProtectionStatus(response.status)
    || ((response.status === 503 || response.status >= 500) && hasBotProtectionSignals(response, bodyPreview));

  if (protectedResponse) {
    return {
      ok: true,
      accessible: true,
      ...base,
      finalState: 'PROTECTED',
      checkStatus: 'PROTECTED',
      health: 'PROTECTED',
      reason: 'Website is online but blocked automated access.',
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      error: 'Page not found (404). Please enter a valid website page.',
      checkStatus: 'NOT_FOUND',
    };
  }

  if (response.status >= 500) {
    return {
      ok: true,
      accessible: false,
      ...base,
      finalState: 'PARTIAL',
      checkStatus: 'SERVER_ERROR',
      health: 'HTTP_ERROR',
      reason: `Server returned HTTP ${response.status}. The scanner will still try to process the website.`,
    };
  }

  return {
    ok: true,
    accessible: false,
    ...base,
    finalState: 'PARTIAL',
    checkStatus: 'UNKNOWN_HTTP_RESPONSE',
    health: 'HTTP_ERROR',
    reason: `Received HTTP ${response.status}. The scanner will still try to process the website.`,
  };
}

async function defaultTcpProbe(url: string, timeoutMs: number): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'http:' ? 80 : 443;
  if (!hostname || !Number.isFinite(port)) {
    return false;
  }

  await lookup(hostname);

  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: hostname, port, timeout: timeoutMs });
    let settled = false;

    const finish = (reachable: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };

    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function runTcpPrecheck(url: string, tcpProbe: TcpProbe, timeoutMs = 5_000): Promise<PrecheckResult> {
  try {
    const reachable = await tcpProbe(url, timeoutMs);
    if (!reachable) {
      return { ok: false, error: 'Host did not accept a TCP connection.' };
    }

    return {
      ok: true,
      accessible: false,
      finalUrl: url,
      redirected: false,
      finalState: 'PARTIAL',
      checkStatus: 'TCP_REACHABLE',
      health: 'HTTP_ERROR',
      reason: 'Host accepted TCP connection, but no usable HTTP response was received.',
    };
  } catch (error) {
    return { ok: false, error: classifyNetworkError(error), checkStatus: 'NOT_REACHABLE' };
  }
}

async function runHttpPrecheck(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs = 10_000,
): Promise<PrecheckResult> {
  const { signal, cancel } = timeoutSignal(timeoutMs);

  try {
    let response = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal,
      headers: buildBrowserLikeHeaders(),
    });

    if (response.status === 400 || response.status === 404 || response.status === 405 || response.status >= 500) {
      response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal,
        headers: buildBrowserLikeHeaders(),
      });
    }

    return classifyHttpResponse(response, url);
  } catch (error) {
    return { ok: false, error: classifyNetworkError(error), checkStatus: 'NOT_REACHABLE' };
  } finally {
    cancel();
  }
}

function isDefinitiveHttpFailure(result: PrecheckResult): boolean {
  return !result.ok && result.checkStatus !== 'NOT_REACHABLE';
}

function shouldTryScannerFallback(result: PrecheckResult): boolean {
  if (result.ok) {
    return !result.accessible;
  }

  return result.checkStatus !== 'REDIRECTED_DOMAIN_MISMATCH';
}

function classifyPartialHealth(error: string): { checkStatus: 'SSL_ERROR' | 'TCP_REACHABLE'; health: 'SSL_ERROR' | 'HTTP_ERROR'; reason: string } {
  if (/certificate|cert|ssl|tls|self.signed|expired|hostname|altname|unable to verify/i.test(error)) {
    return {
      checkStatus: 'SSL_ERROR',
      health: 'SSL_ERROR',
      reason: 'Host accepted TCP connection, but HTTPS certificate validation failed.',
    };
  }

  return {
    checkStatus: 'TCP_REACHABLE',
    health: 'HTTP_ERROR',
    reason: 'Host accepted TCP connection, but no usable HTTP response was received.',
  };
}

async function runScannerPrecheckFallback(url: string, fetchImpl: FetchLike): Promise<PrecheckResult | undefined> {
  const scannerPrecheckUrl = env.scannerPrecheckFallbackUrl
    || (env.scannerDispatchMode === 'http' ? env.scannerServiceUrl : undefined);

  if (!env.scannerPrecheckFallbackEnabled || !scannerPrecheckUrl) {
    return undefined;
  }

  const { signal, cancel } = timeoutSignal(env.scannerPrecheckFallbackTimeoutMs);

  try {
    precheckLogger.info('Trying scanner browser precheck fallback.', {
      url,
      scannerServiceUrl: scannerPrecheckUrl,
    });

    const response = await fetchImpl(`${scannerPrecheckUrl}/precheck`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

    if (!response.ok || !payload) {
      precheckLogger.warn('Scanner browser precheck fallback returned an invalid response.', {
        url,
        status: response.status,
      });
      return undefined;
    }

    if (payload.success) {
      return {
        ok: true,
        accessible: true,
        finalUrl: payload.finalUrl || url,
        status: payload.status,
        redirected: Boolean(payload.redirected),
        finalState: 'PASS',
        checkStatus: 'HEALTHY',
        health: 'OK',
        reason: 'Website was verified by scanner browser precheck.',
      };
    }

    precheckLogger.info('Scanner browser precheck fallback could not verify URL.', {
      url,
      error: payload.error,
    });
    return undefined;
  } catch (error) {
    precheckLogger.warn('Scanner browser precheck fallback failed.', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  } finally {
    cancel();
  }
}

// Checks whether a URL is reachable enough to enqueue an audit.
// The AWS scanner performs the real browser validation later.
export async function precheckCandidateUrl(
  url: string,
  fetchImpl: FetchLike = fetch,
  options: PrecheckOptions = {},
): Promise<PrecheckResult> {
  const httpResult = await runHttpPrecheck(url, fetchImpl);
  if (httpResult.ok) {
    if (!httpResult.accessible && (options.scannerFallback ?? true)) {
      const scannerResult = await runScannerPrecheckFallback(url, fetchImpl);
      if (scannerResult?.ok) {
        return scannerResult;
      }
    }

    return httpResult;
  }

  if (isDefinitiveHttpFailure(httpResult)) {
    if ((options.scannerFallback ?? true) && shouldTryScannerFallback(httpResult)) {
      const scannerResult = await runScannerPrecheckFallback(url, fetchImpl);
      if (scannerResult?.ok) {
        return scannerResult;
      }
    }

    return httpResult;
  }

  precheckLogger.debug('Direct HTTP precheck failed, trying TCP reachability.', {
    url,
    error: httpResult.error,
  });

  const tcpResult = await runTcpPrecheck(url, options.tcpProbe ?? defaultTcpProbe);
  if (tcpResult.ok) {
    if (options.scannerFallback ?? true) {
      const scannerResult = await runScannerPrecheckFallback(url, fetchImpl);
      if (scannerResult?.ok) {
        return scannerResult;
      }
    }

    if (!isRootCandidateUrl(url)) {
      return {
        ok: false,
        error: 'No usable HTTP response was received for this page. Please check the URL or try the website homepage.',
        checkStatus: 'NOT_REACHABLE',
      };
    }

    const partial = classifyPartialHealth(httpResult.error);
    return {
      ok: true,
      accessible: false,
      finalUrl: url,
      redirected: false,
      finalState: 'PARTIAL',
      checkStatus: partial.checkStatus,
      health: partial.health,
      reason: partial.reason,
    };
  }

  return httpResult;
}
