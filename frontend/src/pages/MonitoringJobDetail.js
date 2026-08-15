import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMonitoringJob, listMonitoringNotifications, listMonitoringRuns, triggerMonitoringJob } from '../api';
import MonitoringJobModal from '../components/MonitoringJobModal';
import { WCAG_STANDARD_OPTIONS } from '../components/WcagStandardSelect';

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
/* Theme-aware — same conversion as Monitoring.js: --t9 is a fixed decorative
   teal that never flips, so this page stayed dark in light mode. */
.mjd-pg { min-height: 100vh; padding-top: 112px; padding-bottom: 80px; background: var(--bg); color: var(--ink); }
.mjd-wrap { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
.mjd-back { color: var(--ink6); font-size: 16px; cursor: pointer; background: none; border: none; padding: 0; margin-bottom: 14px; }
.mjd-back:hover { color: var(--ink); }
.mjd-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
.mjd-meta { font-size: 16px; line-height: 1.6; color: var(--ink6); margin-top: 6px; }
.mjd-status-pill { display: inline-flex; padding: 3px 10px; border-radius: 9999px; font-size: 16px; font-weight: 700; white-space: nowrap; margin-left: 10px; vertical-align: middle; }
.mjd-status-active { background: var(--t6); color: #fff; }
.mjd-status-paused { background: var(--ink6); color: var(--bg); }
.mjd-status-error { background: #B3261E; color: #fff; }
.mjd-section { background: var(--surface); border: 1px solid var(--sandd); border-radius: 16px; padding: 24px; margin-bottom: 20px; }
.mjd-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: var(--ink); }
.mjd-chart-wrap { overflow-x: auto; }
.mjd-point { cursor: pointer; }
.mjd-point:hover { stroke: var(--ink); stroke-width: 2; }
.mjd-table { width: 100%; border-collapse: collapse; font-size: 16px; }
.mjd-table th { text-align: left; padding: 8px 10px; color: var(--ink6); font-weight: 700; font-size: 16px; letter-spacing: 0.02em; border-bottom: 1px solid var(--sandd); }
.mjd-table td { padding: 10px; color: var(--ink); border-bottom: 1px solid var(--sandd); }
.mjd-table tr:hover td { background: var(--sand); }
.mjd-delta-up { color: var(--tlink); font-weight: 700; }
.mjd-delta-down { color: var(--coral); font-weight: 700; }
.mjd-link { color: var(--tlink); cursor: pointer; text-decoration: none; }
.mjd-link:hover { text-decoration: underline; }
.mjd-run-status { display: inline-flex; padding: 2px 8px; border-radius: 9999px; font-size: 16px; font-weight: 700; white-space: nowrap; }
.mjd-run-complete { background: var(--t6); color: #fff; }
.mjd-run-failed { background: #B3261E; color: #fff; }
.mjd-run-pending, .mjd-run-running { background: #1D4FD8; color: #fff; }
.mjd-empty { color: var(--ink6); font-size: 16px; line-height: 1.6; padding: 12px 0; }
`;

function scoreColor(score) {
    if (typeof score !== 'number') return 'var(--ink3)';
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

const MonitoringJobDetail = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const [job, setJob] = useState(null);
    const [runs, setRuns] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [triggering, setTriggering] = useState(false);

    const load = async () => {
        setLoading(true);
        setError('');
        const [detailRes, runsRes, notifsRes] = await Promise.all([
            getMonitoringJob(jobId),
            listMonitoringRuns(jobId, { limit: 25 }),
            listMonitoringNotifications(jobId, { limit: 20 }),
        ]);
        if (detailRes?.error) { setError(detailRes.error); setLoading(false); return; }
        setJob(detailRes.item);
        setRuns(runsRes?.items || []);
        setNotifications(notifsRes?.items || []);
        setLoading(false);
    };

    useEffect(() => { load(); }, [jobId]);

    const chronologicalRuns = useMemo(() => [...runs].reverse(), [runs]);

    const handleTriggerNow = async () => {
        setTriggering(true);
        const res = await triggerMonitoringJob(jobId);
        setTriggering(false);
        if (res?.error) { setError(res.error); return; }
        load();
    };

    const goToReport = (run) => {
        if (run?.reportPath) navigate(run.reportPath);
    };

    if (loading) {
        return (
            <div className="mjd-pg"><div className="mjd-wrap"><p className="mjd-empty">Loading monitor…</p></div></div>
        );
    }

    if (error && !job) {
        return (
            <div className="mjd-pg"><div className="mjd-wrap">
                <button className="mjd-back" onClick={() => navigate('/monitoring')}>← Back to Monitoring</button>
                <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5', fontSize: '16px' }}>{error}</div>
            </div></div>
        );
    }

    return (
        <>
            <style>{STYLES}</style>
            <div className="mjd-pg">
                <div className="mjd-wrap">
                    <button className="mjd-back" onClick={() => navigate('/monitoring')}>← Back to Monitoring</button>

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
                            <div className="mjd-empty">No runs yet — this monitor hasn't executed a scan.</div>
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
                                            <td>{run.reportPath ? <span className="mjd-link" onClick={() => navigate(run.reportPath)}>View</span> : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
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
};

export default MonitoringJobDetail;
