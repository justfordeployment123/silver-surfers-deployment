import React, { Suspense, useEffect, useRef, useState } from 'react';
import { getSubscription, quickAudit } from '../api';
import WcagStandardSelect from '../components/WcagStandardSelect';

const HeroGlobe = React.lazy(() => import('../components/HeroGlobe'));

/* ── Scan results modal ──────────────────────────────────────── */
const ScanResultsModal = ({ result, isVisible, onClose }) => {
  if (!isVisible || !result) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(4,46,34,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--rl)',
        padding: 32,
        maxWidth: 520,
        width: '100%',
        boxShadow: '0 16px 48px rgba(8,80,65,0.18)',
      }}>
        <h3 style={{ fontFamily: 'var(--ffd)', fontSize: 22, color: 'var(--ink)', marginBottom: 20 }}>
          Senior-Friendly Score Results
        </h3>

        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: 'var(--ffd)', fontSize: 48, fontWeight: 700,
            color: 'var(--t4)', lineHeight: 1, marginBottom: 10,
          }}>
            {result.score}/100
          </div>
          <p style={{ fontSize: 15, color: 'var(--ink6)', lineHeight: 1.7 }}>{result.summary}</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontFamily: 'var(--ffd)', fontSize: 16, color: 'var(--ink)', marginBottom: 10 }}>
            Recommendations:
          </h4>
          <ul style={{ paddingLeft: 18, color: 'var(--ink6)', fontSize: 14, lineHeight: 1.8 }}>
            {result.recommendations.map((rec, i) => (
              <li key={i} style={{ listStyle: 'disc', marginBottom: 4 }}>{rec}</li>
            ))}
          </ul>
        </div>

        <button
          onClick={onClose}
          className="btn btn-d"
          style={{ width: '100%', justifyContent: 'center', fontSize: 15 }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

/* ── Page ────────────────────────────────────────────────────── */
const MainScreen = () => {
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

  const navigateToServices = () => { window.location.href = '/services'; };

  const handleContactClick = () => showEmailFallback('hello@silversurfers.ai');

  const showEmailFallback = (email) => {
    const fallback = document.createElement('div');
    fallback.style.cssText = 'position:fixed;top:16px;right:16px;background:var(--surface);border:1px solid var(--sandd);border-radius:var(--rl);padding:16px;box-shadow:0 8px 32px rgba(8,80,65,0.12);z-index:9999;max-width:320px;font-family:var(--ff)';
    fallback.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <p style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px">Email us directly:</p>
          <p style="font-size:13px;color:var(--t6);font-family:monospace;margin-bottom:6px">${email}</p>
          <p style="font-size:12px;color:var(--ink3);margin-bottom:6px">Click to copy or email us manually</p>
          <button onclick="navigator.clipboard.writeText('${email}')" style="font-size:12px;color:var(--t6);background:none;border:none;cursor:pointer;font-family:var(--ff);padding:0">Copy address</button>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="color:var(--ink3);background:none;border:none;cursor:pointer;font-size:18px;line-height:1;padding:0;flex-shrink:0">&times;</button>
      </div>`;
    document.body.appendChild(fallback);
    setTimeout(() => { if (fallback.parentElement) fallback.remove(); }, 10000);
  };

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
      const res = await quickAudit(scanData.email.trim(), url, scanData.firstName.trim(), scanData.lastName.trim(), selectedDevice);
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(res?.message || '🆓 Your FREE scan has started! We\'ll email you the results shortly - no subscription required!');
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openScan') === '1') {
      setTimeout(() => {
        if (formRef.current) {
          formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          setFormHighlighted(true);
          setTimeout(() => setFormHighlighted(false), 3000);
          const url = new URL(window.location);
          url.searchParams.delete('openScan');
          window.history.replaceState({}, '', url);
        }
      }, 500);
    }
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
          background: active ? 'rgba(29,158,117,0.25)' : 'rgba(255,255,255,0.06)',
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
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11, marginTop: 2, color: disabled ? 'rgba(255,255,255,0.35)' : active ? 'var(--t2)' : 'rgba(255,255,255,0.45)' }}>
          {locked ? (hasSubscriptionQuickScanAccess ? 'Unlocked' : 'Subscription') : 'FREE'}
        </div>
      </button>
    );
  };

  return (
    <>
      <style>{`
        /* ── Hero ──────────────────────────────────────── */
        .home-hero {
          background: var(--t9);
          padding: 120px 0 80px;
          position: relative;
          overflow: hidden;
        }
        .home-glow {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(29,158,117,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .home-glow-1 { width: 680px; height: 680px; top: -200px; right: -100px; }
        .home-glow-2 { width: 420px; height: 420px; bottom: -120px; left: -80px; }

        /* ── Scan form card ────────────────────────────── */
        .home-form-card {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--rl);
          padding: 32px;
          transition: box-shadow 0.4s;
        }
        .home-form-card.highlighted {
          box-shadow: 0 0 0 3px var(--t4), 0 16px 48px rgba(29,158,117,0.2);
        }

        /* ── Form inputs on dark bg ────────────────────── */
        .home-input {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255,255,255,0.92);
          border: 1.5px solid transparent;
          border-radius: var(--r);
          font-size: 15px;
          font-family: var(--ff);
          color: var(--ink);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .home-input::placeholder { color: var(--ink3); }
        .home-input:focus {
          border-color: var(--t4);
          box-shadow: 0 0 0 3px rgba(29,158,117,0.15);
        }

        /* ── How it works (sand section) ──────────────── */
        .home-step-card {
          background: var(--surface);
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          padding: 32px 28px 28px;
          position: relative;
          overflow: hidden;
          transition: box-shadow 0.2s, transform 0.2s;
          text-align: center;
        }
        .home-step-card:hover {
          box-shadow: 0 8px 32px rgba(8,80,65,0.09);
          transform: translateY(-2px);
        }
        .home-step-card-bar {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--t4);
        }
        .home-step-icon {
          width: 64px; height: 64px;
          border-radius: 16px;
          background: var(--t05);
          border: 1px solid var(--t1);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 18px;
        }
        .home-step-icon svg { color: var(--t6); }

        /* ── Hero globe — anchored independently of the text
           column's height, not grid-centered against it ─── */
        .hero-globe-slot {
          position: absolute;
          top: 96px;
          right: 4%;
          width: min(32vw, 420px);
          height: min(32vw, 420px);
          z-index: 2;
        }

        /* ── Responsive ────────────────────────────────── */
        @media (max-width: 1200px) {
          .hero-globe-slot { right: 2%; width: min(30vw, 360px); height: min(30vw, 360px); }
        }
        @media (max-width: 1024px) {
          .hero-globe-slot { display: none; }
        }
        @media (max-width: 768px) {
          .home-hero { padding: 100px 0 60px; }
          .home-metrics-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .home-form-card { padding: 20px; }
          .home-metrics-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div>
        {/* ════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════ */}
        <section className="home-hero">
          <div className="home-glow home-glow-1" />
          <div className="home-glow home-glow-2" />

          <div className="hero-globe-slot">
            <Suspense fallback={null}>
              <HeroGlobe />
            </Suspense>
          </div>

          <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
            {/* Eyebrow */}
            <div className="eyebrow eyebrow--light">Silver Digital Readiness™</div>

            {/* Headline */}
            <h1 className="h1" style={{ color: '#fff', maxWidth: 680, marginBottom: 18 }}>
              Are You Delivering{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--t1)' }}>
                Older Adult Friendly Digital Experiences?
              </em>
            </h1>

            <p className="lead" style={{ color: 'rgba(255,255,255,0.6)', maxWidth: 560, marginBottom: 40 }}>
              <strong style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                Reach 124 million older adults with $8.3 trillion in buying power.
              </strong>{' '}
              Unlock your SilverSurfers Score today.
            </p>

            {/* ── Scan form ── */}
            <div style={{ maxWidth: 660 }}>
              <div className={`home-form-card${formHighlighted ? ' highlighted' : ''}`}>

                {success && (
                  <div className="alert-success" style={{ marginBottom: 20 }}>{success}</div>
                )}
                {error && (
                  <div className="alert-error" style={{ marginBottom: 20 }}>{error}</div>
                )}

                <form ref={formRef} onSubmit={handleScanSubmit} noValidate>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <input
                      className="home-input"
                      type="text"
                      name="websiteUrl"
                      placeholder="Enter your website"
                      value={scanData.websiteUrl}
                      onChange={handleInputChange}
                      inputMode="url"
                      autoComplete="url"
                      required
                    />
                    <input
                      className="home-input"
                      type="email"
                      name="email"
                      placeholder="Work email address"
                      value={scanData.email}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <input
                      className="home-input"
                      type="text"
                      name="firstName"
                      placeholder="First Name"
                      value={scanData.firstName}
                      onChange={handleInputChange}
                      autoComplete="given-name"
                      required
                    />
                    <input
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

                  {/* Device selector */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{
                      display: 'block', fontSize: 12, fontWeight: 600,
                      color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em',
                      textTransform: 'uppercase', marginBottom: 10,
                    }}>
                      Select Device Type
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                      <DeviceBtn device="desktop" label="Desktop" locked={false} />
                      <DeviceBtn device="tablet"  label="Tablet"  locked={true}  />
                      <DeviceBtn device="mobile"  label="Mobile"  locked={true}  />
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', textAlign: 'center', marginTop: 8 }}>
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
                    style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px 22px', opacity: isScanning ? 0.65 : 1 }}
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
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
                    Tablet and Mobile testing available with{' '}
                    <a href="/subscription" style={{ color: 'var(--t2)', textDecoration: 'underline' }}>paid subscriptions</a>
                  </p>
                </div>

                <p style={{
                  fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65,
                  textAlign: 'center', marginTop: 18, fontWeight: 300,
                }}>
                  Earn the SilverSurfers Seal of Approval through expert audits that score your site and
                  deliver actionable reports to create more delightful digital experiences for older adults.
                </p>
              </div>

              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginTop: 24, fontWeight: 300 }}>
                SilverSurfers empowers organizations to create accessible and inclusive digital experiences
                that delight and engage SilverSurfers (adults 50+) as they surf the digital oceans.
              </p>
            </div>

            {/* Stats bar */}
            <div className="stats" style={{ maxWidth: 660 }}>
              <div className="stat"><div className="stat-n">500+</div><div className="stat-l">Websites Audited</div></div>
              <div className="stat"><div className="stat-n">85%</div><div className="stat-l">Improved Accessibility</div></div>
              <div className="stat"><div className="stat-n">$8.3T</div><div className="stat-l">50+ buying power</div></div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            TRUST / CAPABILITIES
        ════════════════════════════════════════════════ */}
        <section className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>What we do</div>
              <h2 className="h2">Creating Delightful &amp; Inclusive Digital Experiences</h2>
              <p className="lead" style={{ maxWidth: 620, margin: '14px auto 0' }}>
                Trusted by businesses to create accessible, easy-to-use websites that welcome users of all ages
              </p>
            </div>

            {/* Metrics */}
            <div className="home-metrics-grid" style={{
              display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
              gap: 24, marginBottom: 56,
            }}>
              {[
                { n: '500+', l: 'Websites Audited' },
                { n: '85%',  l: 'Improved Accessibility' },
                { n: '95%',  l: 'Client Satisfaction' },
                { n: '30s',  l: 'Quick Assessment' },
              ].map(({ n, l }) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--ffd)', fontSize: 'clamp(32px,4vw,48px)', fontWeight: 700, color: 'var(--t4)', lineHeight: 1, marginBottom: 6 }}>{n}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink6)' }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Feature cards */}
            <div className="g3">
              {[
                {
                  tag: 'Analysis',
                  title: 'Accessibility Analysis',
                  body: 'Comprehensive evaluation of your website\'s accessibility for older adults, focusing on readability, navigation, and usability.',
                  icon: (
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                  ),
                },
                {
                  tag: 'Certification',
                  title: 'Seal of Approval',
                  body: 'Earn the SilverSurfers Seal of Approval Badge to display on your website, showing your commitment to inclusive design.',
                  icon: (
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  ),
                },
                {
                  tag: 'Guidance',
                  title: 'Improvement Guide',
                  body: 'Receive detailed, actionable recommendations to enhance your website\'s usability for older adult visitors.',
                  icon: (
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  ),
                },
              ].map(({ tag, title, body, icon }) => (
                <div key={title} className="card">
                  <div className="card-bar" />
                  <div className="tag">{tag}</div>
                  <div className="v-icon" style={{ marginBottom: 14 }}>{icon}</div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            HOW IT WORKS
        ════════════════════════════════════════════════ */}
        <section className="sec-sand">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>How it works</div>
              <h2 className="h2">How SilverSurfers Works</h2>
              <p className="lead" style={{ maxWidth: 580, margin: '14px auto 0' }}>
                Simple 3-step process to make your website older adult friendly and earn your Seal of Approval Badge
              </p>
            </div>

            <div className="g3">
              {/* Step 1 */}
              <div className="home-step-card">
                <div className="home-step-card-bar" />
                <div className="step-num" style={{ margin: '0 auto 18px' }}>1</div>
                <div className="home-step-icon">
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                </div>
                <h3 style={{ marginBottom: 10 }}>Quick Scan</h3>
                <p>Enter your URL to get an instant <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>SilverSurfers Score</strong> and see how accessible and inclusive your website really is.</p>
                <button
                  onClick={navigateToServices}
                  className="btn btn-o"
                  style={{ marginTop: 20 }}
                >
                  Get Full Audit Here
                </button>
              </div>

              {/* Step 2 */}
              <div className="home-step-card">
                <div className="home-step-card-bar" />
                <div className="step-num" style={{ margin: '0 auto 18px' }}>2</div>
                <div className="home-step-icon">
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <h3 style={{ marginBottom: 10 }}>Get Improvements</h3>
                <p>Receive expert guidance that goes beyond industry standards, offering improvements in visual design, navigation, and user experience to enhance accessibility and create more delightful digital experiences for older adults.</p>
              </div>

              {/* Step 3 */}
              <div className="home-step-card">
                <div className="home-step-card-bar" />
                <div className="step-num" style={{ margin: '0 auto 18px' }}>3</div>
                <div className="home-step-icon">
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <h3 style={{ marginBottom: 10 }}>Earn Your Seal</h3>
                <p>Once you meet SilverSurfers standards, earn the SilverSurfers Seal of Approval to proudly display on your website.</p>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <button onClick={navigateToServices} className="btn btn-d">
                Explore Our Services
              </button>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            TESTIMONIAL
        ════════════════════════════════════════════════ */}
        <div className="proof-strip">
          <div className="wrap">
            <div className="proof-g" style={{ gridTemplateColumns: '1fr' }}>
              <div className="proof-item" style={{ padding: '40px 48px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, color: 'var(--t4)', lineHeight: 1, marginBottom: 16, fontFamily: 'Georgia, serif' }}>"</div>
                <blockquote className="proof-q" style={{ fontSize: 18, maxWidth: 680, margin: '0 auto 20px' }}>
                  SilverSurfers helped us create a website that our older customers can actually use. Our conversion rate from senior visitors increased by 40% after implementing their recommendations.
                </blockquote>
                <div className="proof-a" style={{ fontSize: 13 }}>
                  <strong style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600, display: 'block', marginBottom: 2 }}>
                    Maria Rodriguez
                  </strong>
                  Owner, Sunset Health Services
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════════ */}
        <section className="cta-sec">
          {/* subtle glow */}
          <div style={{
            position: 'absolute', width: 600, height: 600, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(29,158,117,0.12) 0%, transparent 70%)',
            top: '-150px', left: '50%', transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }} />
          <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="h2" style={{ color: '#fff', marginBottom: 14 }}>
              Ready to welcome <em style={{ fontStyle: 'italic', color: 'var(--t1)' }}>all generations?</em>
            </h2>
            <p className="lead" style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 560, margin: '0 auto' }}>
              Start your journey to creating an inclusive and delightful digital experience for everyone.
              Get your free assessment and discover how to make your digital assets accessible to users of all ages.
            </p>

            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <button
                onClick={() => document.querySelector('form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="btn btn-p"
              >
                Get the Quick Scan Report
              </button>
              <button onClick={handleContactClick} className="btn btn-g">
                Contact Our Team
              </button>
            </div>

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <a href="/subscription" className="btn btn-o" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)' }}>
                Get Full Audit Here
              </a>
              <p className="cta-note" style={{ marginTop: 12 }}>
                Tablet and Mobile testing available with{' '}
                <a href="/subscription" style={{ color: 'var(--t2)', textDecoration: 'underline' }}>paid subscriptions</a>
              </p>
            </div>
          </div>
        </section>

        <ScanResultsModal result={scanResult} isVisible={showResultsModal} onClose={handleCloseModal} />
      </div>
    </>
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

export default MainScreen;
