import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    deleteMonitoringJob,
    listMonitoringJobs,
    listMonitoringRuns,
    pauseMonitoringJob,
    resumeMonitoringJob,
    triggerMonitoringJob,
} from '../api';
import MonitoringJobModal from '../components/MonitoringJobModal';

const STYLES = `
/* Theme-aware: this page previously hard-coded a dark backdrop (--t9, a fixed
   decorative teal that intentionally never flips) plus white text and
   rgba(255,255,255,*) surfaces, so it stayed dark in light mode while the nav
   — which does use tokens — flipped correctly. Everything below now reads the
   --bg/--surface/--ink/--sandd tokens that flip on [data-theme]. */
.mo-pg { min-height: 100vh; padding-top: 112px; padding-bottom: 80px; background: var(--bg); color: var(--ink); }
.mo-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
.mo-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
.mo-tile { background: var(--surface); border: 1px solid var(--sandd); border-radius: 14px; padding: 18px; }
.mo-tile-label { font-size: 16px; letter-spacing: 0.02em; color: var(--ink6); margin-bottom: 6px; }
.mo-tile-value { font-size: 26px; font-weight: 800; color: var(--tlink); }
.mo-jobs-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.mo-job-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.mo-job-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; transition: border-color .15s; }
.mo-job-card:hover { border-color: var(--t4); }
.mo-job-domain { font-size: 16px; font-weight: 700; color: var(--ink); cursor: pointer; overflow-wrap: anywhere; }
.mo-job-domain:hover { text-decoration: underline; color: var(--tlink); }
.mo-job-meta { font-size: 16px; color: var(--ink6); }
.mo-status-pill { display: inline-flex; padding: 3px 10px; border-radius: 9999px; font-size: 16px; font-weight: 700; white-space: nowrap; }
.mo-status-active { background: var(--t6); color: #fff; }
.mo-status-paused { background: var(--ink6); color: var(--bg); }
.mo-status-error { background: #B3261E; color: #fff; }
.mo-job-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mo-job-score { font-size: 22px; font-weight: 800; }
.mo-job-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mo-btn { border-radius: 8px; border: 1px solid var(--sandd); background: var(--bg); padding: 6px 10px; font-size: 16px; font-weight: 700; color: var(--ink); cursor: pointer; }
.mo-btn:hover { background: var(--sand); }
.mo-btn-del { border-color: var(--coral); background: transparent; color: var(--coral); }
.mo-btn-del:hover { background: var(--coralbg); color: #A83A22; }
.mo-empty { text-align: center; padding: 60px 24px; background: var(--surface); border: 1px dashed var(--sandd); border-radius: 20px; }
.mo-empty h3 { font-size: 20px; margin-bottom: 8px; color: var(--ink); }
.mo-empty p { color: var(--ink6); max-width: 460px; margin: 0 auto 20px auto; font-size: 16px; line-height: 1.6; }
.mo-head-sub { font-size: 16px; line-height: 1.6; color: var(--ink6); }
.mo-error { padding: 14px 16px; border-radius: 10px; background: var(--coralbg); border: 1px solid var(--coral); color: #A83A22; font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
.mo-jobs-title { font-size: 18px; font-weight: 700; color: var(--ink); }
@media (max-width: 900px) { .mo-tiles { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .mo-tiles { grid-template-columns: 1fr; } }
`;

function scoreColor(score) {
    if (typeof score !== 'number') return 'var(--ink3)';
    if (score >= 80) return 'var(--t4)';
    if (score >= 60) return '#f59e0b';
    return 'var(--coral)';
}

