'use client';

// The interactive core of the old Home.js MainScreen component: the
// quick-scan form, device selector, WCAG selector, subscription-gating,
// and results modal. Everything here is stateful/personalized (reads
// getSubscription(), posts via quickAudit()) so it stays a client island —
// app/page.js renders the surrounding marketing sections as a Server
// Component and mounts this in place of the old form-card block.
import { useEffect, useRef, useState } from 'react';
import { getSubscription, quickAudit } from '../../lib/apiClient';
import WcagStandardSelect from '../WcagStandardSelect';

/* ── Scan results modal ──────────────────────────────────────── */
const ScanResultsModal = ({ result, isVisible, onClose }) => {
  if (!isVisible || !result) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(16,47,69,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--rl)',
        padding: 32,
        maxWidth: 520,
        width: '100%',
        boxShadow: '0 16px 48px rgba(16,47,69,0.18)',
      }}>
        <h3 style={{ fontFamily: 'var(--ffd)', fontSize: 22, color: 'var(--ink)', marginBottom: 20 }}>
          SilverSurfers Score Results
        </h3>

        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: 'var(--ffd)', fontSize: 48, fontWeight: 700,
            color: 'var(--t4)', lineHeight: 1, marginBottom: 10,
          }}>
            {result.score}/100
          </div>
          <p style={{ fontSize: 16, color: 'var(--ink6)', lineHeight: 1.7 }}>{result.summary}</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontFamily: 'var(--ffd)', fontSize: 16, color: 'var(--ink)', marginBottom: 10 }}>
            Recommendations:
          </h4>
          <ul style={{ paddingLeft: 18, color: 'var(--ink6)', fontSize: 16, lineHeight: 1.8 }}>
            {result.recommendations.map((rec, i) => (
              <li key={i} style={{ listStyle: 'disc', marginBottom: 4 }}>{rec}</li>
            ))}
          </ul>
        </div>

        <button
          onClick={onClose}
          className="btn btn-d"
          style={{ width: '100%', justifyContent: 'center', fontSize: 16 }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

/* ── Tiny helpers ──────────────────────────────────────────── */
const Spinner = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    style={{ animation: 'spin 0.8s linear infinite', marginRight: 8 }}>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
  </svg>
);

const DeviceIcon = ({ device }) => {
  const icons = {
    desktop: <svg width="22" height="22" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd"/></svg>,
    tablet:  <svg width="22" height="22" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z"/></svg>,
    mobile:  <svg width="22" height="22" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>,
  };
  return icons[device] || null;
};

