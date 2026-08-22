'use client';

// Ported from frontend/src/pages/ResetPassword.js. Reads ?token= via
// window.location.search in a useEffect rather than next/navigation's
// useSearchParams() — see app/(site)/login/page.js's comment for why.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetPassword } from '../../../lib/apiClient';

export default function ResetPassword() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || '');
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(''); setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    const res = await resetPassword(token, password);
    setLoading(false);
    if (res.error) setError(res.error);
    else { setMsg('Password reset successful. Redirecting…'); setTimeout(() => router.push('/'), 1200); }
  };

  return (
    <>
      <style>{`
        .auth-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--t9);
          padding: 96px 16px 40px;
        }
        .auth-link { color: var(--tlink); text-decoration: underline; font-size: 16px; transition: color 0.15s; }
        .auth-link:hover { color: var(--t3); }
        .auth-error { font-size: 16px; color: var(--coral); text-align: center; margin-bottom: 8px; }
        .auth-success-text { font-size: 16px; color: var(--t4); text-align: center; margin-bottom: 8px; }
        .auth-footer { font-size: 16px; color: var(--ink6); text-align: center; margin-top: 10px; }
      `}</style>
      <div className="auth-bg">
        <form onSubmit={onSubmit} className="auth-card">
          <h1 className="h2" style={{ textAlign: 'center', marginBottom: '24px' }}>Reset Password</h1>

          <div style={{ marginBottom: '16px' }}>
            <label className="ss-label" htmlFor="rp-password">New password</label>
            <input
              id="rp-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="ss-input"
              required
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label className="ss-label" htmlFor="rp-confirm">Confirm password</label>
            <input
              id="rp-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="ss-input"
              required
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
          {msg && <p className="auth-success-text">{msg}</p>}

          <button
            type="submit"
            disabled={loading || !token}
            className="btn btn-d"
            style={{ width: '100%', justifyContent: 'center', opacity: (loading || !token) ? 0.6 : 1 }}
          >
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>

          <p className="auth-footer">
            <a href="/login" className="auth-link">Back to login</a>
          </p>
        </form>
      </div>
    </>
  );
}
