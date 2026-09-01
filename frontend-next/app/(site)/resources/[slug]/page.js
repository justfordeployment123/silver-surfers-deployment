// Dedicated per-resource page (todo.md Phase E). Same server-shell pattern
// as the shared /resources page, but ResourceRequestForm is rendered with
// `lockedResource` set instead of `resources`/`selectedSlug` — no dropdown,
// the resource is fixed by the route.
//
// E3 (real page copy) is explicitly [CONTENT] in todo.md, blocked on the
// client. The "What's inside" copy below is an honest placeholder built
// only from data already in data/resources.js (title/description) — it
// does not invent specifics about contents that don't exist yet. Swap it
// for real copy per resource once the client provides it; nothing else on
// this page needs to change.
import { notFound } from 'next/navigation';
import Link from 'next/link';

import resources from '../../../../data/resources';
import ResourceRequestForm from '../../../../components/resources/ResourceRequestForm';

export function generateStaticParams() {
  return resources.map((resource) => ({ slug: resource.slug }));
}

function getResource(slug) {
  return resources.find((r) => r.slug === slug) || null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) return { title: 'Resource | SilverSurfers' };
  return {
    title: `${resource.title} | SilverSurfers`,
    description: resource.description,
  };
}

export default async function ResourceDetailPage({ params }) {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) notFound();

  return (
    <>
      <style>{`
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
        .rsd-back {
          display: inline-flex; align-items: center; gap: 6px;
          color: var(--t4); font-size: 16px; text-decoration: none;
          margin-bottom: 28px;
        }
        .rsd-whats-inside {
          background: var(--surface);
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          padding: 32px;
          max-width: 720px;
          margin: 0 auto;
        }
        @media (max-width: 600px) {
          .rsc-form-grid { grid-template-columns: 1fr; }
          .rsc-form-wrap { padding: 24px 20px; }
          .rsd-whats-inside { padding: 24px 20px; }
        }
      `}</style>

      <div>
        {/* ── Hero ─────────────────────────────────── */}
        <div className="pg-hero">
          <div className="wrap" style={{ textAlign: 'center' }}>
            <p className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>Free Resource</p>
            <h1 className="h1">{resource.title}</h1>
            <p className="lead">{resource.description}</p>
          </div>
        </div>

        {/* ── What's inside (placeholder until E3 real copy lands) ── */}
        <section className="sec">
          <div className="wrap">
            <Link href="/resources" className="rsd-back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to all resources
            </Link>
            <div className="rsd-whats-inside">
              <h2 className="h3" style={{ marginBottom: '12px' }}>What&rsquo;s inside</h2>
              <p style={{ fontSize: '16px', color: 'var(--ink6)', lineHeight: '1.65' }}>
                {resource.description} We&rsquo;re finalizing the full contents now — request it below and
                we&rsquo;ll email your copy the moment it&rsquo;s ready.
              </p>
            </div>
          </div>
        </section>

        {/* ── Request form (locked to this resource, no dropdown) ──── */}
        <section id="request-form" className="sec-sand">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <p className="eyebrow">Request</p>
              <h2 className="h2">Get Your Free Copy</h2>
              <p className="sub">Tell us where to send it.</p>
            </div>
            <div className="rsc-form-wrap">
              <ResourceRequestForm lockedResource={resource} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
