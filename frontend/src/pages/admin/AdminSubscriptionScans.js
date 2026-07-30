import React, { useState, useEffect } from 'react';
import { adminListSubscriptionScans } from '../../api';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 14px; color: var(--ink6); }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: var(--surface); outline: none; }
.ap-sel:focus { border-color: var(--t4); }
.ap-btn-p { background: var(--t4); color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-btn-green { background: #16a34a; color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-green:hover:not(:disabled) { background: #15803d; }
.ap-btn-green:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #991b1b; }
.ap-stat-mini { background: var(--t05); border: 1px solid var(--t1); border-radius: var(--r); padding: 16px 20px; }
.ap-stat-mini-val { font-size: 22px; font-weight: 700; color: var(--t8); line-height: 1; }
.ap-stat-mini-lbl { font-size: 12px; color: var(--ink6); margin-top: 3px; }
.ap-tbl { width: 100%; border-collapse: collapse; }
.ap-tbl thead { background: var(--sand); }
.ap-tbl th { padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 600; color: var(--ink6); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.ap-tbl td { padding: 12px 16px; font-size: 13px; color: var(--ink); border-top: 1px solid var(--sandd); }
.ap-tbl tr:hover td { background: var(--sand); }
.ap-th-btn { background: none; border: none; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--ink6); text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; gap: 4px; }
.ap-th-btn:hover { color: var(--ink); }
.pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
.pill-g { background: #dcfce7; color: #166534; }
.pill-a { background: #fef3c7; color: #92400e; }
.pill-r { background: #fee2e2; color: #991b1b; }
.pill-t { background: var(--t05); color: var(--t6); }
.pill-y { background: #fef9c3; color: #713f12; }
.pill-gr { background: #f3f4f6; color: #374151; }
.ap-spin { animation: ap-spin-kf 0.7s linear infinite; }
@keyframes ap-spin-kf { to { transform: rotate(360deg); } }
.ap-sk { background: var(--sandd); border-radius: 6px; animation: ap-pulse 1.5s ease-in-out infinite; }
@keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const PLAN_TITLES = { starter: 'Starter Plan', pro: 'Pro Plan', oneTime: 'One-Time Package' };
const PLAN_EMOJIS = { starter: '🌟', pro: '💎', oneTime: '📦' };

const AdminSubscriptionScans = ({ planType = 'all' }) => {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [refreshing, setRefreshing] = useState(false);
  const [statistics, setStatistics] = useState({ totalScans: 0, completedScans: 0, failedScans: 0, uniqueEmails: 0, uniqueUrls: 0 });

  const title = PLAN_TITLES[planType] || 'All Subscription Scans';
  const emoji = PLAN_EMOJIS[planType] || '🔍';

  useEffect(() => { loadScans(); }, [sortBy, sortOrder, planType]);

  useEffect(() => {
    const t = setTimeout(() => { if (searchQuery !== undefined) loadScans(); }, 500);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadScans = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {
        limit: 100,
        search: searchQuery || undefined,
        planId: planType !== 'all' ? planType : undefined,
        sortBy, sortOrder
      };
      const result = await adminListSubscriptionScans(params);
      if (result.error) {
        setError(result.error);
        setScans([]);
        setStatistics({ totalScans: 0, completedScans: 0, failedScans: 0, uniqueEmails: 0, uniqueUrls: 0 });
      } else {
        setScans(result.items || []);
        setStatistics(result.statistics || { totalScans: 0, completedScans: 0, failedScans: 0, uniqueEmails: 0, uniqueUrls: 0 });
      }
    } catch (err) {
      setError('Failed to load subscription scan data');
      setScans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => { setRefreshing(true); await loadScans(); setRefreshing(false); };

  const handleExport = () => {
    const headers = ['URL', 'Email', 'First Name', 'Last Name', 'Plan', 'Device', 'Score', 'Status', 'Scan Date'];
    const csvData = scans.map(scan => [
      scan.url, scan.email, scan.firstName || '', scan.lastName || '',
      scan.planId || 'N/A', scan.device || 'N/A',
      scan.score !== undefined ? `${Math.round(scan.score)}%` : 'N/A',
      scan.status, new Date(scan.createdAt).toLocaleString()
    ]);
    const csvContent = [headers.join(','), ...csvData.map(row => row.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `subscription-scans-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const scoreColor = (s) => s >= 80 ? '#16a34a' : s >= 50 ? '#d97706' : '#ef4444';

  const SortArrow = ({ field }) => sortBy !== field ? null : <span style={{ fontSize: '10px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>;

  const planPill = (planId) => {
    if (planId === 'pro') return <span className="pill pill-t">{planId}</span>;
    if (planId === 'starter') return <span className="pill pill-gr">{planId}</span>;
    return <span className="pill pill-gr">{planId || 'N/A'}</span>;
  };

  const statusPill = (status) => {
    if (status === 'completed') return <span className="pill pill-g">completed</span>;
    if (status === 'completed_with_warnings') return <span className="pill pill-a">completed w/ warn</span>;
    if (status === 'processing') return <span className="pill pill-t">processing</span>;
    if (status === 'queued') return <span className="pill pill-y">queued</span>;
    return <span className="pill pill-r">{status || 'unknown'}</span>;
  };

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '32px', width: '220px' }} />
          {[1,2,3].map(i => (
            <div key={i} className="ap-card" style={{ padding: '24px' }}>
              <div className="ap-sk" style={{ height: '16px', width: '70%', marginBottom: '8px' }} />
              <div className="ap-sk" style={{ height: '12px', width: '40%' }} />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <h1 className="ap-h1">{emoji} {title}</h1>
            <p className="ap-sub">Monitor all {title.toLowerCase()} audit requests</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleExport} disabled={scans.length === 0} className="ap-btn-green">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
            <button onClick={handleRefresh} disabled={refreshing} className="ap-btn-p">
              {refreshing ? (
                <>
                  <svg className="ap-spin" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" style={{ opacity: 0.25 }} />
                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" stroke="none" style={{ opacity: 0.75 }} />
                  </svg>
                  Refreshing...
                </>
              ) : 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Total Scans', val: statistics.totalScans },
            { label: 'Completed', val: statistics.completedScans },
            { label: 'Failed', val: statistics.failedScans },
            { label: 'Unique Emails', val: statistics.uniqueEmails },
            { label: 'Unique URLs', val: statistics.uniqueUrls },
          ].map(({ label, val }) => (
            <div key={label} className="ap-stat-mini">
              <div className="ap-stat-mini-val">{val}</div>
              <div className="ap-stat-mini-lbl">{label}</div>
            </div>
          ))}
        </div>

        <div className="ap-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <input
              type="text"
              placeholder="Search by URL or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ap-inp"
              style={{ flex: 1, minWidth: '200px' }}
            />
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field); setSortOrder(order);
              }}
              className="ap-sel"
            >
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="email-asc">Email A-Z</option>
              <option value="email-desc">Email Z-A</option>
              <option value="url-asc">URL A-Z</option>
              <option value="url-desc">URL Z-A</option>
            </select>
            <button onClick={() => { setSearchQuery(''); setSortBy('createdAt'); setSortOrder('desc'); }} className="ap-btn-s">
              Clear Filters
            </button>
          </div>
        </div>

        {error && <div className="ap-err">{error}</div>}

        <div className="ap-card">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sandd)' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>Scan Records ({scans.length})</span>
          </div>
          {scans.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="ap-tbl">
                <thead>
                  <tr>
                    <th><button className="ap-th-btn" onClick={() => handleSort('url')}>URL <SortArrow field="url" /></button></th>
                    <th><button className="ap-th-btn" onClick={() => handleSort('email')}>Email <SortArrow field="email" /></button></th>
                    <th>Name</th>
                    <th>Plan</th>
                    <th>Device</th>
                    <th><button className="ap-th-btn" onClick={() => handleSort('score')}>Score <SortArrow field="score" /></button></th>
                    <th>Status</th>
                    <th><button className="ap-th-btn" onClick={() => handleSort('createdAt')}>Date <SortArrow field="createdAt" /></button></th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan._id}>
                      <td>
                        <span style={{ display: 'block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={scan.url}>
                          {scan.url}
                        </span>
                      </td>
                      <td>{scan.email}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{[scan.firstName, scan.lastName].filter(Boolean).join(' ') || 'N/A'}</td>
                      <td>{planPill(scan.planId)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{scan.device || 'All'}</td>
                      <td>
                        {scan.score !== undefined && scan.score !== null ? (
                          <span style={{ fontWeight: 700, color: scoreColor(scan.score) }}>{Math.round(scan.score)}%</span>
                        ) : (
                          <span style={{ color: 'var(--ink3)' }}>N/A</span>
                        )}
                      </td>
                      <td>{statusPill(scan.status)}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>{new Date(scan.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink6)' }}>
              <svg style={{ width: '48px', height: '48px', margin: '0 auto 16px', display: 'block', color: 'var(--ink3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>No subscription scans found</p>
              <p style={{ fontSize: '13px' }}>No scan records found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminSubscriptionScans;
