import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  deleteMyAnalysis,
  fetchMyAnalysisReportFile,
  getMyAnalysisDetail,
  rescanMyAnalysis,
  rerunMyAnalysis,
} from '../api';

function ScoreBadge({ value, tone }) {
  const tones = {
    green: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
    yellow: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
    red: 'bg-rose-500/20 text-rose-200 border-rose-400/30',
    blue: 'bg-sky-500/20 text-sky-200 border-sky-400/30',
    gray: 'bg-white/10 text-gray-200 border-white/10',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tones[tone] || tones.gray}`}>
      {value}
    </span>
  );
}

function getRiskTone(value) {
  if (value === 'low') {
    return 'green';
  }

  if (value === 'medium') {
    return 'yellow';
  }

  if (value === 'high') {
    return 'red';
  }

  return 'gray';
}

function getStatusTone(value) {
  if (value === 'completed' || value === 'sent' || value === 'pass') {
    return 'green';
  }

  if (value === 'completed_with_warnings') {
    return 'yellow';
  }

  if (value === 'processing' || value === 'sending' || value === 'needs-improvement') {
    return 'blue';
  }

  if (value === 'failed' || value === 'fail') {
    return 'red';
  }

  return 'gray';
}

function getPriorityTone(value) {
  if (value === 'high') {
    return 'red';
  }

  if (value === 'medium') {
    return 'yellow';
  }

  if (value === 'low') {
    return 'green';
  }

  return 'gray';
}

function formatStatusLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getBucketTone(value) {
  if (value === 'quick-wins') {
    return 'green';
  }

  if (value === 'medium-effort') {
    return 'yellow';
  }

  if (value === 'high-effort') {
    return 'red';
  }

  return 'gray';
}

function buildFallbackRemediationBuckets(roadmap) {
  const bucketOrder = [
    {
      key: 'quick-wins',
      label: 'Quick Wins',
      description: 'Lower-effort improvements that can remove friction quickly and raise usability confidence fast.',
    },
    {
      key: 'medium-effort',
      label: 'Medium Effort',
      description: 'Moderate implementation work with meaningful accessibility and usability payoff.',
    },
    {
      key: 'high-effort',
      label: 'High Effort',
      description: 'Bigger redesign or engineering work that should be planned as a larger remediation phase.',
    },
  ];

  return bucketOrder
    .map((bucket) => {
      const items = roadmap.filter((item) => item.bucketKey === bucket.key);
      return {
        ...bucket,
        items,
        itemCount: items.length,
      };
    })
    .filter((bucket) => bucket.itemCount > 0);
}

function renderAuditMetadata(issue) {
  const badges = [];

  if (issue?.auditSourceLabel) {
    badges.push(
      <ScoreBadge key={`${issue.auditId || issue.id}-source`} value={issue.auditSourceLabel} tone="gray" />,
    );
  }

  if (Array.isArray(issue?.wcagCriteria)) {
    issue.wcagCriteria.forEach((criterion) => {
      badges.push(
        <ScoreBadge key={`${issue.auditId || issue.id}-wcag-${criterion}`} value={`WCAG ${criterion}`} tone="gray" />,
      );
    });
  }

  return badges;
}

function getInlineActionLabel(reportFile) {
  return reportFile?.hasPreview ? 'View PDF' : 'Open File';
}

function getDownloadActionLabel(reportFile) {
  return reportFile?.hasPreview ? 'Download PDF' : 'Download File';
}

function wcagUnderstandingUrl(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return `https://www.w3.org/WAI/WCAG22/Understanding/${slug}`;
}

function getWcagStatusTone(status) {
  if (status === 'pass') return 'green';
  if (status === 'fail') return 'red';
  if (status === 'needs-review') return 'yellow';
  return 'gray';
}

