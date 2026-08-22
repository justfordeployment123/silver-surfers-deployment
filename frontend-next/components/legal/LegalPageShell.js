// Shared dark-hero wrapper used by all legal/static pages — ported from the
// identical inline styles repeated in frontend/src/pages/TermsOfUse.js,
// PrivacyPolicy.js, and AccessibilityGuides.js.
export default function LegalPageShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--t9)', paddingTop: 96, paddingBottom: 40 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>{children}</div>
    </div>
  );
}
