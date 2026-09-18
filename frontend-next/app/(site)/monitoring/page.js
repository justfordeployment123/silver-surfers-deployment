'use client';

// Ported from frontend/src/pages/Monitoring.js.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../../components/ProtectedRoute';
import {
    deleteMonitoringJob,
    listMonitoringJobs,
    listMonitoringRuns,
    pauseMonitoringJob,
    resumeMonitoringJob,
    triggerMonitoringJob,
} from '../../../lib/apiClient';
import MonitoringJobModal from '../../../components/MonitoringJobModal';

const STYLES = `
/* UAT: this whole page used to hardcode a fixed-dark background
   (var(--t9), a decorative token that intentionally never flips) plus
   white/black overlay colors everywhere, so toggling the site theme only
   visibly changed the header — the page body looked identical in both
   modes. Switched to the theme-aware tokens (var(--bg)/var(--surface)/
   var(--ink)/var(--sandd)) the rest of the site's content pages use, so
   this page now actually flips light/dark like everything else. */
.mo-pg { min-height: 100vh; padding-top: 112px; padding-bottom: 80px; background: var(--bg); color: var(--ink); }
.mo-wrap { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
.mo-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
.mo-tile { background: var(--surface); border: 1px solid var(--sandd); border-radius: 14px; padding: 18px; }
.mo-tile-label { font-size: 16px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink6); margin-bottom: 6px; }
.mo-tile-value { font-size: 26px; font-weight: 800; color: var(--t4); }
.mo-jobs-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.mo-job-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.mo-job-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; transition: border-color .15s; }
.mo-job-card:hover { border-color: rgba(1,150,189,0.4); }
/* UAT: a long domain in this flex row (justify-content: space-between)
   was squeezing the status pill below its own text's natural width, since
   neither side had flex-shrink/min-width rules — the pill's rounded
   background shrank but "PAUSED"/"ACTIVE" didn't, so the text overflowed
   its own box. The domain truncates now instead of squeezing its sibling. */
.mo-job-domain { font-size: 16px; font-weight: 700; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--ink); }
.mo-job-domain:hover { text-decoration: underline; color: var(--t4); }
.mo-job-meta { font-size: 16px; color: var(--ink6); }
.mo-status-pill { display: inline-flex; padding: 3px 10px; border-radius: 9999px; font-size: 16px; font-weight: 700; letter-spacing: 0.04em; flex-shrink: 0; white-space: nowrap; }
.mo-status-active { background: rgba(1,150,189,0.65); color: #fff; }
.mo-status-paused { background: rgba(75,85,99,0.55); color: #fff; }
.mo-status-error { background: rgba(220,38,38,0.65); color: #fff; }
.mo-job-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mo-job-score { font-size: 22px; font-weight: 800; }
.mo-job-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mo-btn { border-radius: 8px; border: 1px solid var(--sandd); background: var(--sand); padding: 6px 10px; font-size: 16px; font-weight: 700; color: var(--ink); cursor: pointer; }
.mo-btn:hover { background: var(--sandd); }
.mo-btn-del { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); color: var(--coral); }
.mo-btn-del:hover { background: rgba(239,68,68,0.15); }
.mo-empty { text-align: center; padding: 60px 24px; background: var(--surface); border: 1px dashed var(--sandd); border-radius: 20px; }
.mo-empty h3 { font-size: 20px; margin-bottom: 8px; color: var(--ink); }
.mo-empty p { color: var(--ink6); max-width: 460px; margin: 0 auto 20px auto; font-size: 16px; }
/* UAT: this used to render inline at the top of the page, so a "Run Now"
   click on a card further down the (potentially long) list produced
   feedback that was off-screen — it looked like nothing happened unless
   you scrolled up. A fixed toast is visible regardless of scroll position. */
.mo-success { position: fixed; top: 84px; right: 24px; z-index: 900; max-width: 380px; padding: 14px 18px; border-radius: 10px; background: var(--surface); border: 1px solid var(--t4); color: var(--ink); font-size: 16px; box-shadow: 0 12px 32px rgba(0,0,0,0.25); animation: mo-toast-in .2s ease-out; }
@keyframes mo-toast-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.mo-trend-label { font-size: 16px; color: var(--ink6); margin-bottom: 4px; }
.mo-view-trend { font-size: 16px; font-weight: 700; color: var(--t4); background: none; border: none; padding: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.mo-view-trend:hover { text-decoration: underline; }
`;

