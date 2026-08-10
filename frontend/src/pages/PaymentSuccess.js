import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPayment } from '../api';

const CheckIcon = () => (
  <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--t4)', flexShrink: 0, marginTop: '1px' }} aria-hidden="true">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [purchaseDetails, setPurchaseDetails] = useState(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) { setError('No payment session found.'); setLoading(false); return; }
    confirmOneTimePayment(sessionId);
  }, [searchParams]);

  const confirmOneTimePayment = async (sessionId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'}/payment-success?session_id=${sessionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setPurchaseDetails({
          oneTimeScans: data.oneTimeScans,
          planId: data.purchaseDetails?.planId,
          amount: data.purchaseDetails?.amount,
          date: data.purchaseDetails?.date
        });
        console.log('✅ Payment confirmed, credits granted:', data.oneTimeScans);
      }
    } catch (err) {
      console.error('Payment confirmation error:', err);
      setError('Failed to confirm payment. Please contact support if your credit was not added.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <style>{`.ps-bg { background: var(--t9); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; } .ps-spinner { width: 48px; height: 48px; border: 3px solid rgba(29,158,117,0.2); border-top-color: var(--t4); border-radius: 50%; animation: psSpin 0.8s linear infinite; } @keyframes psSpin { to { transform: rotate(360deg); } }`}</style>
        <div className="ps-bg">
          <div className="auth-card" style={{ textAlign: 'center', maxWidth: '460px' }}>
            <div className="ps-spinner" style={{ margin: '0 auto 20px' }} />
            <h1 className="h2" style={{ marginBottom: '8px' }}>Confirming Payment…</h1>
            <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>Please wait while we process your purchase.</p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <style>{`.ps-bg { background: var(--t9); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }`}</style>
        <div className="ps-bg">
          <div className="auth-card" style={{ textAlign: 'center', maxWidth: '460px' }}>
            <div style={{ width: '56px', height: '56px', background: 'rgba(239,68,68,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="28" height="28" fill="currentColor" viewBox="0 0 20 20" style={{ color: '#ef4444' }} aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="h2" style={{ marginBottom: '12px' }}>Payment Error</h1>
            <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '24px' }}>{error}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => navigate('/services')} className="btn btn-o" style={{ flex: 1, justifyContent: 'center' }}>View Plans</button>
              <button onClick={() => navigate('/contact')} className="btn btn-d" style={{ flex: 1, justifyContent: 'center' }}>Contact Support</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .ps-bg { background: var(--t9); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .ps-card { background: var(--surface); border-radius: var(--rl); padding: 44px; box-shadow: 0 8px 40px rgba(4,46,34,0.15); width: 100%; max-width: 600px; }
        .ps-detail-row { background: var(--surface); border-radius: var(--r); padding: 16px; text-align: center; }
        .ps-detail-num { font-size: 28px; font-weight: 700; color: var(--t4); font-family: var(--ffd); }
        .ps-detail-label { font-size: 16px; color: var(--ink6); margin-bottom: 4px; }
        .ps-next-list { display: flex; flex-direction: column; gap: 10px; }
        .ps-next-item { display: flex; align-items: flex-start; gap: 10px; font-size: 16px; color: var(--ink6); }
        .ps-actions { display: flex; flex-direction: column; gap: 12px; }
        @media (min-width: 480px) { .ps-actions { flex-direction: row; } }
      `}</style>
      <div className="ps-bg">
        <div className="ps-card">

          {/* Success icon + title */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ width: '64px', height: '64px', background: 'var(--t05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="32" height="32" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--t4)' }} aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="h2" style={{ marginBottom: '6px' }}>Payment Successful!</h1>
            <p style={{ fontSize: '16px', color: 'var(--ink6)' }}>Thank you for your purchase</p>
          </div>

          {/* Purchase details */}
          <div style={{ background: 'var(--t05)', borderRadius: 'var(--r)', padding: '20px', marginBottom: '20px', border: '1px solid var(--t1)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--t4)' }} aria-hidden="true">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
              Your One-Time Scan Credit
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: purchaseDetails?.amount ? '1fr 1fr' : '1fr', gap: '12px' }}>
              <div className="ps-detail-row">
                <p className="ps-detail-label">Available Scans</p>
                <p className="ps-detail-num">{purchaseDetails?.oneTimeScans || 0}</p>
              </div>
              {purchaseDetails?.amount && (
                <div className="ps-detail-row">
                  <p className="ps-detail-label">Amount Paid</p>
                  <p className="ps-detail-num" style={{ color: 'var(--ink)' }}>${(purchaseDetails.amount / 100).toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>

          {/* What's next */}
          <div style={{ background: 'var(--sand)', borderRadius: 'var(--r)', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '14px' }}>What's Next?</h2>
            <div className="ps-next-list">
              <div className="ps-next-item"><CheckIcon /><span>Your one-time scan credit has been added to your account</span></div>
              <div className="ps-next-item"><CheckIcon /><span>Click the button below to start your accessibility audit</span></div>
              <div className="ps-next-item"><CheckIcon /><span>You'll receive a comprehensive PDF report via email</span></div>
            </div>
          </div>

          {/* Actions */}
          <div className="ps-actions">
            <button onClick={() => navigate('/checkout')} className="btn btn-p" style={{ flex: 1, justifyContent: 'center' }}>
              Start Your Audit Now
            </button>
            <button onClick={() => navigate('/account')} className="btn btn-o" style={{ flex: 1, justifyContent: 'center' }}>
              View Account
            </button>
          </div>

          <p style={{ textAlign: 'center', fontSize: '16px', color: 'var(--ink6)', marginTop: '20px' }}>
            A confirmation email has been sent to your registered email address.
          </p>
        </div>
      </div>
    </>
  );
};

export default PaymentSuccess;
