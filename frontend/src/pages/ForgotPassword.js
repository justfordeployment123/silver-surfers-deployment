import React, { useState } from 'react';
import { forgotPassword } from '../api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(''); setError(''); setLoading(true);
    const res = await forgotPassword(email);
    setLoading(false);
    if (res.error) setError(res.error);
    else setMsg(res.message || 'Password reset email sent (if account exists).');
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
          <h1 className="h2" style={{ textAlign: 'center', marginBottom: '24px' }}>Forgot Password</h1>

          <div style={{ marginBottom: '20px' }}>
            <label className="ss-label" htmlFor="fp-email">Email</label>
            <input
              id="fp-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="ss-input"
              required
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
          {msg && <p className="auth-success-text">{msg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-d"
            style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.65 : 1 }}
          >
            {loading ? 'Sending…' : 'Send Reset Email'}
          </button>

          <p className="auth-footer">
            <a href="/login" className="auth-link">Back to login</a>
          </p>
        </form>
      </div>
    </>
  );
};

export default ForgotPassword;