function getWcagStatusLabel(status) {
  if (status === 'pass') return 'Pass';
  if (status === 'fail') return 'Fail';
  if (status === 'needs-review') return 'Needs Review';
  return 'N/A';
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

export default function AnalysisDetail() {
  const navigate = useNavigate();
  const { taskId } = useParams();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reportAction, setReportAction] = useState('');
  const [reportError, setReportError] = useState('');
  const [rerunning, setRerunning] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wcagStatusFilter, setWcagStatusFilter] = useState('active');
  const [wcagPrincipleFilter, setWcagPrincipleFilter] = useState('all');
  const [wcagLevelFilter, setWcagLevelFilter] = useState('all');
  const [wcagExpandedRow, setWcagExpandedRow] = useState(null);

  const loadDetail = async (cancelled = false) => {
    setLoading(true);
    setError('');

    const result = await getMyAnalysisDetail(taskId);
    if (cancelled) {
      return;
    }

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
  }, [taskId]);

  const dimensions = item?.dimensions || [];
  const evaluationDimensions = item?.evaluationDimensions || item?.scorecard?.evaluationDimensions || [];
  const topIssues = item?.topIssues || [];
  const roadmap = item?.remediationRoadmap || [];
  const remediationBuckets =
    item?.remediationBuckets?.length
      ? item.remediationBuckets
      : buildFallbackRemediationBuckets(roadmap);
  const aiReport = item?.aiReport || null;
  const reportFiles = item?.reportFiles || [];
  const wcagMatrix = item?.wcagMatrix || [];
  const wcagSummary = item?.wcagSummary || null;

  const filteredWcagMatrix = wcagMatrix.filter((row) => {
    const statusMatch =
      wcagStatusFilter === 'all' ? true :
      wcagStatusFilter === 'active' ? (row.status === 'fail' || row.status === 'needs-review') :
      row.status === wcagStatusFilter;
    const principleMatch = wcagPrincipleFilter === 'all' || row.principle === wcagPrincipleFilter;
    const levelMatch = wcagLevelFilter === 'all' || row.level === wcagLevelFilter;
    return statusMatch && principleMatch && levelMatch;
  });

  const handleRerun = async () => {
    if (!taskId) return;
    setRerunning(true);
    setError('');
    const result = await rerunMyAnalysis(taskId);
    setRerunning(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    await loadDetail();
  };

  const handleRescan = async () => {
    if (!taskId) return;
    setRescanning(true);
    setError('');
    const result = await rescanMyAnalysis(taskId);
    setRescanning(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    navigate('/account');
  };

  const handleDelete = async () => {
    if (!taskId) return;
    if (!window.confirm('Delete this full audit from your account?')) return;

    setDeleting(true);
    setError('');
    const result = await deleteMyAnalysis(taskId);
    setDeleting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    navigate('/account');
  };

  const handleReportAction = async (reportFile, disposition) => {
    if (!taskId || !reportFile?.id) {
      return;
    }

    const actionId = `${reportFile.id}:${disposition}`;
    setReportAction(actionId);
    setReportError('');

    const result = await fetchMyAnalysisReportFile(taskId, reportFile.id, disposition);
    setReportAction('');

    if (result?.error || !result?.blob) {
      setReportError(result?.error || 'Failed to load report file.');
      return;
    }

    const fileName = result.filename || reportFile.displayName || reportFile.filename || 'report.pdf';
    const blobUrl = window.URL.createObjectURL(result.blob);

    if (disposition === 'inline') {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
      return;
    }

    const link = document.createElement('a');
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
              onClick={() => navigate('/account')}
              className="mb-4 inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 transition hover:bg-white/10"
            >
              Back to account
            </button>
            <h1 className="bg-gradient-to-r from-blue-400 via-green-500 to-teal-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
              Analysis Detail
            </h1>
            <p className="mt-3 break-all text-sm text-gray-300">{item?.url || 'Loading analysis record...'}</p>
            {item?.taskId ? <p className="mt-2 text-xs uppercase tracking-[0.2em] text-gray-500">Task {item.taskId}</p> : null}
          </div>

          {item ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleRescan}
                disabled={rescanning}
                className="rounded-lg bg-sky-600/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {rescanning ? 'Queueing...' : 'Re-scan'}
              </button>
              {item.status === 'failed' ? (
                <button
                  onClick={handleRerun}
                  disabled={rerunning}
                  className="rounded-lg bg-amber-600/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rerunning ? 'Re-running...' : 'Re-run scan'}
                </button>
              ) : null}
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <ScoreBadge value={formatStatusLabel(item.status)} tone={getStatusTone(item.status)} />
              <ScoreBadge value={`Email ${item.emailStatus}`} tone={getStatusTone(item.emailStatus)} />
              {item.riskTier ? <ScoreBadge value={`${item.riskTier} risk`} tone={getRiskTone(item.riskTier)} /> : null}
              {item.scoreStatus ? <ScoreBadge value={item.scoreStatus} tone={getStatusTone(item.scoreStatus)} /> : null}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-gray-300">Loading analysis details...</div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-6 text-sm text-rose-100">{error}</div>
        ) : null}

        {!loading && !error && item ? (
          <div className="space-y-8">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <StatCard
                label="Silver Score"
                value={item.score != null ? `${Math.round(item.score)}%` : 'Pending'}
                help={item.scoreStatus ? item.scoreStatus.replace(/-/g, ' ') : 'Awaiting results'}
              />
              <StatCard
                label="Risk Tier"
                value={item.riskTier ? item.riskTier.toUpperCase() : 'Pending'}
                help="Current litigation-oriented risk classification"
              />
              <StatCard
                label="Successful Page/Device Targets"
                value={`${item.successfulTargetCount || 0}/${item.plannedTargetCount || item.pageCount || 0}`}
                help="Each page scanned on desktop, mobile, and tablet counts as its own target"
              />
              <StatCard
                label="Reports"
                value={String(item.attachmentCount || 0)}
                help={item.reportDirectory ? 'Report package generated' : 'No report package yet'}
              />
            </section>

            {(item.warnings?.length > 0 || item.degradedTargetCount > 0 || item.failedTargetCount > 0) ? (
              <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-6">
                <div className="mb-4 flex flex-wrap gap-2">
                  <ScoreBadge value={`Degraded ${item.degradedTargetCount || 0}`} tone="yellow" />
                  <ScoreBadge value={`Failed ${item.failedTargetCount || 0}`} tone={item.failedTargetCount ? 'red' : 'gray'} />
                  <ScoreBadge value={`Planned ${item.plannedTargetCount || 0}`} tone="gray" />
                </div>
                {item.warnings?.length > 0 ? (
                  <div className="space-y-2">
                    <h2 className="text-xl font-bold text-white">Warnings</h2>
                    {item.warnings.map((warning) => (
                      <p key={warning} className="text-sm text-amber-100">{warning}</p>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {item.scanTargets?.length > 0 ? (
              <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
                <div className="mb-5">
                  <h2 className="text-2xl font-bold">Scan Targets</h2>
                  <p className="mt-1 text-sm text-gray-300">Each page and device combination scanned during this audit, including lite fallbacks and any failed targets.</p>
                </div>
                <div className="space-y-3">
                  {item.scanTargets.map((target, index) => (
                    <div key={`${target.url}-${target.device}-${index}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-all font-semibold text-white">{target.url}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-400">
                            {target.device} {target.isHomepage ? '• homepage' : ''}
                          </p>
                          {target.failureReason ? (
                            <p className="mt-2 text-sm text-rose-200">{target.failureReason}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ScoreBadge value={formatStatusLabel(target.status)} tone={getStatusTone(target.status)} />
                          {typeof target.score === 'number' ? <ScoreBadge value={`Score ${Math.round(target.score)}`} tone={getStatusTone(target.score >= 80 ? 'completed' : target.score >= 70 ? 'needs-improvement' : 'failed')} /> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
              <div className="mb-5">
                <h2 className="text-2xl font-bold">Report Files</h2>
                <p className="mt-1 text-sm text-gray-300">Open the stored PDF package for this scan or download a local copy from your profile.</p>
              </div>
              {reportError ? (
                <div className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{reportError}</div>
              ) : null}
              {reportFiles.length === 0 ? (
                <p className="text-sm text-gray-400">No report files are available for this analysis yet.</p>
              ) : (
                <div className="space-y-3">
                  {reportFiles.map((reportFile) => (
                    <div key={reportFile.id} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="break-all font-semibold text-white">{reportFile.displayName || reportFile.filename}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                          <span>{reportFile.contentType || 'application/pdf'}</span>
                          {reportFile.sizeMB ? <span>{reportFile.sizeMB} MB</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleReportAction(reportFile, 'inline')}
                          disabled={reportAction === `${reportFile.id}:inline`}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reportAction === `${reportFile.id}:inline` ? 'Opening...' : getInlineActionLabel(reportFile)}
                        </button>
                        <button
                          onClick={() => handleReportAction(reportFile, 'attachment')}
                          disabled={reportAction === `${reportFile.id}:attachment`}
                          className="rounded-lg bg-emerald-600/80 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reportAction === `${reportFile.id}:attachment` ? 'Downloading...' : getDownloadActionLabel(reportFile)}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
              <div className="mb-5">
                <h2 className="text-2xl font-bold">AI Executive Summary</h2>
                <p className="mt-1 text-sm text-gray-300">Business-friendly narrative generated from the stored scorecard and remediation roadmap.</p>
              </div>
              {!aiReport ? (
                <p className="text-sm text-gray-400">No AI summary is available for this analysis yet.</p>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-white">{aiReport.headline}</p>
                      <ScoreBadge value={aiReport.provider} tone={aiReport.provider === 'openai' ? 'blue' : 'gray'} />
                      <ScoreBadge value={aiReport.status} tone={aiReport.status === 'generated' ? 'green' : 'yellow'} />
                      {aiReport.model ? <ScoreBadge value={aiReport.model} tone="gray" /> : null}
                    </div>
                    <p className="mt-3 text-sm text-gray-200">{aiReport.summary}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <h3 className="text-lg font-semibold text-white">Business Impact</h3>
                      <p className="mt-3 text-sm text-gray-300">{aiReport.businessImpact}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <h3 className="text-lg font-semibold text-white">Priority Summary</h3>
                      <p className="mt-3 text-sm text-gray-300">{aiReport.prioritySummary}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-lg font-semibold text-white">Top Recommendations</h3>
                    {Array.isArray(aiReport.topRecommendations) && aiReport.topRecommendations.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {aiReport.topRecommendations.map((recommendation, index) => (
                          <div key={`${index}-${recommendation}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-200">
                                {index + 1}
                              </span>
                              <p className="text-sm text-gray-200">{recommendation}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-gray-400">No AI recommendations are available yet.</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-lg font-semibold text-white">Stakeholder Note</h3>
                    <p className="mt-3 text-sm text-gray-300">{aiReport.stakeholderNote}</p>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Primary Score Categories</h2>
                  <p className="mt-1 text-sm text-gray-300">The four weighted Silver Score categories generated from the eight evaluation dimensions.</p>
                </div>
              </div>
              {dimensions.length === 0 ? (
                <p className="text-sm text-gray-400">This analysis does not have a scorecard yet.</p>
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
                      {dimension.topIssues?.length ? (
                        <div className="mt-4 space-y-2">
                          {dimension.topIssues.map((issue) => (
                            <div key={`${dimension.key}-${issue.auditId}`} className="rounded-xl border border-white/5 bg-black/20 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-white">{issue.title}</p>
                                <ScoreBadge value={issue.severity} tone={getRiskTone(issue.severity)} />
                              </div>
                              <p className="mt-1 text-sm text-gray-300">{issue.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-gray-400">No top issues recorded for this dimension.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
              <div className="mb-5">
                <h2 className="text-2xl font-bold">Eight Evaluation Dimensions</h2>
                <p className="mt-1 text-sm text-gray-300">These dimensions capture the underlying Silver Web evaluation model used to build the weighted score categories.</p>
              </div>
              {evaluationDimensions.length === 0 ? (
                <p className="text-sm text-gray-400">This analysis does not include evaluation-dimension data yet.</p>
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
                      {dimension.topIssues?.length ? (
                        <div className="mt-4 space-y-2">
                          {dimension.topIssues.map((issue) => (
                            <div key={`${dimension.key}-${issue.auditId}`} className="rounded-xl border border-white/5 bg-black/20 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-white">{issue.title}</p>
                                <ScoreBadge value={issue.severity} tone={getRiskTone(issue.severity)} />
                              </div>
                              <p className="mt-1 text-sm text-gray-300">{issue.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-gray-400">No top issues recorded for this evaluation dimension.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
                <h2 className="text-2xl font-bold">Top Issues</h2>
                <p className="mt-1 text-sm text-gray-300">Highest-impact score drivers from the current analysis.</p>
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
                        {issue.displayValue ? <p className="mt-2 text-xs text-gray-400">Observed: {issue.displayValue}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
                <h2 className="text-2xl font-bold">Remediation Roadmap</h2>
                <p className="mt-1 text-sm text-gray-300">Phase 1 remediation plan grouped into Quick Wins, Medium Effort, and High Effort workstreams.</p>
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
                              <ScoreBadge value={`${bucket.itemCount} items`} tone={getBucketTone(bucket.key)} />
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
                                <ScoreBadge value={`${itemRow.impact} impact`} tone={getPriorityTone(itemRow.impact)} />
                                <ScoreBadge value={`${itemRow.effort} effort`} tone={getPriorityTone(itemRow.effort)} />
                                <ScoreBadge value={itemRow.dimensionLabel} tone="blue" />
                                {itemRow.evaluationDimensionLabel ? (
                                  <ScoreBadge value={itemRow.evaluationDimensionLabel} tone="gray" />
                                ) : null}
                                {renderAuditMetadata(itemRow)}
                              </div>
                              <p className="mt-3 text-sm text-gray-200">{itemRow.action}</p>
                              <p className="mt-2 text-sm text-gray-400">{itemRow.whyItMatters}</p>
                              {itemRow.sourceUrl ? <p className="mt-2 break-all text-xs text-gray-500">Source page: {itemRow.sourceUrl}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {wcagMatrix.length > 0 ? (
              <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
                <div className="mb-5">
                  <h2 className="text-2xl font-bold">WCAG 2.2 Matrix</h2>
                  <p className="mt-1 text-sm text-gray-300">
                    Automated coverage of all WCAG 2.2 Level A and AA success criteria across this audit.
                  </p>
                </div>

                {wcagSummary ? (
                  <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                      <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Passed</p>
                      <p className="mt-3 text-3xl font-bold text-emerald-400">{wcagSummary.passed ?? 0}</p>
                      <p className="mt-2 text-sm text-emerald-300/70">criteria</p>
                    </div>
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-5">
                      <p className="text-xs uppercase tracking-[0.2em] text-rose-300">Failed</p>
                      <p className="mt-3 text-3xl font-bold text-rose-400">{wcagSummary.failed ?? 0}</p>
                      <p className="mt-2 text-sm text-rose-300/70">criteria</p>
                    </div>
                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
                      <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Needs Review</p>
                      <p className="mt-3 text-3xl font-bold text-amber-400">{wcagSummary.needsReview ?? 0}</p>
                      <p className="mt-2 text-sm text-amber-300/70">manual only</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Not Applicable</p>
                      <p className="mt-3 text-3xl font-bold text-gray-400">{wcagSummary.notApplicable ?? 0}</p>
                      <p className="mt-2 text-sm text-gray-500">criteria</p>
                    </div>
                  </div>
                ) : null}

                <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                  <div className="flex flex-wrap gap-1">
                    <span className="mr-1 self-center text-xs uppercase tracking-[0.15em] text-gray-500">Status</span>
                    {[
                      { value: 'active', label: 'Issues Only' },
                      { value: 'all', label: 'All' },
                      { value: 'pass', label: 'Pass' },
                      { value: 'fail', label: 'Fail' },
                      { value: 'needs-review', label: 'Needs Review' },
                      { value: 'not-applicable', label: 'N/A' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setWcagStatusFilter(opt.value)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          wcagStatusFilter === opt.value
                            ? 'border-blue-400/50 bg-blue-500/20 text-blue-200'
                            : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <span className="mr-1 self-center text-xs uppercase tracking-[0.15em] text-gray-500">Principle</span>
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'perceivable', label: 'Perceivable' },
                      { value: 'operable', label: 'Operable' },
                      { value: 'understandable', label: 'Understandable' },
                      { value: 'robust', label: 'Robust' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setWcagPrincipleFilter(opt.value)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          wcagPrincipleFilter === opt.value
                            ? 'border-blue-400/50 bg-blue-500/20 text-blue-200'
                            : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <span className="mr-1 self-center text-xs uppercase tracking-[0.15em] text-gray-500">Level</span>
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'A', label: 'A' },
                      { value: 'AA', label: 'AA' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setWcagLevelFilter(opt.value)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          wcagLevelFilter === opt.value
                            ? 'border-blue-400/50 bg-blue-500/20 text-blue-200'
                            : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <span className="ml-auto text-xs text-gray-500">{filteredWcagMatrix.length} of {wcagMatrix.length} criteria</span>
                </div>

                {filteredWcagMatrix.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">No criteria match the current filters.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <div className="grid grid-cols-[60px_1fr_52px_110px_60px] border-b border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                      <span>Criterion</span>
                      <span>Title</span>
                      <span className="text-center">Level</span>
                      <span className="text-center">Status</span>
                      <span className="text-center">Issues</span>
                    </div>
                    {filteredWcagMatrix.map((row, index) => {
                      const isExpanded = wcagExpandedRow === row.criterion;
                      return (
                        <div key={row.criterion}>
                          <button
                            onClick={() => setWcagExpandedRow(isExpanded ? null : row.criterion)}
                            className={`grid w-full grid-cols-[60px_1fr_52px_110px_60px] items-center gap-2 px-4 py-3 text-left transition hover:bg-white/5 ${
                              index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'
                            } ${isExpanded ? 'bg-white/5' : ''}`}
                          >
                            <span className="text-xs font-mono font-semibold text-gray-300">{row.criterion}</span>
                            <span className="text-sm text-white">{row.title}</span>
                            <span className="text-center text-xs font-semibold text-gray-400">{row.level}</span>
                            <span className="flex justify-center">
                              <ScoreBadge value={getWcagStatusLabel(row.status)} tone={getWcagStatusTone(row.status)} />
                            </span>
                            <span className="text-center text-sm text-gray-300">{row.issueCount ?? 0}</span>
                          </button>

                          {isExpanded ? (
                            <div className="border-t border-white/5 bg-black/20 px-4 py-4 space-y-3">
                              {row.remediationGuidance ? (
                                <div>
                                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-1">Guidance</p>
                                  <p className="text-sm text-gray-200">{row.remediationGuidance}</p>
                                </div>
                              ) : null}

                              {row.manualReviewRequired && row.manualReviewReason ? (
                                <div>
                                  <p className="text-xs uppercase tracking-[0.15em] text-amber-500 mb-1">Manual Review Required</p>
                                  <p className="text-sm text-amber-200/80">{row.manualReviewReason}</p>
                                </div>
                              ) : null}

                              {Array.isArray(row.affectedElements) && row.affectedElements.length > 0 ? (
                                <div>
                                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500 mb-1">Affected Elements</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {row.affectedElements.slice(0, 10).map((el, i) => (
                                      <code key={i} className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-gray-300">{el}</code>
                                    ))}
                                    {row.affectedElements.length > 10 ? (
                                      <span className="text-xs text-gray-500">+{row.affectedElements.length - 10} more</span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}

                              <a
                                href={wcagUnderstandingUrl(row.title)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-blue-300 transition hover:bg-white/10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                WCAG Understanding Doc ↗
                              </a>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="text-xs text-gray-500">
                    Criteria marked Needs Review require manual review and cannot be fully assessed by automated scanning. This report does not constitute a legal conformance certification.
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
