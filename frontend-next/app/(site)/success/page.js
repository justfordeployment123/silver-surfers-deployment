'use client';

// Ported from frontend/src/pages/Success.js. Reads ?session_id= via
// window.location.search rather than useSearchParams() — see
// app/(site)/login/page.js's comment for why.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmPayment } from '../../../lib/apiClient';

export default function Success() {
  const [status, setStatus] = useState('Confirming your payment…');
  const router = useRouter();
  const ranRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (ranRef.current) return;
      ranRef.current = true;
      const sessionId = new URLSearchParams(window.location.search).get('session_id');
      if (!sessionId) { setStatus('Missing session id.'); return; }
      const res = await confirmPayment(sessionId);
      if (res.error) {
        setStatus(`Error: ${res.error}`);
      } else {
        setStatus('Payment confirmed. Your audit is queued! Redirecting…');
        setTimeout(() => router.push('/'), 2500);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`.success-bg { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--t9); padding: 96px 24px 40px; }`}</style>
      <div className="success-bg">
        <div className="auth-card" style={{ textAlign: 'center', maxWidth: '440px' }}>
          <div style={{ width: '52px', height: '52px', background: 'var(--t05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="26" height="26" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--t4)' }} aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="h2" style={{ marginBottom: '12px' }}>Checkout Success</h1>
          <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>{status}</p>
        </div>
      </div>
    </>
  );
}
