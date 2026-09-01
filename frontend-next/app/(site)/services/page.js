// Ported from frontend/src/pages/Services.js. Server Component shell for
// the static hero/quick-scan/final-CTA sections; the personalized pricing
// grid is a client island (components/services/PricingSection.js) — see
// that file for why it isn't server-rendered.
import Link from 'next/link';
import PricingSection from '../../../components/services/PricingSection';
import { CheckIcon, PlanSvgIcon } from '../../../components/services/planIcons';

export const metadata = {
  title: 'Services & Pricing | SilverSurfers',
  description:
    'We help businesses create digital experiences that engage and delight older adults — expert digital experience assessments, actionable enhancements, and certification.',
};

const FREE_AUDIT = {
  name: 'Quick Scan Report', price: 'Always free',
  description: 'Quick Scan version of the SilverSurfers report – a quick snapshot and your SilverSurfers Score.',
  features: ['SilverSurfers Score (0-100)', 'High-level improvement recommendations', 'Email copy of results'],
  cta: 'Get Quick Scan Report', highlight: 'Start here - No cost',
};

export default function ServicesPage() {
  return (
    <>
      <style>{`
        /* ── Services-specific ─────────────────────────── */
        .svc-hero {
          background: var(--t9);
          padding: 120px 0 80px;
          position: relative;
          overflow: hidden;
        }
        .svc-glow {
          position: absolute; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, rgba(10,168,143,0.16) 0%, transparent 70%);
        }
        .svc-glow-1 { width: 640px; height: 640px; top: -180px; right: -80px; }
        .svc-glow-2 { width: 380px; height: 380px; bottom: -100px; left: -60px; }

        /* ── Free audit highlight card ─────────────────── */
        .free-card {
          background: var(--sand);
          border: 2px solid var(--sandd);
          border-radius: var(--rl);
          padding: 48px;
          position: relative;
          overflow: hidden;
        }
        .free-card h3 { color: var(--ink); }
        .free-card .free-card-label { color: var(--ink); }
        .free-card .free-card-feature { color: var(--ink6); }
        .free-card .free-card-note { color: var(--tlink); }
        .free-card-bar {
          position: absolute; top: 0; left: 0; right: 0;
          height: 4px; background: var(--t4);
        }
        .free-card-badge {
          position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
          background: var(--t6); color: #fff;
          font-size: 16px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 5px 18px; border-radius: 0 0 8px 8px;
          white-space: nowrap;
        }

        /* ── Billing toggle ────────────────────────────── */
        .billing-toggle {
          display: inline-flex;
          background: var(--sand);
          border: 1px solid var(--sandd);
          border-radius: 30px;
          padding: 4px;
          gap: 2px;
        }
        .billing-opt {
          min-height: 44px;
          padding: 10px 22px;
          border-radius: 24px;
          font-size: 16px;
          font-weight: 600;
          font-family: var(--ff);
          border: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          color: var(--ink6);
          background: transparent;
        }
        .billing-opt.active {
          background: var(--t8);
          color: #fff;
        }

        /* ── Plan card ─────────────────────────────────── */
        .svc-plan {
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          padding: 28px 24px;
          background: var(--surface);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .svc-plan:hover {
          box-shadow: 0 8px 32px rgba(16,47,69,0.1);
          transform: translateY(-3px);
        }
        .svc-plan-bar {
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px; background: var(--t4);
        }
        .svc-plan.featured {
          border-color: var(--t4);
          background: var(--sand);
        }
        .svc-plan.current-plan {
          border-color: var(--t6);
          background: var(--sand);
        }
        .svc-plan.dark-plan {
          background: var(--t9);
          border-color: var(--t9);
        }
        .svc-plan.dark-plan .svc-plan-bar { background: var(--t4); }

        .svc-plan-pop {
          position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
          font-size: 16px; font-weight: 700; padding: 5px 16px;
          border-radius: 0 0 8px 8px; white-space: nowrap;
        }
        .svc-plan-pop.teal  { background: var(--t6); color: #fff; }
        .svc-plan-pop.green { background: var(--t6); color: #fff; }

        .svc-plan-name {
          font-size: 16px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--ink6); margin-bottom: 6px;
        }
        .dark-plan .svc-plan-name { color: var(--t2); }

        .svc-plan-icon { font-size: 32px; margin-bottom: 8px; }

        .svc-plan-price {
          font-family: var(--ffd); font-size: 34px; font-weight: 700;
          color: var(--ink); line-height: 1; margin-bottom: 2px;
        }
        .dark-plan .svc-plan-price { color: #fff; }

        .svc-plan-price-suffix {
          font-family: var(--ff); font-size: 16px; font-weight: 400; color: var(--ink6);
        }
        .dark-plan .svc-plan-price-suffix { color: rgba(255,255,255,0.75); }

        .svc-plan-caption {
          font-size: 16px; color: var(--ink3); margin-bottom: 16px;
        }
        .dark-plan .svc-plan-caption { color: rgba(255,255,255,0.75); }

        .svc-plan-divider {
          border: none; border-top: 1px solid var(--sandd); margin-bottom: 16px;
        }
        .dark-plan .svc-plan-divider { border-color: rgba(255,255,255,0.1); }

        .svc-plan-desc {
          font-size: 16px; color: var(--ink6); margin-bottom: 14px; line-height: 1.55;
        }
        .dark-plan .svc-plan-desc { color: rgba(255,255,255,0.75); }

        .svc-plan-feature {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 16px; color: var(--ink6); line-height: 1.5; margin-bottom: 8px;
        }
        .dark-plan .svc-plan-feature { color: rgba(255,255,255,0.75); }

        .svc-check {
          width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; color: var(--t4);
        }

        /* ── How to choose cards ───────────────────────── */
        .choose-card {
          background: var(--surface);
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          padding: 28px;
          position: relative; overflow: hidden;
          display: flex; flex-direction: column;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .choose-card:hover {
          box-shadow: 0 8px 32px rgba(16,47,69,0.09);
          transform: translateY(-2px);
        }
        .choose-card-bar {
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px; background: var(--t4);
        }

        /* ── Loading spinner ───────────────────────────── */
        .svc-spinner {
          width: 40px; height: 40px;
          border: 3px solid var(--t1);
          border-top-color: var(--t4);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 48px auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 1024px) {
          .svc-plans-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .svc-plans-grid { grid-template-columns: 1fr !important; }
          .free-card { padding: 32px 20px; }
        }
      `}</style>

      <div>
        {/* ════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════ */}
        <section className="svc-hero">
          <div className="svc-glow svc-glow-1" />
          <div className="svc-glow svc-glow-2" />
          <div className="wrap" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>Plans &amp; Pricing</div>
            <h1 className="h1" style={{ color: '#fff', maxWidth: 700, margin: '0 auto 18px' }}>
              Service Packages &amp; Pricing
            </h1>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: 600, margin: '0 auto 32px' }}>
              We help businesses create digital experiences that engage and delight older adults — with expert
              digital experience assessments, actionable enhancements, and certification to showcase your
              commitment to accessibility.
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link href="/services#quickscan" className="btn btn-p">Start Free</Link>
              <Link href="/services#fullaudit" className="btn btn-g">View All Plans</Link>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            FREE / QUICK SCAN
        ════════════════════════════════════════════════ */}
        <section id="quickscan" className="sec" style={{ scrollMarginTop: 80 }}>
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>Start here</div>
              <h2 className="h2">Start Here — Completely Free</h2>
              <p className="lead" style={{ maxWidth: 520, margin: '12px auto 0' }}>
                Get immediate insights into your current digital experience
              </p>
            </div>

            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              <div className="free-card">
                <div className="free-card-bar" />
                <div className="free-card-badge">{FREE_AUDIT.highlight}</div>

                <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 16 }}>
                  <div style={{ marginBottom: 10, color: 'var(--t4)' }}><PlanSvgIcon id="freeAudit" /></div>
                  <h3 className="h3" style={{ marginBottom: 8 }}>{FREE_AUDIT.name}</h3>
                  <div style={{ fontFamily: 'var(--ffd)', fontSize: 32, fontWeight: 700, color: 'var(--t4)', marginBottom: 14 }}>
                    {FREE_AUDIT.price}
                  </div>
                  <p className="lead" style={{ maxWidth: 480, margin: '0 auto' }}>{FREE_AUDIT.description}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
                  <div>
                    <p className="free-card-label" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                      What you get
                    </p>
                    {FREE_AUDIT.features.map((f, i) => (
                      <div key={i} className="svc-plan-feature">
                        <CheckIcon />
                        <span className="free-card-feature" style={{ fontSize: 16 }}>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <Link href="/?openScan=1" className="btn btn-d" style={{ display: 'inline-flex', marginBottom: 14 }}>
                      {FREE_AUDIT.cta}
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ marginLeft: 6 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                      </svg>
                    </Link>
                    <p className="free-card-note" style={{ fontSize: 16, marginBottom: 14 }}>No credit card required</p>
                    <Link href="/subscription" className="btn btn-o" style={{ display: 'inline-flex' }}>
                      Get Full Audit Here
                    </Link>
                    <p style={{ fontSize: 16, color: 'var(--ink3)', marginTop: 12 }}>
                      <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>Tablet &amp; Mobile testing available with{' '}
                      <Link href="/subscription" style={{ color: 'var(--tlink)', textDecoration: 'underline' }}>paid subscriptions</Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <PricingSection />

        {/* ════════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════════ */}
        <section className="cta-sec">
          <div className="wrap">
            <h2 className="h2" style={{ marginBottom: 14 }}>Ready to Get Started?</h2>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: 520, margin: '0 auto' }}>
              Join the growing community of businesses elevating their digital experience with SilverSurfers.ai
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link href="/?openScan=1" className="btn btn-p">Get Quick Scan Report</Link>
              <Link href="/contact" className="btn btn-g">Contact Us</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
