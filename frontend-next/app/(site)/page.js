// Ported from frontend/src/pages/Home.js. The old MainScreen component was
// one monolithic client component; here the static marketing sections
// (trust/capabilities, how-it-works, testimonial, most of the final CTA)
// render as part of this Server Component, while the genuinely
// stateful/personalized pieces — the quick-scan form + device selector +
// WCAG selector + results modal (components/home/QuickScanSection.js), the
// WebGL globe (components/home/HeroGlobeLoader.js, ssr:false, direct swap
// for the old React.lazy()+Suspense split), and the two final-CTA buttons
// that need DOM access (components/home/FinalCtaButtons.js) — are client
// islands mounted in place. Neither client island wraps itself in
// next/navigation's useSearchParams/useRouter (each would force a
// <Suspense> boundary here) — QuickScanSection reads window.location
// directly instead, after finding that a <Suspense> boundary here for
// useSearchParams left real SSR'd HTML in place that React never actually
// hydrated (no fiber attached; clicks/submits fell through to native
// browser behavior instead of the React handlers). See the comment in
// components/home/QuickScanSection.js for the full story.
import Link from 'next/link';
import HeroGlobeLoader from '../../components/home/HeroGlobeLoader';
import QuickScanSection from '../../components/home/QuickScanSection';
import FinalCtaButtons from '../../components/home/FinalCtaButtons';

export const metadata = {
  title: 'SilverSurfers | Accessibility for Older Adults',
  description: 'Reach 124 million older adults with $8.3 trillion in buying power. Unlock your SilverSurfers Score today with a free accessibility scan.',
};

