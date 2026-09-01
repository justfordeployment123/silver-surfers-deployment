// Lead-magnet resource library. Server Component shell, same shape as
// app/(site)/services/page.js and app/(site)/contact/page.js (dark .pg-hero
// + a .g3 grid of .card elements). The interactive part (card grid + the
// form, and the state connecting "which card was clicked" to "which
// resource the form pre-selects") is one client island, ResourcesGrid.js —
// same server-shell-plus-client-island split used by Contact/Services.
import resources from '../../../data/resources';
import ResourcesGrid from '../../../components/resources/ResourcesGrid';

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
        .rsc-form-wrap {
          max-width: 640px;
          margin: 0 auto;
          background: var(--surface);
          border-radius: var(--rl);
          padding: 44px;
          border: 1px solid var(--sandd);
          box-shadow: 0 4px 28px rgba(4,46,34,0.07);
        }
        .rsc-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 16px;
        }
        .rsc-form-field { margin-bottom: 16px; }
        .rsc-consent-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 24px;
          font-size: 16px;
          color: var(--ink6);
          line-height: 1.5;
          cursor: pointer;
        }
        .rsc-consent-row input { margin-top: 3px; flex-shrink: 0; }
        .rsc-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: rscSpin 0.7s linear infinite;
          display: inline-block;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes rscSpin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          .rsc-form-grid { grid-template-columns: 1fr; }
          .rsc-form-wrap { padding: 24px 20px; }
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

        {/* ── Resource Grid + Request Form ───────────── */}
        <ResourcesGrid resources={resources} />
      </div>
    </>
  );
}
