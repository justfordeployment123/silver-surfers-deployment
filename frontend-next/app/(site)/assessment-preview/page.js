'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { createAssessmentPreview, getAssessmentPreview } from '../../../lib/apiClient';

const STATUS_LABELS = {
  purchased: 'Ready to begin',
  intake_in_progress: 'In progress',
  intake_complete: 'Answers submitted',
  pending_review: 'Report in staff review',
  report_ready: 'Report ready',
  delivered: 'Report ready',
};

function PreviewContent() {
  const router = useRouter();
  const [assessment, setAssessment] = useState(null);
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    getAssessmentPreview().then((result) => {
      if (!mounted) return;
      if (result?.error) setError(result.error);
      else {
        setAssessment(result.assessment || null);
        setCourse(result.course || null);
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  async function openPreview() {
    setBusy(true);
    setError('');
    const result = await createAssessmentPreview();
    setBusy(false);
    if (result?.error || !result?.assessment?._id) {
      setError(result?.error || 'Could not open the preview. Please try again.');
      return;
    }
    router.push(`/assessment/${result.assessment._id}`);
  }

  return (
    <section className="preview-page">
      <style>{`
        .preview-page { min-height: 72vh; padding: 150px 24px 100px; background: var(--bg); color: var(--ink); }
        .preview-shell { max-width: 760px; margin: auto; }
        .preview-eyebrow { margin-bottom: 16px; color: var(--t6); font-size: .82rem; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; }
        .preview-page h1 { margin-bottom: 20px; font-size: clamp(2.5rem, 6vw, 4.5rem); line-height: 1.1; }
        .preview-lead { max-width: 680px; color: var(--ink6); font-size: 1.12rem; line-height: 1.75; }
        .preview-card { margin-top: 40px; padding: 32px; border: 1px solid var(--sandd); border-radius: 16px; background: var(--surface); box-shadow: 0 20px 50px rgba(2, 39, 60, .08); }
        .preview-card h2 { margin-bottom: 12px; font-size: 1.4rem; }
        .preview-card p { margin-bottom: 16px; color: var(--ink6); line-height: 1.7; }
        .preview-error { color: #ad2f2f !important; }
        .preview-note { margin-top: 22px; font-size: .9rem; }
      `}</style>
      <div className="preview-shell">
        <p className="preview-eyebrow">Invitation-only preview</p>
        <h1>Explore Milestone 3.1.</h1>
        <p className="preview-lead">Try the AI Edge course and the complete AI Readiness Assessment without making a payment. Answer 36 questions with our AI assistant, then receive a report after our team reviews it.</p>
        {!loading && !error && (
          <div className="preview-card">
            <h2>AI Edge course</h2>
            <p>Explore seven learning modules and track your test progress. This progress is separate from any future purchase.</p>
            {course ? <Link href={`/courses/${course._id}?preview=1`} className="btn btn-p">Open AI Edge preview</Link> : <p>The course has not been loaded on staging yet. Please contact the team.</p>}
          </div>
        )}
        <div className="preview-card">
          <h2>AI Readiness Assessment</h2>
          {loading && <p>Checking your invitation…</p>}
          {!loading && error && <p className="preview-error" role="alert">{error}</p>}
          {!loading && !error && !assessment && (
            <>
              <p>Your answers will be saved as you go. Please do not include passwords, payment card details, or health information.</p>
              <button type="button" className="btn btn-p" disabled={busy} onClick={openPreview}>
                {busy ? 'Opening…' : 'Start assessment preview'}
              </button>
            </>
          )}
          {!loading && !error && assessment && (
            <>
              <p><strong>{STATUS_LABELS[assessment.status] || 'Your preview assessment'}</strong></p>
              <p>You can return to your assessment at any time while your invitation remains active.</p>
              <Link href={`/assessment/${assessment._id}`} className="btn btn-p">
                {assessment.status === 'report_ready' || assessment.status === 'delivered' ? 'View your report' : 'Open assessment'}
              </Link>
            </>
          )}
        </div>
        <p className="preview-note">This invitation does not include a Stripe checkout or charge.</p>
      </div>
    </section>
  );
}

export default function AssessmentPreviewPage() {
  return <ProtectedRoute><PreviewContent /></ProtectedRoute>;
}
