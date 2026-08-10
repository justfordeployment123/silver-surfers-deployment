import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { deleteMyQuickScan, fetchMyQuickScanReportFile, getMyQuickScanDetail, rescanMyQuickScan, rerunMyQuickScan } from "../api";

// Mirrors the backend's describeWcagStandardLabel() (wcag-mapping.ts) so the
// report header text matches what's on the PDF (2.2.7.3).
function describeWcagStandard(wcagStandard, conformanceLevel) {
  const level = conformanceLevel || 'AA';
  if (wcagStandard === 'wcag21') return `WCAG 2.1 Level ${level}`;
  if (wcagStandard === 'wcag22') return `WCAG 2.2 Level ${level}`;
  return 'Full Combined (WCAG 2.1 + 2.2)';
}

const STYLES = `
.qsd-pg { min-height: 100vh; background: var(--t9); padding: 112px 24px 80px; color: #fff; }
.qsd-wrap { max-width: 1152px; margin: 0 auto; }
.qsd-back { display: inline-flex; align-items: center; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 6px 12px; font-size: 16px; color: rgba(255,255,255,0.75); cursor: pointer; margin-bottom: 16px; transition: background .15s; }
.qsd-back:hover { background: rgba(255,255,255,0.1); }
.sb { display: inline-flex; align-items: center; border-radius: 9999px; border: 1px solid; padding: 3px 10px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.sb-green { background: rgba(29,158,117,0.2); color: var(--t3); border-color: rgba(29,158,117,0.3); }
.sb-yellow { background: rgba(245,158,11,0.15); color: #fcd34d; border-color: rgba(245,158,11,0.3); }
.sb-red { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
.sb-blue { background: rgba(56,189,248,0.15); color: #bae6fd; border-color: rgba(56,189,248,0.3); }
.sb-gray { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.1); }
.qsd-btn-rescan { border-radius: 8px; background: var(--t6); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; border: none; cursor: pointer; transition: background .15s; }
.qsd-btn-rescan:hover { background: var(--t8); }
.qsd-btn-rescan:disabled { opacity: 0.6; cursor: not-allowed; }
.qsd-btn-rerun { border-radius: 8px; background: rgba(217,119,6,0.7); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; border: none; cursor: pointer; }
.qsd-btn-rerun:hover { background: rgba(217,119,6,0.9); }
.qsd-btn-rerun:disabled { opacity: 0.6; cursor: not-allowed; }
.qsd-btn-del { border-radius: 8px; border: 1px solid rgba(248,113,113,0.25); background: rgba(239,68,68,0.08); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fca5a5; cursor: pointer; }
.qsd-btn-del:hover { background: rgba(239,68,68,0.15); }
.qsd-btn-del:disabled { opacity: 0.6; cursor: not-allowed; }
.qsd-btn-open { border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; cursor: pointer; }
.qsd-btn-open:hover { background: rgba(255,255,255,0.1); }
.qsd-btn-open:disabled { opacity: 0.6; cursor: not-allowed; }
.qsd-btn-dl { border-radius: 8px; background: var(--t6); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; border: none; cursor: pointer; }
.qsd-btn-dl:hover { background: var(--t8); }
.qsd-btn-dl:disabled { opacity: 0.6; cursor: not-allowed; }
`;

function ScoreBadge({ value, tone }) {
    const cls = { green: 'sb-green', yellow: 'sb-yellow', red: 'sb-red', blue: 'sb-blue', gray: 'sb-gray' };
    return <span className={`sb ${cls[tone] || 'sb-gray'}`}>{value}</span>;
}

function getRiskTone(value) {
    if (value === "low") return "green";
    if (value === "medium") return "yellow";
    if (value === "high") return "red";
    return "gray";
}

function getStatusTone(value) {
    if (value === "completed" || value === "sent" || value === "pass") return "green";
    if (value === "processing" || value === "sending" || value === "needs-improvement") return "blue";
    if (value === "failed" || value === "fail") return "red";
    return "gray";
}

function getPriorityTone(value) {
    if (value === "high") return "red";
    if (value === "medium") return "yellow";
    if (value === "low") return "green";
    return "gray";
}

function getBucketTone(value) {
    if (value === "quick-wins") return "green";
    if (value === "medium-effort") return "yellow";
    if (value === "high-effort") return "red";
    return "gray";
}

