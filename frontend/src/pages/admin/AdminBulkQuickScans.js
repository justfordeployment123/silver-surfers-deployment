import React, { useState } from 'react';
import { adminBulkQuickScans } from '../../api';

const STYLES = `
.ap-card { background: #fff; border: 1px solid var(--sandd); border-radius: var(--r); }
.ap-h1 { font-size: 26px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ap-sub { font-size: 14px; color: var(--ink6); }
.ap-lbl { font-size: 13px; font-weight: 500; color: var(--ink6); margin-bottom: 6px; display: block; }
.ap-inp { border: 1px solid var(--sandd); border-radius: 8px; padding: 8px 12px; font-size: 14px; color: var(--ink); background: #fff; outline: none; width: 100%; box-sizing: border-box; }
.ap-inp:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-textarea { border: 1px solid var(--sandd); border-radius: 8px; padding: 10px 12px; font-size: 13px; font-family: monospace; color: var(--ink); background: #fff; outline: none; width: 100%; resize: vertical; box-sizing: border-box; }
.ap-textarea:focus { border-color: var(--t4); box-shadow: 0 0 0 2px rgba(29,158,117,0.1); }
.ap-btn-p { background: var(--t4); color: #fff; padding: 10px 24px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: background .15s; }
.ap-btn-p:hover:not(:disabled) { background: var(--t8); }
.ap-btn-p:disabled { opacity: 0.6; cursor: not-allowed; }
.ap-err { background: #fee2e2; border: 1px solid #fca5a5; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #991b1b; }
.ap-ok { background: #dcfce7; border: 1px solid #86efac; border-radius: var(--r); padding: 12px 16px; font-size: 13px; color: #166534; }
.ap-info { background: var(--t05); border: 1px solid var(--t1); border-radius: var(--r); padding: 16px; font-size: 13px; color: var(--t6); }
.ap-spin { animation: ap-spin-kf 0.7s linear infinite; }
@keyframes ap-spin-kf { to { transform: rotate(360deg); } }
`;

const AdminBulkQuickScans = () => {
  const [urls, setUrls] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [result, setResult] = useState(null);

  const MAX_URLS = 200;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setResult(null);

    const urlList = urls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (urlList.length === 0) {
      setError('Please enter at least one URL.');
      return;
    }

    if (urlList.length > MAX_URLS) {
      setError(`Maximum ${MAX_URLS} URLs allowed per bulk submission. You provided ${urlList.length}.`);
      return;
    }

    const invalidUrls = urlList.filter(url => {
      try {
        new URL(url.startsWith('http') ? url : `https://${url}`);
        return false;
      } catch {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      setError(`Invalid URL format: ${invalidUrls.join(', ')}`);
      return;
    }

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const response = await adminBulkQuickScans({
        urls: urlList,
        email,
        firstName: firstName || 'Admin',
        lastName: lastName || 'User'
      });

      if (response.error) {
        setError(response.error);
      } else {
        setSuccess(response.message || 'Bulk submission processed successfully!');
        setResult(response);
        setUrls('');
        setEmail('');
        setFirstName('');
        setLastName('');
      }
    } catch (err) {
      setError('Failed to submit bulk quick scans. Please try again.');
      console.error('Bulk scan error:', err);
    } finally {
      setLoading(false);
    }
  };

  const urlCount = urls.split('\n').filter(url => url.trim().length > 0).length;

  return (
    <>
      <style>{STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h1 className="ap-h1">Bulk Quick Scans</h1>
          <p className="ap-sub">Submit multiple URLs for quick scan processing (up to {MAX_URLS} URLs)</p>
        </div>

        <div className="ap-info">
          <p style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--t8)' }}>How it works</p>
          <ul style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>Enter one URL per line (up to {MAX_URLS} URLs)</li>
            <li>All scans will be queued and processed serially</li>
            <li>Each scan will send results to the specified email address</li>
            <li>URLs scanned in the last 24 hours will be automatically skipped</li>
          </ul>
        </div>

        <div className="ap-card" style={{ padding: '24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div>
                <label htmlFor="email" className="ap-lbl">
                  Email Address <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@silversurfers.ai"
                  required
                  className="ap-inp"
                />
              </div>
              <div>
                <label htmlFor="firstName" className="ap-lbl">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Admin"
                  className="ap-inp"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="ap-lbl">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="User"
                  className="ap-inp"
                />
              </div>
            </div>

            <div>
              <label htmlFor="urls" className="ap-lbl">
                URLs (one per line) <span style={{ color: '#ef4444' }}>*</span>
                {urlCount > 0 && (
                  <span style={{ marginLeft: '8px', fontWeight: 400, color: 'var(--ink3)' }}>
                    ({urlCount} {urlCount === 1 ? 'URL' : 'URLs'})
                  </span>
                )}
              </label>
              <textarea
                id="urls"
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder={"https://example.com\nhttps://another-site.com\nhttps://third-site.com"}
                rows={12}
                required
                className="ap-textarea"
              />
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ink3)' }}>
                Enter one URL per line. URLs can include or omit the protocol (http:// or https://).
              </p>
            </div>

            {error && <div className="ap-err">{error}</div>}
            {success && <div className="ap-ok">{success}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={loading || urlCount === 0 || !email}
                className="ap-btn-p"
              >
                {loading ? (
                  <>
                    <svg className="ap-spin" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" style={{ opacity: 0.25 }} />
                      <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" style={{ opacity: 0.75 }} fill="currentColor" stroke="none" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Submit Bulk Scan ({urlCount} {urlCount === 1 ? 'URL' : 'URLs'})
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default AdminBulkQuickScans;