function scoreColor(score) {
    if (typeof score !== 'number') return 'var(--ink3)';
    if (score >= 80) return 'var(--t4)';
    if (score >= 60) return 'var(--amber)';
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

function MonitoringContent() {
    const router = useRouter();
    const [jobs, setJobs] = useState([]);
    const [planId, setPlanId] = useState(null);
    const [limits, setLimits] = useState(null);
    const [runsByJob, setRunsByJob] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingJob, setEditingJob] = useState(null);
    const [busyJobId, setBusyJobId] = useState(null);
    const [triggeringId, setTriggeringId] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');

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
        if (action === 'trigger') setTriggeringId(job._id);
        setError('');
        setSuccessMessage('');
        let res;
        if (action === 'pause') res = await pauseMonitoringJob(job._id);
        else if (action === 'resume') res = await resumeMonitoringJob(job._id);
        else if (action === 'trigger') res = await triggerMonitoringJob(job._id);
        else if (action === 'delete') {
            if (!window.confirm(`Delete the monitor for ${job.domain}? This also deletes its run history.`)) { setBusyJobId(null); return; }
            res = await deleteMonitoringJob(job._id);
        }
        setBusyJobId(null);
        setTriggeringId(null);
        if (res?.error) { setError(res.error); return; }
        if (action === 'trigger') {
            // "Run Now" used to give zero feedback — the scan was actually
            // queued (confirmed by the backend's { success: true } response)
            // but nothing on screen showed it, so it looked like the click
            // did nothing. This scan runs in the background and can take a
            // few minutes to complete, so tell the user that up front rather
            // than leaving them refreshing and guessing.
            setSuccessMessage(`Scan started for ${job.domain}. This runs in the background — it can take a few minutes to finish and update below.`);
            setTimeout(() => setSuccessMessage((current) => (current.startsWith(`Scan started for ${job.domain}`) ? '' : current)), 8000);
        }
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
                        <h1 className="h1" style={{ color: 'var(--t4)', marginBottom: '8px' }}>Monitoring</h1>
                        <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>Automatically re-scan your domains on a schedule and get alerted when accessibility regresses.</p>
                    </header>

                    {successMessage && (
                        <div className="mo-success" role="status">{successMessage}</div>
                    )}

                    {error && (
                        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--coral)', fontSize: '16px', marginBottom: '20px' }}>
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <p style={{ color: 'var(--ink6)' }}>Loading your monitors…</p>
                    ) : jobs.length === 0 ? (
                        <div className="mo-empty">
                            <h3>No monitors set up yet</h3>
                            <p>Monitoring runs a scheduled scan against a domain — weekly, monthly, or on your own custom cron — and alerts you by email if the SilverSurfers Score drops or new issues appear.</p>
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
                                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>Your Monitors {limits ? `(${jobs.filter(j=>j.status==='active').length}${limits.maxActiveJobs === Infinity ? '' : ` / ${limits.maxActiveJobs}`} active)` : ''}</h2>
                                <button className="btn btn-d" onClick={openCreate}>+ New Monitor</button>
                            </div>

                            <div className="mo-job-grid">
                                {jobs.map((job) => {
                                    const runs = runsByJob[job._id] || [];
                                    return (
                                        <div key={job._id} className="mo-job-card">
                                            <div className="mo-job-row">
                                                <span className="mo-job-domain" onClick={() => router.push(`/monitoring/${job._id}`)}>{job.domain}</span>
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
                                                <div>
                                                    <div className="mo-trend-label">Score trend</div>
                                                    <Sparkline scores={runs.map((r) => r.score)} />
                                                </div>
                                            </div>
                                            {/* Explicit call-to-action rather than relying on people to guess
                                                that the domain name text up top is clickable — the full
                                                trend chart and run history only live on the detail page,
                                                and that wasn't obvious ("you have to click in the monitor
                                                box... not overly clear"). */}
                                            <button type="button" className="mo-view-trend" onClick={() => router.push(`/monitoring/${job._id}`)}>
                                                View full trend &amp; run history
                                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                            <div className="mo-job-actions">
                                                <button className="mo-btn" onClick={() => openEdit(job)}>Edit</button>
                                                {job.status === 'paused'
                                                    ? <button className="mo-btn" disabled={busyJobId === job._id} onClick={() => handleAction(job, 'resume')}>Resume</button>
                                                    : <button className="mo-btn" disabled={busyJobId === job._id} onClick={() => handleAction(job, 'pause')}>Pause</button>}
                                                <button className="mo-btn" disabled={busyJobId === job._id} onClick={() => handleAction(job, 'trigger')}>{triggeringId === job._id ? 'Running…' : 'Run Now'}</button>
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
}

export default function MonitoringPage() {
    return (
        <ProtectedRoute>
            <MonitoringContent />
        </ProtectedRoute>
    );
}
