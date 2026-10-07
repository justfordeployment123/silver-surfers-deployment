'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import ChatWindow from '../../../../components/assessment/ChatWindow';
import { getAssessmentDetail, getMe, respondToAssessment, startAssessmentFlow } from '../../../../lib/apiClient';

// Milestone 3.1 Developer Plan, Module 11. Placeholder copy — Jackie is
// supplying the real wording (client answers 2026-10-07, #6). Do not ship
// to production with this text still in place.
const DISCLOSURE_TEXT = "Your answers are saved and reviewed by our team to prepare your personalized report. "
  + 'You can take your time, there is no time limit, and you can pick up where you left off if you need to step away.';

function ReportView({ sections }) {
  if (!sections) return <p>Your report is ready, but no content was found. Please contact support.</p>;

  return (
    <div className="assessment-report">
      <style>{`
        .assessment-report section { margin-bottom: 28px; }
        .assessment-report h3 { margin-bottom: 10px; }
        .ief-row { display: flex; gap: 10px; align-items: baseline; margin-bottom: 10px; }
        .ief-pill { font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: var(--t05); color: var(--t6); }
      `}</style>

      <section>
        <p className="lead">{sections.summary}</p>
      </section>

      <section>
        <h3 className="h3">Hours You Could Reclaim</h3>
        <p><strong>{sections.hoursReclaimable?.estimate}</strong></p>
        <p>{sections.hoursReclaimable?.explanation}</p>
      </section>

      <section>
        <h3 className="h3">Where to Focus First</h3>
        {(sections.impactEffortPrioritization || []).map((item) => (
          <div key={item.item} className="ief-row">
            <div>
              <strong>{item.item}</strong>
              <div>
                <span className="ief-pill">Impact: {item.impact}</span>{' '}
                <span className="ief-pill">Effort: {item.effort}</span>
              </div>
              <p>{item.rationale}</p>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h3 className="h3">Recommended Tools</h3>
        <ul>
          {(sections.toolRecommendations || []).map((item) => (
            <li key={item.tool}><strong>{item.tool}</strong> — {item.reason}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="h3">Estimated Financial Return</h3>
        <p><strong>{sections.estimatedFinancialReturn?.estimate}</strong></p>
        <p>{sections.estimatedFinancialReturn?.explanation}</p>
      </section>
    </div>
  );
}

function AssessmentContent() {
  const { assessmentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);

  async function load() {
    setLoading(true);
    const result = await getAssessmentDetail(assessmentId);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setAssessment(result.assessment);
    setCurrentQuestion(result.currentQuestion);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me?.user) {
        setLoading(false);
        return;
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  async function handleBegin() {
    setStarting(true);
    const result = await startAssessmentFlow(assessmentId);
    setStarting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAssessment(result.assessment);
    setCurrentQuestion(result.currentQuestion);
  }

  async function handleSend(answerText) {
    setSending(true);
    setError('');
    const result = await respondToAssessment(assessmentId, answerText);
    setSending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAssessment(result.assessment);
    setCurrentQuestion(result.currentQuestion ?? null);
  }

  if (loading) return <section className="sec"><div className="wrap"><p>Loading…</p></div></section>;
  if (error && !assessment) return <section className="sec"><div className="wrap"><p style={{ color: '#c0392b' }}>{error}</p></div></section>;
  if (!assessment) return null;

  return (
    <section className="sec">
      <style>{`
        .assessment-page { max-width: 760px; margin: 0 auto; padding: 104px 24px 64px; }
        .assessment-disclosure { border: 1px solid var(--sandd); border-radius: var(--rl); padding: 28px; background: var(--surface); }
      `}</style>
      <div className="assessment-page">
        <h1 className="h2" style={{ marginBottom: 24 }}>AI Readiness Assessment</h1>

        {error && <p style={{ color: '#c0392b' }}>{error}</p>}

        {(assessment.status === 'purchased' || assessment.status === 'scheduled') && (
          <div className="assessment-disclosure">
            <p>{DISCLOSURE_TEXT}</p>
            <button type="button" className="btn btn-p" style={{ marginTop: 16 }} disabled={starting} onClick={handleBegin}>
              {starting ? 'Starting…' : "I understand, let's begin"}
            </button>
          </div>
        )}

        {assessment.status === 'intake_in_progress' && (
          <ChatWindow
            transcript={assessment.transcript || []}
            currentQuestion={currentQuestion}
            onSend={handleSend}
            sending={sending}
          />
        )}

        {(assessment.status === 'intake_complete' || assessment.status === 'pending_review') && (
          <div className="assessment-disclosure">
            <p>Thank you for completing the assessment. Your answers are being reviewed by our team, and we&apos;ll notify you when your report is ready.</p>
          </div>
        )}

        {(assessment.status === 'report_ready' || assessment.status === 'delivered') && (
          <ReportView sections={assessment.aiReport?.sections} />
        )}
      </div>
    </section>
  );
}

export default function AssessmentPage() {
  return (
    <ProtectedRoute>
      <AssessmentContent />
    </ProtectedRoute>
  );
}
