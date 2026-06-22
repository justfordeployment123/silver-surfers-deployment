import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../src/config/env.ts';
import { buildCandidateUrls, precheckCandidateUrl } from '../src/features/audits/precheck.service.ts';

// ── buildCandidateUrls ────────────────────────────────────────────────────────

test('buildCandidateUrls adds www and non-www variants for bare apex domain', () => {
  assert.deepEqual(buildCandidateUrls('example.com'), {
    input: 'example.com',
    candidateUrls: [
      'https://www.example.com',
      'https://example.com',
      'http://www.example.com',
      'http://example.com',
    ],
  });
});

test('buildCandidateUrls treats www-prefixed input the same as bare domain', () => {
  assert.deepEqual(buildCandidateUrls('www.example.com'), {
    input: 'www.example.com',
    candidateUrls: [
      'https://www.example.com',
      'https://example.com',
      'http://www.example.com',
      'http://example.com',
    ],
  });
});

test('buildCandidateUrls adds www variants for explicit-protocol apex domain', () => {
  assert.deepEqual(buildCandidateUrls('https://example.com'), {
    input: 'https://example.com',
    candidateUrls: [
      'https://www.example.com',
      'https://example.com',
      'http://www.example.com',
      'http://example.com',
    ],
  });
});

test('buildCandidateUrls does not add www variants for subdomains', () => {
  assert.deepEqual(buildCandidateUrls('blog.example.com'), {
    input: 'blog.example.com',
    candidateUrls: ['https://blog.example.com', 'http://blog.example.com'],
  });
});

test('buildCandidateUrls preserves an explicit protocol with path', () => {
  assert.deepEqual(buildCandidateUrls('https://example.com/path'), {
    input: 'https://example.com/path',
    candidateUrls: ['https://example.com/path', 'http://example.com/path'],
  });
});

test('buildCandidateUrls does not add www variants when URL has a path', () => {
  assert.deepEqual(buildCandidateUrls('example.com/page'), {
    input: 'example.com/page',
    candidateUrls: ['https://example.com/page', 'http://example.com/page'],
  });
});

test('buildCandidateUrls returns empty candidates for empty input', () => {
  assert.deepEqual(buildCandidateUrls(''), {
    input: '',
    candidateUrls: [],
  });
});

// ── precheckCandidateUrl ──────────────────────────────────────────────────────

test('precheckCandidateUrl resolves via direct HTTP HEAD check', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response('', { status: 200 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.deepEqual(result, {
    ok: true,
    accessible: true,
    finalUrl: 'https://example.com',
    status: 200,
    redirected: false,
    finalState: 'PASS',
    checkStatus: 'HEALTHY',
    health: 'OK',
    reason: 'Website responded successfully.',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.com');
  assert.equal(calls[0].method, 'HEAD');
});

test('precheckCandidateUrl falls back to GET when HEAD returns 405', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response('', {
      status: init?.method === 'HEAD' ? 405 : 200,
    });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, true);
    assert.equal(result.finalState, 'PASS');
    assert.equal(result.checkStatus, 'HEALTHY');
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'HEAD');
  assert.equal(calls[1].method, 'GET');
});

test('precheckCandidateUrl falls back to GET when HEAD returns 400', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response('', {
      status: init?.method === 'HEAD' ? 400 : 200,
    });
  };

  const result = await precheckCandidateUrl('https://facebook.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 200);
    assert.equal(result.checkStatus, 'HEALTHY');
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'HEAD');
  assert.equal(calls[1].method, 'GET');
});

test('precheckCandidateUrl falls back to GET when HEAD returns 404', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response('', {
      status: init?.method === 'HEAD' ? 404 : 200,
    });
  };

  const result = await precheckCandidateUrl('https://www.delwebb.com/homes/arizona/phoenix', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 200);
    assert.equal(result.checkStatus, 'HEALTHY');
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'HEAD');
  assert.equal(calls[1].method, 'GET');
});

test('precheckCandidateUrl treats 502 Bad Gateway as reachable but inconclusive', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    // HEAD → 502 triggers GET retry; GET also 502
    return new Response('', { status: init?.method === 'POST' ? 503 : 502 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, false);
    assert.equal(result.status, 502);
    assert.equal(result.finalState, 'PARTIAL');
    assert.equal(result.checkStatus, 'SERVER_ERROR');
    assert.equal(result.health, 'HTTP_ERROR');
    assert.match(result.reason || '', /HTTP 502/);
  }
});

test('precheckCandidateUrl falls back to TCP reachability when HTTP check fails', async () => {
  const calls: Array<{ url: string; method?: string }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl, {
    tcpProbe: async () => true,
    scannerFallback: false,
  });

  assert.deepEqual(result, {
    ok: true,
    accessible: false,
    finalUrl: 'https://example.com',
    redirected: false,
    finalState: 'PARTIAL',
    checkStatus: 'TCP_REACHABLE',
    health: 'HTTP_ERROR',
    reason: 'Host accepted TCP connection, but no usable HTTP response was received.',
  });
  assert.equal(calls[0].method, 'HEAD');
  assert.equal(calls.length, 1);
});

test('precheckCandidateUrl marks TCP-only exact page URLs as enqueueable partial checks', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.method === 'HEAD' || init?.method === 'GET') {
      throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
    }

    throw new Error('unexpected call');
  };

  const result = await precheckCandidateUrl('https://example.com/missing?utm_source=test', fetchImpl, {
    tcpProbe: async () => true,
    scannerFallback: false,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, false);
    assert.equal(result.finalUrl, 'https://example.com/missing?utm_source=test');
    assert.equal(result.finalState, 'PARTIAL');
    assert.equal(result.checkStatus, 'TCP_REACHABLE');
    assert.equal(result.health, 'HTTP_ERROR');
  }
});

