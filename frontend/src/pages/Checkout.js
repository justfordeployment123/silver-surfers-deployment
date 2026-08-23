import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, startAudit, precheckUrl, getSubscription } from '../api';
import WcagStandardSelect from '../components/WcagStandardSelect';

const Checkout = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [lockedEmail, setLockedEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('desktop');
  const [wcagConfig, setWcagConfig] = useState({ wcagStandard: 'combined', conformanceLevel: 'AA' });
  const [creditType, setCreditType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [oneTimeScans, setOneTimeScans] = useState(0);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        setSubscriptionLoading(true);
        const [userResult, subscriptionResult] = await Promise.all([getMe(), getSubscription()]);

        if (userResult.user && userResult.user.email) {
          setEmail(userResult.user.email);
          setLockedEmail(userResult.user.email);
        } else {
          const savedEmail = localStorage.getItem('userEmail') || localStorage.getItem('email') || localStorage.getItem('authEmail');
          if (savedEmail) { setEmail(savedEmail); setLockedEmail(savedEmail); }
        }

        if (subscriptionResult.subscription) setSubscription(subscriptionResult.subscription);
        if (subscriptionResult.oneTimeScans !== undefined) setOneTimeScans(subscriptionResult.oneTimeScans);

        const hasSubscriptionScans = subscriptionResult.subscription &&
          subscriptionResult.subscription.status === 'active' &&
          (subscriptionResult.subscription.limits?.scansPerMonth || 0) - (subscriptionResult.subscription.usage?.scansThisMonth || 0) > 0;

        if (hasSubscriptionScans) {
          setCreditType('subscription');
        } else if (subscriptionResult.oneTimeScans > 0) {
          setCreditType('oneTime');
        }
      } catch (error) {
        console.log('Could not load user data:', error);
        const savedEmail = localStorage.getItem('userEmail') || localStorage.getItem('email') || localStorage.getItem('authEmail');
        if (savedEmail) { setEmail(savedEmail); setLockedEmail(savedEmail); }
      } finally {
        setSubscriptionLoading(false);
      }
    };
    loadUserData();
  }, []);

  useEffect(() => {
    const remainingScans = getRemainingScans();
    if (creditType === 'subscription' && remainingScans === 0 && oneTimeScans > 0) {
      setCreditType('oneTime');
    }
  }, [creditType, subscription, oneTimeScans, subscription?.usage?.scansThisMonth, subscription?.limits?.scansPerMonth]);

  const getRemainingScans = () => {
    if (!subscription || !subscription.limits) return 0;
    const maxScans = subscription.limits.scansPerMonth;
    const usedScans = subscription.usage?.scansThisMonth || 0;
    return Math.max(0, maxScans - usedScans);
  };

  const canStartAudit = () => {
    if (!creditType) return false;
    if (creditType === 'oneTime') return oneTimeScans > 0;
    if (creditType === 'subscription') {
      if (!subscription || subscription.status !== 'active') return false;
      return getRemainingScans() > 0;
    }
    return false;
  };

  const hasBothOptions = () => {
    const hasActiveSubscription = subscription && subscription.status === 'active';
    const hasOneTime = oneTimeScans > 0;
    return hasActiveSubscription && hasOneTime;
  };

  const shouldShowDeviceSelection = () => {
    if (creditType === 'oneTime') return true;
    if (creditType === 'subscription') return subscription && subscription.planId === 'starter';
    return false;
  };

  const getUsageStatusColor = () => {
    const remaining = getRemainingScans();
    if (remaining === 0) return 'co-use-danger';
    if (remaining <= 2) return 'co-use-warn';
    return 'co-use-ok';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const auditEmail = lockedEmail || email;

    if (!url || !auditEmail) { setError('Please fill in all fields'); return; }

    if (!creditType) {
      if (subscription && subscription.status === 'active' && getRemainingScans() > 0) {
        setCreditType('subscription');
      } else if (oneTimeScans > 0) {
        setCreditType('oneTime');
      } else {
        setError('You need an active subscription or one-time scan credit to start an audit. Please purchase a plan or one-time scan.');
        return;
      }
    }

    if (creditType === 'subscription' && getRemainingScans() === 0 && oneTimeScans > 0) {
      setCreditType('oneTime');
    }

    if (creditType === 'oneTime' && !selectedDevice) {
      setError('Please select a device type for your one-time scan.'); return;
    }

    if (creditType === 'subscription' && subscription && subscription.planId === 'starter' && !selectedDevice) {
      setError('Please select a device type for your Starter plan scan.'); return;
    }

    if (!canStartAudit()) {
      if (creditType === 'oneTime' && oneTimeScans === 0) {
        setError('You have no one-time scan credits available.');
      } else if (creditType === 'subscription') {
        if (!subscription || subscription.status !== 'active') {
          setError('You need an active subscription to start an audit.');
        } else {
          setError(`You have reached your yearly scan limit (${subscription.limits?.scansPerMonth || 0} scans). Please upgrade your plan or wait for next year.`);
        }
      } else {
        setError('You need an active subscription or one-time scan credit to start an audit. Please purchase a plan or one-time scan.');
      }
      return;
    }

    setLoading(true); setPrecheckLoading(true); setError(''); setSuccess('');

    try {
      setPrecheckLoading(true);
      const precheckResult = await precheckUrl(url);

      if (precheckResult.error || precheckResult.success === false) {
        setError(precheckResult.error || 'URL not reachable. Please check the domain and try again.');
        return;
      }

      setPrecheckLoading(false);
      setSuccess('URL validated successfully! Starting audit...');

      let deviceToUse = null;
      if (creditType === 'oneTime') {
        deviceToUse = selectedDevice;
      } else if (creditType === 'subscription' && subscription && subscription.planId === 'starter') {
        deviceToUse = selectedDevice;
      }

      const auditResult = await startAudit(auditEmail, url, deviceToUse, firstName, lastName, creditType, wcagConfig);

      if (auditResult.error) {
        setError(auditResult.error); setSuccess('');
      } else {
        setSuccess('Audit request submitted successfully! You will receive an email with your comprehensive accessibility report shortly.');
        setUrl('');
      }
    } catch (err) {
      setError('Failed to submit audit request. Please try again.'); setSuccess('');
    } finally {
      setLoading(false); setPrecheckLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .co-page {
          min-height: 100vh;
          background: var(--t9);
          padding: 96px 16px 48px;
        }
        .co-wrap { max-width: 560px; margin: 0 auto; }
        .co-card {
          background: var(--surface);
          border-radius: var(--rl);
          padding: 36px;
          box-shadow: 0 8px 40px rgba(4,46,34,0.15);
        }
        .co-sub-banner {
          background: var(--t05);
          border: 1px solid var(--t1);
          border-radius: var(--r);
          padding: 16px;
          margin-bottom: 20px;
        }
        .co-sub-banner-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        /* .co-sub-banner's background is the fixed pale teal (--t05), which by
           design never flips with theme. --ink/--ink6 DO flip, turning near-
           white in dark mode, so this heading rendered near-white text on a
           near-white card. Pin it to the fixed dark end of the same teal
           scale so it stays readable regardless of theme. */
        .co-sub-banner-header .h3 { color: var(--t9); }
        .co-sub-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 12px; }
        .co-stat-cell { text-align: center; }
        .co-stat-num { font-size: 24px; font-weight: 700; font-family: var(--ffd); color: var(--t9); }
        .co-stat-label { font-size: 16px; color: var(--t8); margin-top: 2px; }
        .co-use-ok { background: var(--t05); color: var(--t4); border-radius: var(--r); padding: 10px 14px; }
        .co-use-warn { background: rgba(245,158,11,0.08); color: var(--amber); border-radius: var(--r); padding: 10px 14px; }
        .co-use-danger { background: rgba(239,68,68,0.08); color: var(--coral); border-radius: var(--r); padding: 10px 14px; }
        .co-use-num.co-use-ok,
        .co-use-num.co-use-warn,
        .co-use-num.co-use-danger { background: none; padding: 0; border-radius: 0; }
        .co-no-sub {
          background: rgba(239,68,68,0.06);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: var(--r);
          padding: 14px;
          margin-bottom: 20px;
        }
        .co-onetime-banner {
          background: var(--sand);
          border: 1px solid var(--sandd);
          border-radius: var(--r);
          padding: 14px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .co-credit-opts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        .co-credit-opt {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px;
          border: 2px solid var(--sandd);
          border-radius: var(--r);
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .co-credit-opt.selected { border-color: var(--t4); background: var(--t05); }
        .co-device-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 20px; }
        .co-device-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 14px 8px;
          border: 2px solid var(--sandd);
          border-radius: var(--r);
          background: var(--surface);
          color: var(--ink6);
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
          font-size: 16px;
          font-weight: 500;
        }
        .co-device-btn.active {
          border-color: var(--t4);
          background: var(--t05);
          color: var(--t4);
        }
        .co-pro-note {
          background: var(--t05);
          border: 1px solid var(--t1);
          border-radius: var(--r);
          padding: 12px 14px;
          margin-bottom: 20px;
          font-size: 16px;
          color: var(--t7);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .co-sku { background: var(--t6); color: #fff; font-size: 16px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
        .co-spin { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: coSpin 0.7s linear infinite; vertical-align: middle; margin-right: 8px; }
        @keyframes coSpin { to { transform: rotate(360deg); } }
        .co-skel { animation: coSkelPulse 1.2s ease-in-out infinite; }
        .co-skel-bar { height: 16px; background: var(--sandd); border-radius: 6px; margin-bottom: 10px; }
        @keyframes coSkelPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      <div className="co-page">
        <div className="co-wrap">

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 className="h1" style={{ color: '#fff', marginBottom: '8px' }}>Start Your Accessibility Audit</h1>
            <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)' }}>Enter your website URL to begin a comprehensive accessibility analysis</p>
          </div>

          <div className="co-card">

            {/* Subscription status */}
            {subscriptionLoading ? (
              <div className="co-skel" style={{ marginBottom: '20px' }}>
                <div className="co-skel-bar" style={{ width: '75%' }} />
                <div className="co-skel-bar" style={{ width: '50%' }} />
              </div>
            ) : subscription && subscription.status === 'active' ? (
              <div className="co-sub-banner">
                <div className="co-sub-banner-header">
                  <h3 className="h3" style={{ margin: 0 }}>Subscription Status</h3>
                  <span className="tag">{subscription.isTeamMember ? 'Team Member' : 'Active'}</span>
                </div>

                <div className="co-sub-stats">
                  <div className="co-stat-cell">
                    <div className="co-stat-num">{subscription.plan?.name || 'Plan'}</div>
                    <div className="co-stat-label">Current Plan</div>
                  </div>
                  <div className="co-stat-cell">
                    <div className={`co-stat-num co-use-num ${getUsageStatusColor()}`}>{getRemainingScans()}</div>
                    <div className="co-stat-label">Scans Remaining</div>
                  </div>
                  <div className="co-stat-cell">
                    <div className="co-stat-num">{subscription.limits?.scansPerMonth || 0}</div>
                    <div className="co-stat-label">Yearly Limit</div>
                  </div>
                </div>

                <div className={`${getUsageStatusColor()}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 500 }}>
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {getRemainingScans() === 0
                    ? 'No scans remaining this year. Upgrade your plan or wait for next year.'
                    : getRemainingScans() <= 2
                    ? `Warning: Only ${getRemainingScans()} scan${getRemainingScans() !== 1 ? 's' : ''} remaining this month.`
                    : `You have ${getRemainingScans()} scan${getRemainingScans() !== 1 ? 's' : ''} remaining this month.`}
                </div>
              </div>
            ) : (
              (!oneTimeScans || oneTimeScans === 0) && (
                <div className="co-no-sub">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--coral)', flexShrink: 0, marginTop: '1px' }} aria-hidden="true">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--coral)', fontSize: '16px' }}>No Active Subscription</div>
                      <div style={{ fontSize: '16px', color: 'var(--ink6)' }}>You need an active subscription to start audits.</div>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* One-time scans */}
            {oneTimeScans > 0 && (
              <div className="co-onetime-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--t4)', flexShrink: 0 }} aria-hidden="true">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--ink)' }}>One-Time Scan Credits</div>
                    <div style={{ fontSize: '16px', color: 'var(--ink6)' }}>You have {oneTimeScans} one-time scan{oneTimeScans !== 1 ? 's' : ''} available</div>
                  </div>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--t4)', fontFamily: 'var(--ffd)' }}>{oneTimeScans}</div>
              </div>
            )}

            {/* Alerts */}
            {error && <div className="alert-error" style={{ marginBottom: '16px' }}><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>{error}</div>}
            {success && <div className="alert-success" style={{ marginBottom: '16px' }}><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>{success}</div>}

            <form onSubmit={handleSubmit}>
              {/* URL */}
              <div style={{ marginBottom: '16px' }}>
                <label className="ss-label" htmlFor="co-url">Website URL</label>
                <input id="co-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourwebsite.com" className="ss-input" required />
              </div>

              {/* Email */}
              <div style={{ marginBottom: '16px' }}>
                <label className="ss-label" htmlFor="co-email">Email Address</label>
                <input
                  type="email"
                  id="co-email"
                  value={lockedEmail || email}
                  onChange={(e) => {
                    if (lockedEmail) { e.currentTarget.value = lockedEmail; setEmail(lockedEmail); return; }
                    setEmail(e.target.value);
                  }}
                  onInput={(e) => {
                    if (lockedEmail && e.currentTarget.value !== lockedEmail) {
                      e.currentTarget.value = lockedEmail; setEmail(lockedEmail);
                    }
                  }}
                  onPaste={(e) => { if (lockedEmail) { e.preventDefault(); setEmail(lockedEmail); } }}
                  placeholder="your@email.com"
                  readOnly={Boolean(lockedEmail)}
                  aria-readonly={Boolean(lockedEmail)}
                  autoComplete={lockedEmail ? 'off' : 'email'}
                  className="ss-input"
                  style={lockedEmail ? { background: 'var(--sand)', cursor: 'not-allowed' } : {}}
                  required
                />
              </div>

              {/* Name fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="ss-label" htmlFor="co-fname">First Name</label>
                  <input type="text" id="co-fname" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" autoComplete="given-name" className="ss-input" required />
                </div>
                <div>
                  <label className="ss-label" htmlFor="co-lname">Last Name</label>
                  <input type="text" id="co-lname" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" autoComplete="family-name" className="ss-input" required />
                </div>
              </div>

              {/* Credit type */}
              {hasBothOptions() && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="ss-label">Select Credit Type to Use</label>
                  <div className="co-credit-opts">
                    <label className={`co-credit-opt${creditType === 'subscription' ? ' selected' : ''}`}>
                      <input type="radio" name="creditType" value="subscription" checked={creditType === 'subscription'} onChange={(e) => setCreditType(e.target.value)} style={{ accentColor: 'var(--t4)', width: '18px', height: '18px', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--ink)' }}>Use Subscription ({subscription.plan?.name || 'Plan'})</div>
                        <div style={{ fontSize: '16px', color: 'var(--ink6)', marginTop: '2px' }}>
                          {getRemainingScans()} scan{getRemainingScans() !== 1 ? 's' : ''} remaining this month
                          {subscription.planId === 'pro' && ' • Tests all devices (Desktop, Tablet, Mobile)'}
                          {subscription.planId === 'starter' && ' • Select one device type per scan'}
                        </div>
                      </div>
                    </label>
                    <label className={`co-credit-opt${creditType === 'oneTime' ? ' selected' : ''}`}>
                      <input type="radio" name="creditType" value="oneTime" checked={creditType === 'oneTime'} onChange={(e) => setCreditType(e.target.value)} style={{ accentColor: 'var(--t4)', width: '18px', height: '18px', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--ink)' }}>Use One-Time Scan Credit</div>
                        <div style={{ fontSize: '16px', color: 'var(--ink6)', marginTop: '2px' }}>
                          {oneTimeScans} credit{oneTimeScans !== 1 ? 's' : ''} available • Select one device type per scan
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Device selection */}
              {shouldShowDeviceSelection() && (
                <div style={{ marginBottom: '16px' }}>
                  <label className="ss-label">Select Device Type</label>
                  <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '10px' }}>
                    {creditType === 'oneTime'
                      ? 'Select which device type to audit for this one-time scan. One-time scans audit one device type per scan.'
                      : 'Your Starter plan allows auditing for one device type per scan.'}
                  </p>
                  <div className="co-device-grid">
                    {[
                      { key: 'desktop', label: 'Desktop', icon: <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" /> },
                      { key: 'tablet', label: 'Tablet', icon: <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" /> },
                      { key: 'mobile', label: 'Mobile', icon: <path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /> },
                    ].map(({ key, label, icon }) => (
                      <button key={key} type="button" onClick={() => setSelectedDevice(key)} className={`co-device-btn${selectedDevice === key ? ' active' : ''}`}>
                        <svg width="28" height="28" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">{icon}</svg>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* WCAG standard selector */}
              <div style={{ marginBottom: '16px' }}>
                <WcagStandardSelect
                  variant="themed"
                  wcagStandard={wcagConfig.wcagStandard}
                  conformanceLevel={wcagConfig.conformanceLevel}
                  onChange={setWcagConfig}
                />
              </div>

              {/* Pro plan info */}
              {creditType === 'subscription' && subscription && subscription.planId === 'pro' && (
                <div className="co-pro-note">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--t4)', flexShrink: 0 }} aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span><strong>Pro Plan:</strong> Your audit will test all devices (Desktop, Tablet, and Mobile)</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !canStartAudit()}
                className="btn btn-d"
                style={{ width: '100%', justifyContent: 'center', opacity: (loading || !canStartAudit()) ? 0.65 : 1, cursor: !canStartAudit() ? 'not-allowed' : 'pointer' }}
              >
                {loading ? (
                  <><span className="co-spin" aria-hidden="true" />{precheckLoading ? 'Validating URL...' : 'Starting Audit...'}</>
                ) : !canStartAudit() ? (
                  (creditType === 'subscription' && getRemainingScans() === 0 && oneTimeScans > 0)
                    ? 'Please Select One-Time Scan Credit'
                    : (getRemainingScans() === 0 && oneTimeScans === 0)
                    ? 'Scan Limit Reached'
                    : 'No Active Subscription'
                ) : (
                  'Start Full Audit'
                )}
              </button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button onClick={() => navigate('/subscription')} className="btn btn-o" style={{ fontSize: '16px' }}>
                ← Back to Subscription
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Checkout;
