import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  deleteMyAnalysis,
  fetchMyAnalysisReportFile,
  getMyAnalysisDetail,
  rescanMyAnalysis,
  rerunMyAnalysis,
} from '../api';

// Mirrors the backend's describeWcagStandardLabel() (wcag-mapping.ts) so the
// report header text matches what's on the PDF (2.2.7.3).
function describeWcagStandard(wcagStandard, conformanceLevel) {
  const level = conformanceLevel || 'AA';
  if (wcagStandard === 'wcag21') return `WCAG 2.1 Level ${level}`;
  if (wcagStandard === 'wcag22') return `WCAG 2.2 Level ${level}`;
  return 'Full Combined (WCAG 2.1 + 2.2)';
}

const STYLES = `
.ad-pg { min-height: 100vh; background: var(--t9); padding: 112px 24px 80px; color: #fff; }
.ad-wrap { max-width: 1152px; margin: 0 auto; }
.ad-back { display: inline-flex; align-items: center; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 6px 12px; font-size: 16px; color: rgba(255,255,255,0.75); cursor: pointer; margin-bottom: 16px; }
.ad-back:hover { background: rgba(255,255,255,0.1); }
.sb { display: inline-flex; align-items: center; border-radius: 9999px; border: 1px solid; padding: 3px 10px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.sb-green { background: rgba(29,158,117,0.2); color: var(--t3); border-color: rgba(29,158,117,0.3); }
.sb-yellow { background: rgba(245,158,11,0.15); color: #fcd34d; border-color: rgba(245,158,11,0.3); }
.sb-red { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
.sb-blue { background: rgba(56,189,248,0.15); color: #bae6fd; border-color: rgba(56,189,248,0.3); }
.sb-gray { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.1); }
.ad-btn-rescan { border-radius: 8px; background: var(--t6); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; border: none; cursor: pointer; }
.ad-btn-rescan:hover { background: var(--t8); }
.ad-btn-rescan:disabled { opacity: 0.6; cursor: not-allowed; }
.ad-btn-rerun { border-radius: 8px; background: rgba(217,119,6,0.7); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; border: none; cursor: pointer; }
.ad-btn-rerun:hover { background: rgba(217,119,6,0.9); }
.ad-btn-rerun:disabled { opacity: 0.6; cursor: not-allowed; }
.ad-btn-del { border-radius: 8px; border: 1px solid rgba(248,113,113,0.25); background: rgba(239,68,68,0.08); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fca5a5; cursor: pointer; }
.ad-btn-del:hover { background: rgba(239,68,68,0.15); }
.ad-btn-del:disabled { opacity: 0.6; cursor: not-allowed; }
.ad-btn-open { border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; cursor: pointer; }
.ad-btn-open:hover { background: rgba(255,255,255,0.1); }
.ad-btn-open:disabled { opacity: 0.6; cursor: not-allowed; }
.ad-btn-dl { border-radius: 8px; background: var(--t6); padding: 6px 12px; font-size: 16px; font-weight: 700; color: #fff; border: none; cursor: pointer; }
.ad-btn-dl:hover { background: var(--t8); }
.ad-btn-dl:disabled { opacity: 0.6; cursor: not-allowed; }
.wcag-filter-btn { border-radius: 8px; border: 1px solid; padding: 5px 12px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background .15s; }
.wcag-filter-btn-active { border-color: var(--t1); background: var(--t05); color: var(--t4); }
.wcag-filter-btn-inactive { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.75); }
.wcag-filter-btn-inactive:hover { background: rgba(255,255,255,0.1); }
.wcag-stat-pass { border-radius: 16px; border: 1px solid rgba(29,158,117,0.25); background: rgba(29,158,117,0.12); padding: 20px; }
.wcag-stat-fail { border-radius: 16px; border: 1px solid rgba(239,68,68,0.25); background: rgba(239,68,68,0.1); padding: 20px; }
.wcag-stat-review { border-radius: 16px; border: 1px solid rgba(245,158,11,0.25); background: rgba(245,158,11,0.1); padding: 20px; }
.wcag-stat-na { border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 20px; }
.ad-rec-num { display: inline-flex; width: 24px; height: 24px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: var(--t05); font-size: 16px; font-weight: 700; color: var(--t4); }
.ad-wcag-link { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); padding: 5px 12px; font-size: 16px; font-weight: 700; color: var(--t3); text-decoration: none; }
.ad-wcag-link:hover { background: rgba(255,255,255,0.1); }
`;