function formatTimeUntil(dateStr) {
    if (!dateStr) return '—';
    const diffMs = new Date(dateStr).getTime() - Date.now();
    if (diffMs <= 0) return 'Due now';
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}m`;
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function scheduleLabel(job) {
    const map = { weekly: 'Weekly', biweekly: 'Bi-Weekly', monthly: 'Monthly', trimonthly: 'Tri-Monthly', quarterly: 'Quarterly', custom: 'Custom' };
    return map[job.schedule] || job.schedule;
}

const Sparkline = ({ scores }) => {
    const valid = scores.filter((s) => typeof s === 'number');
    if (valid.length < 2) return <div style={{ height: 32, fontSize: 16, color: 'var(--ink6)', display: 'flex', alignItems: 'center' }}>Not enough runs yet</div>;
    const w = 140, h = 32, max = 100, min = 0;
    const points = scores.map((s, i) => {
        const x = (i / (scores.length - 1)) * w;
        const y = h - ((Math.max(min, Math.min(max, s ?? 0)) - min) / (max - min)) * h;
        return `${x},${y}`;
    }).join(' ');
    const last = valid[valid.length - 1];
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <polyline points={points} fill="none" stroke={scoreColor(last)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

const Monitoring = () => {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [planId, setPlanId] = useState(null);
    const [limits, setLimits] = useState(null);
    const [runsByJob, setRunsByJob] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState(null);
    const [busyJobId, setBusyJobId] = useState(null);

    const load = async () => {
        setLoading(true);
        setError('');
        const res = await listMonitoringJobs();
        if (res?.error) { setError(res.error); setLoading(false); return; }
        setJobs(res.items || []);
        setPlanId(res.planId);
        setLimits(res.limits);

        const runEntries = await Promise.all((res.items || []).map(async (job) => {
            const runsRes = await listMonitoringRuns(job._id, { limit: 6 });
            return [job._id, runsRes?.items ? [...runsRes.items].reverse() : []];
        }));
        setRunsByJob(Object.fromEntries(runEntries));
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const tiles = useMemo(() => {
        const activeJobs = jobs.filter((j) => j.status === 'active');
        const nextRun = activeJobs
            .map((j) => j.nextRunAt)
            .filter(Boolean)
            .sort((a, b) => new Date(a) - new Date(b))[0];

        const lastRunJob = [...jobs]
            .filter((j) => j.lastRunAt)
            .sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt))[0];

        const jobsWithIssues = jobs.filter((j) => {
            const runs = runsByJob[j._id] || [];
            const latest = runs[runs.length - 1];
            return (latest?.newIssueCount || 0) > 0;
        }).length;

        return {
            active: activeJobs.length,
            nextRun: nextRun ? formatTimeUntil(nextRun) : '—',
            lastScore: typeof lastRunJob?.lastRunScore === 'number' ? Math.round(lastRunJob.lastRunScore) : '—',
            withIssues: jobsWithIssues,
        };
    }, [jobs, runsByJob]);

    const handleAction = async (job, action) => {
        setBusyJobId(job._id);
        let res;
        if (action === 'pause') res = await pauseMonitoringJob(job._id);
        else if (action === 'resume') res = await resumeMonitoringJob(job._id);
        else if (action === 'trigger') res = await triggerMonitoringJob(job._id);
        else if (action === 'delete') {
            if (!window.confirm(`Delete the monitor for ${job.domain}? This also deletes its run history.`)) { setBusyJobId(null); return; }
            res = await deleteMonitoringJob(job._id);
        }
        setBusyJobId(null);
        if (res?.error) { setError(res.error); return; }
        load();
    };

    const openCreate = () => { setEditingJob(null); setModalOpen(true); };
    const openEdit = (job) => { setEditingJob(job); setModalOpen(true); };

    return (
        <>
            <style>{STYLES}</style>
            <div className="mo-pg">
                <div className="mo-wrap">
                    <header style={{ marginBottom: '28px' }}>
                        <h1 className="h1" style={{ color: 'var(--tlink)', marginBottom: '8px' }}>Monitoring</h1>
                        <p className="mo-head-sub">Automatically re-scan your domains on a schedule and get alerted when accessibility regresses.</p>
                    </header>

                    {error && (
                        <div className="mo-error">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <p className="mo-head-sub">Loading your monitors…</p>
                    ) : jobs.length === 0 ? (
                        <div className="mo-empty">
                            <h3>No monitors set up yet</h3>
                            <p>Monitoring runs a scheduled scan against a domain — weekly, monthly, or on your own custom cron — and alerts you by email if the Silver Score™ drops or new issues appear.</p>
                            <button className="btn btn-d" onClick={openCreate}>Set Up Your First Monitor</button>
                        </div>
                    ) : (
                        <>
                            <div className="mo-tiles">
                                <div className="mo-tile"><div className="mo-tile-label">Active Jobs</div><div className="mo-tile-value">{tiles.active}</div></div>
                                <div className="mo-tile"><div className="mo-tile-label">Next Scheduled Run</div><div className="mo-tile-value">{tiles.nextRun}</div></div>
                                <div className="mo-tile"><div className="mo-tile-label">Last Run Score</div><div className="mo-tile-value">{tiles.lastScore}</div></div>
                                <div className="mo-tile"><div className="mo-tile-label">Jobs With Issues</div><div className="mo-tile-value">{tiles.withIssues}</div></div>
                            </div>

                            <div className="mo-jobs-head">
                                <h2 className="mo-jobs-title">Your Monitors {limits ? `(${jobs.filter(j=>j.status==='active').length}${limits.maxActiveJobs === Infinity ? '' : ` / ${limits.maxActiveJobs}`} active)` : ''}</h2>
                                <button className="btn btn-d" onClick={openCreate}>+ New Monitor</button>
                            </div>

                            <div className="mo-job-grid">
                                {jobs.map((job) => {
                                    const runs = runsByJob[job._id] || [];
                                    return (
                                        <div key={job._id} className="mo-job-card">
                                            <div className="mo-job-row">
                                                <span className="mo-job-domain" onClick={() => navigate(`/monitoring/${job._id}`)}>{job.domain}</span>
                                                <span className={`mo-status-pill mo-status-${job.status}`}>{job.status.toUpperCase()}</span>
                                            </div>
                                            <div className="mo-job-meta">{scheduleLabel(job)} · Next run {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'}</div>
                                            <div className="mo-job-row">
                                                <div>
                                                    <div className="mo-job-meta" style={{ marginBottom: 4 }}>Last score</div>
                                                    <div className="mo-job-score" style={{ color: scoreColor(job.lastRunScore) }}>
                                                        {typeof job.lastRunScore === 'number' ? Math.round(job.lastRunScore) : '—'}
                                                    </div>
                                                </div>
                                                <Sparkline scores={runs.map((r) => r.score)} />
                                            </div>
                                            <div className="mo-job-actions">
                                                <button className="mo-btn" onClick={() => openEdit(job)}>Edit</button>
                                                {job.status === 'paused'
                                                    ? <button className="mo-btn" disabled={busyJobId === job._id} onClick={() => handleAction(job, 'resume')}>Resume</button>
                                                    : <button className="mo-btn" disabled={busyJobId === job._id} onClick={() => handleAction(job, 'pause')}>Pause</button>}
                                                <button className="mo-btn" disabled={busyJobId === job._id} onClick={() => handleAction(job, 'trigger')}>Run Now</button>
                                                <button className="mo-btn mo-btn-del" disabled={busyJobId === job._id} onClick={() => handleAction(job, 'delete')}>Delete</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <MonitoringJobModal
                isOpen={modalOpen}
                job={editingJob}
                planLimits={limits}
                onClose={() => setModalOpen(false)}
                onSaved={() => { setModalOpen(false); load(); }}
            />
        </>
    );
};

export default Monitoring;
