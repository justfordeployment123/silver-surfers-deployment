import { env } from '../src/config/env.ts';
import { buildCandidateUrls, precheckCandidateUrl } from '../src/features/audits/precheck.service.ts';

type CandidateOutcome = {
  candidateUrl: string;
  ok: boolean;
  accessible?: boolean;
  status?: number;
  finalUrl?: string;
  redirected?: boolean;
  finalState?: string;
  checkStatus?: string;
  health?: string;
  reason?: string;
  error?: string;
  durationMs: number;
};

function usage(): void {
  console.log([
    'Usage:',
    '  node --import ./scripts/register-typescript-loader.mjs scripts/test-url-precheck.ts <url> [url...]',
    '',
    'Examples:',
    '  node --import ./scripts/register-typescript-loader.mjs scripts/test-url-precheck.ts bestbuy.com chatgpt.com',
    '  node --import ./scripts/register-typescript-loader.mjs scripts/test-url-precheck.ts https://www.curemd.com',
    '',
    `Scanner service: ${env.scannerServiceUrl}`,
    `SKIP_URL_PRECHECK: ${env.skipUrlPrecheck}`,
  ].join('\n'));
}

async function checkCandidate(candidateUrl: string): Promise<CandidateOutcome> {
  const startedAt = Date.now();
  const result = await precheckCandidateUrl(candidateUrl);
  const durationMs = Date.now() - startedAt;

  if (result.ok) {
    return {
      candidateUrl,
      ok: true,
      accessible: result.accessible,
      status: result.status,
      finalUrl: result.finalUrl,
      redirected: result.redirected,
      finalState: result.finalState,
      checkStatus: result.checkStatus,
      health: result.health,
      reason: result.reason,
      durationMs,
    };
  }

  return {
    candidateUrl,
    ok: false,
    error: result.error,
    checkStatus: result.checkStatus,
    durationMs,
  };
}

async function runPrecheck(rawUrl: string): Promise<void> {
  const { input, candidateUrls } = buildCandidateUrls(rawUrl);

  console.log('\n' + '-'.repeat(72));
  console.log(`Input      : ${input || '(empty)'}`);
  console.log(`Candidates : ${candidateUrls.length}`);

  if (!candidateUrls.length) {
    console.log('Final      : FAIL');
    console.log('Reason     : Invalid URL');
    return;
  }

  if (env.skipUrlPrecheck) {
    console.log('Final      : SKIPPED');
    console.log(`Normalized : ${candidateUrls[0]}`);
    console.log('Reason     : SKIP_URL_PRECHECK=true');
    return;
  }

  const outcomes: CandidateOutcome[] = [];
  let selected: CandidateOutcome | undefined;

  for (const candidateUrl of candidateUrls) {
    const outcome = await checkCandidate(candidateUrl);
    outcomes.push(outcome);
    if (outcome.ok && outcome.accessible) {
      selected = outcome;
      break;
    }
    if (outcome.ok && !outcome.accessible) {
      break;
    }
  }

  console.log('');
  console.log('Candidate results:');
  outcomes.forEach((outcome, index) => {
    const prefix = `${String(index + 1).padStart(2, '0')}.`;
    if (outcome.ok) {
      console.log(`${prefix} ${outcome.accessible ? 'OK  ' : 'WARN'} ${outcome.candidateUrl}`);
      console.log(`     status=${outcome.status ?? 'unknown'} redirected=${Boolean(outcome.redirected)} time=${outcome.durationMs}ms`);
      console.log(`     finalState=${outcome.finalState ?? 'unknown'} check=${outcome.checkStatus ?? 'unknown'} health=${outcome.health ?? 'unknown'}`);
      if (outcome.reason) console.log(`     reason=${outcome.reason}`);
      console.log(`     final=${outcome.finalUrl}`);
    } else {
      console.log(`${prefix} FAIL ${outcome.candidateUrl}`);
      console.log(`     check=${outcome.checkStatus ?? 'unknown'} error=${outcome.error} time=${outcome.durationMs}ms`);
    }
  });

  console.log('');
  const partial = outcomes.find((outcome) => outcome.ok && !outcome.accessible);
  if (selected) {
    console.log('Final      : PASS');
    console.log(`Normalized : ${selected.candidateUrl}`);
    console.log(`Final URL  : ${selected.finalUrl}`);
    console.log(`Status     : ${selected.status ?? 'unknown'}`);
    console.log(`Redirected : ${Boolean(selected.redirected)}`);
  } else if (partial) {
    console.log('Final      : PARTIAL');
    console.log(`Normalized : ${partial.candidateUrl}`);
    console.log(`Final URL  : ${partial.finalUrl}`);
    console.log(`Check      : ${partial.checkStatus ?? 'unknown'}`);
    console.log(`Health     : ${partial.health ?? 'unknown'}`);
    if (partial.reason) console.log(`Reason     : ${partial.reason}`);
  } else {
    console.log('Final      : FAIL');
    console.log('Reason     : URL not reachable. Please check the domain and try again.');
  }
}

const urls = process.argv.slice(2).filter(Boolean);

if (!urls.length || urls.includes('--help') || urls.includes('-h')) {
  usage();
  process.exit(urls.length ? 0 : 1);
}

for (const url of urls) {
  await runPrecheck(url);
}
