'use client';

// Ported from frontend/src/pages/MonitoringJobDetail.js. Dynamic route param
// via next/navigation's useParams() (see account/analysis/[taskId]/page.js
// for why not props.params).
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import { getMonitoringJob, listMonitoringNotifications, listMonitoringRuns, triggerMonitoringJob } from '../../../../lib/apiClient';
import MonitoringJobModal from '../../../../components/MonitoringJobModal';
import { WCAG_STANDARD_OPTIONS } from '../../../../components/WcagStandardSelect';

// 2.2.7.4 — each run snapshots the standard used at dispatch time, since the
// job's own selection can change between runs. Falls back to a short label
// for legacy runs recorded before this field existed.
function describeRunWcagStandard(wcagStandard, conformanceLevel) {
  if (!wcagStandard) return '—';
  const match = WCAG_STANDARD_OPTIONS.find(
    (o) => o.wcagStandard === wcagStandard && (o.wcagStandard === 'combined' || o.conformanceLevel === conformanceLevel)
  );
  return match?.label || wcagStandard;
}

const STYLES = `
.mjd-pg { min-height: 100vh; padding-top: 112px; padding-bottom: 80px; background: var(--t9); color: #fff; }
.mjd-wrap { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
.mjd-back { color: rgba(255,255,255,0.75); font-size: 16px; cursor: pointer; background: none; border: none; padding: 0; margin-bottom: 14px; }
.mjd-back:hover { color: #fff; }
.mjd-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
.mjd-meta { font-size: 16px; color: rgba(255,255,255,0.75); margin-top: 6px; }
.mjd-status-pill { display: inline-flex; padding: 3px 10px; border-radius: 9999px; font-size: 16px; font-weight: 700; letter-spacing: 0.04em; margin-left: 10px; vertical-align: middle; }
.mjd-status-active { background: rgba(29,158,117,0.65); color: #fff; }
.mjd-status-paused { background: rgba(75,85,99,0.55); color: #fff; }
.mjd-status-error { background: rgba(220,38,38,0.65); color: #fff; }
.mjd-section { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin-bottom: 20px; }
.mjd-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: #fff; }
.mjd-chart-wrap { overflow-x: auto; }
.mjd-point { cursor: pointer; }
.mjd-point:hover { stroke: #fff; stroke-width: 2; }
.mjd-table { width: 100%; border-collapse: collapse; font-size: 16px; }
.mjd-table th { text-align: left; padding: 8px 10px; color: rgba(255,255,255,0.75); font-weight: 600; font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); }
.mjd-table td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.mjd-table tr:hover td { background: rgba(255,255,255,0.03); }
.mjd-delta-up { color: var(--t4); font-weight: 700; }
.mjd-delta-down { color: var(--coral); font-weight: 700; }
.mjd-link { color: var(--t4); cursor: pointer; text-decoration: none; }
.mjd-link:hover { text-decoration: underline; }
.mjd-run-status { display: inline-flex; padding: 2px 8px; border-radius: 9999px; font-size: 16px; font-weight: 700; }
.mjd-run-complete { background: rgba(29,158,117,0.65); color: #fff; }
.mjd-run-failed { background: rgba(220,38,38,0.65); color: #fff; }
.mjd-run-pending, .mjd-run-running { background: rgba(37,99,235,0.65); color: #fff; }
.mjd-empty { color: rgba(255,255,255,0.75); font-size: 16px; padding: 12px 0; }
.mjd-pg-btn { border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; padding: 6px 12px; font-size: 16px; font-weight: 500; color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.05); cursor: pointer; transition: background .15s; }
.mjd-pg-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.mjd-pg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mjd-pg-btn-active { border-color: var(--t4); background: var(--t6); color: #fff; border-radius: 6px; padding: 6px 12px; font-size: 16px; font-weight: 600; cursor: default; }
`;

function scoreColor(score) {
    if (typeof score !== 'number') return 'rgba(255,255,255,0.4)';
    if (score >= 80) return 'var(--t4)';
    if (score >= 60) return '#f59e0b';
    return 'var(--coral)';
}

function scheduleLabel(job) {
    const map = { weekly: 'Weekly', biweekly: 'Bi-Weekly', monthly: 'Monthly', trimonthly: 'Tri-Monthly', quarterly: 'Quarterly', custom: 'Custom' };
    return map[job?.schedule] || job?.schedule;
}

