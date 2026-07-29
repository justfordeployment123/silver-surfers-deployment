import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE, fetchJSON } from '../config/apiBase';
import { getMe } from '../api';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const inviteToken = urlParams.get('invite') || localStorage.getItem('pendingInviteToken');
  const inviteEmail = urlParams.get('email') || localStorage.getItem('pendingInviteEmail');

  let redirectTo = location.state?.from;
  if (!redirectTo) {
    if (inviteToken) {
      redirectTo = `/team/accept?token=${inviteToken}`;
    } else if (urlParams.get('from') === 'checkout') {
      redirectTo = '/checkout';
    } else {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('lastRoute') : null;
      const isValidRoute = stored &&
        stored.startsWith('/') &&
        !stored.includes('/api') &&
        !stored.includes('undefined') &&
        !stored.includes('/dashboard/') &&
        !['/login', '/signup', '/verify-email', '/resend-verification', '/forgot-password', '/reset-password'].includes(stored);
      redirectTo = isValidRoute ? stored : '/';
    }
  }

  const [form, setForm] = useState({ email: inviteEmail || '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resendStatus, setResendStatus] = useState({ sending: false, message: null, error: null });
  const [googleReady, setGoogleReady] = useState(false);
  const googleDivRef = useRef(null);
  const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token) return;
      const result = await getMe();
      if (!mounted || !result?.user) return;
      navigate(redirectTo, { replace: true });
    })();
    return () => { mounted = false; };
  }, [navigate, redirectTo]);

  useEffect(() => {
    const lastRoute = localStorage.getItem('lastRoute');
    if (lastRoute && (lastRoute.includes('/api') || lastRoute.includes('undefined') || !lastRoute.startsWith('/') || lastRoute.includes('/dashboard/'))) {
      console.warn('Clearing invalid lastRoute:', lastRoute);
      localStorage.removeItem('lastRoute');
    }
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const existing = document.getElementById('google-identity-script');
    if (existing) { initGoogle(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = 'google-identity-script';
    script.onload = () => initGoogle();
    script.onerror = () => setError('Failed to load Google auth');
    document.head.appendChild(script);
  }, [GOOGLE_CLIENT_ID]);

  function initGoogle() {
    if (!window.google || !googleDivRef.current) return;
    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
        ux_mode: 'popup'
      });
      window.google.accounts.id.renderButton(googleDivRef.current, {
        theme: 'outline', size: 'large', width: 320, shape: 'rectangular'
      });
      setGoogleReady(true);
    } catch (e) {
      setError('Google init error');
    }
  }

  async function handleGoogleResponse(resp) {
    if (!resp.credential) { setError('Google auth failed'); return; }
    setLoading(true); setError(null);
    try {
      const { ok, data } = await fetchJSON('/auth/google', { method: 'POST', body: JSON.stringify({ idToken: resp.credential }) });
      if (!ok || !data.token) throw new Error(data?.error || 'Google login failed');
      if (inviteEmail && data.user && data.user.email) {
        if (data.user.email.toLowerCase() !== inviteEmail.toLowerCase()) {
          setError(`This invitation is for ${inviteEmail}. Please log in with that email address.`);
          return;
        }
      }
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('token', data.token);
      try { const payload = JSON.parse(atob(data.token.split('.')[1])); if (payload.role === 'admin') { navigate('/admin', { replace: true }); return; } } catch {}
      navigate(redirectTo, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (name === 'email') {
      if (unverifiedEmail) setUnverifiedEmail(null);
      if (resendStatus.message || resendStatus.error || resendStatus.sending) {
        setResendStatus({ sending: false, message: null, error: null });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (unverifiedEmail) setUnverifiedEmail(null);
    if (resendStatus.message || resendStatus.error || resendStatus.sending) {
      setResendStatus({ sending: false, message: null, error: null });
    }
    if (!form.email || !form.password) { setError('Email and password required'); return; }
    if (inviteEmail && form.email.toLowerCase() !== inviteEmail.toLowerCase()) {
      setError(`This invitation is for ${inviteEmail}. Please use that email address to log in.`);
      return;
    }
    setLoading(true);
    try {
      const { ok, data, status } = await fetchJSON('/auth/login', { method: 'POST', body: JSON.stringify(form) });
      if (status === 403 && (data?.error || '').toLowerCase().includes('not verified')) {
        setUnverifiedEmail(form.email);
        throw new Error('Email not verified');
      }
      if (!ok || !data.token) throw new Error(data?.error || 'Login failed');
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('token', data.token);
      try { const payload = JSON.parse(atob(data.token.split('.')[1])); if (payload.role === 'admin') { navigate('/admin', { replace: true }); return; } } catch {}
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
        .auth-invite {
          margin-bottom: 20px;
          padding: 14px 16px;
          background: var(--t05);
          border-left: 3px solid var(--t4);
          border-radius: var(--r);
        }
        .auth-invite-title { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
        .auth-invite-text { font-size: 13px; color: var(--ink6); }
        .auth-link { color: var(--t4); text-decoration: underline; font-size: 13px; transition: color 0.15s; }
        .auth-link:hover { color: var(--t3); }
        .auth-error { font-size: 13px; color: var(--coral); text-align: center; margin-bottom: 8px; }
        .auth-success-text { font-size: 13px; color: var(--t4); text-align: center; }
        .auth-footer { font-size: 13px; color: var(--ink6); text-align: center; margin-top: 10px; }
        .auth-field { margin-bottom: 16px; }
      `}</style>
      <div className="auth-bg">
        <form onSubmit={handleSubmit} className="auth-card">
          <h2 className="h2" style={{ textAlign: 'center', marginBottom: '24px' }}>Sign in to continue</h2>

          {inviteEmail && (
            <div className="auth-invite">
              <p className="auth-invite-title">Team Invitation</p>
              <p className="auth-invite-text">
                Please log in with <strong>{inviteEmail}</strong> to accept your team invitation.
              </p>
            </div>
          )}

          <div className="auth-field">
            <label className="ss-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@email.com"
              className="ss-input"
              autoComplete="email"
              required
              readOnly={!!inviteEmail}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label className="ss-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              className="ss-input"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          {unverifiedEmail && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink6)', textAlign: 'center', marginBottom: '8px' }}>
                The email <strong>{unverifiedEmail}</strong> is not verified.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setResendStatus({ sending: true, message: null, error: null });
                  try {
                    const r = await fetch(`${API_BASE}/auth/resend-verification`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: unverifiedEmail })
                    });
                    const t = await r.text();
                    let d; try { d = t ? JSON.parse(t) : {}; } catch { d = {}; }
                    if (!r.ok) throw new Error(d.error || 'Failed to resend');
                    setResendStatus({ sending: false, message: 'Verification email sent. Check your inbox.', error: null });
                  } catch (e) {
                    setResendStatus({ sending: false, message: null, error: e.message });
                  }
                }}
                disabled={resendStatus.sending}
                className="btn btn-o"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {resendStatus.sending ? 'Sending…' : 'Resend Verification Email'}
              </button>
              {resendStatus.message && <p className="auth-success-text" style={{ marginTop: '6px' }}>{resendStatus.message}</p>}
              {resendStatus.error && <p className="auth-error" style={{ marginTop: '6px' }}>{resendStatus.error}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-d"
            style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.65 : 1 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          {GOOGLE_CLIENT_ID && (
            <div style={{ marginTop: '12px' }}>
              <div ref={googleDivRef} style={{ display: 'flex', justifyContent: 'center' }} />
              {!googleReady && (
                <p style={{ fontSize: '12px', color: 'var(--ink6)', textAlign: 'center', marginTop: '8px' }}>
                  Loading Google sign-in…
                </p>
              )}
            </div>
          )}

          <p className="auth-footer">
            New here? <a className="auth-link" href="/signup">Create an account</a>
          </p>
          <p className="auth-footer">
            <a className="auth-link" href="/forgot-password">Forgot password?</a>
          </p>
        </form>
      </div>
    </>
  );
}