export default function Home() {
  return (
    <>
      <style>{`
        /* ── Hero ──────────────────────────────────────── */
        .home-hero {
          background: var(--t9);
          padding: 120px 0 80px;
          position: relative;
          overflow: hidden;
        }
        .home-glow {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(29,158,117,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .home-glow-1 { width: 680px; height: 680px; top: -200px; right: -100px; }
        .home-glow-2 { width: 420px; height: 420px; bottom: -120px; left: -80px; }

        /* ── Scan form card ────────────────────────────── */
        .home-form-card {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--rl);
          padding: 32px;
          transition: box-shadow 0.4s;
        }
        .home-form-card.highlighted {
          box-shadow: 0 0 0 3px var(--t4), 0 16px 48px rgba(29,158,117,0.2);
        }

        /* ── Form inputs on dark bg ────────────────────── */
        .home-input {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255,255,255,0.92);
          border: 1.5px solid transparent;
          border-radius: var(--r);
          font-size: 16px;
          font-family: var(--ff);
          /* Fixed dark ink, not the theme-flipping --ink — this field's
             background always stays light (it sits in the permanently-dark
             hero regardless of site theme), so its text must stay dark too. */
          color: #1A1A18;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .home-input::placeholder { color: #6E6E6B; }
        .home-input:focus {
          border-color: var(--t4);
          box-shadow: 0 0 0 3px rgba(29,158,117,0.15);
        }

        /* ── How it works (sand section) ──────────────── */
        .home-step-card {
          background: var(--surface);
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          padding: 32px 28px 28px;
          position: relative;
          overflow: hidden;
          transition: box-shadow 0.2s, transform 0.2s;
          text-align: center;
        }
        .home-step-card:hover {
          box-shadow: 0 8px 32px rgba(8,80,65,0.09);
          transform: translateY(-2px);
        }
        .home-step-card-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--t4);
        }
        .home-step-icon {
          width: 64px; height: 64px;
          border-radius: 16px;
          background: var(--t05);
          border: 1px solid var(--t1);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 18px;
        }
        .home-step-icon svg { color: var(--t6); }

        /* ── Hero globe — anchored independently of the text
           column's height, not grid-centered against it ─── */
        .hero-globe-slot {
          position: absolute;
          top: 96px;
          right: 4%;
          width: min(32vw, 420px);
          height: min(32vw, 420px);
          z-index: 2;
        }

        /* ── Responsive ────────────────────────────────── */
        @media (max-width: 1200px) {
          .hero-globe-slot { right: 2%; width: min(30vw, 360px); height: min(30vw, 360px); }
        }
        @media (max-width: 1024px) {
          .hero-globe-slot { display: none; }
        }
        @media (max-width: 768px) {
          .home-hero { padding: 100px 0 60px; }
          .home-metrics-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .home-form-card { padding: 20px; }
          .home-metrics-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div>
        {/* ════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════ */}
        <section className="home-hero">
          <div className="home-glow home-glow-1" />
          <div className="home-glow home-glow-2" />

          <div className="hero-globe-slot">
            <HeroGlobeLoader />
          </div>

          <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
            {/* Eyebrow */}
            <div className="eyebrow eyebrow--light">Silver Digital Readiness™</div>

            {/* Headline */}
            <h1 className="h1" style={{ color: '#fff', maxWidth: 680, marginBottom: 18 }}>
              Are You Delivering{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--t1)' }}>
                Older Adult Friendly Digital Experiences?
              </em>
            </h1>

            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: 560, marginBottom: 40 }}>
              <strong style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                Reach 124 million older adults with $8.3 trillion in buying power.
              </strong>{' '}
              Unlock your SilverSurfers Score today.
            </p>

            {/* ── Scan form ── */}
            <div style={{ maxWidth: 660 }}>
              <QuickScanSection />

              <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.7, marginTop: 24, fontWeight: 300 }}>
                SilverSurfers empowers organizations to create accessible and inclusive digital experiences
                that delight and engage SilverSurfers (adults 50+) as they surf the digital oceans.
              </p>
            </div>

            {/* Stats bar */}
            <div className="stats" style={{ maxWidth: 660 }}>
              <div className="stat"><div className="stat-n">500+</div><div className="stat-l">Websites Audited</div></div>
              <div className="stat"><div className="stat-n">85%</div><div className="stat-l">Improved Accessibility</div></div>
              <div className="stat"><div className="stat-n">$8.3T</div><div className="stat-l">50+ buying power</div></div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            TRUST / CAPABILITIES
        ════════════════════════════════════════════════ */}
        <section className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>What we do</div>
              <h2 className="h2">Creating Delightful &amp; Inclusive Digital Experiences</h2>
              <p className="lead" style={{ maxWidth: 620, margin: '14px auto 0' }}>
                Trusted by businesses to create accessible, easy-to-use websites that welcome users of all ages
              </p>
            </div>

            {/* Metrics */}
            <div className="home-metrics-grid" style={{
              display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
              gap: 24, marginBottom: 56,
            }}>
              {[
                { n: '500+', l: 'Websites Audited' },
                { n: '85%',  l: 'Improved Accessibility' },
                { n: '95%',  l: 'Client Satisfaction' },
                { n: '30s',  l: 'Quick Assessment' },
              ].map(({ n, l }) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--ffd)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 700, color: 'var(--t4)', lineHeight: 1, marginBottom: 6 }}>{n}</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink6)' }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Feature cards */}
            <div className="g3">
              {[
                {
                  tag: 'Analysis',
                  title: 'Accessibility Analysis',
                  body: 'Comprehensive evaluation of your website\'s accessibility for older adults, focusing on readability, navigation, and usability.',
                  icon: (
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                  ),
                },
                {
                  tag: 'Certification',
                  title: 'Seal of Approval',
                  body: 'Earn the SilverSurfers Seal of Approval Badge to display on your website, showing your commitment to inclusive design.',
                  icon: (
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  ),
                },
                {
                  tag: 'Guidance',
                  title: 'Improvement Guide',
                  body: 'Receive detailed, actionable recommendations to enhance your website\'s usability for older adult visitors.',
                  icon: (
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  ),
                },
              ].map(({ tag, title, body, icon }) => (
                <div key={title} className="card">
                  <div className="card-bar" />
                  <div className="tag">{tag}</div>
                  <div className="v-icon" style={{ marginBottom: 14 }}>{icon}</div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            HOW IT WORKS
        ════════════════════════════════════════════════ */}
        <section className="sec-sand">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>How it works</div>
              <h2 className="h2">How SilverSurfers Works</h2>
              <p className="lead" style={{ maxWidth: 580, margin: '14px auto 0' }}>
                Simple 3-step process to make your website older adult friendly and earn your Seal of Approval Badge
              </p>
            </div>

            <div className="g3">
              {/* Step 1 */}
              <div className="home-step-card">
                <div className="home-step-card-bar" />
                <div className="step-num" style={{ margin: '0 auto 18px' }}>1</div>
                <div className="home-step-icon">
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                </div>
                <h3 style={{ marginBottom: 10 }}>Quick Scan</h3>
                <p>Enter your URL to get an instant <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>SilverSurfers Score</strong> and see how accessible and inclusive your website really is.</p>
                <Link href="/services" className="btn btn-o" style={{ marginTop: 20 }}>
                  Get Full Audit Here
                </Link>
              </div>

              {/* Step 2 */}
              <div className="home-step-card">
                <div className="home-step-card-bar" />
                <div className="step-num" style={{ margin: '0 auto 18px' }}>2</div>
                <div className="home-step-icon">
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <h3 style={{ marginBottom: 10 }}>Get Improvements</h3>
                <p>Receive expert guidance that goes beyond industry standards, offering improvements in visual design, navigation, and user experience to enhance accessibility and create more delightful digital experiences for older adults.</p>
              </div>

              {/* Step 3 */}
              <div className="home-step-card">
                <div className="home-step-card-bar" />
                <div className="step-num" style={{ margin: '0 auto 18px' }}>3</div>
                <div className="home-step-icon">
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <h3 style={{ marginBottom: 10 }}>Earn Your Seal</h3>
                <p>Once you meet SilverSurfers standards, earn the SilverSurfers Seal of Approval to proudly display on your website.</p>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <Link href="/services" className="btn btn-d">
                Explore Our Services
              </Link>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            TESTIMONIAL
        ════════════════════════════════════════════════ */}
        <div className="proof-strip">
          <div className="wrap">
            <div className="proof-g" style={{ gridTemplateColumns: '1fr' }}>
              <div className="proof-item" style={{ padding: '40px 48px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, color: 'var(--t1)', lineHeight: 1, marginBottom: 16, fontFamily: 'Georgia, serif' }}>&quot;</div>
                <blockquote className="proof-q" style={{ fontSize: 18, maxWidth: 680, margin: '0 auto 20px' }}>
                  SilverSurfers helped us create a website that our older customers can actually use. Our conversion rate from senior visitors increased by 40% after implementing their recommendations.
                </blockquote>
                <div className="proof-a" style={{ fontSize: 16 }}>
                  <strong style={{ color: 'rgba(255, 255, 255, 0.75)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                    Maria Rodriguez
                  </strong>
                  Owner, Sunset Health Services
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════════ */}
        <section className="cta-sec">
          {/* subtle glow */}
          <div style={{
            position: 'absolute', width: 600, height: 600, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(29,158,117,0.12) 0%, transparent 70%)',
            top: '-150px', left: '50%', transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }} />
          <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="h2" style={{ color: '#fff', marginBottom: 14 }}>
              Ready to welcome <em style={{ fontStyle: 'italic', color: 'var(--t1)' }}>all generations?</em>
            </h2>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: 560, margin: '0 auto' }}>
              Start your journey to creating an inclusive and delightful digital experience for everyone.
              Get your free assessment and discover how to make your digital assets accessible to users of all ages.
            </p>

            <FinalCtaButtons />

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <a href="/subscription" className="btn btn-o" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255, 255, 255, 0.75)' }}>
                Get Full Audit Here
              </a>
              <p className="cta-note" style={{ marginTop: 12 }}>
                Tablet and Mobile testing available with{' '}
                <a href="/subscription" style={{ color: 'var(--t2)', textDecoration: 'underline' }}>paid subscriptions</a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
