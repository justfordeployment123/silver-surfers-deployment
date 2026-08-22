// Matches the old app's <Route index element={<Navigate to="/admin/dashboard"
// replace />} /> nested inside the AdminLayout route.
//
// Three bugs found in sequence while verifying this file:
//
// 1. An earlier client-side ('use client' + useEffect + router.replace)
//    version raced against AdminLayout's own client-side auth-check effect
//    — both fire on the same initial mount of /admin, and this page's
//    redirect to /admin/dashboard could win the race, leaving an
//    unauthenticated visitor stranded on the dashboard instead of bounced
//    to /admin/login.
//
// 2. Switching to a Server Component calling next/navigation's redirect()
//    looked like a fix, but this route has no dynamic data, so Next.js
//    statically prerendered it (confirmed via `curl -I /admin` returning
//    200 with no Location header, and the build output listing it "○
//    Static"). A statically prerendered redirect() is baked into the page
//    as a client-side instruction the router runs *after* hydration — the
//    same race as bug #1, just moved one layer down.
//
// 3. Adding `dynamic = 'force-dynamic'` (still living at
//    app/admin/(dashboard)/page.js at the time) fixed the static-prerender
//    issue but NOT the underlying error — a real browser check (not just
//    curl) showed "Application error: a client-side exception has
//    occurred", console-logged as minified React error #310: "Rendered
//    more hooks than during the previous render." Root cause: this file
//    lived inside the app/admin/(dashboard)/ route group, so it rendered
//    *underneath* AdminLayout — a 'use client' component with its own
//    useState/useEffect hooks. redirect() works by throwing a special
//    NEXT_REDIRECT value during render; throwing a Server Component child
//    mid-render while its Client Component parent is also running/hydrating
//    its own hooks produced an inconsistent hook count between renders.
//    No amount of dynamic-rendering configuration fixes this — the real
//    problem was structural (nesting under a hook-using layout at all).
//
// Fix: this file now lives at app/admin/page.js, a sibling of
// app/admin/login/ and OUTSIDE app/admin/(dashboard)/ entirely, so it never
// renders under AdminLayout and never shares a render pass with any hooks.
// `/admin/dashboard` (inside the (dashboard) group) mounts AdminLayout
// fresh on its own, client-side, running its own checkAuth exactly once —
// completely decoupled from this redirect.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdminIndex() {
  redirect('/admin/dashboard');
}
