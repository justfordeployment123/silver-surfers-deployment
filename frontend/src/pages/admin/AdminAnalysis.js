import React, { useState, useEffect } from 'react';
import { adminListAnalysis } from '../../api';

const STYLES = `
.ap-card { background: #fff; border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 14px; color: var(--ink6); }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: #fff; outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: #fff; outline: none; }
.ap-sel:focus { border-color: var(--t4); }
.ap-btn-p { background: var(--t4); color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: #fff; border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #991b1b; }
.ap-warn { background: #fef3c7; border: 1px solid #fcd34d; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #92400e; }
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

const AdminAnalysis = () => {
  const [analysis, setAnalysis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAnalysis();
  }, [statusFilter]);

  const loadAnalysis = async () => {
    try {
      setLoading(true);
      setError('');
      const params = { limit: 200 };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const result = await adminListAnalysis(params);
      if (result.error) {
        setError(result.error);
        setAnalysis([]);
      } else {
        let items = Array.isArray(result.items) ? result.items : [];
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          items = items.filter(record =>
            (record.url || '').toLowerCase().includes(query) ||
            (record.email || '').toLowerCase().includes(query) ||
            (record.taskId || '').toLowerCase().includes(query)
          );
        }
        setAnalysis(items);
      }
    } catch (err) {
      setError('Failed to load analysis data');
      setAnalysis([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAnalysis();
    setRefreshing(false);
  };

  const getStatusPill = (status) => {
    if (status === 'completed') return <span className="pill pill-g">completed</span>;
    if (status === 'completed_with_warnings') return <span className="pill pill-a">completed w/ warnings</span>;
    if (status === 'failed') return <span className="pill pill-r">failed</span>;
    if (status === 'processing') return <span className="pill pill-t">processing</span>;
    if (status === 'queued') return <span className="pill pill-y">queued</span>;
    return <span className="pill pill-gr">{status || 'unknown'}</span>;
  };

  const getEmailPill = (emailStatus) => {
    if (emailStatus === 'sent') return <span className="pill pill-g">email sent</span>;
    if (emailStatus === 'failed') return <span className="pill pill-r">email failed</span>;
    if (emailStatus === 'sending') return <span className="pill pill-t">email sending</span>;
    return <span className="pill pill-gr">email {emailStatus || 'pending'}</span>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  const groupedAnalysis = analysis.reduce((groups, record) => {
    const status = record.status || 'unknown';
    if (!groups[status]) groups[status] = [];
    groups[status].push(record);
    return groups;
  }, {});

  const statusOrder = ['queued', 'processing', 'completed', 'completed_with_warnings', 'failed'];
  const sortedGroups = statusOrder.filter(status => groupedAnalysis[status]);

  const dotColor = (status) => {
    if (status === 'completed') return '#16a34a';
    if (status === 'completed_with_warnings') return '#d97706';
    if (status === 'failed') return '#ef4444';
    if (status === 'processing') return 'var(--t4)';
    return '#f59e0b';
  };

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '32px', width: '220px' }} />
          {[1, 2, 3].map(i => (
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
            <h1 className="ap-h1">Analysis Queue</h1>
            <p className="ap-sub">Monitor and manage website analysis requests</p>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="ap-btn-p">
            {refreshing ? (
              <>
                <svg className="ap-spin" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" style={{ opacity: 0.25 }} />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" stroke="none" style={{ opacity: 0.75 }} />
                </svg>
                Refreshing...
              </>
            ) : 'Refresh'}
          </button>
        </div>

        <div className="ap-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <input
              type="text"
              placeholder="Search by URL, email, or task ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ap-inp"
              style={{ flex: 1, minWidth: '200px' }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ap-sel">
              <option value="all">All Status</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="completed_with_warnings">Completed with warnings</option>
              <option value="failed">Failed</option>
            </select>
            <button onClick={() => { setSearchQuery(''); setStatusFilter('all'); }} className="ap-btn-s">
              Clear Filters
            </button>
          </div>
        </div>

        {error && <div className="ap-err">{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {sortedGroups.length > 0 ? (
            sortedGroups.map(status => (
              <div key={status} className="ap-card">
                <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--sandd)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: dotColor(status), flexShrink: 0 }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>
                    {status.replace(/_/g, ' ')} ({groupedAnalysis[status].length})
                  </h3>
                </div>
                <div>
                  {groupedAnalysis[status].map((record, idx) => (
                    <div key={record._id || record.taskId} style={{
                      padding: '18px 24px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--sandd)',
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)', wordBreak: 'break-all' }}>{record.url}</span>
                        {getStatusPill(record.status)}
                        {getEmailPill(record.emailStatus)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink6)', display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '4px' }}>
                        <span>Email: {record.email}</span>
                        <span>Task: {record.taskId}</span>
                        {record.createdAt && <span>Created: {formatDate(record.createdAt)}</span>}
                        {record.updatedAt && <span>Updated: {formatDate(record.updatedAt)}</span>}
                        {typeof record.attachmentCount === 'number' && <span>PDFs: {record.attachmentCount}</span>}
                      </div>
                      {record.failureReason && (
                        <div className="ap-err" style={{ marginTop: '8px', padding: '8px 12px', fontSize: '12px' }}>
                          <strong>Failure reason:</strong> {record.failureReason}
                        </div>
                      )}
                      {record.emailError && (
                        <div className="ap-warn" style={{ marginTop: '8px', padding: '8px 12px', fontSize: '12px' }}>
                          <strong>Email error:</strong> {record.emailError}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink6)' }}>
              <svg style={{ width: '48px', height: '48px', margin: '0 auto 16px', display: 'block', color: 'var(--ink3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>No analysis records</p>
              <p style={{ fontSize: '13px' }}>No analysis requests found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminAnalysis;
