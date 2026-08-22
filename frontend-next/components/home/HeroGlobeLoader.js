'use client';

// next/dynamic's `ssr: false` option is only allowed inside a Client
// Component module — this tiny wrapper exists solely to hold that boundary,
// so app/page.js (a Server Component) can still import and render it
// directly. Direct replacement for the old app's
// `React.lazy(() => import('../components/HeroGlobe'))` + <Suspense>.
import dynamic from 'next/dynamic';

const HeroGlobe = dynamic(() => import('../HeroGlobe'), { ssr: false });

export default function HeroGlobeLoader() {
  return <HeroGlobe />;
}
