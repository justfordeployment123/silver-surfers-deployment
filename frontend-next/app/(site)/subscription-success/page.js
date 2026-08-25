'use client';

// Ported from frontend/src/pages/SubscriptionSuccess.js. Reads ?session_id=
// via window.location.search rather than useSearchParams() — see
// app/(site)/login/page.js's comment for why.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmSubscriptionSuccess, getSubscription } from '../../../lib/apiClient';

const CheckItem = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--t4)', fontSize: '16px' }}>
    <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
    <span>{children}</span>
  </div>
);

export default function SubscriptionSuccess() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (sessionId) {
      confirmSubscription(sessionId);
    } else {
      setError('No session ID found');
      setLoading(false);
    }
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const result = await getSubscription();
      if (result && !result.error) setSubscription(result.subscription);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const confirmSubscription = async (sessionId) => {
    try {
      const result = await confirmSubscriptionSuccess(sessionId);
      if (result.error) setError(result.error); else setSuccess(true);
    } catch (err) {
      setError('Failed to confirm subscription');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <style>{`.ss-bg { background: var(--t9); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 96px 24px 40px; } .ss-spin { width: 40px; height: 40px; border: 3px solid rgba(29,158,117,0.2); border-top-color: var(--t4); border-radius: 50%; animation: ssSpin 0.8s linear infinite; margin: 0 auto 16px; } @keyframes ssSpin { to { transform: rotate(360deg); } }`}</style>
        <div className="ss-bg" style={{ flexDirection: 'column', gap: '12px' }}>
          <div className="ss-spin" />
          <p style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '16px' }}>Confirming your subscription…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .ss-bg { background: var(--t9); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 96px 24px 40px; }
        .ss-card { background: var(--surface); border-radius: var(--rl); padding: 52px 44px; box-shadow: 0 8px 40px rgba(4,46,34,0.15); width: 100%; max-width: 560px; text-align: center; }
        .ss-check-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
      `}</style>
      <div className="ss-bg">
        <div className="ss-card">
          {success ? (
            <>
              <div style={{ marginBottom: '16px', color: 'var(--t4)', display: 'flex', justifyContent: 'center' }}><svg width="52" height="52" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
              <h1 className="h2" style={{ marginBottom: '12px' }}>Welcome to SilverSurfers!</h1>
              <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '28px', lineHeight: '1.6' }}>
                Your subscription has been successfully activated. You can now access all the features of your plan.
              </p>

              <div className="ss-check-list">
                <CheckItem>Subscription activated</CheckItem>
                <CheckItem>Payment processed</CheckItem>
                <CheckItem>Account upgraded</CheckItem>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {!subscriptionLoading && subscription && !subscription.isTeamMember && (
                  <button onClick={() => router.push('/subscription')} className="btn btn-d" style={{ width: '100%', justifyContent: 'center' }}>
                    Manage Subscription
                  </button>
                )}
                {!subscriptionLoading && subscription && subscription.isTeamMember && (
                  <div style={{ padding: '12px 16px', background: 'var(--t05)', border: '1px solid var(--t1)', borderRadius: 'var(--r)' }}>
                    <p style={{ fontSize: '16px', color: 'var(--t7)' }}>
                      You&apos;re using a team plan. Contact the plan owner to manage the subscription.
                    </p>
                  </div>
                )}
                <button onClick={() => router.push('/')} className="btn btn-o" style={{ width: '100%', justifyContent: 'center' }}>
                  Go to Dashboard
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '16px', color: 'var(--coral)', display: 'flex', justifyContent: 'center' }}><svg width="52" height="52" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6m0-6l-6 6m9-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
              <h1 className="h2" style={{ marginBottom: '12px' }}>Subscription Error</h1>
              <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '28px', lineHeight: '1.6' }}>
                {error || 'There was an issue confirming your subscription. Please contact support.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => router.push('/subscription')} className="btn btn-d" style={{ width: '100%', justifyContent: 'center' }}>
                  Try Again
                </button>
                <button onClick={() => router.push('/contact')} className="btn btn-o" style={{ width: '100%', justifyContent: 'center' }}>
                  Contact Support
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
