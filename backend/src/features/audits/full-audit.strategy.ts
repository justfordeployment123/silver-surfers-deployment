import type { FullAuditDevice, FullAuditScannerMode } from './full-audit.helpers.ts';

export interface FullAuditTargetPage {
  url: string;
  isHomepage: boolean;
  priorityBucket: 'homepage' | 'primary' | 'secondary' | 'other';
}

export interface PlannedFullAuditTargetPage extends FullAuditTargetPage {
  preferredScanMode: FullAuditScannerMode;
  allowFullRetry: boolean;
}

export interface FullAuditTargetResult {
  url: string;
  device: FullAuditDevice;
  isHomepage: boolean;
  scanModeUsed: FullAuditScannerMode;
  status: 'completed' | 'failed';
  score?: number | null;
  failureReason?: string;
  errorCode?: string;
  statusCode?: number;
}

export interface FullAuditExecutionSummary {
  plannedTargetCount: number;
  successfulTargetCount: number;
  degradedTargetCount: number;
  failedTargetCount: number;
  warnings: string[];
}

export interface ScannerLoadSnapshot {
  activeAudits: number;
  queuedAudits: number;
  maxConcurrentAudits: number;
  maxQueuedAudits: number;
}

const PRIMARY_PAGE_KEYWORDS = [
  'pricing',
  'price',
  'plan',
  'plans',
  'service',
  'services',
  'product',
  'products',
  'solution',
  'solutions',
  'feature',
  'features',
];

const SECONDARY_PAGE_KEYWORDS = [
  'contact',
  'about',
  'help',
  'faq',
  'support',
];

function normalizeComparableUrl(input: string): string {
  try {
    const parsed = new URL(input.startsWith('http') ? input : `https://${input}`);
    const normalizedHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const collapsedPath = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    const normalizedPath = ['/', '/home', '/index', '/index.html', '/index.htm', '/default', '/default.aspx'].includes(collapsedPath.toLowerCase())
      ? '/'
      : collapsedPath.toLowerCase();
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${normalizedHost}${port}${normalizedPath}`;
  } catch {
    const fallback = String(input || '').trim().replace(/\/+$/, '').toLowerCase();
    return fallback.replace(/^https?:\/\/www\./, (prefix) => prefix.replace('www.', ''));
  }
}

function getUrlPathTokens(input: string): string[] {
  try {
    const parsed = new URL(input.startsWith('http') ? input : `https://${input}`);
    return parsed.pathname
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  } catch {
    return String(input || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }
}

function getPriorityBucket(url: string, homepageUrl: string): FullAuditTargetPage['priorityBucket'] {
  if (normalizeComparableUrl(url) === normalizeComparableUrl(homepageUrl)) {
    return 'homepage';
  }

  const tokens = getUrlPathTokens(url);
  if (tokens.some((token) => PRIMARY_PAGE_KEYWORDS.includes(token))) {
    return 'primary';
  }

  if (tokens.some((token) => SECONDARY_PAGE_KEYWORDS.includes(token))) {
    return 'secondary';
  }

  return 'other';
}

export function selectFullAuditTargetPages(
  homepageUrl: string,
  crawledLinks: string[],
  options?: {
    totalPageLimit?: number;
    priorityPageLimit?: number;
  },
): FullAuditTargetPage[] {
  const totalPageLimit = Math.max(1, options?.totalPageLimit || 6);
  const priorityPageLimit = Math.max(0, options?.priorityPageLimit || 3);
  const byNormalizedUrl = new Map<string, { url: string; index: number }>();
  const orderedLinks = [homepageUrl, ...crawledLinks];

  orderedLinks.forEach((link, index) => {
    const normalized = normalizeComparableUrl(link);
    if (!normalized || byNormalizedUrl.has(normalized)) {
      return;
    }

    byNormalizedUrl.set(normalized, {
      url: link,
      index,
    });
  });

  const pages = [...byNormalizedUrl.values()].map((entry) => ({
    url: entry.url,
    index: entry.index,
    priorityBucket: getPriorityBucket(entry.url, homepageUrl),
  }));

  const homepage = pages.find((page) => page.priorityBucket === 'homepage');
  const nonHomepagePages = pages
    .filter((page) => page.priorityBucket !== 'homepage')
    .sort((left, right) => {
      const rank = {
        primary: 0,
        secondary: 1,
        other: 2,
      } as const;

      const leftRank = rank[left.priorityBucket as 'primary' | 'secondary' | 'other'];
      const rightRank = rank[right.priorityBucket as 'primary' | 'secondary' | 'other'];

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.index - right.index;
    });

  const priorityPages = nonHomepagePages
    .filter((page) => page.priorityBucket === 'primary' || page.priorityBucket === 'secondary')
    .slice(0, priorityPageLimit);
  const selectedNormalized = new Set(priorityPages.map((page) => normalizeComparableUrl(page.url)));
  const fillerPages = nonHomepagePages.filter((page) => !selectedNormalized.has(normalizeComparableUrl(page.url)));

  const selectedPages = [
    ...(homepage ? [homepage] : []),
    ...priorityPages,
    ...fillerPages,
  ].slice(0, totalPageLimit);

  return selectedPages.map((page) => ({
    url: page.url,
    isHomepage: page.priorityBucket === 'homepage',
    priorityBucket: page.priorityBucket,
  }));
}

export function planFullAuditTargetPages(
  targetPages: FullAuditTargetPage[],
  options?: {
    fullModePageLimit?: number;
  },
): PlannedFullAuditTargetPage[] {
  const fullModePageLimit = Math.max(0, options?.fullModePageLimit ?? 2);
  let remainingFullModePages = fullModePageLimit;

  return targetPages.map((page) => {
    const shouldUseFullMode = remainingFullModePages > 0;
    if (shouldUseFullMode) {
      remainingFullModePages -= 1;
    }

    return {
      ...page,
      preferredScanMode: shouldUseFullMode ? 'full' : 'lite',
      allowFullRetry: page.isHomepage,
    };
  });
}

export function shouldPreferLiteScannerForLoad(
  load: ScannerLoadSnapshot | null | undefined,
  options?: {
    isHomepage?: boolean;
  },
): boolean {
  if (!load || options?.isHomepage) {
    return false;
  }

  const queuedRatio = load.maxQueuedAudits > 0
    ? load.queuedAudits / load.maxQueuedAudits
    : 0;
  const activeRatio = load.maxConcurrentAudits > 0
    ? load.activeAudits / load.maxConcurrentAudits
    : 0;

  return load.queuedAudits >= Math.max(1, load.maxQueuedAudits - 1)
    || queuedRatio >= 0.75
    || (activeRatio >= 1 && load.queuedAudits > 0);
}

export function resolveFullAuditCompletionStatus(
  summary: FullAuditExecutionSummary,
): 'completed' | 'completed_with_warnings' | 'failed' {
  if (summary.successfulTargetCount <= 0) {
    return 'failed';
  }

  if (summary.degradedTargetCount > 0 || summary.failedTargetCount > 0 || summary.warnings.length > 0) {
    return 'completed_with_warnings';
  }

  return 'completed';
}
