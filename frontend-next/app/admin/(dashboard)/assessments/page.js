'use client';

// Milestone 3.1 Developer Plan, Module 13. Follows the exact table/filter/
// pagination/modal pattern of app/admin/(dashboard)/users/page.js (.ap-tbl,
// pill status classes, .ap-modal detail view) rather than inventing new
// admin UI conventions — including reusing its STYLES block verbatim.
import { useEffect, useState } from 'react';
import {
  adminApproveAssessmentReport,
  adminListAssessments,
  adminGetAssessment,
  adminRegenerateAssessmentReport,
  adminUpdateAssessmentReport,
} from '../../../../lib/apiClient';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 16px; color: var(--ink6); }
.ap-lbl { font-size: 16px; font-weight: 500; color: var(--ink6); margin-bottom: 6px; display: block; }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 16px; color: var(--ink); background: var(--surface); outline: none; width: 100%; box-sizing: border-box; }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 16px; color: var(--ink); background: var(--surface); outline: none; width: 100%; }
.ap-btn-p { background: var(--t6); color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 16px; color: #991b1b; }
.ap-ok { background: #dcfce7; border: 1px solid #86efac; border-radius: var(--r); padding: 12px 16px; font-size: 16px; color: #166534; }
.ap-tbl { width: 100%; border-collapse: collapse; }
.ap-tbl thead { background: var(--sand); }
.ap-tbl th { padding: 10px 16px; text-align: left; font-size: 16px; font-weight: 600; color: var(--ink6); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.ap-tbl td { padding: 12px 16px; font-size: 16px; color: var(--ink); border-top: 1px solid var(--sandd); }
.ap-tbl tr:hover td { background: var(--sand); }
.ap-link-btn { background: none; border: none; cursor: pointer; font-size: 16px; font-weight: 600; color: var(--t4); padding: 0; transition: color .15s; }
.ap-link-btn:hover { color: var(--t8); }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 16px; font-weight: 600; }
.pill-g { background: #dcfce7; color: #166534; }
.pill-r { background: #fee2e2; color: #991b1b; }
.pill-t { background: var(--t05); color: var(--t6); }
.pill-a { background: #fef3c7; color: #92400e; }
.pill-gr { background: #f3f4f6; color: #374151; }
.ap-modal-overlay { position: fixed; inset: 0; background: rgba(16,47,69,0.45); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; overflow-y: auto; }
.ap-modal { background: var(--surface); border-radius: var(--rl); width: 100%; max-width: 720px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.18); }
.ap-modal-hdr { padding: 20px 24px; border-bottom: 1px solid var(--sandd); display: flex; align-items: flex-start; justify-content: space-between; flex-shrink: 0; }
.ap-modal-close { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 6px; color: var(--ink3); transition: background .15s, color .15s; }
.ap-modal-close:hover { background: var(--sand); color: var(--ink); }
.ap-modal-body { overflow-y: auto; flex: 1; padding: 20px 24px; }
.ap-action-btn { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-size: 16px; font-weight: 600; text-align: left; transition: background .15s, border-color .15s, color .15s; }
.ap-action-btn-teal { background: var(--t6); color: #fff; }
.ap-action-btn-teal:hover:not(:disabled) { background: var(--t8); }
.ap-action-btn-neutral { background: var(--sand); border-color: var(--sandd); color: var(--ink); }
.ap-action-btn-neutral:hover:not(:disabled) { background: var(--sandd); }
.ap-action-btn-green { background: #16a34a; color: #fff; }
.ap-action-btn-green:hover:not(:disabled) { background: #15803d; }
.ap-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ap-detail-lbl { font-size: 16px; font-weight: 600; color: var(--ink3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
.ap-section-hdr { font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--sandd); margin-top: 20px; }
.ap-answer-row { margin-bottom: 14px; }
.ap-sk { background: var(--sandd); border-radius: 6px; animation: ap-pulse 1.5s ease-in-out infinite; }
@keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const STATUS_PILL = {
  purchased: 'pill-gr',
  scheduled: 'pill-gr',
  intake_in_progress: 'pill-a',
  intake_complete: 'pill-a',
  pending_review: 'pill-a',
  report_ready: 'pill-g',
  delivered: 'pill-g',
};

function customerLabel(user) {
  if (!user) return 'Unknown customer';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export default function AdminAssessments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, pages: 1 });
  const [detail, setDetail] = useState(null);
  const [editedSections, setEditedSections] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    const result = await adminListAssessments({
      page: currentPage,
      limit: 50,
      status: filterStatus !== 'all' ? filterStatus : undefined,
    });
    if (result?.error) {
      setError(result.error);
      setItems([]);
    } else {
      setItems(result.items || []);
      setPagination({
        total: Number(result.total) || 0,
        page: Number(result.page) || currentPage,
        limit: Number(result.limit) || 50,
        pages: Math.max(1, Number(result.pages) || 1),
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filterStatus]);

  async function openDetail(id) {
    const result = await adminGetAssessment(id);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDetail(result.assessment);
    setEditedSections(JSON.stringify(result.assessment.aiReport?.sections || {}, null, 2));
  }

  async function handleSaveEdit() {
    let parsed;
    try {
      parsed = JSON.parse(editedSections);
    } catch {
      setError('Report sections must be valid JSON.');
      return;
    }
    setBusy(true);
    const result = await adminUpdateAssessmentReport(detail._id, parsed);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDetail(result.assessment);
    setSuccess('Report updated.');
    load();
  }

  async function handleRegenerate() {
    setBusy(true);
    const result = await adminRegenerateAssessmentReport(detail._id);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setDetail(result.assessment);
    setEditedSections(JSON.stringify(result.assessment.aiReport?.sections || {}, null, 2));
    setSuccess('Report regenerated by AI.');
  }

  async function handleApprove() {
    if (!window.confirm('Approve this report and release it to the customer?')) return;
    setBusy(true);
    const result = await adminApproveAssessmentReport(detail._id);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSuccess('Report approved and customer notified.');
    setDetail(null);
    load();
  }

  if (loading && items.length === 0) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '32px', width: '280px' }} />
          <div className="ap-card" style={{ padding: '24px' }}>
            <div className="ap-sk" style={{ height: '200px' }} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h1 className="ap-h1">AI Readiness Assessment Review</h1>
          <p className="ap-sub">Review draft reports before they&apos;re released to customers.</p>
        </div>

        <div className="ap-card" style={{ padding: '20px' }}>
          <label className="ap-lbl">Status</label>
          <select value={filterStatus} onChange={(e) => { setCurrentPage(1); setFilterStatus(e.target.value); }} className="ap-sel" style={{ maxWidth: 280 }}>
            <option value="all">All (pending review first)</option>
            <option value="pending_review">Pending Review</option>
            <option value="intake_in_progress">Intake In Progress</option>
            <option value="report_ready">Report Ready</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>

        {success && <div className="ap-ok">{success}</div>}
        {error && <div className="ap-err">{error}</div>}

        <div className="ap-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="ap-tbl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>AI Report</th>
                  <th>Flagged</th>
                  <th>Completed</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--ink6)' }}>No assessments found</td></tr>
                ) : (
                  items.map((item) => (
                    <tr key={item._id}>
                      <td>{customerLabel(item.user)}</td>
                      <td><span className={`pill ${STATUS_PILL[item.status] || 'pill-gr'}`}>{item.status}</span></td>
                      <td>{item.aiReport?.status || '—'}</td>
                      <td>{item.needsAdminAttention ? <span className="pill pill-r">Needs attention</span> : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--ink6)' }}>
                        {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => openDetail(item._id)} className="ap-link-btn">View</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 20px', borderTop: '1px solid var(--sandd)' }}>
              <span style={{ fontSize: '16px', color: 'var(--ink6)' }}>
                Page {pagination.page} of {pagination.pages} ({pagination.total} total)
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1} className="ap-btn-s">Prev</button>
                <button type="button" onClick={() => setCurrentPage((p) => Math.min(pagination.pages, p + 1))} disabled={pagination.page >= pagination.pages} className="ap-btn-s">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <div className="ap-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="ap-modal">
            <div className="ap-modal-hdr">
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', marginBottom: '3px' }}>Assessment Review</h3>
                <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>{customerLabel(detail.userId)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="ap-modal-close">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="ap-modal-body">
              <div className="ap-section-hdr" style={{ marginTop: 0 }}>Answers ({(detail.answers || []).length} of 36)</div>
              {(detail.answers || []).map((answer) => (
                <div key={answer.questionId} className="ap-answer-row">
                  <div className="ap-detail-lbl">
                    Q{answer.questionId}. {answer.question}
                    {!answer.clarified && <span className="pill pill-r" style={{ marginLeft: 8 }}>Not fully clarified</span>}
                  </div>
                  <div>{answer.text}</div>
                </div>
              ))}

              <div className="ap-section-hdr">AI Report Draft ({detail.aiReport?.status}, {detail.aiReport?.provider})</div>
              <label className="ap-lbl">Sections (JSON — edit directly if needed)</label>
              <textarea
                value={editedSections}
                onChange={(e) => setEditedSections(e.target.value)}
                className="ap-inp"
                style={{ minHeight: 240, fontFamily: 'monospace', fontSize: 14 }}
              />

              <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
                <button type="button" className="ap-action-btn ap-action-btn-neutral" disabled={busy} onClick={handleSaveEdit}>
                  Save Edited Report
                </button>
                <button type="button" className="ap-action-btn ap-action-btn-neutral" disabled={busy} onClick={handleRegenerate}>
                  Regenerate with AI
                </button>
                <button type="button" className="ap-action-btn ap-action-btn-green" disabled={busy} onClick={handleApprove}>
                  Approve &amp; Release to Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
