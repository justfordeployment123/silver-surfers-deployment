import React, { useState, useEffect } from 'react';

const STYLES = `
.srm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; }
.srm-card { background: var(--surface); border-radius: 24px; max-width: 900px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 32px 80px rgba(0,0,0,0.3); }
.srm-close-bar { position: sticky; top: 0; background: var(--surface); border-radius: 24px 24px 0 0; border-bottom: 1px solid #f3f4f6; padding: 12px 20px; display: flex; justify-content: flex-end; z-index: 10; }
.srm-close-btn { width: 40px; height: 40px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; color: #6b7280; }
.srm-close-btn:hover { background: #e5e7eb; color: #111; }
.srm-body { padding: 24px; display: flex; flex-direction: column; gap: 32px; }
.srm-result-header { text-align: center; background: var(--sandd); border-radius: 16px; padding: 32px; border: 1px solid var(--t1); }
.srm-score-pill { display: inline-flex; align-items: center; padding: 10px 24px; border-radius: 9999px; font-weight: 700; font-size: 15px; }
.srm-score-pill-green { background: var(--t4); color: #fff; }
.srm-score-pill-yellow { background: #f59e0b; color: #fff; }
.srm-score-pill-red { background: var(--coral); color: #fff; }
.srm-section { background: var(--surface); border-radius: 16px; padding: 24px; border: 1px solid #e5e7eb; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.srm-section-icon { color: var(--t4); flex-shrink: 0; }
.srm-rec-item { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: var(--sandd); border-radius: 12px; border: 1px solid var(--t1); }
.srm-rec-num { flex-shrink: 0; width: 24px; height: 24px; background: var(--t4); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 700; }
.srm-cta { background: var(--t9); border-radius: 16px; padding: 32px; color: #fff; }
.srm-email-notice { background: var(--sandd); border-radius: 16px; padding: 24px; border: 1px solid var(--t1); }
.srm-email-icon { flex-shrink: 0; width: 40px; height: 40px; background: var(--t4); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.srm-lead { background: var(--sandd); border-radius: 16px; padding: 32px; border: 1px solid var(--t1); text-align: center; }
.srm-lead-inner { background: var(--surface); border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb; margin-bottom: 24px; }
.srm-spinner { width: 64px; height: 64px; border: 4px solid var(--t1); border-top-color: var(--t4); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;

const ScanResultsModal = ({ result, onClose, isVisible }) => {
  const [scanData, setScanData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isVisible) {
      setError('');
      setLoading(false);
      setScanData(result || null);
    }
  }, [result, isVisible]);

  const getScorePillClass = (score) => {
    if (score >= 80) return 'srm-score-pill srm-score-pill-green';
    if (score >= 60) return 'srm-score-pill srm-score-pill-yellow';
    return 'srm-score-pill srm-score-pill-red';
  };

  const getScoreGradientColors = (score) => {
    if (score >= 80) return { start: '#1D9E75', end: '#0f7a5a' };
    if (score >= 60) return { start: '#f59e0b', end: '#d97706' };
    return { start: '#ef4444', end: '#dc2626' };
  };

  const getScoreTextColor = (score) => {
    if (score >= 80) return 'var(--t4)';
    if (score >= 60) return '#d97706';
    return 'var(--coral)';
  };

  const getScoreMessage = (score) => {
    if (score >= 80) return 'Excellent AI Visibility';
    if (score >= 60) return 'Good AI Visibility';
    if (score >= 40) return 'Room to Improve';
    return 'Significant Room for Improvement';
  };

  const getSummaryText = (score, summary) => {
    if (score >= 80) return `Your website scored ${score} out of 100 on our AI Visibility scale. You're in a great position for AI-driven search, but there may be a few areas to further strengthen your presence. Below are the top findings from our analysis.`;
    if (score >= 60) return `Your website scored ${score} out of 100 on our AI Visibility scale. You're doing well, but there's still room to boost your visibility and become the top answer. Here are the most impactful opportunities we found.`;
    if (score >= 40) return `Your website scored ${score} out of 100 on our AI Visibility scale. There's room to improve your AI findability. Below are the key areas to focus on for better results.`;
    return `Your website scored ${score} out of 100 on our AI Visibility scale. This means there's significant room for improvement. Below are the top findings from our analysis.`;
  };

  if (!isVisible) return null;

  const displayScore = Number.isFinite(Number(scanData?.score)) ? Math.round(Number(scanData.score)) : 0;

  return (
    <>
      <style>{STYLES}</style>
      <div className="srm-overlay">
        <div className="srm-card">
          <div className="srm-close-bar">
            <button onClick={onClose} className="srm-close-btn" aria-label="Close">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '24px' }}>
              <div className="srm-spinner"></div>
              <h2 style={{ fontFamily: 'var(--ffd)', fontSize: '22px', fontWeight: 700, color: 'var(--t9)' }}>Analyzing your website…</h2>
              <p style={{ fontSize: '14px', color: 'var(--ink6)', textAlign: 'center' }}>Our AI is scanning your site for visibility factors</p>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '20px' }}>
              <div style={{ width: '72px', height: '72px', background: 'rgba(239,68,68,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="36" height="36" fill="none" stroke="var(--coral)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 style={{ fontFamily: 'var(--ffd)', fontSize: '22px', fontWeight: 700, color: 'var(--t9)' }}>Oops! Something went wrong</h2>
              <p style={{ fontSize: '14px', color: 'var(--ink6)', textAlign: 'center' }}>{error}</p>
              <button onClick={onClose} className="btn btn-d">Try Another Scan</button>
            </div>
          )}

          {!loading && !error && scanData && (
            <div className="srm-body">
              <div className="srm-result-header">
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ width: '96px', height: '96px', margin: '0 auto 16px', position: 'relative' }}>
                    <svg style={{ width: '96px', height: '96px', transform: 'rotate(-90deg)' }} viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={`url(#srm-grad-${displayScore})`} strokeWidth="2" strokeDasharray={`${displayScore}, 100`} style={{ transition: 'stroke-dasharray 1s ease-out' }} />
                      <defs>
                        <linearGradient id={`srm-grad-${displayScore}`} x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor={getScoreGradientColors(scanData.score).start} />
                          <stop offset="100%" stopColor={getScoreGradientColors(scanData.score).end} />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '22px', fontWeight: 700, color: getScoreTextColor(displayScore) }}>{displayScore}%</span>
                    </div>
                  </div>
                </div>
                <h1 style={{ fontFamily: 'var(--ffd)', fontSize: '28px', fontWeight: 700, color: 'var(--t9)', marginBottom: '12px' }}>
                  AI Findability Score: {displayScore}/100
                </h1>
                <p style={{ fontSize: '16px', color: 'var(--ink6)', marginBottom: '20px' }}>Your site's AI visibility at a glance</p>
                <div className={getScorePillClass(displayScore)}>{getScoreMessage(displayScore)}</div>
              </div>

              <div className="srm-section">
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t9)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg className="srm-section-icon" width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Summary
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--ink6)', lineHeight: 1.7 }}>{getSummaryText(displayScore, scanData.summary)}</p>
              </div>

              <div className="srm-section">
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--t9)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg className="srm-section-icon" width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Key Findings & Opportunities
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(scanData.recommendations || []).slice(0, 5).map((rec, idx) => (
                    <div key={idx} className="srm-rec-item">
                      <div className="srm-rec-num">{idx + 1}</div>
                      <p style={{ fontSize: '14px', color: 'var(--ink6)', lineHeight: 1.6 }}>{rec}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="srm-cta">
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <h3 style={{ fontFamily: 'var(--ffd)', fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Ready to Improve Your Score?</h3>
                  <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)' }}>See our full report and strategy for improving your AI visibility</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
                  <a href="/services" className="btn btn-p" style={{ textDecoration: 'none' }}>Get My Detailed Report</a>
                  <a href="/contact" className="btn btn-g" style={{ textDecoration: 'none' }}>Talk to an Expert</a>
                </div>
              </div>

              <div className="srm-email-notice">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div className="srm-email-icon">
                    <svg width="22" height="22" fill="none" stroke="#fff" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t9)', marginBottom: '6px' }}>Results Sent!</h4>
                    <p style={{ fontSize: '14px', color: 'var(--ink6)', lineHeight: 1.6 }}>
                      A copy of these results has been sent to <strong>{scanData.email}</strong>.
                      Check your inbox for your AI Visibility Score and next steps.
                    </p>
                  </div>
                </div>
              </div>

              <div className="srm-lead">
                <h3 style={{ fontFamily: 'var(--ffd)', fontSize: '22px', fontWeight: 700, color: 'var(--t9)', marginBottom: '12px' }}>
                  Turn Your Score of {scanData.score} into 90+
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--ink6)', marginBottom: '24px', maxWidth: '540px', margin: '0 auto 24px' }}>
                  Our experts can help you improve your AI visibility significantly. Pick a plan below to get started.
                </p>
                <div className="srm-lead-inner">
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <svg width="32" height="32" fill="none" stroke="var(--t4)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600, marginBottom: '16px' }}>
                    Next Step: Get a professional AI Visibility Report for a full diagnosis and custom action plan.
                  </p>
                  <a href="/services" className="btn btn-d" style={{ textDecoration: 'none' }}>
                    Explore Improvement Options
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginLeft: '8px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--ink6)' }}>
                  We only use your URL to perform this one-time analysis. We won't share your data. Unsubscribe anytime.{' '}
                  <a href="/privacy" style={{ color: 'var(--t4)', textDecoration: 'underline' }}>Privacy Policy</a>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ScanResultsModal;