function ScoreBadge({ value, tone }) {
  const cls = { green: 'sb-green', yellow: 'sb-yellow', red: 'sb-red', blue: 'sb-blue', gray: 'sb-gray' };
  return <span className={`sb ${cls[tone] || 'sb-gray'}`}>{value}</span>;
}

function getRiskTone(value) {
  if (value === 'low') return 'green';
  if (value === 'medium') return 'yellow';
  if (value === 'high') return 'red';
  return 'gray';
}

function getStatusTone(value) {
  if (value === 'completed' || value === 'sent' || value === 'pass') return 'green';
  if (value === 'completed_with_warnings') return 'yellow';
  if (value === 'processing' || value === 'sending' || value === 'needs-improvement') return 'blue';
  if (value === 'failed' || value === 'fail') return 'red';
  return 'gray';
}

function getPriorityTone(value) {
  if (value === 'high') return 'red';
  if (value === 'medium') return 'yellow';
  if (value === 'low') return 'green';
  return 'gray';
}

function formatStatusLabel(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getBucketTone(value) {
  if (value === 'quick-wins') return 'green';
  if (value === 'medium-effort') return 'yellow';
  if (value === 'high-effort') return 'red';
  return 'gray';
}

function buildFallbackRemediationBuckets(roadmap) {
  const bucketOrder = [
    { key: 'quick-wins', label: 'Quick Wins', description: 'Lower-effort improvements that can remove friction quickly and raise usability confidence fast.' },
    { key: 'medium-effort', label: 'Medium Effort', description: 'Moderate implementation work with meaningful accessibility and usability payoff.' },
    { key: 'high-effort', label: 'High Effort', description: 'Bigger redesign or engineering work that should be planned as a larger remediation phase.' },
  ];
  return bucketOrder.map((bucket) => {
    const items = roadmap.filter((item) => item.bucketKey === bucket.key);
    return { ...bucket, items, itemCount: items.length };
  }).filter((bucket) => bucket.itemCount > 0);
}

function renderAuditMetadata(issue) {
  const badges = [];
  if (issue?.auditSourceLabel) badges.push(<ScoreBadge key={`${issue.auditId || issue.id}-source`} value={issue.auditSourceLabel} tone="gray" />);
  if (Array.isArray(issue?.wcagCriteria)) {
    issue.wcagCriteria.forEach((criterion) => {
      badges.push(<ScoreBadge key={`${issue.auditId || issue.id}-wcag-${criterion}`} value={`WCAG ${criterion}`} tone="gray" />);
    });
  }
  return badges;
}

function getInlineActionLabel(reportFile) { return reportFile?.hasPreview ? 'View PDF' : 'Open File'; }
function getDownloadActionLabel(reportFile) { return reportFile?.hasPreview ? 'Download PDF' : 'Download File'; }

function wcagUnderstandingUrl(title) {
  const slug = String(title || '').toLowerCase().replace(/[()]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
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
    <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '20px', backdropFilter: 'blur(4px)' }}>
      <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>{label}</p>
      <p style={{ marginTop: '12px', fontSize: '28px', fontWeight: 700, color: '#fff' }}>{value}</p>
      {help ? <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{help}</p> : null}
    </div>
  );
}

