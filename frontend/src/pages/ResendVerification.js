import React, { useState } from 'react';
import { resendVerification } from '../api';

const ResendVerification = () => {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(''); setError(''); setLoading(true);
    const res = await resendVerification(email);
    setLoading(false);
    if (res.error) setError(res.error); else setMsg(res.message || 'Verification email sent.');
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
      `}</style>
      <div className="auth-bg">
        <form onSubmit={onSubmit} className="auth-card">
          <h2 className="h2" style={{ textAlign: 'center', marginBottom: '24px' }}>Resend Verification</h2>
          <div style={{ marginBottom: '16px' }}>
            <label className="ss-label" htmlFor="rv-email">Email</label>
            <input
              id="rv-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="ss-input"
              required
            />
          </div>
          {error && <p style={{ fontSize: '13px', color: 'var(--coral)', textAlign: 'center', marginBottom: '8px' }}>{error}</p>}
          {msg && <p style={{ fontSize: '13px', color: 'var(--t4)', textAlign: 'center', marginBottom: '8px' }}>{msg}</p>}
          <button type="submit" disabled={loading} className="btn btn-d" style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.65 : 1 }}>
            {loading ? 'Sending…' : 'Send Email'}
          </button>
          <p style={{ fontSize: '13px', color: 'var(--ink6)', textAlign: 'center', marginTop: '16px' }}>
            <a href="/login" style={{ color: 'var(--t4)', textDecoration: 'none' }}>Back to login</a>
          </p>
        </form>
      </div>
    </>
  );
};

export default ResendVerification;
