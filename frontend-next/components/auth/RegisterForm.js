'use client';

// Ported from frontend/src/pages/Register.js. Shared by both app/(site)/register
// and app/(site)/signup — the old app served the same component at /register
// and /signup; here that's two thin page.js files rendering this one
// component, matching the pattern already used for the duplicate legal
// routes (/terms + /terms-of-use, /privacy + /privacy-policy).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJSON } from '../../lib/publicApi';

const getInviteParams = () => {
  if (typeof window === 'undefined') return { inviteToken: null, inviteEmail: null };
  const urlParams = new URLSearchParams(window.location.search);
  return {
    inviteToken: urlParams.get('invite') || localStorage.getItem('pendingInviteToken'),
    inviteEmail: urlParams.get('email') || localStorage.getItem('pendingInviteEmail'),
  };
};

export default function RegisterForm() {
  const router = useRouter();
  const [{ inviteToken, inviteEmail }] = useState(getInviteParams);

  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Pre-fill the invite email once known (avoids an SSR/client value mismatch
  // in useState's initial value — see app/(site)/login/page.js for the same
  // pattern with a fuller explanation).
  useEffect(() => {
    if (inviteEmail) setForm((f) => ({ ...f, email: inviteEmail }));
  }, [inviteEmail]);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); setMessage(null);
    if (!form.email || !form.password) { setError('Email and password required'); return; }
    if (inviteEmail && form.email.toLowerCase() !== inviteEmail.toLowerCase()) {
      setError(`This invitation is for ${inviteEmail}. Please use that email address to create your account.`);
      return;
    }
    setLoading(true);
    try {
      const { ok, data, status } = await fetchJSON('/auth/register', { method: 'POST', body: JSON.stringify(form) });
      if (!ok) throw new Error(data?.error || `Registration failed (status ${status})`);
      if (inviteToken) {
        setMessage('Registration successful. Check your email to verify your account, then you will be redirected to accept your team invitation.');
      } else {
        setMessage('Registration successful. Check your email to verify your account.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    if (inviteToken) {
      router.push(`/login?invite=${inviteToken}&email=${encodeURIComponent(inviteEmail || '')}`);
    } else {
      router.push('/login');
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
        .auth-invite-title { font-size: 16px; font-weight: 600; color: var(--ink); margin-bottom: 4px; }
        .auth-invite-text { font-size: 16px; color: var(--ink6); }
        .auth-link { color: var(--tlink); text-decoration: underline; font-size: 16px; transition: color 0.15s; }
        .auth-link:hover { color: var(--t3); }
        .auth-error { font-size: 16px; color: var(--coral); text-align: center; margin-bottom: 8px; }
        .auth-success-text { font-size: 16px; color: var(--t4); text-align: center; margin-bottom: 8px; }
        .auth-footer { font-size: 16px; color: var(--ink6); text-align: center; margin-top: 10px; }
      `}</style>
      <div className="auth-bg">
        <form onSubmit={handleSubmit} className="auth-card">
          <h1 className="h2" style={{ textAlign: 'center', marginBottom: '24px' }}>Create your account</h1>

          {inviteEmail && (
            <div className="auth-invite">
              <p className="auth-invite-title">Team Invitation</p>
              <p className="auth-invite-text">
                Create an account with <strong>{inviteEmail}</strong> to accept your team invitation.
              </p>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label className="ss-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
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
            <label className="ss-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              className="ss-input"
              autoComplete="new-password"
              required
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-success-text">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-d"
            style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.65 : 1 }}
          >
            {loading ? 'Creating…' : 'Create Account'}
          </button>

          {message && (
            <button
              type="button"
              onClick={handleGoToLogin}
              className="btn btn-o"
              style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}
            >
              Go to Login
            </button>
          )}

          <p className="auth-footer">
            Already have an account?{' '}
            <a
              href={inviteToken ? `/login?invite=${inviteToken}&email=${encodeURIComponent(inviteEmail || '')}` : '/login'}
              className="auth-link"
            >
              Sign in
            </a>
          </p>
        </form>
      </div>
    </>
  );
}