const ScoreTrendChart = ({ runs, onPointClick }) => {
    const points = runs.filter((r) => typeof r.score === 'number');
    if (points.length < 2) {
        return <div className="mjd-empty">Not enough completed runs yet to chart a trend.</div>;
    }
    const w = Math.max(320, points.length * 60), h = 140, pad = 16;
    const coords = points.map((r, i) => {
        const x = pad + (i / (points.length - 1)) * (w - pad * 2);
        const y = h - pad - (Math.max(0, Math.min(100, r.score)) / 100) * (h - pad * 2);
        return { x, y, run: r };
    });
    const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
    return (
        <div className="mjd-chart-wrap">
            <svg width={w} height={h}>
                <polyline points={polyline} fill="none" stroke="var(--t4)" strokeWidth="2" />
                {coords.map((c) => (
                    <circle
                        key={c.run._id}
                        className="mjd-point"
                        cx={c.x}
                        cy={c.y}
                        r={5}
                        fill={scoreColor(c.run.score)}
                        onClick={() => onPointClick(c.run)}
                    >
                        <title>{new Date(c.run.triggeredAt).toLocaleDateString()} — {Math.round(c.run.score)}</title>
                    </circle>
                ))}
            </svg>
        </div>
    );
};

function MonitoringJobDetailContent() {
    const router = useRouter();
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [runs, setRuns] = useState([]);
    const [runsPagination, setRunsPagination] = useState({ total: 0, page: 1, limit: 25, pages: 1 });
    const [runsPage, setRunsPage] = useState(1);
    const [notifications, setNotifications] = useState([]);
    const [notifsPagination, setNotifsPagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });
    const [notifsPage, setNotifsPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [triggering, setTriggering] = useState(false);

    // Run history and the alert log page independently — both backend
    // routes already supported real page/limit/skip/countDocuments before
    // this migration (see monitoring.routes.ts's /jobs/:id/runs and
    // /jobs/:id/notifications), so this is UI-only wiring, not a backend
    // change like the other Phase 4 pages.
    const load = async () => {
        setLoading(true);
        setError('');
        const [detailRes, runsRes, notifsRes] = await Promise.all([
            getMonitoringJob(jobId),
            listMonitoringRuns(jobId, { page: runsPage, limit: 25 }),
            listMonitoringNotifications(jobId, { page: notifsPage, limit: 20 }),
        ]);
        if (detailRes?.error) { setError(detailRes.error); setLoading(false); return; }
        setJob(detailRes.item);
        setRuns(runsRes?.items || []);
        setRunsPagination({
            total: Number(runsRes?.total) || 0,
            page: Number(runsRes?.page) || runsPage,
            limit: Number(runsRes?.limit) || 25,
            pages: Math.max(1, Number(runsRes?.pages) || 1),
        });
        setNotifications(notifsRes?.items || []);
        setNotifsPagination({
            total: Number(notifsRes?.total) || 0,
            page: Number(notifsRes?.page) || notifsPage,
            limit: Number(notifsRes?.limit) || 20,
            pages: Math.max(1, Number(notifsRes?.pages) || 1),
        });
        setLoading(false);
    };

    useEffect(() => { load(); }, [jobId, runsPage, notifsPage]);

    const PaginationBar = ({ pagination, setPage }) => {
        if ((pagination.total || 0) <= (pagination.limit || 1)) return null;
        const totalPages = pagination.pages || 1;
        const activePage = pagination.page || 1;
        const start = Math.max(1, activePage - 2);
        const end = Math.min(totalPages, activePage + 2);
        const pages = [];
        for (let p = start; p <= end; p += 1) pages.push(p);
        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '12px' }}>
                <span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.75)' }}>
                    Page {activePage} of {totalPages} ({pagination.total} total)
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    <button type="button" onClick={() => setPage(1)} disabled={activePage <= 1} className="mjd-pg-btn">First</button>
                    <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={activePage <= 1} className="mjd-pg-btn">Prev</button>
                    {pages.map(p => (
                        <button
                            type="button"
                            key={p}
                            onClick={() => setPage(p)}
                            className={p === activePage ? 'mjd-pg-btn-active' : 'mjd-pg-btn'}
                        >
                            {p}
                        </button>
                    ))}
                    <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={activePage >= totalPages} className="mjd-pg-btn">Next</button>
                    <button type="button" onClick={() => setPage(totalPages)} disabled={activePage >= totalPages} className="mjd-pg-btn">Last</button>
                </div>
            </div>
        );
    };

    const chronologicalRuns = useMemo(() => [...runs].reverse(), [runs]);

    const handleTriggerNow = async () => {
        setTriggering(true);
        const res = await triggerMonitoringJob(jobId);
        setTriggering(false);
        if (res?.error) { setError(res.error); return; }
        load();
    };

    const goToReport = (run) => {
        if (run?.reportPath) router.push(run.reportPath);
    };

    if (loading) {
        return (
            <div className="mjd-pg"><div className="mjd-wrap"><p style={{ color: 'rgba(255, 255, 255, 0.75)' }}>Loading monitor…</p></div></div>
        );
    }

    if (error && !job) {
        return (
            <div className="mjd-pg"><div className="mjd-wrap">
                <button className="mjd-back" onClick={() => router.push('/monitoring')}>← Back to Monitoring</button>
                <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5', fontSize: '16px' }}>{error}</div>
            </div></div>
        );
    }

    return (
        <>
            <style>{STYLES}</style>
            <div className="mjd-pg">
                <div className="mjd-wrap">
                    <button className="mjd-back" onClick={() => router.push('/monitoring')}>← Back to Monitoring</button>

                    <div className="mjd-head">
                        <div>
                            <h1 className="h1" style={{ color: 'var(--t4)' }}>
                                {job.domain}
                                <span className={`mjd-status-pill mjd-status-${job.status}`}>{job.status.toUpperCase()}</span>
                            </h1>
                            <p className="mjd-meta">
                                {scheduleLabel(job)} · Next run {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'} · Last run {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'never'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn btn-o" onClick={() => setModalOpen(true)}>Edit</button>
                            <button className="btn btn-d" onClick={handleTriggerNow} disabled={triggering}>{triggering ? 'Running…' : 'Run Now'}</button>
                        </div>
                    </div>

                    {error && (
                        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5', fontSize: '16px', marginBottom: '20px' }}>{error}</div>
                    )}

                    <div className="mjd-section">
                        <h2>Silver Score™ Trend</h2>
                        <ScoreTrendChart runs={chronologicalRuns} onPointClick={goToReport} />
                    </div>

                    <div className="mjd-section">
                        <h2>Run History</h2>
                        {runs.length === 0 ? (
                            <div className="mjd-empty">No runs yet — this monitor hasn&apos;t executed a scan.</div>
                        ) : (
                            <table className="mjd-table">
                                <thead>
                                    <tr>
                                        <th>Date</th><th>Standard</th><th>Status</th><th>Score</th><th>Δ</th><th>Issues</th><th>New</th><th>Resolved</th><th>Report</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {runs.map((run) => (
                                        <tr key={run._id}>
                                            <td>{new Date(run.triggeredAt).toLocaleString()}</td>
                                            <td>{describeRunWcagStandard(run.wcagStandard, run.conformanceLevel)}</td>
                                            <td><span className={`mjd-run-status mjd-run-${run.status}`}>{run.status}</span></td>
                                            <td>{typeof run.score === 'number' ? Math.round(run.score) : '—'}</td>
                                            <td>
                                                {typeof run.scoreDelta === 'number'
                                                    ? <span className={run.scoreDelta >= 0 ? 'mjd-delta-up' : 'mjd-delta-down'}>{run.scoreDelta > 0 ? '+' : ''}{run.scoreDelta}</span>
                                                    : '—'}
                                            </td>
                                            <td>{run.issueCount ?? '—'}</td>
                                            <td>{run.newIssueCount ?? '—'}</td>
                                            <td>{run.resolvedIssueCount ?? '—'}</td>
                                            <td>{run.reportPath ? <span className="mjd-link" onClick={() => router.push(run.reportPath)}>View</span> : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <PaginationBar pagination={runsPagination} setPage={setRunsPage} />
                    </div>

                    <div className="mjd-section">
                        <h2>Alert Log</h2>
                        {notifications.length === 0 ? (
                            <div className="mjd-empty">No notifications sent for this monitor yet.</div>
                        ) : (
                            <table className="mjd-table">
                                <thead>
                                    <tr><th>Date</th><th>Type</th><th>Recipients</th><th>Status</th></tr>
                                </thead>
                                <tbody>
                                    {notifications.map((n) => (
                                        <tr key={n._id}>
                                            <td>{new Date(n.createdAt).toLocaleString()}</td>
                                            <td>{String(n.type || '').replace(/_/g, ' ')}</td>
                                            <td>{(n.recipients || []).join(', ') || '—'}</td>
                                            <td><span className={`mjd-run-status ${n.status === 'sent' ? 'mjd-run-complete' : 'mjd-run-failed'}`}>{n.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <PaginationBar pagination={notifsPagination} setPage={setNotifsPage} />
                    </div>
                </div>
            </div>

            <MonitoringJobModal
                isOpen={modalOpen}
                job={job}
                planLimits={null}
                onClose={() => setModalOpen(false)}
                onSaved={() => { setModalOpen(false); load(); }}
            />
        </>
    );
}

export default function MonitoringJobDetailPage() {
    return (
        <ProtectedRoute>
            <MonitoringJobDetailContent />
        </ProtectedRoute>
    );
}
