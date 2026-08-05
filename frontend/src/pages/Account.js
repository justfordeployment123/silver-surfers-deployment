import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    deleteMyAnalysis,
    deleteMyQuickScan,
    getMe,
    getSubscription,
    listMyAnalysis,
    listMyQuickScans,
    rerunMyAnalysis,
    rerunMyQuickScan,
    rescanMyAnalysis,
    rescanMyQuickScan,
} from "../api";

const STYLES = `
.ac-pg { min-height: 100vh; padding-top: 112px; padding-bottom: 80px; background: var(--t9); color: #fff; }
.ac-wrap { max-width: 1024px; margin: 0 auto; padding: 0 24px; }
.sp { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #fff; }
.sp-cmp { background: rgba(29,158,117,0.65); }
.sp-cww { background: rgba(217,119,6,0.65); }
.sp-fail { background: rgba(220,38,38,0.65); }
.sp-proc { background: rgba(37,99,235,0.65); }
.sp-def { background: rgba(75,85,99,0.55); }
.ac-sub-banner { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); border-radius: var(--r); padding: 24px; margin-bottom: 32px; }
.ac-tab-wrap { border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.18); padding: 8px; margin-bottom: 12px; }
.ac-tab { border-radius: 12px; padding: 12px 16px; text-align: left; border: none; cursor: pointer; width: 100%; transition: background .15s; }
.ac-tab-active { background: var(--surface); color: var(--ink); }
.ac-tab-inactive { background: rgba(255,255,255,0.05); color: #fff; }
.ac-tab-inactive:hover { background: rgba(255,255,255,0.1); }
.ac-tab-badge { border-radius: 9999px; padding: 2px 10px; font-size: 12px; font-weight: 700; }
.ac-tab-badge-active { background: var(--t05); color: var(--t8); }
.ac-tab-badge-inactive { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.75); }
.ac-inp { flex: 1; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.1); color: #fff; font-size: 14px; outline: none; border: 1px solid rgba(255,255,255,0.12); }
.ac-inp::placeholder { color: rgba(255,255,255,0.35); }
.ac-inp:focus { border-color: var(--t4); }
.ac-sel { padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.1); color: #fff; font-size: 14px; outline: none; border: 1px solid rgba(255,255,255,0.12); }
.ac-ref { padding: 8px 16px; border-radius: 8px; background: var(--t4); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; border: none; white-space: nowrap; }
.ac-ref:hover { background: var(--t8); }
.ac-card { padding: 16px; border-radius: 10px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); transition: border-color .15s; }
.ac-card:hover { border-color: rgba(29,158,117,0.4); }
.ac-btn-rescan { border-radius: 8px; background: var(--t4); padding: 6px 12px; font-size: 12px; font-weight: 700; color: #fff; border: none; cursor: pointer; transition: background .15s; }
.ac-btn-rescan:hover { background: var(--t8); }
.ac-btn-rescan:disabled { opacity: 0.6; cursor: not-allowed; }
.ac-btn-rerun { border-radius: 8px; background: rgba(217,119,6,0.7); padding: 6px 12px; font-size: 12px; font-weight: 700; color: #fff; border: none; cursor: pointer; }
.ac-btn-rerun:hover { background: rgba(217,119,6,0.9); }
.ac-btn-rerun:disabled { opacity: 0.6; cursor: not-allowed; }
.ac-btn-view { border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 6px 12px; font-size: 12px; font-weight: 700; color: #fff; cursor: pointer; }
.ac-btn-view:hover { background: rgba(255,255,255,0.1); }
.ac-btn-del { border-radius: 8px; border: 1px solid rgba(248,113,113,0.25); background: rgba(239,68,68,0.08); padding: 6px 12px; font-size: 12px; font-weight: 700; color: #fca5a5; cursor: pointer; }
.ac-btn-del:hover { background: rgba(239,68,68,0.15); }
.ac-btn-del:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const StatusPill = ({ value }) => {
    const cls =
        value === "completed" ? "sp-cmp"
        : value === "completed_with_warnings" ? "sp-cww"
        : value === "failed" ? "sp-fail"
        : value === "processing" ? "sp-proc"
        : "sp-def";
    const label =
        value === "completed_with_warnings"
            ? "COMPLETED WITH WARNINGS"
            : String(value || "queued").replace(/_/g, " ").toUpperCase();
    return <span className={`sp ${cls}`}>{label}</span>;
};

const EmailPill = ({ value }) => {
    const cls =
        value === "sent" ? "sp-cmp"
        : value === "failed" ? "sp-fail"
        : value === "sending" ? "sp-proc"
        : "sp-def";
    return <span className={`sp ${cls}`}>EMAIL {String(value || "pending").toUpperCase()}</span>;
};

const ScorePill = ({ value }) => {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    const rounded = Math.round(value);
    const cls = rounded >= 80 ? "sp-cmp" : rounded >= 70 ? "sp-cww" : "sp-fail";
    return <span className={`sp ${cls}`}>SILVER SCORE {rounded}</span>;
};

const RiskPill = ({ value }) => {
    if (!value) return null;
    const normalized = String(value).toLowerCase();
    const cls = normalized === "low" ? "sp-cmp" : normalized === "medium" ? "sp-cww" : "sp-fail";
    return <span className={`sp ${cls}`}>RISK {normalized.toUpperCase()}</span>;
};

const getQuickScanStepIndex = (value) => {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "completed") return 2;
    if (normalized === "queued" || normalized === "processing") return 1;
    return 0;
};

const getQuickScanStatusLabel = (value) => {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "processing") return "Queued";
    if (normalized === "failed") return "Failed";
    if (normalized) return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    return "Pending";
};

const QuickScanStatusLine = ({ value }) => {
    const failed = String(value || "").toLowerCase() === "failed";
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>
            <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.72)', fontSize: '11px' }}>Current status</span>
            <span style={{ color: failed ? '#fca5a5' : 'var(--t3)' }}>{getQuickScanStatusLabel(value)}</span>
        </div>
    );
};

export default function Account() {
    const [user, setUser] = useState(null);
    const [items, setItems] = useState([]);
    const [quickScans, setQuickScans] = useState([]);
    const [activeTab, setActiveTab] = useState("full-audits");
    const [loading, setLoading] = useState(true);
    const [auditError, setAuditError] = useState("");
    const [quickScanError, setQuickScanError] = useState("");
    const [rerunningKey, setRerunningKey] = useState("");
    const [rescanningKey, setRescanningKey] = useState("");
    const [deletingKey, setDeletingKey] = useState("");
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
    const [subscription, setSubscription] = useState(null);
    const navigate = useNavigate();

    const load = async () => {
        setLoading(true);
        setAuditError("");
        setQuickScanError("");
        const [analysisRes, quickScanRes] = await Promise.all([listMyAnalysis({ limit: 200 }), listMyQuickScans({ limit: 200 })]);

        if (analysisRes?.error) { setAuditError(analysisRes.error); setItems([]); }
        else { setItems(Array.isArray(analysisRes.items) ? analysisRes.items : []); }

        if (quickScanRes?.error) { setQuickScanError(quickScanRes.error); setQuickScans([]); }
        else { setQuickScans(Array.isArray(quickScanRes.items) ? quickScanRes.items : []); }

        setLoading(false);
    };

    useEffect(() => {
        (async () => {
            const me = await getMe();
            if (!me?.user) { setUser(null); setLoading(false); return; }
            setUser(me.user);
            try {
                const subResult = await getSubscription();
                if (subResult.subscription) setSubscription(subResult.subscription);
            } catch { console.log("No subscription found"); }
            await load();
        })();
    }, []);

    const filtered = items.filter((r) => {
        const matchQ = q ? (r.url || "").toLowerCase().includes(q.toLowerCase()) || (r.taskId || "").toLowerCase().includes(q.toLowerCase()) : true;
        const matchStatus = status === "all" ? true : r.status === status;
        return matchQ && matchStatus;
    });

    const filteredQuickScans = quickScans.filter((scan) => {
        const matchQ = q ? (scan.url || "").toLowerCase().includes(q.toLowerCase()) || (scan.email || "").toLowerCase().includes(q.toLowerCase()) : true;
        const matchStatus = status === "all" ? true : scan.status === status;
        return matchQ && matchStatus;
    });

    const handleRerunAnalysis = async (taskId) => {
        if (!taskId) return;
        setRerunningKey(`analysis:${taskId}`); setAuditError("");
        const result = await rerunMyAnalysis(taskId);
        setRerunningKey("");
        if (result?.error) { setAuditError(result.error); return; }
        await load();
    };

    const handleRerunQuickScan = async (quickScanId) => {
        if (!quickScanId) return;
        setRerunningKey(`quick:${quickScanId}`); setQuickScanError("");
        const result = await rerunMyQuickScan(quickScanId);
        setRerunningKey("");
        if (result?.error) { setQuickScanError(result.error); return; }
        await load();
    };

    const handleRescanAnalysis = async (taskId) => {
        if (!taskId) return;
        setRescanningKey(`analysis:${taskId}`); setAuditError("");
        const result = await rescanMyAnalysis(taskId);
        setRescanningKey("");
        if (result?.error) { setAuditError(result.error); return; }
        await load();
    };

    const handleRescanQuickScan = async (quickScanId) => {
        if (!quickScanId) return;
        setRescanningKey(`quick:${quickScanId}`); setQuickScanError("");
        const result = await rescanMyQuickScan(quickScanId);
        setRescanningKey("");
        if (result?.error) { setQuickScanError(result.error); return; }
        await load();
    };

    const handleDeleteAnalysis = async (taskId) => {
        if (!taskId) return;
        if (!window.confirm("Delete this full audit from your account?")) return;
        setDeletingKey(`analysis:${taskId}`); setAuditError("");
        const result = await deleteMyAnalysis(taskId);
        setDeletingKey("");
        if (result?.error) { setAuditError(result.error); return; }
        await load();
    };

    const handleDeleteQuickScan = async (quickScanId) => {
        if (!quickScanId) return;
        if (!window.confirm("Delete this quick scan from your account?")) return;
        setDeletingKey(`quick:${quickScanId}`); setQuickScanError("");
        const result = await deleteMyQuickScan(quickScanId);
        setDeletingKey("");
        if (result?.error) { setQuickScanError(result.error); return; }
        await load();
    };

    return (
        <>
            <style>{STYLES}</style>
            <div className="ac-pg">
                <div className="ac-wrap">
                    <header style={{ marginBottom: '32px' }}>
                        <h1 className="h1" style={{ color: 'var(--t4)', marginBottom: '8px' }}>My Account</h1>
                        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)' }}>Your full audits, quick scans, and their current delivery status.</p>
                    </header>

                    {!user && (
                        <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                            Please log in to view your account.
                        </div>
                    )}

                    {user && (
                        <>
                            {subscription && subscription.status === "active" && (
                                <div className="ac-sub-banner">
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                                        <div>
                                            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Ready to Start Your Audit?</h3>
                                            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)' }}>
                                                You have {subscription.isTeamMember ? "team access to" : "an active"}{" "}
                                                <span style={{ fontWeight: 700, color: 'var(--t4)' }}>{subscription.plan?.name}</span> subscription
                                            </p>
                                            {subscription.isTeamMember && (
                                                <p style={{ fontSize: '13px', color: '#fcd34d', marginTop: '4px', display: 'flex', alignItems: 'center', gap: 5 }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>You're using a team plan</p>
                                            )}
                                        </div>
                                        <button onClick={() => navigate("/checkout")} className="btn btn-d">
                                            Start Full Audit
                                        </button>
                                    </div>
                                </div>
                            )}

                            <section>
                                <div className="ac-tab-wrap">
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        {[
                                            { key: 'full-audits', label: 'Full Audits', desc: 'Detailed audit runs and report packages', count: filtered.length },
                                            { key: 'quick-scans', label: 'Quick Scans', desc: 'Fast scan requests with status progress', count: filteredQuickScans.length },
                                        ].map(({ key, label, desc, count }) => (
                                            <button
                                                key={key}
                                                onClick={() => setActiveTab(key)}
                                                className={`ac-tab ${activeTab === key ? 'ac-tab-active' : 'ac-tab-inactive'}`}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                                    <div>
                                                        <p style={{ fontSize: '15px', fontWeight: 700, color: activeTab === key ? 'var(--ink)' : '#fff', marginBottom: '2px' }}>{label}</p>
                                                        <p style={{ fontSize: '13px', color: activeTab === key ? 'var(--ink6)' : 'rgba(255,255,255,0.72)' }}>{desc}</p>
                                                    </div>
                                                    <span className={`ac-tab-badge ${activeTab === key ? 'ac-tab-badge-active' : 'ac-tab-badge-inactive'}`}>{count}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
                                    <input
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        placeholder={activeTab === "quick-scans" ? "Search URL or email..." : "Search URL or taskId..."}
                                        className="ac-inp"
                                    />
                                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="ac-sel">
                                        <option value="all" className="text-black">All</option>
                                        <option value="queued" className="text-black">Queued</option>
                                        <option value="processing" className="text-black">Processing</option>
                                        <option value="completed" className="text-black">Completed</option>
                                        <option value="completed_with_warnings" className="text-black">Completed with warnings</option>
                                        <option value="failed" className="text-black">Failed</option>
                                    </select>
                                    <button onClick={load} className="ac-ref">Refresh</button>
                                </div>

                                {loading && <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.72)' }}>Loading...</div>}

                                {activeTab === "full-audits" ? (
                                    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                            <div>
                                                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Full Audits</h2>
                                                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)' }}>Detailed accessibility audit runs linked to your account.</p>
                                            </div>
                                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)' }}>{filtered.length} shown</span>
                                        </div>

                                        {auditError && <div style={{ fontSize: '14px', color: '#fca5a5' }}>{auditError}</div>}
                                        {!loading && filtered.length === 0 && <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.72)', fontStyle: 'italic' }}>No full audits found.</div>}

                                        {filtered.map((rec) => (
                                            <div key={rec._id || rec.taskId} className="ac-card">
                                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                                                            <span style={{ fontWeight: 600, wordBreak: 'break-all', fontSize: '14px' }}>{rec.url}</span>
                                                            <StatusPill value={rec.status} />
                                                            <EmailPill value={rec.emailStatus} />
                                                            <ScorePill value={rec.score ?? rec.scoreCard?.overallScore} />
                                                            <RiskPill value={rec.scoreCard?.riskTier} />
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.72)', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                                                            <span>Task: {rec.taskId}</span>
                                                            {rec.createdAt && <span>Created {new Date(rec.createdAt).toLocaleString()}</span>}
                                                            {typeof rec.attachmentCount === "number" && <span>PDFs: {rec.attachmentCount}</span>}
                                                            {typeof rec.successfulTargetCount === "number" && typeof rec.plannedTargetCount === "number" && (
                                                                <span>Targets: {rec.successfulTargetCount}/{rec.plannedTargetCount}</span>
                                                            )}
                                                            {typeof rec.degradedTargetCount === "number" && rec.degradedTargetCount > 0 && (
                                                                <span>Lite fallback: {rec.degradedTargetCount}</span>
                                                            )}
                                                            {Array.isArray(rec.reportFiles) && rec.reportFiles.length > 0 && <span>Stored reports ready</span>}
                                                        </div>
                                                        {rec.failureReason && <div style={{ marginTop: '4px', fontSize: '12px', color: '#fca5a5' }}>Reason: {rec.failureReason}</div>}
                                                        {!rec.failureReason && Array.isArray(rec.warnings) && rec.warnings.filter(w => !w.includes('dispatched to the scanner service')).length > 0 && (
                                                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#fcd34d' }}>
                                                                Warning: {rec.warnings.filter(w => !w.includes('dispatched to the scanner service'))[0]}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {rec.taskId && (
                                                            <button onClick={() => handleRescanAnalysis(rec.taskId)} disabled={rescanningKey === `analysis:${rec.taskId}`} className="ac-btn-rescan">
                                                                {rescanningKey === `analysis:${rec.taskId}` ? "Queueing..." : "Re-scan"}
                                                            </button>
                                                        )}
                                                        {rec.status === "failed" && rec.taskId && (
                                                            <button onClick={() => handleRerunAnalysis(rec.taskId)} disabled={rerunningKey === `analysis:${rec.taskId}`} className="ac-btn-rerun">
                                                                {rerunningKey === `analysis:${rec.taskId}` ? "Re-running..." : "Re-run"}
                                                            </button>
                                                        )}
                                                        {rec.taskId && (
                                                            <button onClick={() => navigate(`/account/analysis/${rec.taskId}`)} className="ac-btn-view">
                                                                {rec.attachmentCount > 0 ? "View reports" : "View details"}
                                                            </button>
                                                        )}
                                                        {rec.taskId && (
                                                            <button onClick={() => handleDeleteAnalysis(rec.taskId)} disabled={deletingKey === `analysis:${rec.taskId}`} className="ac-btn-del">
                                                                {deletingKey === `analysis:${rec.taskId}` ? "Deleting..." : "Delete"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </section>
                                ) : (
                                    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                            <div>
                                                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Quick Scans</h2>
                                                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)' }}>Free scan requests with a live status line for pending, queued, and complete.</p>
                                            </div>
                                            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.72)' }}>{filteredQuickScans.length} shown</span>
                                        </div>

                                        {quickScanError && <div style={{ fontSize: '14px', color: '#fca5a5' }}>{quickScanError}</div>}
                                        {!loading && filteredQuickScans.length === 0 && <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.72)', fontStyle: 'italic' }}>No quick scans found.</div>}

                                        {filteredQuickScans.map((scan) => (
                                            <div key={scan._id || `${scan.email}-${scan.url}-${scan.createdAt || scan.scanDate}`} className="ac-card">
                                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                                                            <span style={{ fontWeight: 600, wordBreak: 'break-all', fontSize: '14px' }}>{scan.url}</span>
                                                            <StatusPill value={scan.status} />
                                                            <EmailPill value={scan.emailStatus} />
                                                            <ScorePill value={scan.scanScore} />
                                                        </div>
                                                        <QuickScanStatusLine value={scan.status} />
                                                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.72)', display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px' }}>
                                                            {scan.scanDate && <span>Scanned {new Date(scan.scanDate).toLocaleString()}</span>}
                                                            {scan.createdAt && <span>Requested {new Date(scan.createdAt).toLocaleString()}</span>}
                                                            {scan.reportGenerated && <span>Report generated</span>}
                                                            {Array.isArray(scan.reportFiles) && scan.reportFiles.length > 0 && <span>Stored reports ready</span>}
                                                        </div>
                                                        {scan.errorMessage && <div style={{ fontSize: '12px', color: '#fca5a5', marginTop: '4px' }}>Reason: {scan.errorMessage}</div>}
                                                        {scan.emailError && <div style={{ fontSize: '12px', color: '#fcd34d', marginTop: '4px' }}>Email: {scan.emailError}</div>}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {scan._id && (
                                                            <button onClick={() => handleRescanQuickScan(scan._id)} disabled={rescanningKey === `quick:${scan._id}`} className="ac-btn-rescan">
                                                                {rescanningKey === `quick:${scan._id}` ? "Queueing..." : "Re-scan"}
                                                            </button>
                                                        )}
                                                        {scan.status === "failed" && scan._id && (
                                                            <button onClick={() => handleRerunQuickScan(scan._id)} disabled={rerunningKey === `quick:${scan._id}`} className="ac-btn-rerun">
                                                                {rerunningKey === `quick:${scan._id}` ? "Re-running..." : "Re-run"}
                                                            </button>
                                                        )}
                                                        {scan._id && (
                                                            <button onClick={() => navigate(`/account/quick-scans/${scan._id}`)} className="ac-btn-view">
                                                                View quick scan
                                                            </button>
                                                        )}
                                                        {scan._id && (
                                                            <button onClick={() => handleDeleteQuickScan(scan._id)} disabled={deletingKey === `quick:${scan._id}`} className="ac-btn-del">
                                                                {deletingKey === `quick:${scan._id}` ? "Deleting..." : "Delete"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </section>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