function renderAuditMetadata(issue) {
    const badges = [];
    if (issue?.auditSourceLabel) {
        badges.push(<ScoreBadge key={`${issue.auditId || issue.id}-source`} value={issue.auditSourceLabel} tone="gray" />);
    }
    if (Array.isArray(issue?.wcagCriteria)) {
        issue.wcagCriteria.forEach((criterion) => {
            badges.push(<ScoreBadge key={`${issue.auditId || issue.id}-wcag-${criterion}`} value={`WCAG ${criterion}`} tone="gray" />);
        });
    }
    return badges;
}

function getInlineActionLabel(reportFile) { return reportFile?.hasPreview ? "View PDF" : "Open File"; }
function getDownloadActionLabel(reportFile) { return reportFile?.hasPreview ? "Download PDF" : "Download File"; }

function StatCard({ label, value, help }) {
    return (
        <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '20px', backdropFilter: 'blur(4px)' }}>
            <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>{label}</p>
            <p style={{ marginTop: '12px', fontSize: '28px', fontWeight: 700, color: '#fff' }}>{value}</p>
            {help ? <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{help}</p> : null}
        </div>
    );
}

const Section = ({ children, style }) => (
    <section style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', padding: '24px', ...style }}>
        {children}
    </section>
);

export default function QuickScanDetail() {
    const navigate = useNavigate();
    const { quickScanId } = useParams();

    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reportAction, setReportAction] = useState("");
    const [reportError, setReportError] = useState("");
    const [rerunning, setRerunning] = useState(false);
    const [rescanning, setRescanning] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const loadDetail = async (cancelled = false) => {
        setLoading(true); setError("");
        const result = await getMyQuickScanDetail(quickScanId);
        if (cancelled) return;
        if (result?.error) { setError(result.error); setItem(null); }
        else { setItem(result?.item || null); }
        setLoading(false);
    };

    useEffect(() => {
        let cancelled = false;
        loadDetail(cancelled);
        return () => { cancelled = true; };
    }, [quickScanId]);

    const reportFiles = item?.reportFiles || [];
    const dimensions = item?.dimensions || [];
    const evaluationDimensions = item?.evaluationDimensions || item?.scorecard?.evaluationDimensions || [];
    const topIssues = item?.topIssues || [];
    const remediationBuckets = item?.remediationBuckets || [];

    const handleRerun = async () => {
        if (!quickScanId) return;
        setRerunning(true); setError("");
        const result = await rerunMyQuickScan(quickScanId);
        setRerunning(false);
        if (result?.error) { setError(result.error); return; }
        await loadDetail();
    };

    const handleRescan = async () => {
        if (!quickScanId) return;
        setRescanning(true); setError("");
        const result = await rescanMyQuickScan(quickScanId);
        setRescanning(false);
        if (result?.error) { setError(result.error); return; }
        navigate("/account");
    };

    const handleDelete = async () => {
        if (!quickScanId) return;
        if (!window.confirm("Delete this quick scan from your account?")) return;
        setDeleting(true); setError("");
        const result = await deleteMyQuickScan(quickScanId);
        setDeleting(false);
        if (result?.error) { setError(result.error); return; }
        navigate("/account");
    };

    const handleReportAction = async (reportFile, disposition) => {
        if (!quickScanId || !reportFile?.id) return;
        const actionId = `${reportFile.id}:${disposition}`;
        setReportAction(actionId); setReportError("");
        const result = await fetchMyQuickScanReportFile(quickScanId, reportFile.id, disposition);
        setReportAction("");
        if (result?.error || !result?.blob) { setReportError(result?.error || "Failed to load report file."); return; }
        const fileName = result.filename || reportFile.displayName || reportFile.filename || "quick-scan-report.pdf";
        const blobUrl = window.URL.createObjectURL(result.blob);
        if (disposition === "inline") {
            window.open(blobUrl, "_blank", "noopener,noreferrer");
            window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
            return;
        }
        const link = document.createElement("a");
        link.href = blobUrl; link.download = fileName;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10_000);
    };

    return (
        <>
            <style>{STYLES}</style>
            <div className="qsd-pg">
                <div className="qsd-wrap">
                    <div style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                            <button onClick={() => navigate("/account")} className="qsd-back">Back to account</button>
                            <h1 className="h1" style={{ color: 'var(--t4)', marginBottom: '10px' }}>Quick Scan Detail</h1>
                            <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', wordBreak: 'break-all' }}>{item?.url || "Loading quick scan record..."}</p>
                            {item?.quickScanId ? <p style={{ marginTop: '8px', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>Quick Scan {item.quickScanId}</p> : null}
                            {item ? (
                                <p style={{ marginTop: '10px', fontSize: '16px', fontWeight: 700, color: 'var(--t3)' }}>
                                    Evaluated against: {describeWcagStandard(item.wcagStandard, item.conformanceLevel)}
                                </p>
                            ) : null}
                        </div>

                        {item ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <button onClick={handleRescan} disabled={rescanning} className="qsd-btn-rescan">{rescanning ? "Queueing..." : "Re-scan"}</button>
                                {item.status === "failed" ? (
                                    <button onClick={handleRerun} disabled={rerunning} className="qsd-btn-rerun">{rerunning ? "Re-running..." : "Re-run scan"}</button>
                                ) : null}
                                <button onClick={handleDelete} disabled={deleting} className="qsd-btn-del">{deleting ? "Deleting..." : "Delete"}</button>
                                <ScoreBadge value={item.status} tone={getStatusTone(item.status)} />
                                <ScoreBadge value={`Email ${item.emailStatus || "pending"}`} tone={getStatusTone(item.emailStatus)} />
                                {item.riskTier ? <ScoreBadge value={`${item.riskTier} risk`} tone={getRiskTone(item.riskTier)} /> : null}
                                {item.scoreStatus ? <ScoreBadge value={item.scoreStatus} tone={getStatusTone(item.scoreStatus)} /> : null}
                            </div>
                        ) : null}
                    </div>

                    {loading ? (
                        <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.18)', padding: '24px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>
                            Loading quick scan details...
                        </div>
                    ) : null}

                    {!loading && error ? (
                        <div style={{ borderRadius: '16px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(239,68,68,0.1)', padding: '24px', fontSize: '16px', color: '#fca5a5' }}>{error}</div>
                    ) : null}

                    {!loading && !error && item ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                            {item.emailError ? (
                                <div style={{ borderRadius: '16px', border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(245,158,11,0.1)', padding: '16px', fontSize: '16px', color: '#fcd34d' }}>
                                    Email delivery issue: {item.emailError}
                                </div>
                            ) : null}

                            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '16px' }}>
                                <StatCard label="Quick Scan Score" value={item.score != null ? `${Math.round(item.score)}%` : "Pending"} help={item.scoreStatus ? item.scoreStatus.replace(/-/g, " ") : "Awaiting results"} />
                                <StatCard label="Risk Tier" value={item.riskTier ? item.riskTier.toUpperCase() : "Pending"} help="Current risk classification for this quick scan" />
                                <StatCard label="Pages Audited" value={String(item.pageCount || 0)} help="Pages included in the current quick scan scorecard" />
                                <StatCard label="Reports" value={String(item.attachmentCount || 0)} help={item.reportGenerated ? "Quick scan report package generated" : "No report package yet"} />
                            </section>

                            <Section>
                                <div style={{ marginBottom: '20px' }}>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>Report Files</h2>
                                    <p style={{ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Open the stored PDF package for this quick scan or download a local copy from your profile.</p>
                                </div>
                                {reportError ? (
                                    <div style={{ marginBottom: '16px', borderRadius: '10px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(239,68,68,0.1)', padding: '12px 16px', fontSize: '16px', color: '#fca5a5' }}>{reportError}</div>
                                ) : null}
                                {reportFiles.length === 0 ? (
                                    <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No report files are available for this quick scan yet.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {reportFiles.map((reportFile) => (
                                            <div key={reportFile.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ wordBreak: 'break-all', fontWeight: 700, color: '#fff', fontSize: '16px' }}>{reportFile.displayName || reportFile.filename}</p>
                                                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>
                                                        <span>{reportFile.contentType || "application/pdf"}</span>
                                                        {reportFile.sizeMB ? <span>{reportFile.sizeMB} MB</span> : null}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    <button onClick={() => handleReportAction(reportFile, "inline")} disabled={reportAction === `${reportFile.id}:inline`} className="qsd-btn-open">
                                                        {reportAction === `${reportFile.id}:inline` ? "Opening..." : getInlineActionLabel(reportFile)}
                                                    </button>
                                                    <button onClick={() => handleReportAction(reportFile, "attachment")} disabled={reportAction === `${reportFile.id}:attachment`} className="qsd-btn-dl">
                                                        {reportAction === `${reportFile.id}:attachment` ? "Downloading..." : getDownloadActionLabel(reportFile)}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Section>

                            <Section>
                                <div style={{ marginBottom: '20px' }}>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>Primary Score Categories</h2>
                                    <p style={{ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>The weighted Silver Score categories generated for this quick scan.</p>
                                </div>
                                {dimensions.length === 0 ? (
                                    <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>This quick scan does not have a scorecard breakdown yet.</p>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '16px' }}>
                                        {dimensions.map((dimension) => (
                                            <div key={dimension.key} style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '20px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                                                    <div>
                                                        <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>{dimension.label}</p>
                                                        <p style={{ marginTop: '8px', fontSize: '28px', fontWeight: 700, color: '#fff' }}>{Math.round(dimension.score)}%</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>
                                                        <p>{dimension.issueCount} issues</p>
                                                        <p style={{ marginTop: '4px' }}>Weight {dimension.weight}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Section>

                            <Section>
                                <div style={{ marginBottom: '20px' }}>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>Eight Evaluation Dimensions</h2>
                                    <p style={{ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>The underlying evaluation dimensions used to calculate the quick scan score.</p>
                                </div>
                                {evaluationDimensions.length === 0 ? (
                                    <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>This quick scan does not include evaluation-dimension data yet.</p>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '16px' }}>
                                        {evaluationDimensions.map((dimension) => (
                                            <div key={dimension.key} style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '20px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                                                    <div>
                                                        <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>{dimension.label}</p>
                                                        <p style={{ marginTop: '8px', fontSize: '28px', fontWeight: 700, color: '#fff' }}>{Math.round(dimension.score)}%</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>
                                                        <p>{dimension.issueCount} issues</p>
                                                        <p style={{ marginTop: '4px' }}>Coverage {dimension.weight}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Section>

                            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '24px' }}>
                                <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', padding: '24px' }}>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>Top Issues</h2>
                                    <p style={{ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Highest-impact findings from this quick scan.</p>
                                    {topIssues.length === 0 ? (
                                        <p style={{ marginTop: '20px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No issue breakdown available yet.</p>
                                    ) : (
                                        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {topIssues.map((issue) => (
                                                <div key={issue.auditId} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '16px' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                                        <p style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>{issue.title}</p>
                                                        <ScoreBadge value={issue.severity} tone={getRiskTone(issue.severity)} />
                                                        {renderAuditMetadata(issue)}
                                                        <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Score {Math.round(issue.score)}%</span>
                                                    </div>
                                                    <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{issue.description}</p>
                                                    {issue.displayValue ? <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Observed: {issue.displayValue}</p> : null}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', padding: '24px' }}>
                                    <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#fff' }}>Remediation Roadmap</h2>
                                    <p style={{ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Priority fixes grouped into quick wins, medium effort, and high effort workstreams.</p>
                                    {remediationBuckets.length === 0 ? (
                                        <p style={{ marginTop: '20px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No remediation roadmap available yet.</p>
                                    ) : (
                                        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {remediationBuckets.map((bucket) => (
                                                <div key={bucket.key} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '16px' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                                                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{bucket.label}</h3>
                                                                <ScoreBadge value={`${bucket.itemCount} items`} tone={getBucketTone(bucket.key)} />
                                                            </div>
                                                            <p style={{ marginTop: '6px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{bucket.description}</p>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                        {bucket.items.map((itemRow, index) => (
                                                            <div key={itemRow.id} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.18)', padding: '16px' }}>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                                    <span style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>{bucket.label} #{index + 1}</span>
                                                                    <p style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>{itemRow.title}</p>
                                                                </div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                                                    <ScoreBadge value={`${itemRow.impact} impact`} tone={getPriorityTone(itemRow.impact)} />
                                                                    <ScoreBadge value={`${itemRow.effort} effort`} tone={getPriorityTone(itemRow.effort)} />
                                                                    <ScoreBadge value={itemRow.dimensionLabel} tone="blue" />
                                                                    {itemRow.evaluationDimensionLabel ? <ScoreBadge value={itemRow.evaluationDimensionLabel} tone="gray" /> : null}
                                                                    {renderAuditMetadata(itemRow)}
                                                                </div>
                                                                <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>{itemRow.action}</p>
                                                                <p style={{ marginTop: '6px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{itemRow.whyItMatters}</p>
                                                                {itemRow.sourceUrl ? <p style={{ marginTop: '6px', wordBreak: 'break-all', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Source page: {itemRow.sourceUrl}</p> : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    );
}