export default function QuickScanSection() {
  const [scanData, setScanData] = useState({ websiteUrl: '', email: '', firstName: '', lastName: '' });
  const [wcagConfig, setWcagConfig] = useState({ wcagStandard: 'combined', conformanceLevel: 'AA' });
  const [selectedDevice, setSelectedDevice]   = useState('desktop');
  const [isScanning, setIsScanning]           = useState(false);
  const [error, setError]                     = useState('');
  const [success, setSuccess]                 = useState('');
  const [subscription, setSubscription]       = useState(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [scanResult, setScanResult]           = useState(null);
  const [formHighlighted, setFormHighlighted] = useState(false);

  const hasSubscriptionQuickScanAccess = ['active', 'trialing'].includes(
    String(subscription?.status || '').toLowerCase()
  );

  const formRef = useRef(null);

  const handleInputChange = (e) => setScanData({ ...scanData, [e.target.name]: e.target.value });

  const handleCloseModal = () => {
    setShowResultsModal(false);
    setScanResult(null);
    setScanData({ websiteUrl: '', email: '' });
  };

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    if (isScanning) return;
    setIsScanning(true);
    setError('');
    setSuccess('');
    try {
      let url = scanData.websiteUrl.trim();
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      const res = await quickAudit(scanData.email.trim(), url, scanData.firstName.trim(), scanData.lastName.trim(), selectedDevice, wcagConfig);
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(res?.message || 'Your FREE scan has started! We\'ll email you the results shortly - no subscription required!');
        setScanData({ websiteUrl: '', email: '', firstName: '', lastName: '' });
      }
    } catch (err) {
      console.error('Scan error:', err);
      setError('Unable to start the scan right now. Please try again in a moment.');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const result = await getSubscription();
      if (!mounted) return;
      setSubscription(result?.subscription ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!hasSubscriptionQuickScanAccess && selectedDevice !== 'desktop') setSelectedDevice('desktop');
  }, [hasSubscriptionQuickScanAccess, selectedDevice]);

  // Same ?openScan=1 deep-link behavior as the old app, ported verbatim
  // (raw window.location/history APIs rather than next/navigation's
  // useSearchParams/useRouter) — a Client Component using useSearchParams
  // must be wrapped in a <Suspense> boundary, and that boundary failed to
  // hydrate this subtree in testing (real DOM shown, but no React fiber
  // ever attached — clicks/submits fell through to native browser
  // behavior). Reading location.search directly needs no Suspense boundary
  // at all, sidestepping the bug entirely.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openScan') !== '1') return;
    const timer = setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        setFormHighlighted(true);
        setTimeout(() => setFormHighlighted(false), 3000);
        const url = new URL(window.location);
        url.searchParams.delete('openScan');
        window.history.replaceState({}, '', url);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  /* ── Device button helper ── */
  const DeviceBtn = ({ device, label, locked }) => {
    const active   = selectedDevice === device;
    const disabled = locked && !hasSubscriptionQuickScanAccess;
    return (
      <button
        type="button"
        onClick={() => !disabled && setSelectedDevice(device)}
        disabled={disabled}
        style={{
          padding: '10px 8px',
          borderRadius: 'var(--r)',
          border: active ? '2px solid var(--t4)' : '2px solid rgba(255,255,255,0.2)',
          background: active ? 'rgba(10,168,143,0.25)' : 'rgba(255,255,255,0.06)',
          color: disabled ? 'rgba(255,255,255,0.35)' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 0.15s, background 0.15s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          fontFamily: 'var(--ff)',
        }}
      >
        <DeviceIcon device={device} />
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 16, marginTop: 2, color: disabled ? 'rgba(255,255,255,0.35)' : active ? 'var(--t1)' : 'rgba(255,255,255,0.75)' }}>
          {locked ? (hasSubscriptionQuickScanAccess ? 'Unlocked' : 'Subscription') : 'FREE'}
        </div>
      </button>
    );
  };

  return (
    <>
      <div className={`home-form-card${formHighlighted ? ' highlighted' : ''}`}>

        {success && (
          <div className="alert-success" style={{ marginBottom: 20 }}>{success}</div>
        )}
        {error && (
          <div className="alert-error" style={{ marginBottom: 20 }}>{error}</div>
        )}

        <form ref={formRef} onSubmit={handleScanSubmit} noValidate>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="sr-only" htmlFor="quick-scan-website-url">Website URL</label>
              <input
                id="quick-scan-website-url"
                className="home-input"
                type="url"
                name="websiteUrl"
                placeholder="Enter your website"
                value={scanData.websiteUrl}
                onChange={handleInputChange}
                inputMode="url"
                autoComplete="url"
                required
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="quick-scan-email">Work email address</label>
              <input
                id="quick-scan-email"
                className="home-input"
                type="email"
                name="email"
                placeholder="Work email address"
                value={scanData.email}
                onChange={handleInputChange}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="sr-only" htmlFor="quick-scan-first-name">First name</label>
              <input
                id="quick-scan-first-name"
                className="home-input"
                type="text"
                name="firstName"
                placeholder="First Name"
                value={scanData.firstName}
                onChange={handleInputChange}
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="quick-scan-last-name">Last name</label>
              <input
                id="quick-scan-last-name"
                className="home-input"
                type="text"
                name="lastName"
                placeholder="Last Name"
                value={scanData.lastName}
                onChange={handleInputChange}
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          {/* Device selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 16, fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.75)', letterSpacing: '0.08em',
              textTransform: 'uppercase', marginBottom: 10,
            }}>
              Select Device Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <DeviceBtn device="desktop" label="Desktop" locked={false} />
              <DeviceBtn device="tablet"  label="Tablet"  locked={true}  />
              <DeviceBtn device="mobile"  label="Mobile"  locked={true}  />
            </div>
            <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.75)', textAlign: 'center', marginTop: 8 }}>
              {hasSubscriptionQuickScanAccess
                ? 'Active subscription detected. Tablet and mobile quick scans are unlocked.'
                : <><svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>Tablet and Mobile testing available with <a href="/services" style={{ color: 'var(--t2)', textDecoration: 'underline' }}>paid subscriptions</a></>
              }
            </p>
          </div>

          {/* WCAG standard selector */}
          <div style={{ marginBottom: 20 }}>
            <WcagStandardSelect
              variant="glass-dark"
              wcagStandard={wcagConfig.wcagStandard}
              conformanceLevel={wcagConfig.conformanceLevel}
              onChange={setWcagConfig}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isScanning}
            className="btn btn-p"
            style={{ width: '100%', justifyContent: 'center', fontSize: 16, padding: '14px 22px', opacity: isScanning ? 0.65 : 1 }}
          >
            {isScanning
              ? <><Spinner /> Analyzing…</>
              : 'Get your SilverSurfers Score'
            }
          </button>
        </form>

        {/* Secondary CTA */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a
            href="/subscription"
            className="btn btn-g"
            style={{ display: 'inline-flex', marginBottom: 10 }}
          >
            Get Full Audit Here
          </a>
          <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.75)' }}>
            Tablet and Mobile testing available with{' '}
            <a href="/subscription" style={{ color: 'var(--t2)', textDecoration: 'underline' }}>paid subscriptions</a>
          </p>
        </div>

        <p style={{
          fontSize: 16, color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.65,
          textAlign: 'center', marginTop: 18, fontWeight: 300,
        }}>
          Earn the SilverSurfers Seal of Approval through expert audits that score your site and
          deliver actionable reports to create more delightful digital experiences for older adults.
        </p>
      </div>

      <ScanResultsModal result={scanResult} isVisible={showResultsModal} onClose={handleCloseModal} />
    </>
  );
}
