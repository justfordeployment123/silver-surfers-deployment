import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { deleteMyQuickScan, fetchMyQuickScanReportFile, getMyQuickScanDetail, rescanMyQuickScan, rerunMyQuickScan } from "../api";

function ScoreBadge({ value, tone }) {
    const tones = {
        green: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30",
        yellow: "bg-amber-500/20 text-amber-200 border-amber-400/30",
        red: "bg-rose-500/20 text-rose-200 border-rose-400/30",
        blue: "bg-sky-500/20 text-sky-200 border-sky-400/30",
        gray: "bg-white/10 text-gray-200 border-white/10",
    };

    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tones[tone] || tones.gray}`}
        >
            {value}
        </span>
    );
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

function getInlineActionLabel(reportFile) {
    return reportFile?.hasPreview ? "View PDF" : "Open File";
}

function getDownloadActionLabel(reportFile) {
    return reportFile?.hasPreview ? "Download PDF" : "Download File";
}

function StatCard({ label, value, help }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{value}</p>
            {help ? <p className="mt-2 text-sm text-gray-300">{help}</p> : null}
        </div>
    );
}

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
        setLoading(true);
        setError("");

        const result = await getMyQuickScanDetail(quickScanId);
        if (cancelled) return;

        if (result?.error) {
            setError(result.error);
            setItem(null);
        } else {
            setItem(result?.item || null);
        }

        setLoading(false);
    };

    useEffect(() => {
        let cancelled = false;
        loadDetail(cancelled);

        return () => {
            cancelled = true;
        };
    }, [quickScanId]);

    const reportFiles = item?.reportFiles || [];
    const dimensions = item?.dimensions || [];
    const evaluationDimensions = item?.evaluationDimensions || item?.scorecard?.evaluationDimensions || [];
    const topIssues = item?.topIssues || [];
    const remediationBuckets = item?.remediationBuckets || [];

    const handleRerun = async () => {
        if (!quickScanId) return;
        setRerunning(true);
        setError("");
        const result = await rerunMyQuickScan(quickScanId);
        setRerunning(false);

        if (result?.error) {
            setError(result.error);
            return;
        }

        await loadDetail();
    };

    const handleRescan = async () => {
        if (!quickScanId) return;
        setRescanning(true);
        setError("");
        const result = await rescanMyQuickScan(quickScanId);
        setRescanning(false);

        if (result?.error) {
            setError(result.error);
            return;
        }

        navigate("/account");
    };

    const handleDelete = async () => {
        if (!quickScanId) return;
        if (!window.confirm("Delete this quick scan from your account?")) return;

        setDeleting(true);
        setError("");
        const result = await deleteMyQuickScan(quickScanId);
        setDeleting(false);

        if (result?.error) {
            setError(result.error);
            return;
        }

        navigate("/account");
    };

    const handleReportAction = async (reportFile, disposition) => {
        if (!quickScanId || !reportFile?.id) return;

        const actionId = `${reportFile.id}:${disposition}`;
        setReportAction(actionId);
        setReportError("");

        const result = await fetchMyQuickScanReportFile(quickScanId, reportFile.id, disposition);
        setReportAction("");

        if (result?.error || !result?.blob) {
            setReportError(result?.error || "Failed to load report file.");
            return;
        }

        const fileName = result.filename || reportFile.displayName || reportFile.filename || "quick-scan-report.pdf";
        const blobUrl = window.URL.createObjectURL(result.blob);

        if (disposition === "inline") {
            window.open(blobUrl, "_blank", "noopener,noreferrer");
            window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
            return;
        }

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10_000);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-green-950 px-4 pb-20 pt-28 text-white md:px-10">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <button
                            onClick={() => navigate("/account")}
                            className="mb-4 inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 transition hover:bg-white/10"
                        >
                            Back to account
                        </button>
                        <h1 className="bg-gradient-to-r from-blue-400 via-green-500 to-teal-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
                            Quick Scan Detail
                        </h1>
                        <p className="mt-3 break-all text-sm text-gray-300">{item?.url || "Loading quick scan record..."}</p>
                        {item?.quickScanId ? (
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-gray-500">Quick Scan {item.quickScanId}</p>
                        ) : null}
                    </div>

                    {item ? (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleRescan}
                                disabled={rescanning}
                                className="rounded-lg bg-sky-600/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {rescanning ? "Queueing..." : "Re-scan"}
                            </button>
                            {item.status === "failed" ? (
                                <button
                                    onClick={handleRerun}
                                    disabled={rerunning}
                                    className="rounded-lg bg-amber-600/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {rerunning ? "Re-running..." : "Re-run scan"}
                                </button>
                            ) : null}
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deleting ? "Deleting..." : "Delete"}
                            </button>
                            <ScoreBadge value={item.status} tone={getStatusTone(item.status)} />
                            <ScoreBadge value={`Email ${item.emailStatus || "pending"}`} tone={getStatusTone(item.emailStatus)} />
                            {item.riskTier ? <ScoreBadge value={`${item.riskTier} risk`} tone={getRiskTone(item.riskTier)} /> : null}
                            {item.scoreStatus ? <ScoreBadge value={item.scoreStatus} tone={getStatusTone(item.scoreStatus)} /> : null}
                        </div>
                    ) : null}
                </div>

                {loading ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-gray-300">
                        Loading quick scan details...
                    </div>
                ) : null}

                {!loading && error ? (
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-6 text-sm text-rose-100">{error}</div>
                ) : null}

                {!loading && !error && item ? (
                    <div className="space-y-8">
                        {item.emailError ? (
                            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                                Email delivery issue: {item.emailError}
                            </div>
                        ) : null}

                        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
                            <StatCard
                                label="Quick Scan Score"
                                value={item.score != null ? `${Math.round(item.score)}%` : "Pending"}
                                help={item.scoreStatus ? item.scoreStatus.replace(/-/g, " ") : "Awaiting results"}
                            />
                            <StatCard
                                label="Risk Tier"
                                value={item.riskTier ? item.riskTier.toUpperCase() : "Pending"}
                                help="Current risk classification for this quick scan"
                            />
                            <StatCard
                                label="Pages Audited"
                                value={String(item.pageCount || 0)}
                                help="Pages included in the current quick scan scorecard"
                            />
                            <StatCard
                                label="Reports"
                                value={String(item.attachmentCount || 0)}
                                help={item.reportGenerated ? "Quick scan report package generated" : "No report package yet"}
                            />
                        </section>

                        <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
                            <div className="mb-5">
                                <h2 className="text-2xl font-bold">Report Files</h2>
                                <p className="mt-1 text-sm text-gray-300">
                                    Open the stored PDF package for this quick scan or download a local copy from your profile.
                                </p>
                            </div>
                            {reportError ? (
                                <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                                    {reportError}
                                </div>
                            ) : null}
                            {reportFiles.length === 0 ? (
                                <p className="text-sm text-gray-400">No report files are available for this quick scan yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {reportFiles.map((reportFile) => (
                                        <div
                                            key={reportFile.id}
                                            className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <p className="break-all font-semibold text-white">
                                                    {reportFile.displayName || reportFile.filename}
                                                </p>
                                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                                                    <span>{reportFile.contentType || "application/pdf"}</span>
                                                    {reportFile.sizeMB ? <span>{reportFile.sizeMB} MB</span> : null}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => handleReportAction(reportFile, "inline")}
                                                    disabled={reportAction === `${reportFile.id}:inline`}
                                                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {reportAction === `${reportFile.id}:inline`
                                                        ? "Opening..."
                                                        : getInlineActionLabel(reportFile)}
                                                </button>
                                                <button
                                                    onClick={() => handleReportAction(reportFile, "attachment")}
                                                    disabled={reportAction === `${reportFile.id}:attachment`}
                                                    className="rounded-lg bg-emerald-600/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {reportAction === `${reportFile.id}:attachment`
                                                        ? "Downloading..."
                                                        : getDownloadActionLabel(reportFile)}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
                            <div className="mb-5">
                                <h2 className="text-2xl font-bold">Primary Score Categories</h2>
                                <p className="mt-1 text-sm text-gray-300">
                                    The weighted Silver Score categories generated for this quick scan.
                                </p>
                            </div>
                            {dimensions.length === 0 ? (
                                <p className="text-sm text-gray-400">This quick scan does not have a scorecard breakdown yet.</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {dimensions.map((dimension) => (
                                        <div key={dimension.key} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{dimension.label}</p>
                                                    <p className="mt-2 text-3xl font-bold text-white">{Math.round(dimension.score)}%</p>
                                                </div>
                                                <div className="text-right text-sm text-gray-300">
                                                    <p>{dimension.issueCount} issues</p>
                                                    <p className="mt-1">Weight {dimension.weight}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
                            <div className="mb-5">
                                <h2 className="text-2xl font-bold">Eight Evaluation Dimensions</h2>
                                <p className="mt-1 text-sm text-gray-300">
                                    The underlying evaluation dimensions used to calculate the quick scan score.
                                </p>
                            </div>
                            {evaluationDimensions.length === 0 ? (
                                <p className="text-sm text-gray-400">This quick scan does not include evaluation-dimension data yet.</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {evaluationDimensions.map((dimension) => (
                                        <div key={dimension.key} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{dimension.label}</p>
                                                    <p className="mt-2 text-3xl font-bold text-white">{Math.round(dimension.score)}%</p>
                                                </div>
                                                <div className="text-right text-sm text-gray-300">
                                                    <p>{dimension.issueCount} issues</p>
                                                    <p className="mt-1">Coverage {dimension.weight}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
                                <h2 className="text-2xl font-bold">Top Issues</h2>
                                <p className="mt-1 text-sm text-gray-300">Highest-impact findings from this quick scan.</p>
                                {topIssues.length === 0 ? (
                                    <p className="mt-5 text-sm text-gray-400">No issue breakdown available yet.</p>
                                ) : (
                                    <div className="mt-5 space-y-3">
                                        {topIssues.map((issue) => (
                                            <div key={issue.auditId} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-semibold text-white">{issue.title}</p>
                                                    <ScoreBadge value={issue.severity} tone={getRiskTone(issue.severity)} />
                                                    {renderAuditMetadata(issue)}
                                                    <span className="text-xs text-gray-400">Score {Math.round(issue.score)}%</span>
                                                </div>
                                                <p className="mt-2 text-sm text-gray-300">{issue.description}</p>
                                                {issue.displayValue ? (
                                                    <p className="mt-2 text-xs text-gray-400">Observed: {issue.displayValue}</p>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
                                <h2 className="text-2xl font-bold">Remediation Roadmap</h2>
                                <p className="mt-1 text-sm text-gray-300">
                                    Priority fixes grouped into quick wins, medium effort, and high effort workstreams.
                                </p>
                                {remediationBuckets.length === 0 ? (
                                    <p className="mt-5 text-sm text-gray-400">No remediation roadmap available yet.</p>
                                ) : (
                                    <div className="mt-5 space-y-5">
                                        {remediationBuckets.map((bucket) => (
                                            <div key={bucket.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="text-lg font-semibold text-white">{bucket.label}</h3>
                                                            <ScoreBadge
                                                                value={`${bucket.itemCount} items`}
                                                                tone={getBucketTone(bucket.key)}
                                                            />
                                                        </div>
                                                        <p className="mt-2 text-sm text-gray-300">{bucket.description}</p>
                                                    </div>
                                                </div>

                                                <div className="mt-4 space-y-3">
                                                    {bucket.items.map((itemRow, index) => (
                                                        <div key={itemRow.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="text-xs uppercase tracking-[0.2em] text-gray-500">
                                                                    {bucket.label} #{index + 1}
                                                                </span>
                                                                <p className="font-semibold text-white">{itemRow.title}</p>
                                                            </div>
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                <ScoreBadge
                                                                    value={`${itemRow.impact} impact`}
                                                                    tone={getPriorityTone(itemRow.impact)}
                                                                />
                                                                <ScoreBadge
                                                                    value={`${itemRow.effort} effort`}
                                                                    tone={getPriorityTone(itemRow.effort)}
                                                                />
                                                                <ScoreBadge value={itemRow.dimensionLabel} tone="blue" />
                                                                {itemRow.evaluationDimensionLabel ? (
                                                                    <ScoreBadge value={itemRow.evaluationDimensionLabel} tone="gray" />
                                                                ) : null}
                                                                {renderAuditMetadata(itemRow)}
                                                            </div>
                                                            <p className="mt-3 text-sm text-gray-200">{itemRow.action}</p>
                                                            <p className="mt-2 text-sm text-gray-400">{itemRow.whyItMatters}</p>
                                                            {itemRow.sourceUrl ? (
                                                                <p className="mt-2 break-all text-xs text-gray-500">
                                                                    Source page: {itemRow.sourceUrl}
                                                                </p>
                                                            ) : null}
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
    );
}
