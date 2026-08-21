import { getLegalDocument } from '../../lib/publicApi';
import SimpleTextFormatter from '../SimpleTextFormatter';

// Server Component: fetches the document server-side (see lib/publicApi.js)
// and renders it directly in the initial HTML — no client-side loading
// spinner, no fetch-on-mount flash, unlike the original CRA
// LegalDocumentViewer.js this replaces.
//
// The original component also supported an inline "Accept Terms" button
// (showAcceptButton prop), but all three pages that use it today
// (TermsOfUse, PrivacyPolicy, AccessibilityGuides) pass showAcceptButton=
// {false} — that code path is unused by any current caller, so it isn't
// ported here to keep this a pure, non-interactive Server Component.
// (Enforced acceptance flows elsewhere in the app go through the separate
// LegalAcceptanceModal.js component, ported when its callers are migrated.)
export default async function LegalDocumentView({ type }) {
  const result = await getLegalDocument(type);

  if (result?.error) {
    return (
      <div className="ldv-card ldv-state">
        <style>{LDV_STYLES}</style>
        <div className="ldv-error-icon" aria-hidden="true">
          <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="ldv-state-title">Error Loading Document</h1>
        <p className="ldv-state-text">{result.error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="ldv-card ldv-state">
        <style>{LDV_STYLES}</style>
        <h1 className="ldv-state-title">Document Not Found</h1>
        <p className="ldv-state-text">This document isn&rsquo;t available right now.</p>
      </div>
    );
  }

  const document = result;

  return (
    <div className="ldv-wrap">
      <style>{LDV_STYLES}</style>

      <div className="ldv-card ldv-header">
        <h1 className="ldv-title">{document.title}</h1>
        <div className="ldv-meta">
          <span>Version {document.version}</span>
          <span>•</span>
          <span>Effective {new Date(document.effectiveDate).toLocaleDateString()}</span>
          {document.acceptanceRequired && (
            <>
              <span>•</span>
              <span className="ldv-meta-required">Acceptance Required</span>
            </>
          )}
        </div>

        {document.summary && (
          <div className="dim-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Summary</h3>
            <p style={{ margin: 0 }}>{document.summary}</p>
          </div>
        )}
      </div>

      <div className="ldv-card ldv-content">
        <SimpleTextFormatter text={document.content} />
      </div>

      <p className="ldv-footer">
        This document was last updated on {new Date(document.effectiveDate).toLocaleDateString()}. Version {document.version}.
      </p>
    </div>
  );
}

const LDV_STYLES = `
  .ldv-wrap { max-width: 100%; }
  .ldv-card {
    background: var(--surface);
    border: 1px solid var(--sandd);
    padding: 24px;
  }
  .ldv-header { border-radius: var(--rl) var(--rl) 0 0; border-bottom: none; }
  .ldv-content { border-radius: 0 0 var(--rl) var(--rl); }
  .ldv-title { font-size: 30px; font-weight: 700; color: var(--ink); margin-bottom: 8px; }
  .ldv-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 16px; color: var(--ink6); }
  .ldv-meta-required { color: var(--tlink); font-weight: 600; }
  .ldv-footer { margin-top: 24px; text-align: center; font-size: 16px; color: var(--ink3); }

  .ldv-state {
    text-align: center;
    padding: 48px 24px;
    border-radius: var(--rl);
  }
  .ldv-error-icon {
    width: 64px; height: 64px;
    background: var(--coralbg);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
    color: var(--coral);
  }
  .ldv-state-title { font-size: 18px; font-weight: 600; color: var(--ink); margin-bottom: 8px; }
  .ldv-state-text { font-size: 16px; color: var(--ink6); }
`;