test('precheckCandidateUrl returns failure when both HTTP and TCP checks fail', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.method === 'HEAD' || init?.method === 'GET') {
      throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    }
    throw new Error('unexpected call');
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl, {
    tcpProbe: async () => false,
    scannerFallback: false,
  });

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'NOT_REACHABLE');
});

test('precheckCandidateUrl accepts common bot-protection statuses as reachable', async () => {
  const fetchImpl: typeof fetch = async () => {
    return new Response('', { status: 403 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, true);
    assert.equal(result.status, 403);
    assert.equal(result.finalUrl, 'https://example.com');
    assert.equal(result.finalState, 'PROTECTED');
    assert.equal(result.checkStatus, 'PROTECTED');
    assert.equal(result.health, 'PROTECTED');
  }
});

test('precheckCandidateUrl rejects 404 pages as not auditable', async () => {
  const fetchImpl: typeof fetch = async () => {
    return new Response('', { status: 404 });
  };

  const result = await precheckCandidateUrl('https://example.com/missing', fetchImpl, {
    tcpProbe: async () => true,
  });

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'NOT_FOUND');
});

test('precheckCandidateUrl lets scanner browser fallback rescue a false 404', async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const originalFallbackEnabled = env.scannerPrecheckFallbackEnabled;
  const originalFallbackUrl = env.scannerPrecheckFallbackUrl;
  env.scannerPrecheckFallbackEnabled = true;
  env.scannerPrecheckFallbackUrl = 'http://scanner.test';

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    if (init?.method === 'POST') {
      return Response.json({
        success: true,
        finalUrl: 'https://www.example.com/protected-page',
        status: 200,
        redirected: false,
      });
    }

    return new Response('', { status: 404 });
  };

  try {
    const result = await precheckCandidateUrl('https://www.example.com/protected-page', fetchImpl);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.accessible, true);
      assert.equal(result.finalUrl, 'https://www.example.com/protected-page');
      assert.equal(result.status, 200);
      assert.equal(result.checkStatus, 'HEALTHY');
      assert.equal(result.reason, 'Website was verified by scanner browser precheck.');
    }
    assert.deepEqual(calls.map((call) => call.method), ['HEAD', 'GET', 'POST']);
  } finally {
    env.scannerPrecheckFallbackEnabled = originalFallbackEnabled;
    env.scannerPrecheckFallbackUrl = originalFallbackUrl;
  }
});

test('precheckCandidateUrl allows 503 only when bot-protection signals are present', async () => {
  const fetchImpl: typeof fetch = async () => {
    return new Response('Access denied by Akamai', { status: 503 });
  };

  const result = await precheckCandidateUrl('https://example.com', fetchImpl);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, true);
    assert.equal(result.status, 503);
    assert.equal(result.finalState, 'PROTECTED');
    assert.equal(result.checkStatus, 'PROTECTED');
  }
});

test('precheckCandidateUrl marks SSL failures with TCP reachability as partial', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' });
  };

  const result = await precheckCandidateUrl('https://expired.badssl.com', fetchImpl, {
    tcpProbe: async () => true,
    scannerFallback: false,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessible, false);
    assert.equal(result.finalState, 'PARTIAL');
    assert.equal(result.checkStatus, 'SSL_ERROR');
    assert.equal(result.health, 'SSL_ERROR');
  }
});

test('precheckCandidateUrl accepts scanner browser precheck fallback after HTTP/TCP partial', async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const originalFallbackEnabled = env.scannerPrecheckFallbackEnabled;
  const originalFallbackUrl = env.scannerPrecheckFallbackUrl;
  env.scannerPrecheckFallbackEnabled = true;
  env.scannerPrecheckFallbackUrl = 'http://scanner.test';

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    if (init?.method === 'POST') {
      return Response.json({
        success: true,
        finalUrl: 'https://www.example.com/',
        status: 200,
        redirected: true,
      });
    }

    throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
  };

  try {
    const result = await precheckCandidateUrl('https://example.com', fetchImpl, {
      tcpProbe: async () => true,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.accessible, true);
      assert.equal(result.finalUrl, 'https://www.example.com/');
      assert.equal(result.status, 200);
      assert.equal(result.checkStatus, 'HEALTHY');
      assert.equal(result.reason, 'Website was verified by scanner browser precheck.');
    }
    assert.equal(calls.some((call) => call.method === 'POST' && call.url.endsWith('/precheck')), true);
  } finally {
    env.scannerPrecheckFallbackEnabled = originalFallbackEnabled;
    env.scannerPrecheckFallbackUrl = originalFallbackUrl;
  }
});

test('precheckCandidateUrl rejects redirects to a different domain', async () => {
  const fetchImpl: typeof fetch = async () => {
    const response = new Response('', {
      status: 403,
      headers: { server: 'cloudflare' },
    });
    Object.defineProperty(response, 'url', { value: 'https://parked.example/cart' });
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  };

  const result = await precheckCandidateUrl('http://bestbuy.com.com', fetchImpl);

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'REDIRECTED_DOMAIN_MISMATCH');
});

test('precheckCandidateUrl does not let TCP fallback rescue a domain-mismatch redirect', async () => {
  const fetchImpl: typeof fetch = async () => {
    const response = new Response('', { status: 403 });
    Object.defineProperty(response, 'url', { value: 'https://parked.example/cart' });
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  };

  let tcpCalled = false;
  const result = await precheckCandidateUrl('http://bestbuy.com.com', fetchImpl, {
    tcpProbe: async () => {
      tcpCalled = true;
      return true;
    },
  });

  assert.equal(result.ok, false);
  assert.equal((result as { checkStatus: string }).checkStatus, 'REDIRECTED_DOMAIN_MISMATCH');
  assert.equal(tcpCalled, false);
});
