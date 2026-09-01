// Lead-magnet resource library. Server Component shell, same shape as
// app/(site)/services/page.js and app/(site)/contact/page.js (dark .pg-hero
// + a .g3 grid of .card elements). Phase A only (todo.md): the card grid
// and page structure. The request form (Phase B) isn't built yet — each
// card's button anchors to #request-form, a placeholder section at the
// bottom that Phase B replaces with the real <ResourceRequestForm />.
import resources from '../../../data/resources';

export const metadata = {
  title: 'Resources | SilverSurfers',
  description: 'Free guides, checklists, and reports to help you build older-adult-friendly digital experiences.',
};

export default function ResourcesPage() {
  return (
    <>
      <style>{`
        .rsc-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--t05);
          color: var(--t4);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          flex-shrink: 0;
        }
        .rsc-placeholder {
          background: var(--surface);
          border: 1px dashed var(--sandd);
          border-radius: var(--rl);
          padding: 48px 24px;
          text-align: center;
          color: var(--ink6);
          font-size: 16px;
        }
      `}</style>

      <div>
        {/* ── Hero ─────────────────────────────────── */}
        <div className="pg-hero">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <p className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>Free Resources</p>
            <h1 className="h1">Guides, Checklists &amp; Reports</h1>
            <p className="lead">
              Practical, no-jargon resources to help you build digital experiences that work for older adults too.
            </p>
          </div>
        </div>

        {/* ── Resource Grid ──────────────────────────── */}
        <section className="sec">
          <div className="wrap">
            <div className="g3">
              {resources.map((resource) => (
                <div className="card" key={resource.slug}>
                  <div className="card-bar" />
                  <div className="rsc-card-icon">
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </div>
                  <h3 className="h3" style={{ marginBottom: '8px' }}>{resource.title}</h3>
                  <p style={{ fontSize: '16px', color: 'var(--ink6)', lineHeight: '1.65', marginBottom: '20px' }}>
                    {resource.description}
                  </p>
                  <a href="#request-form" className="btn btn-p">Get This Resource</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Request form (Phase B builds the real thing here) ────── */}
        <section id="request-form" className="sec-sand">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <p className="eyebrow">Request</p>
              <h2 className="h2">Get Your Free Resource</h2>
              <p className="sub">Tell us which one you want and we&rsquo;ll send it your way.</p>
            </div>
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
              <div className="rsc-placeholder">Request form coming soon.</div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