const Box = ({ children, style }) => (
  <div style={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', padding: '24px', ...style }}>
    {children}
  </div>
);

const SubBox = ({ children, style }) => (
  <div style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '20px', ...style }}>
    {children}
  </div>
);

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
  const [wcagShowAllCriteria, setWcagShowAllCriteria] = useState(false);

  const loadDetail = async (cancelled = false) => {
    setLoading(true); setError('');
    const result = await getMyAnalysisDetail(taskId);
    if (cancelled) return;
    if (result?.error) { setError(result.error); setItem(null); }
    else { setItem(result?.item || null); }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    loadDetail(cancelled);
    return () => { cancelled = true; };
  }, [taskId]);

  const dimensions = item?.dimensions || [];
  const evaluationDimensions = item?.evaluationDimensions || item?.scorecard?.evaluationDimensions || [];
  const topIssues = item?.topIssues || [];
  const roadmap = item?.remediationRoadmap || [];
  const remediationBuckets = item?.remediationBuckets?.length ? item.remediationBuckets : buildFallbackRemediationBuckets(roadmap);
  const aiReport = item?.aiReport || null;
  const reportFiles = item?.reportFiles || [];
  const wcagMatrix = item?.wcagMatrix || [];
  const wcagSummary = item?.wcagSummary || null;
  const outOfScopeWcagRows = item?.outOfScopeWcagRows || [];
  const wcagStandardLabel = describeWcagStandard(item?.wcagStandard, item?.conformanceLevel);

  const filteredWcagMatrix = wcagMatrix.filter((row) => {
    const statusMatch =
      wcagStatusFilter === 'all' ? true :
      wcagStatusFilter === 'active' ? (row.status === 'fail' || row.status === 'needs-review') :
      row.status === wcagStatusFilter;
    const principleMatch = wcagPrincipleFilter === 'all' || row.principle === wcagPrincipleFilter;
    const levelMatch = wcagLevelFilter === 'all' || row.level === wcagLevelFilter;
    return statusMatch && principleMatch && levelMatch;
  });

  // Out-of-scope rows bypass the status/principle/level filters when shown —
  // they're stubs (never evaluated), so filtering them by status would just
  // hide them, defeating the point of the "Show all criteria" toggle.
  const displayedWcagMatrix = wcagShowAllCriteria
    ? [...filteredWcagMatrix, ...outOfScopeWcagRows.map((row) => ({ ...row, outOfScope: true }))]
      .sort((a, b) => a.criterion.localeCompare(b.criterion, undefined, { numeric: true }))
    : filteredWcagMatrix;

  const handleRerun = async () => {
    if (!taskId) return;
    setRerunning(true); setError('');
    const result = await rerunMyAnalysis(taskId);
    setRerunning(false);
    if (result?.error) { setError(result.error); return; }
    await loadDetail();
  };

  const handleRescan = async () => {
    if (!taskId) return;
    setRescanning(true); setError('');
    const result = await rescanMyAnalysis(taskId);
    setRescanning(false);
    if (result?.error) { setError(result.error); return; }
    navigate('/account');
  };

  const handleDelete = async () => {
    if (!taskId) return;
    if (!window.confirm('Delete this full audit from your account?')) return;
    setDeleting(true); setError('');
    const result = await deleteMyAnalysis(taskId);
    setDeleting(false);
    if (result?.error) { setError(result.error); return; }
    navigate('/account');
  };

  const handleReportAction = async (reportFile, disposition) => {
    if (!taskId || !reportFile?.id) return;
    const actionId = `${reportFile.id}:${disposition}`;
    setReportAction(actionId); setReportError('');
    const result = await fetchMyAnalysisReportFile(taskId, reportFile.id, disposition);
    setReportAction('');
    if (result?.error || !result?.blob) { setReportError(result?.error || 'Failed to load report file.'); return; }
    const fileName = result.filename || reportFile.displayName || reportFile.filename || 'report.pdf';
    const blobUrl = window.URL.createObjectURL(result.blob);
    if (disposition === 'inline') {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
      return;
    }
    const link = document.createElement('a');
    link.href = blobUrl; link.download = fileName;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10_000);
  };

  const sectionTitle = (text) => ({ fontSize: '22px', fontWeight: 700, color: '#fff' });
  const sectionSub = (text) => ({ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' });

  return (
    <>
      <style>{STYLES}</style>
      <div className="ad-pg">
        <div className="ad-wrap">
          <div style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <button onClick={() => navigate('/account')} className="ad-back">Back to account</button>
              <h1 className="h1" style={{ color: 'var(--t4)', marginBottom: '10px' }}>Analysis Detail</h1>
              <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', wordBreak: 'break-all' }}>{item?.url || 'Loading analysis record...'}</p>
              {item?.taskId ? <p style={{ marginTop: '8px', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>Task {item.taskId}</p> : null}
              {item ? (
                <p style={{ marginTop: '10px', fontSize: '16px', fontWeight: 700, color: 'var(--t3)' }}>
                  Evaluated against: {wcagStandardLabel}
                </p>
              ) : null}
            </div>

            {item ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <button onClick={handleRescan} disabled={rescanning} className="ad-btn-rescan">{rescanning ? 'Queueing...' : 'Re-scan'}</button>
                {item.status === 'failed' ? (
                  <button onClick={handleRerun} disabled={rerunning} className="ad-btn-rerun">{rerunning ? 'Re-running...' : 'Re-run scan'}</button>
                ) : null}
                <button onClick={handleDelete} disabled={deleting} className="ad-btn-del">{deleting ? 'Deleting...' : 'Delete'}</button>
                <ScoreBadge value={formatStatusLabel(item.status)} tone={getStatusTone(item.status)} />
                <ScoreBadge value={`Email ${item.emailStatus}`} tone={getStatusTone(item.emailStatus)} />
                {item.riskTier ? <ScoreBadge value={`${item.riskTier} risk`} tone={getRiskTone(item.riskTier)} /> : null}
                {item.scoreStatus ? <ScoreBadge value={item.scoreStatus} tone={getStatusTone(item.scoreStatus)} /> : null}
              </div>
            ) : null}
          </div>

          {loading ? (
            <Box><p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Loading analysis details...</p></Box>
          ) : null}

          {!loading && error ? (
            <div style={{ borderRadius: '16px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(239,68,68,0.1)', padding: '24px', fontSize: '16px', color: '#fca5a5' }}>{error}</div>
          ) : null}

          {!loading && !error && item ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '16px' }}>
                <StatCard label="Silver Score" value={item.score != null ? `${Math.round(item.score)}%` : 'Pending'} help={item.scoreStatus ? item.scoreStatus.replace(/-/g, ' ') : 'Awaiting results'} />
                <StatCard label="Risk Tier" value={item.riskTier ? item.riskTier.toUpperCase() : 'Pending'} help="Current litigation-oriented risk classification" />
                <StatCard label="Successful Page/Device Targets" value={`${item.successfulTargetCount || 0}/${item.plannedTargetCount || item.pageCount || 0}`} help="Each page scanned on desktop, mobile, and tablet counts as its own target" />
                <StatCard label="Reports" value={String(item.attachmentCount || 0)} help={item.reportDirectory ? 'Report package generated' : 'No report package yet'} />
              </section>

              {(item.warnings?.length > 0 || item.degradedTargetCount > 0 || item.failedTargetCount > 0) ? (
                <section style={{ borderRadius: '16px', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.1)', padding: '24px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                    <ScoreBadge value={`Degraded ${item.degradedTargetCount || 0}`} tone="yellow" />
                    <ScoreBadge value={`Failed ${item.failedTargetCount || 0}`} tone={item.failedTargetCount ? 'red' : 'gray'} />
                  </div>
                  {item.warnings?.filter(w => !w.includes('dispatched to the scanner service')).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>Warnings</h2>
                      {item.warnings.filter(w => !w.includes('dispatched to the scanner service')).map((warning) => (
                        <p key={warning} style={{ fontSize: '16px', color: '#fcd34d' }}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {item.scanTargets?.length > 0 ? (
                <Box>
                  <div style={{ marginBottom: '20px' }}>
                    <h2 style={sectionTitle()}>Scan Targets</h2>
                    <p style={sectionSub()}>Each page and device combination scanned during this audit, including lite fallbacks and any failed targets.</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {item.scanTargets.map((target, index) => (
                      <SubBox key={`${target.url}-${target.device}-${index}`}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ wordBreak: 'break-all', fontWeight: 700, color: '#fff', fontSize: '16px' }}>{target.url}</p>
                            <p style={{ marginTop: '4px', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>
                              {target.device} {target.isHomepage ? '• homepage' : ''}
                            </p>
                            {target.failureReason ? <p style={{ marginTop: '8px', fontSize: '16px', color: '#fca5a5' }}>{target.failureReason}</p> : null}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <ScoreBadge value={formatStatusLabel(target.status)} tone={getStatusTone(target.status)} />
                            {typeof target.score === 'number' ? <ScoreBadge value={`Score ${Math.round(target.score)}`} tone={getStatusTone(target.score >= 80 ? 'completed' : target.score >= 70 ? 'needs-improvement' : 'failed')} /> : null}
                          </div>
                        </div>
                      </SubBox>
                    ))}
                  </div>
                </Box>
              ) : null}

              <Box>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={sectionTitle()}>Report Files</h2>
                  <p style={sectionSub()}>Open the stored PDF package for this scan or download a local copy from your profile.</p>
                </div>
                {reportError ? (
                  <div style={{ marginBottom: '16px', borderRadius: '10px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(239,68,68,0.1)', padding: '12px 16px', fontSize: '16px', color: '#fca5a5' }}>{reportError}</div>
                ) : null}
                {reportFiles.length === 0 ? (
                  <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No report files are available for this analysis yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {reportFiles.map((reportFile) => (
                      <div key={reportFile.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ wordBreak: 'break-all', fontWeight: 700, color: '#fff', fontSize: '16px' }}>{reportFile.displayName || reportFile.filename}</p>
                          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>
                            <span>{reportFile.contentType || 'application/pdf'}</span>
                            {reportFile.sizeMB ? <span>{reportFile.sizeMB} MB</span> : null}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          <button onClick={() => handleReportAction(reportFile, 'inline')} disabled={reportAction === `${reportFile.id}:inline`} className="ad-btn-open">
                            {reportAction === `${reportFile.id}:inline` ? 'Opening...' : getInlineActionLabel(reportFile)}
                          </button>
                          <button onClick={() => handleReportAction(reportFile, 'attachment')} disabled={reportAction === `${reportFile.id}:attachment`} className="ad-btn-dl">
                            {reportAction === `${reportFile.id}:attachment` ? 'Downloading...' : getDownloadActionLabel(reportFile)}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Box>

              <Box>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={sectionTitle()}>AI Executive Summary</h2>
                  <p style={sectionSub()}>Business-friendly narrative generated from the stored scorecard and remediation roadmap.</p>
                </div>
                {!aiReport ? (
                  <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No AI summary is available for this analysis yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <SubBox>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                        <p style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{aiReport.headline}</p>
                        <ScoreBadge value={aiReport.provider} tone={aiReport.provider === 'openai' ? 'blue' : 'gray'} />
                        <ScoreBadge value={aiReport.status} tone={aiReport.status === 'generated' ? 'green' : 'yellow'} />
                        {aiReport.model ? <ScoreBadge value={aiReport.model} tone="gray" /> : null}
                      </div>
                      <p style={{ marginTop: '12px', fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>{aiReport.summary}</p>
                    </SubBox>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
                      <SubBox>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Business Impact</h3>
                        <p style={{ marginTop: '12px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{aiReport.businessImpact}</p>
                      </SubBox>
                      <SubBox>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Priority Summary</h3>
                        <p style={{ marginTop: '12px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{aiReport.prioritySummary}</p>
                      </SubBox>
                    </div>

                    <SubBox>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Top Recommendations</h3>
                      {Array.isArray(aiReport.topRecommendations) && aiReport.topRecommendations.length > 0 ? (
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {aiReport.topRecommendations.map((rec, index) => (
                            <div key={`${index}-${rec}`} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.18)', padding: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <span className="ad-rec-num">{index + 1}</span>
                                <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>{rec}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ marginTop: '12px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No AI recommendations are available yet.</p>
                      )}
                    </SubBox>

                    <SubBox>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Stakeholder Note</h3>
                      <p style={{ marginTop: '12px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{aiReport.stakeholderNote}</p>
                    </SubBox>
                  </div>
                )}
              </Box>

              <Box>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={sectionTitle()}>Primary Score Categories</h2>
                  <p style={sectionSub()}>The four weighted Silver Score categories generated from the eight evaluation dimensions.</p>
                </div>
                {dimensions.length === 0 ? (
                  <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>This analysis does not have a scorecard yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
                    {dimensions.map((dimension) => (
                      <SubBox key={dimension.key}>
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
                        {dimension.topIssues?.length ? (
                          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {dimension.topIssues.map((issue) => (
                              <div key={`${dimension.key}-${issue.auditId}`} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.18)', padding: '12px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                  <p style={{ fontWeight: 600, color: '#fff', fontSize: '16px' }}>{issue.title}</p>
                                  <ScoreBadge value={issue.severity} tone={getRiskTone(issue.severity)} />
                                </div>
                                <p style={{ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{issue.description}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ marginTop: '16px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No top issues recorded for this dimension.</p>
                        )}
                      </SubBox>
                    ))}
                  </div>
                )}
              </Box>

              <Box>
                <div style={{ marginBottom: '20px' }}>
                  <h2 style={sectionTitle()}>Eight Evaluation Dimensions</h2>
                  <p style={sectionSub()}>These dimensions capture the underlying Silver Web evaluation model used to build the weighted score categories.</p>
                </div>
                {evaluationDimensions.length === 0 ? (
                  <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>This analysis does not include evaluation-dimension data yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
                    {evaluationDimensions.map((dimension) => (
                      <SubBox key={dimension.key}>
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
                        {dimension.topIssues?.length ? (
                          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {dimension.topIssues.map((issue) => (
                              <div key={`${dimension.key}-${issue.auditId}`} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.18)', padding: '12px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                  <p style={{ fontWeight: 600, color: '#fff', fontSize: '16px' }}>{issue.title}</p>
                                  <ScoreBadge value={issue.severity} tone={getRiskTone(issue.severity)} />
                                </div>
                                <p style={{ marginTop: '4px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{issue.description}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ marginTop: '16px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No top issues recorded for this evaluation dimension.</p>
                        )}
                      </SubBox>
                    ))}
                  </div>
                )}
              </Box>

              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '24px' }}>
                <Box>
                  <h2 style={sectionTitle()}>Top Issues</h2>
                  <p style={sectionSub()}>Highest-impact score drivers from the current analysis.</p>
                  {topIssues.length === 0 ? (
                    <p style={{ marginTop: '20px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No issue breakdown available yet.</p>
                  ) : (
                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {topIssues.map((issue) => (
                        <SubBox key={issue.auditId}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                            <p style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>{issue.title}</p>
                            <ScoreBadge value={issue.severity} tone={getRiskTone(issue.severity)} />
                            {renderAuditMetadata(issue)}
                            <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Score {Math.round(issue.score)}%</span>
                          </div>
                          <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{issue.description}</p>
                          {issue.displayValue ? <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>Observed: {issue.displayValue}</p> : null}
                        </SubBox>
                      ))}
                    </div>
                  )}
                </Box>

                <Box>
                  <h2 style={sectionTitle()}>Remediation Roadmap</h2>
                  <p style={sectionSub()}>Phase 1 remediation plan grouped into Quick Wins, Medium Effort, and High Effort workstreams.</p>
                  {remediationBuckets.length === 0 ? (
                    <p style={{ marginTop: '20px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No remediation roadmap available yet.</p>
                  ) : (
                    <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {remediationBuckets.map((bucket) => (
                        <SubBox key={bucket.key}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{bucket.label}</h3>
                            <ScoreBadge value={`${bucket.itemCount} items`} tone={getBucketTone(bucket.key)} />
                          </div>
                          <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)', marginBottom: '16px' }}>{bucket.description}</p>
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
                        </SubBox>
                      ))}
                    </div>
                  )}
                </Box>
              </section>

              {wcagMatrix.length > 0 ? (
                <Box>
                  <div style={{ marginBottom: '20px' }}>
                    <h2 style={sectionTitle()}>{wcagStandardLabel} Matrix</h2>
                    <p style={sectionSub()}>Automated coverage of success criteria evaluated against {wcagStandardLabel} for this audit.</p>
                  </div>

                  {wcagSummary ? (
                    <div style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '12px' }}>
                      <div className="wcag-stat-pass">
                        <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--t3)' }}>Passed</p>
                        <p style={{ marginTop: '12px', fontSize: '28px', fontWeight: 700, color: 'var(--t4)' }}>{wcagSummary.passed ?? 0}</p>
                        <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(29,158,117,0.7)' }}>criteria</p>
                      </div>
                      <div className="wcag-stat-fail">
                        <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#fca5a5' }}>Failed</p>
                        <p style={{ marginTop: '12px', fontSize: '28px', fontWeight: 700, color: '#f87171' }}>{wcagSummary.failed ?? 0}</p>
                        <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(239,68,68,0.6)' }}>criteria</p>
                      </div>
                      <div className="wcag-stat-review">
                        <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#fcd34d' }}>Needs Review</p>
                        <p style={{ marginTop: '12px', fontSize: '28px', fontWeight: 700, color: '#fbbf24' }}>{wcagSummary.needsReview ?? 0}</p>
                        <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(245,158,11,0.6)' }}>manual only</p>
                      </div>
                      <div className="wcag-stat-na">
                        <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255, 255, 255, 0.75)' }}>Not Applicable</p>
                        <p style={{ marginTop: '12px', fontSize: '28px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.75)' }}>{wcagSummary.notApplicable ?? 0}</p>
                        <p style={{ marginTop: '8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>criteria</p>
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255, 255, 255, 0.75)', marginRight: '4px' }}>Status</span>
                      {[
                        { value: 'active', label: 'Issues Only' },
                        { value: 'all', label: 'All' },
                        { value: 'pass', label: 'Pass' },
                        { value: 'fail', label: 'Fail' },
                        { value: 'needs-review', label: 'Needs Review' },
                        { value: 'not-applicable', label: 'N/A' },
                      ].map((opt) => (
                        <button key={opt.value} onClick={() => setWcagStatusFilter(opt.value)} className={`wcag-filter-btn ${wcagStatusFilter === opt.value ? 'wcag-filter-btn-active' : 'wcag-filter-btn-inactive'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255, 255, 255, 0.75)', marginRight: '4px' }}>Principle</span>
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'perceivable', label: 'Perceivable' },
                        { value: 'operable', label: 'Operable' },
                        { value: 'understandable', label: 'Understandable' },
                        { value: 'robust', label: 'Robust' },
                      ].map((opt) => (
                        <button key={opt.value} onClick={() => setWcagPrincipleFilter(opt.value)} className={`wcag-filter-btn ${wcagPrincipleFilter === opt.value ? 'wcag-filter-btn-active' : 'wcag-filter-btn-inactive'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255, 255, 255, 0.75)', marginRight: '4px' }}>Level</span>
                      {[
                        { value: 'all', label: 'All' },
                        { value: 'A', label: 'A' },
                        { value: 'AA', label: 'AA' },
                      ].map((opt) => (
                        <button key={opt.value} onClick={() => setWcagLevelFilter(opt.value)} className={`wcag-filter-btn ${wcagLevelFilter === opt.value ? 'wcag-filter-btn-active' : 'wcag-filter-btn-inactive'}`}>
                          {opt.label}
                        </button>
                      ))}
                      <span style={{ marginLeft: 'auto', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{filteredWcagMatrix.length} of {wcagMatrix.length} criteria</span>
                    </div>

                    {outOfScopeWcagRows.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => setWcagShowAllCriteria((v) => !v)}
                          className={`wcag-filter-btn ${wcagShowAllCriteria ? 'wcag-filter-btn-active' : 'wcag-filter-btn-inactive'}`}
                        >
                          {wcagShowAllCriteria ? 'Showing all criteria' : 'Show all criteria'}
                        </button>
                        <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>
                          {outOfScopeWcagRows.length} criteria outside the {wcagStandardLabel} scope {wcagShowAllCriteria ? 'shown below (dimmed)' : 'are hidden'}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {displayedWcagMatrix.length === 0 ? (
                    <p style={{ padding: '24px', textAlign: 'center', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>No criteria match the current filters.</p>
                  ) : (
                    <div style={{ overflow: 'hidden', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 52px 110px 60px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255, 255, 255, 0.75)' }}>
                        <span>Criterion</span>
                        <span>Title</span>
                        <span style={{ textAlign: 'center' }}>Level</span>
                        <span style={{ textAlign: 'center' }}>Status</span>
                        <span style={{ textAlign: 'center' }}>Issues</span>
                      </div>
                      {displayedWcagMatrix.map((row, index) => {
                        const isExpanded = wcagExpandedRow === row.criterion;
                        const dimmed = Boolean(row.outOfScope);
                        return (
                          <div key={row.criterion} style={dimmed ? { opacity: 0.4 } : undefined}>
                            <button
                              onClick={() => !dimmed && setWcagExpandedRow(isExpanded ? null : row.criterion)}
                              style={{ fontSize: '16px', display: 'grid', width: '100%', gridTemplateColumns: '60px 1fr 52px 110px 60px', alignItems: 'center', gap: '8px', padding: '12px 16px', textAlign: 'left', background: isExpanded ? 'rgba(255,255,255,0.05)' : index % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent', border: 'none', cursor: dimmed ? 'default' : 'pointer', color: '#fff', transition: 'background .15s' }}
                            >
                              <span style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255, 255, 255, 0.75)' }}>{row.criterion}</span>
                              <span style={{ fontSize: '16px', color: '#fff' }}>{row.title}</span>
                              <span style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.75)' }}>{row.level}</span>
                              <span style={{ display: 'flex', justifyContent: 'center' }}>
                                {dimmed
                                  ? <ScoreBadge value="Not evaluated in this scan" tone="gray" />
                                  : <ScoreBadge value={getWcagStatusLabel(row.status)} tone={getWcagStatusTone(row.status)} />}
                              </span>
                              <span style={{ textAlign: 'center', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{dimmed ? '—' : (row.issueCount ?? 0)}</span>
                            </button>

                            {isExpanded && !dimmed ? (
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.18)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {row.remediationGuidance ? (
                                  <div>
                                    <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255, 255, 255, 0.75)', marginBottom: '4px' }}>Guidance</p>
                                    <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>{row.remediationGuidance}</p>
                                  </div>
                                ) : null}

                                {row.manualReviewRequired && row.manualReviewReason ? (
                                  <div>
                                    <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#fcd34d', marginBottom: '4px' }}>Manual Review Required</p>
                                    <p style={{ fontSize: '16px', color: 'rgba(252,211,77,0.75)' }}>{row.manualReviewReason}</p>
                                  </div>
                                ) : null}

                                {Array.isArray(row.affectedElements) && row.affectedElements.length > 0 ? (
                                  <div>
                                    <p style={{ fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255, 255, 255, 0.75)', marginBottom: '6px' }}>Affected Elements</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {row.affectedElements.slice(0, 10).map((el, i) => (
                                        <code key={i} style={{ borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '2px 8px', fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>{el}</code>
                                      ))}
                                      {row.affectedElements.length > 10 ? (
                                        <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>+{row.affectedElements.length - 10} more</span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}

                                <a href={wcagUnderstandingUrl(row.title)} target="_blank" rel="noopener noreferrer" className="ad-wcag-link" onClick={(e) => e.stopPropagation()}>
                                  WCAG Understanding Doc ↗
                                </a>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
                    <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>
                      Criteria marked Needs Review require manual review and cannot be fully assessed by automated scanning. This report does not constitute a legal conformance certification.
                    </p>
                  </div>
                </Box>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
