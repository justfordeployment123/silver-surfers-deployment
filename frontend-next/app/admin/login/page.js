'use client';

// Ported from frontend/src/pages/AdminLogin.js. Lives outside app/(site)/
// on purpose: the old app renders this with no Header/Footer (it's a
// sibling of the AdminLayout-wrapped routes in App.js's route table, not a
// child of it). Kept as a standalone app/admin/login/page.js for the same
// reason — a future app/admin/layout.js (Phase 3 Group E) must not wrap
// this route in the admin dashboard chrome; use a nested route group for
// the dashboard routes there instead of putting the layout directly on
// app/admin/.
//
// Bug fix while porting: `animate-spin`/`opacity-25`/`opacity-75`
// classNames were undefined in the CRA app too — the spinner never
// actually spun. Defined for real here.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adminLogin } from '../../../lib/apiClient';

const STYLES = `
.al-bg { min-height: 100vh; background: var(--t9); display: flex; align-items: center; justify-content: center; padding: 96px 16px 40px; }
.al-inner { max-width: 440px; width: 100%; }
.al-brand { text-align: center; margin-bottom: 32px; }
.al-icon { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: var(--t4); border-radius: 20px; margin-bottom: 16px; }
.al-card { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); border-radius: var(--r); padding: 32px; }
.al-title { font-family: var(--ffd); font-size: 22px; font-weight: 700; color: #fff; text-align: center; margin-bottom: 24px; }
.al-lbl { display: block; font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.75); margin-bottom: 8px; }
.al-input { width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; color: #fff; font-size: 16px; outline: none; transition: border-color .15s; box-sizing: border-box; }
.al-input::placeholder { color: rgba(255,255,255,0.75); }
.al-input:focus { border-color: var(--t4); }
.al-err { margin-bottom: 20px; padding: 12px 16px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); border-radius: 10px; display: flex; align-items: center; gap: 8px; }
.al-err-txt { font-size: 16px; color: #fca5a5; }
.al-warn { margin-top: 20px; padding: 12px 16px; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); border-radius: 10px; display: flex; gap: 10px; }
.al-warn-t { font-size: 16px; font-weight: 600; color: #fcd34d; margin-bottom: 4px; }
.al-warn-b { font-size: 16px; color: rgba(252,211,77,0.75); }
.al-back { display: block; text-align: center; margin-top: 20px; font-size: 16px; color: rgba(255,255,255,0.75); cursor: pointer; background: none; border: none; }
.al-back:hover { color: rgba(255,255,255,0.85); }
.al-spin { animation: alSpin 0.8s linear infinite; }
@keyframes alSpin { to { transform: rotate(360deg); } }
`;

export default function AdminLogin() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    if (token && userRole === 'admin') router.push('/admin/dashboard');
  }, [router]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const result = await adminLogin(formData.email, formData.password);
      if (result.error) {
        setError(result.error);
      } else {
        localStorage.setItem('token', result.token);
        localStorage.setItem('userRole', 'admin');
        localStorage.setItem('adminUser', JSON.stringify(result.user));
        router.push('/admin/dashboard');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="al-bg">
        <div className="al-inner">
          <div className="al-brand">
            <div className="al-icon">
              <svg width="28" height="28" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 style={{ fontFamily: 'var(--ffd)', fontSize: '28px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Admin Portal</h1>
            <p style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.75)' }}>SilverSurfers Administration</p>
          </div>

          <div className="al-card">
            <h2 className="al-title">Sign In</h2>

            {error && (
              <div className="al-err">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" style={{ color: '#fca5a5', flexShrink: 0 }} aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="al-err-txt">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label htmlFor="al-email" className="al-lbl">Admin Email</label>
                <input id="al-email" type="email" name="email" value={formData.email} onChange={handleChange} className="al-input" placeholder="admin@silversurfers.com" required />
              </div>
              <div>
                <label htmlFor="al-password" className="al-lbl">Password</label>
                <input id="al-password" type="password" name="password" value={formData.password} onChange={handleChange} className="al-input" placeholder="Enter your password" required />
              </div>
              <button type="submit" disabled={loading} className="btn btn-d" style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.65 : 1 }}>
                {loading ? (
                  <>
                    <svg className="al-spin" style={{ width: 18, height: 18, marginRight: 8 }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing In…
                  </>
                ) : 'Sign In to Admin Panel'}
              </button>
            </form>

            <div className="al-warn">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" style={{ color: '#fcd34d', flexShrink: 0, marginTop: 2 }} aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="al-warn-t">Admin Access Only</p>
                <p className="al-warn-b">This portal is restricted to authorized administrators only. All activities are logged and monitored.</p>
              </div>
            </div>
          </div>

          <button onClick={() => router.push('/')} className="al-back" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Main Site
          </button>
        </div>
      </div>
    </>
  );
}
