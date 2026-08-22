'use client';

// The two interactive buttons inside app/page.js's final CTA section — the
// only reason that otherwise-static section needs a client boundary at all.
// "Get the Quick Scan Report" scrolls the (server-rendered-shell,
// client-hydrated) scan form into view; "Contact Our Team" shows the same
// email-fallback toast as the hero's contact link.
import showEmailFallback from '../../lib/showEmailFallback';

export default function FinalCtaButtons() {
  return (
    <div className="btn-row" style={{ justifyContent: 'center' }}>
      <button
        onClick={() => document.querySelector('form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        className="btn btn-p"
      >
        Get the Quick Scan Report
      </button>
      <button onClick={() => showEmailFallback('hello@silversurfers.ai')} className="btn btn-g">
        Contact Our Team
      </button>
    </div>
  );
}
