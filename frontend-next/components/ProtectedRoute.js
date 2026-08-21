// Client-side auth guard, ported from frontend/src/components/ProtectedRoute.js.
//
// Kept intentionally client-only (no middleware/cookie auth): the backend's
// only auth mechanism is a bearer token in localStorage, which a Next.js
// middleware (server/edge) cannot read. Adding cookie-based auth is out of
// scope for this migration, so authenticated pages get no SSR benefit and
// no pre-render redirect here — that matches today's CRA behavior exactly,
// it is not a regression.
//
// Reads the current URL's search string via window.location directly
// rather than next/navigation's useSearchParams() — every page that wraps
// its content in <ProtectedRoute> (all of Group D onward) would otherwise
// need its own <Suspense> boundary, and that exact pattern was found (while
// porting Home) to sometimes leave real SSR'd HTML in place that React
// never actually hydrates (no fiber attached at all — see the writeup in
// components/home/QuickScanSection.js). Since this component is entirely
// client-only already (no SSR value from useSearchParams' hydration-aware
// behavior applies here), reading window.location sidesteps the bug class
// entirely instead of risking a repeat on every protected route.
'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getMe } from '../lib/apiClient';

const ProtectedRoute = ({ role = null, children }) => {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await getMe();
      if (!mounted) return;
      const user = res?.user;
      // If no role is specified, allow any authenticated user
      // If a role is specified, check if user has that role
      if (user && (!role || user.role === role)) setAllowed(true);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [role]);

  // react-router's <Navigate state={{from}}> has no Next.js equivalent (the
  // App Router has no navigation-state payload) — the app already has a
  // localStorage 'lastRoute' fallback for exactly this purpose (Login.js
  // reads it when no router state is available), so lean on that instead
  // of trying to reproduce router state.
  useEffect(() => {
    if (loading || allowed) return;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const from = pathname + search + hash;
    if (from && from !== '/login' && from !== '/signup' && !from.includes('/api')) {
      localStorage.setItem('lastRoute', from);
    }
    router.replace('/login');
  }, [loading, allowed, pathname, router]);

  if (loading || !allowed) {
    return (
      <>
        <style>{`
          .prl-shell {
            min-height: 100vh;
            background: var(--bg);
            padding: 120px 0 60px;
          }
          .prl-head { text-align: center; margin-bottom: 48px; }
          .prl-bar {
            border-radius: var(--r);
            background: var(--sandd);
            position: relative;
            overflow: hidden;
            margin: 0 auto;
          }
          .prl-bar::after {
            content: '';
            position: absolute; inset: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
            transform: translateX(-100%);
            animation: prl-shimmer 1.6s ease-in-out infinite;
          }
          :root[data-theme='dark'] .prl-bar::after {
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          }
          @keyframes prl-shimmer { 100% { transform: translateX(100%); } }

          .prl-title-bar { height: 34px; width: 320px; margin-bottom: 14px; }
          .prl-sub-bar   { height: 18px; width: 200px; }

          .prl-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
          }
          .prl-card {
            background: var(--surface);
            border: 1px solid var(--sandd);
            border-radius: var(--rl);
            padding: 32px;
          }
          .prl-card .prl-bar { margin: 0 0 14px; }
          .prl-line-1 { height: 24px; width: 60%; margin-bottom: 20px; }
          .prl-line-2 { height: 13px; width: 100%; margin-bottom: 10px; }
          .prl-line-3 { height: 13px; width: 85%; margin-bottom: 10px; }
          .prl-line-4 { height: 13px; width: 70%; margin-bottom: 20px; }
          .prl-btn-bar { height: 38px; width: 130px; }

          .prl-status {
            display: flex; flex-direction: column; align-items: center;
            gap: 18px; margin-top: 44px;
          }

          /* ── Preloader (bouncing block grid) ─────────────── */
          .prl-blocks {
            display: grid;
            grid-template-columns: repeat(4, 12px);
            gap: 8px;
          }
          .prl-block {
            width: 12px; height: 12px;
            border-radius: 3px;
            background: var(--t4);
            animation: prl-wave 1.4s ease infinite;
          }
          @keyframes prl-wave {
            0%, 100% { transform: translateY(0); opacity: 1; }
            50%      { transform: translateY(10px); opacity: 0.35; }
          }

          /* ── Animated status text (letters rise into view) ── */
          .prl-vtext {
            display: flex;
            justify-content: center;
            overflow: hidden;
            height: 1.3em;
            font-size: 16px;
            font-weight: 500;
            color: var(--ink6);
          }
          .prl-vtext span {
            display: inline-block;
            white-space: pre;
            transform: translateY(1.2em);
            animation: prl-letter-in 1s alternate infinite cubic-bezier(0.86, 0, 0.07, 1);
          }
          @keyframes prl-letter-in {
            0%   { transform: translateY(1.2em); opacity: 0.35; }
            100% { transform: translateY(0); opacity: 1; }
          }

          @media (max-width: 720px) {
            .prl-grid { grid-template-columns: 1fr; }
            .prl-title-bar { width: 240px; }
          }
        `}</style>

        <div className="prl-shell">
          <div className="wrap">
            <div className="prl-head">
              <div className="prl-bar prl-title-bar" />
              <div className="prl-bar prl-sub-bar" />
            </div>

            <div className="prl-grid">
              {[0, 1].map((i) => (
                <div className="prl-card" key={i}>
                  <div className="prl-bar prl-line-1" />
                  <div className="prl-bar prl-line-2" />
                  <div className="prl-bar prl-line-3" />
                  <div className="prl-bar prl-line-4" />
                  <div className="prl-bar prl-btn-bar" />
                </div>
              ))}
            </div>

            <div className="prl-status">
              <div className="prl-blocks">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span
                    key={i}
                    className="prl-block"
                    style={{ animationDelay: `${(i % 4) * 0.15}s` }}
                  />
                ))}
              </div>
              <div className="prl-vtext">
                {'Verifying authentication…'.split('').map((ch, i) => (
                  <span key={i} style={{ animationDelay: `${i * 45}ms` }}>
                    {ch === ' ' ? ' ' : ch}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return children;
};

export default ProtectedRoute;
