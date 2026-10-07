'use client';

import Link from 'next/link';
import { getNextAction, getStatusLabel } from './productStatusLabels';

// Generic across all product types (course/assessment/ebook) — reuses the
// site's existing .card/.tag/.btn classes rather than inventing new ones.
// Milestone 3.1 Developer Plan, Module 3.
export default function ProductStatusCard({ productType, category, title, status, id }) {
  const statusLabel = getStatusLabel(productType, status);
  const nextAction = getNextAction(productType, status, id);

  return (
    <div className="card dash-card">
      <style>{`
        .dash-card { display: flex; flex-direction: column; }
        .dash-card-status {
          display: inline-block;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink6);
          background: var(--sand);
          border: 1px solid var(--sandd);
          padding: 3px 10px;
          border-radius: 999px;
          margin-bottom: 14px;
          align-self: flex-start;
        }
        .dash-card-cta { margin-top: auto; }
      `}</style>
      <span className="tag">{category}</span>
      <h3>{title}</h3>
      <span className="dash-card-status">{statusLabel}</span>
      <div className="dash-card-cta">
        {nextAction ? (
          <Link href={nextAction.href} className="btn btn-p" aria-label={`${nextAction.label}: ${title}`}>
            {nextAction.label}
          </Link>
        ) : (
          <p style={{ margin: 0 }}>Your report is being reviewed by our team — we&apos;ll notify you when it&apos;s ready.</p>
        )}
      </div>
    </div>
  );
}
