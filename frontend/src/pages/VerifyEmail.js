import React, { useEffect, useState } from 'react';
import { verifyEmail, resendVerification } from '../api';
import { useNavigate, useSearchParams } from 'react-router-dom';

const VerifyEmail = () => {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = searchParams.get('redirect') || '/';

  const handleVerify = async (e, overrideToken) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    const useToken = (overrideToken ?? token)?.trim();
    if (!useToken) { setLoading(false); setError('Token required'); return; }
    const res = await verifyEmail(useToken);
    setLoading(false);
    if (res?.error) { setError(res.error); return; }
    navigate(redirect, { replace: true });
  };

  useEffect(() => {
    const qsToken = searchParams.get('token');
    if (qsToken) {
      setToken(qsToken);
      handleVerify(undefined, qsToken);
    }
  }, []);

  const handleResend = async () => {
    if (!email) { setError('Enter your email first'); return; }
    setError(''); setInfo(''); setResendLoading(true);
    const res = await resendVerification(email.trim());
    setResendLoading(false);
    if (res?.error) setError(res.error); else setInfo('Verification email resent.');
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
        .auth-error { font-size: 13px; color: var(--coral); text-align: center; margin-bottom: 8px; }
        .auth-info { font-size: 13px; color: var(--t4); text-align: center; margin-bottom: 8px; }
        .auth-verifying { font-size: 13px; color: var(--ink6); text-align: center; margin-bottom: 12px; }
      `}</style>
      <div className="auth-bg">
        <form onSubmit={handleVerify} className="auth-card">
          <h2 className="h2" style={{ textAlign: 'center', marginBottom: '24px' }}>Verify Email</h2>

          {searchParams.get('token') && loading && (
            <p className="auth-verifying">Verifying your link…</p>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label className="ss-label" htmlFor="ve-token">Verification Token</label>
            <input
              id="ve-token"
              type="text"
              required
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste token"
              className="ss-input"
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label className="ss-label" htmlFor="ve-email">Email (for resend)</label>
            <input
              id="ve-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="ss-input"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
          {info && <p className="auth-info">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-d"
            style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.65 : 1 }}
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>

          <button
            type="button"
            disabled={resendLoading}
            onClick={handleResend}
            className="btn btn-o"
            style={{ width: '100%', justifyContent: 'center', marginTop: '10px', opacity: resendLoading ? 0.65 : 1 }}
          >
            {resendLoading ? 'Resending…' : 'Resend Email'}
          </button>
        </form>
      </div>
    </>
  );
};

export default VerifyEmail;
