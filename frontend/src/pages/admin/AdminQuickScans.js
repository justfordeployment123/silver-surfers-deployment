import React, { useState, useEffect } from 'react';
import { adminListQuickScans } from '../../api';

const STYLES = `
.ap-card { background: var(--surface); border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 16px; color: var(--ink6); }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 16px; color: var(--ink); background: var(--surface); outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-sel { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 16px; color: var(--ink); background: var(--surface); outline: none; }
.ap-sel:focus { border-color: var(--t4); }
.ap-btn-p { background: var(--t6); color: #fff; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-btn-s { background: var(--surface); border: 1px solid var(--sandd); color: var(--ink6); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500; transition: background .15s; }
.ap-btn-s:hover { background: var(--sand); }
.ap-btn-green { background: #16a34a; color: #fff; padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 16px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; transition: background .15s; }
.ap-btn-green:hover:not(:disabled) { background: #15803d; }
.ap-btn-green:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 16px; color: #991b1b; }
.ap-tbl { width: 100%; border-collapse: collapse; }
.ap-tbl thead { background: var(--sand); }
.ap-tbl th { padding: 10px 16px; text-align: left; font-size: 16px; font-weight: 600; color: var(--ink6); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.ap-tbl td { padding: 12px 16px; font-size: 16px; color: var(--ink); border-top: 1px solid var(--sandd); }
.ap-tbl tr:hover td { background: var(--sand); }
.ap-pg-btn { border: 1px solid var(--sandd); border-radius: 6px; padding: 6px 12px; font-size: 16px; font-weight: 500; color: var(--ink6); background: var(--surface); cursor: pointer; transition: background .15s; }
.ap-pg-btn:hover:not(:disabled) { background: var(--sand); }
.ap-pg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ap-pg-btn-active { border-color: var(--t4); background: var(--t6); color: #fff; border-radius: 6px; padding: 6px 12px; font-size: 16px; font-weight: 600; cursor: default; }
.ap-th-btn { background: none; border: none; cursor: pointer; font-size: 16px; font-weight: 600; color: var(--ink6); text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; gap: 4px; }
.ap-th-btn:hover { color: var(--ink); }
.ap-spin { animation: ap-spin-kf 0.7s linear infinite; }
@keyframes ap-spin-kf { to { transform: rotate(360deg); } }
.ap-sk { background: var(--sandd); border-radius: 6px; animation: ap-pulse 1.5s ease-in-out infinite; }
@keyframes ap-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

const AdminQuickScans = () => {
  const [quickScans, setQuickScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('scanDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, pages: 1 });
  const [statistics, setStatistics] = useState({ totalScans: 0, completedScans: 0, failedScans: 0, uniqueEmails: 0, uniqueUrls: 0 });

  useEffect(() => {
    loadQuickScans();
  }, [sortBy, sortOrder, statusFilter, currentPage, pageSize, debouncedSearchQuery]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setCurrentPage(1);
      setDebouncedSearchQuery(searchQuery.trim());
    }, 500);
    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  const loadQuickScans = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {
        page: currentPage,
        limit: pageSize,
        search: debouncedSearchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        sortBy,
        sortOrder
      };
      const result = await adminListQuickScans(params);
      if (result.error) {
        setError(result.error);
        setQuickScans([]);
        setPagination({ total: 0, page: 1, limit: pageSize, pages: 1 });
        setStatistics({ totalScans: 0, completedScans: 0, failedScans: 0, uniqueEmails: 0, uniqueUrls: 0 });
      } else {
        setQuickScans(result.items || []);
        setPagination({
          total: Number(result.total) || 0,
          page: Number(result.page) || currentPage,
          limit: Number(result.limit) || pageSize,
          pages: Math.max(1, Number(result.pages) || 1)
        });
        setStatistics(result.statistics || { totalScans: 0, completedScans: 0, failedScans: 0, uniqueEmails: 0, uniqueUrls: 0 });
      }
    } catch (err) {
      setError('Failed to load quick scan data');
      setQuickScans([]);
      setPagination({ total: 0, page: 1, limit: pageSize, pages: 1 });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadQuickScans();
    setRefreshing(false);
  };

  const handleExport = () => {
    const headers = ['URL', 'Email', 'Name', 'Score (%)', 'Scan Date', 'Status', 'Report Generated', 'Created At'];
    const csvData = quickScans.map(scan => {
      const fullName = [scan.firstName, scan.lastName].filter(Boolean).join(' ') || 'N/A';
      const score = scan.scanScore !== null && scan.scanScore !== undefined ? Math.round(scan.scanScore) : 'N/A';
      return [
        scan.url || '',
        scan.email || '',
        fullName,
        score,
        new Date(scan.scanDate).toLocaleString(),
        scan.status || 'unknown',
        scan.reportGenerated ? 'Yes' : 'No',
        new Date(scan.createdAt).toLocaleString()
      ];
    });
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `quick-scans-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (field) => {
    if (sortBy === field) { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(field); setSortOrder('desc'); }
    setCurrentPage(1);
  };

  const handlePageSizeChange = (event) => {
    setPageSize(Number(event.target.value));
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const totalPages = pagination.pages || 1;
    const activePage = pagination.page || currentPage;
    const start = Math.max(1, activePage - 2);
    const end = Math.min(totalPages, activePage + 2);
    const pages = [];
    for (let page = start; page <= end; page += 1) pages.push(page);
    return pages;
  };

  const totalRecords = pagination.total || 0;
  const visibleStart = totalRecords === 0 ? 0 : ((pagination.page || currentPage) - 1) * (pagination.limit || pageSize) + 1;
  const visibleEnd = Math.min(totalRecords, visibleStart + quickScans.length - 1);

  const scoreColor = (score) => {
    if (score >= 80) return '#16a34a';
    if (score >= 60) return '#d97706';
    return '#ef4444';
  };

  const SortArrow = ({ field }) => {
    if (sortBy !== field) return null;
    return <span style={{ fontSize: '16px' }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="ap-sk" style={{ height: '32px', width: '200px' }} />
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
            <h1 className="ap-h1">Quick Scans</h1>
            <p className="ap-sub">Monitor all free quick scan requests</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleExport} disabled={quickScans.length === 0} className="ap-btn-green">
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
                setSortBy(field); setSortOrder(order); setCurrentPage(1);
              }}
              className="ap-sel"
            >
              <option value="scanDate-desc">Newest First</option>
              <option value="scanDate-asc">Oldest First</option>
              <option value="email-asc">Email A-Z</option>
              <option value="email-desc">Email Z-A</option>
              <option value="url-asc">URL A-Z</option>
              <option value="url-desc">URL Z-A</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="ap-sel"
            >
              <option value="all">All Statuses</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="completed_with_warnings">Completed with warnings</option>
              <option value="failed">Failed</option>
            </select>
            <select value={pageSize} onChange={handlePageSizeChange} className="ap-sel">
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
              <option value={200}>200 per page</option>
            </select>
            <button
              onClick={() => {
                setSearchQuery(''); setDebouncedSearchQuery('');
                setStatusFilter('all'); setSortBy('scanDate'); setSortOrder('desc'); setCurrentPage(1);
              }}
              className="ap-btn-s"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {error && <div className="ap-err">{error}</div>}

        <div className="ap-card">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sandd)' }}>
            <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>
              Quick Scan Records ({visibleStart}–{visibleEnd} of {totalRecords})
            </span>
          </div>

          {quickScans.length > 0 ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="ap-tbl">
                  <thead>
                    <tr>
                      <th><button className="ap-th-btn" onClick={() => handleSort('url')}>URL <SortArrow field="url" /></button></th>
                      <th><button className="ap-th-btn" onClick={() => handleSort('email')}>Email <SortArrow field="email" /></button></th>
                      <th>Name</th>
                      <th>Score</th>
                      <th><button className="ap-th-btn" onClick={() => handleSort('scanDate')}>Scan Date <SortArrow field="scanDate" /></button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {quickScans.map((scan) => (
                      <tr key={scan._id}>
                        <td>
                          <span style={{ display: 'block', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={scan.url}>
                            {scan.url}
                          </span>
                        </td>
                        <td>{scan.email}</td>
                        <td>{[scan.firstName, scan.lastName].filter(Boolean).join(' ') || 'N/A'}</td>
                        <td>
                          {scan.scanScore !== null && scan.scanScore !== undefined ? (
                            <span style={{ fontWeight: 700, color: scoreColor(scan.scanScore) }}>
                              {Math.round(scan.scanScore)}%
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ink3)' }}>N/A</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(scan.scanDate).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 20px', borderTop: '1px solid var(--sandd)' }}>
                <span style={{ fontSize: '16px', color: 'var(--ink6)' }}>
                  Showing {visibleStart}–{visibleEnd} of {totalRecords} quick scans
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <button type="button" onClick={() => setCurrentPage(1)} disabled={(pagination.page || currentPage) <= 1} className="ap-pg-btn">First</button>
                  <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={(pagination.page || currentPage) <= 1} className="ap-pg-btn">Prev</button>
                  {getPageNumbers().map(pageNumber => (
                    <button
                      type="button"
                      key={pageNumber}
                      onClick={() => setCurrentPage(pageNumber)}
                      className={pageNumber === (pagination.page || currentPage) ? 'ap-pg-btn-active' : 'ap-pg-btn'}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCurrentPage(p => Math.min(pagination.pages || 1, p + 1))} disabled={(pagination.page || currentPage) >= (pagination.pages || 1)} className="ap-pg-btn">Next</button>
                  <button type="button" onClick={() => setCurrentPage(pagination.pages || 1)} disabled={(pagination.page || currentPage) >= (pagination.pages || 1)} className="ap-pg-btn">Last</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ink6)' }}>
              <svg style={{ width: '48px', height: '48px', margin: '0 auto 16px', display: 'block', color: 'var(--ink3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>No quick scans found</p>
              <p style={{ fontSize: '16px' }}>No quick scan records found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminQuickScans;
