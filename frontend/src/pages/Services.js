import React, { useState, useEffect } from 'react';
import { getSubscriptionPlans, getSubscription, createCheckoutSession } from '../api';

const Services = () => {
  const [plans, setPlans]                         = useState([]);
  const [loading, setLoading]                     = useState(true);
  const [billingCycle, setBillingCycle]           = useState('yearly');
  const [currentSubscription, setCurrentSubscription] = useState(null);

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    try {
      const [plansResult, subscriptionResult] = await Promise.all([
        getSubscriptionPlans(),
        getSubscription().catch(() => ({ error: 'No subscription' })),
      ]);
      if (plansResult.plans) setPlans(plansResult.plans);
      if (subscriptionResult.subscription) setCurrentSubscription(subscriptionResult.subscription);
    } catch (error) {
      console.error('Failed to load plans:', error);
      setPlans(getDefaultPlans());
    } finally {
      setLoading(false);
    }
  };

  const getDefaultPlans = () => [
    {
      id: 'starter', name: 'Starter', icon: '🚀', description: '',
      yearlyPrice: 144000, monthlyPrice: 14000, currency: 'usd',
      limits: { scansPerMonth: 60, maxUsers: 1, features: ['60 reports per year','Select device per report','up to 25 subpages scanned','1 user account','PDF reports','Actionable recommendations','Priority email support'] },
      popular: false,
    },
    {
      id: 'pro', name: 'Pro', icon: '⭐', description: '',
      yearlyPrice: 478800, monthlyPrice: 46000, currency: 'usd',
      limits: { scansPerMonth: 144, maxUsers: 3, features: ['144 reports per year','All devices tested together','up to 25 subpages scanned','3 team users','SilverSurfers Seal','Priority support','Historical tracking','White-label reports','Quarterly consultation'] },
      popular: true,
    },
    {
      id: 'oneTime', name: 'One-Time', icon: '📊', description: 'Perfect for getting started',
      price: 39700, monthlyPrice: null, yearlyPrice: null, currency: 'usd', type: 'one-time',
      limits: { scansPerMonth: 1, maxUsers: 1, features: ['One device tested','up to 25 subpages scanned','Detailed PDF report','Actionable recommendations','17-category analysis','Email support'] },
      popular: false, isOneTime: true,
    },
    {
      id: 'custom', name: 'Custom', icon: '🏆', description: 'Tailored solutions for enterprise-level accessibility needs.',
      monthlyPrice: null, yearlyPrice: null, currency: 'usd',
      limits: { scansPerMonth: -1, maxUsers: -1, features: ['SilverSurfers Score','Unlimited scans','SilverSurfers Seal of Approval','Unlimited team users','Advanced analytics','API access','White labeling options','Dedicated support','Custom integrations'] },
      popular: false, contactSales: true,
    },
  ];

  const formatPrice = (price) => {
    if (!price) return 'Contact us';
    return `$${parseInt((price / 100).toFixed(0)).toLocaleString()}`;
  };

  const getCurrentPrice = (plan) => {
    if (plan.isOneTime || plan.type === 'one-time') return plan.price;
    return billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  };

  const getPriceDisplay = (plan) => {
    if (billingCycle === 'yearly') {
      const perMonth = plan.yearlyPrice / 12;
      return { main: formatPrice(perMonth), suffix: '/month', caption: `billed yearly (${formatPrice(plan.yearlyPrice)}/year)` };
    }
    return { main: formatPrice(plan.monthlyPrice), suffix: '/Month', caption: `(${formatPrice(plan.monthlyPrice * 12)}/year)` };
  };

  const getDisplayFeatures = (plan) => {
    const scanLimit = plan.limits?.scansPerMonth;
    if (plan.isOneTime || plan.type === 'one-time' || plan.contactSales || scanLimit === -1 || scanLimit === undefined)
      return plan.limits.features;
    const effectiveScans = billingCycle === 'monthly' ? Math.floor(scanLimit / 12) : scanLimit;
    const scanLabel = `${effectiveScans} report${effectiveScans === 1 ? '' : 's'} per ${billingCycle === 'monthly' ? 'month' : 'year'}`;
    return [scanLabel, ...plan.limits.features.slice(1)];
  };

  const handleOneTimePurchase = async (planId) => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token) { window.location.href = `/login?redirect=/services&plan=${planId}`; return; }
      const result = await createCheckoutSession(planId, 'monthly');
      if (result.error) { alert(`Error: ${result.error}`); }
      else if (result.url) { window.location.href = result.url; }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start checkout. Please try again.');
    }
  };

  const getPlanButtonInfo = (plan) => {
    const isCurrentPlan      = currentSubscription && currentSubscription.planId === plan.id;
    const hasActiveSubscription = currentSubscription && currentSubscription.status === 'active';
    const isTeamMember       = currentSubscription && currentSubscription.isTeamMember;
    if (plan.contactSales) return { text: 'Contact Sales', link: '/contact', isDisabled: false };
    if (plan.isOneTime || plan.type === 'one-time') {
      const hasOneTimeScans = currentSubscription && currentSubscription.oneTimeScans > 0;
      return { text: hasOneTimeScans ? 'Use One-Time Report' : 'Get Report', link: hasOneTimeScans ? '/checkout' : '/subscription?plan=oneTime&cycle=monthly', isDisabled: false };
    }
    if (isCurrentPlan && hasActiveSubscription) return { text: 'Start Audit', link: '/checkout', isDisabled: false };
    if (hasActiveSubscription && !isCurrentPlan) {
      if (isTeamMember) return { text: 'Contact Owner', link: '/subscription', isDisabled: false };
      return { text: 'Upgrade Plan', link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`, isDisabled: false };
    }
    if (isTeamMember) return { text: 'Contact Owner', link: '/subscription', isDisabled: false };
    return { text: 'Subscribe Now', link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`, isDisabled: false };
  };

  const freeAudit = {
    name: 'Quick Scan Report', icon: '🔍', price: 'Always free',
    description: 'Quick Scan version of the SilverSurfers report – a quick snapshot and your SilverSurfers Score.',
    features: ['SilverSurfers Score (0-100)', 'High-level improvement recommendations', 'Email copy of results'],
    cta: 'Get Quick Scan Report', highlight: 'Start here - No cost',
  };

  /* helper — plan button class */
  const planBtnClass = (plan, isCurrentPlan) => {
    if (plan.contactSales) return 'btn btn-o';
    if (isCurrentPlan)     return 'btn btn-d';
    return 'btn btn-p';
  };

  return (
    <>
      <style>{`
        /* ── Services-specific ─────────────────────────── */
        .svc-hero {
          background: var(--t9);
          padding: 120px 0 80px;
          position: relative;
          overflow: hidden;
        }
        .svc-glow {
          position: absolute; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, rgba(29,158,117,0.16) 0%, transparent 70%);
        }
        .svc-glow-1 { width: 640px; height: 640px; top: -180px; right: -80px; }
        .svc-glow-2 { width: 380px; height: 380px; bottom: -100px; left: -60px; }

        /* ── Free audit highlight card ─────────────────── */
        .free-card {
          background: var(--sand);
          border: 2px solid var(--sandd);
          border-radius: var(--rl);
          padding: 48px;
          position: relative;
          overflow: hidden;
        }
        .free-card h3 { color: var(--ink); }
        .free-card .free-card-label { color: var(--ink); }
        .free-card .free-card-feature { color: var(--ink6); }
        .free-card .free-card-note { color: var(--t6); }
        .free-card-bar {
          position: absolute; top: 0; left: 0; right: 0;
          height: 4px; background: var(--t4);
        }
        .free-card-badge {
          position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
          background: var(--t4); color: #fff;
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 5px 18px; border-radius: 0 0 8px 8px;
          white-space: nowrap;
        }

        /* ── Billing toggle ────────────────────────────── */
        .billing-toggle {
          display: inline-flex;
          background: var(--sand);
          border: 1px solid var(--sandd);
          border-radius: 30px;
          padding: 4px;
          gap: 2px;
        }
        .billing-opt {
          padding: 8px 22px;
          border-radius: 24px;
          font-size: 13px;
          font-weight: 600;
          font-family: var(--ff);
          border: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          color: var(--ink6);
          background: transparent;
        }
        .billing-opt.active {
          background: var(--t8);
          color: #fff;
        }

        /* ── Plan card ─────────────────────────────────── */
        .svc-plan {
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          padding: 28px 24px;
          background: var(--surface);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .svc-plan:hover {
          box-shadow: 0 8px 32px rgba(8,80,65,0.1);
          transform: translateY(-3px);
        }
        .svc-plan-bar {
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px; background: var(--t4);
        }
        .svc-plan.featured {
          border-color: var(--t4);
          background: var(--sand);
        }
        .svc-plan.current-plan {
          border-color: var(--t6);
          background: var(--sand);
        }
        .svc-plan.dark-plan {
          background: var(--t9);
          border-color: var(--t9);
        }
        .svc-plan.dark-plan .svc-plan-bar { background: var(--t4); }

        .svc-plan-pop {
          position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
          font-size: 11px; font-weight: 700; padding: 5px 16px;
          border-radius: 0 0 8px 8px; white-space: nowrap;
        }
        .svc-plan-pop.teal  { background: var(--t4); color: #fff; }
        .svc-plan-pop.green { background: var(--t6); color: #fff; }

        .svc-plan-name {
          font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--ink6); margin-bottom: 6px;
        }
        .dark-plan .svc-plan-name { color: var(--t2); }

        .svc-plan-icon { font-size: 32px; margin-bottom: 8px; }

        .svc-plan-price {
          font-family: var(--ffd); font-size: 34px; font-weight: 700;
          color: var(--ink); line-height: 1; margin-bottom: 2px;
        }
        .dark-plan .svc-plan-price { color: #fff; }

        .svc-plan-price-suffix {
          font-family: var(--ff); font-size: 14px; font-weight: 400; color: var(--ink6);
        }
        .dark-plan .svc-plan-price-suffix { color: rgba(255,255,255,0.45); }

        .svc-plan-caption {
          font-size: 12px; color: var(--ink3); margin-bottom: 16px;
        }
        .dark-plan .svc-plan-caption { color: rgba(255,255,255,0.35); }

        .svc-plan-divider {
          border: none; border-top: 1px solid var(--sandd); margin-bottom: 16px;
        }
        .dark-plan .svc-plan-divider { border-color: rgba(255,255,255,0.1); }

        .svc-plan-desc {
          font-size: 13px; color: var(--ink6); margin-bottom: 14px; line-height: 1.55;
        }
        .dark-plan .svc-plan-desc { color: rgba(255,255,255,0.5); }

        .svc-plan-feature {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13px; color: var(--ink6); line-height: 1.5; margin-bottom: 8px;
        }
        .dark-plan .svc-plan-feature { color: rgba(255,255,255,0.6); }

        .svc-check {
          width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; color: var(--t4);
        }

        /* ── How to choose cards ───────────────────────── */
        .choose-card {
          background: var(--surface);
          border: 1px solid var(--sandd);
          border-radius: var(--rl);
          padding: 28px;
          position: relative; overflow: hidden;
          display: flex; flex-direction: column;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .choose-card:hover {
          box-shadow: 0 8px 32px rgba(8,80,65,0.09);
          transform: translateY(-2px);
        }
        .choose-card-bar {
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px; background: var(--t4);
        }

        /* ── Loading spinner ───────────────────────────── */
        .svc-spinner {
          width: 40px; height: 40px;
          border: 3px solid var(--t1);
          border-top-color: var(--t4);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 48px auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 1024px) {
          .svc-plans-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .svc-plans-grid { grid-template-columns: 1fr !important; }
          .free-card { padding: 32px 20px; }
        }
      `}</style>

      <div>
        {/* ════════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════════ */}
        <section className="svc-hero">
          <div className="svc-glow svc-glow-1" />
          <div className="svc-glow svc-glow-2" />
          <div className="wrap" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>Plans &amp; Pricing</div>
            <h1 className="h1" style={{ color: '#fff', maxWidth: 700, margin: '0 auto 18px' }}>
              Service Packages &amp; Pricing
            </h1>
            <p className="lead" style={{ color: 'rgba(255,255,255,0.6)', maxWidth: 600, margin: '0 auto 32px' }}>
              We help businesses create digital experiences that engage and delight older adults — with expert
              digital experience assessments, actionable enhancements, and certification to showcase your
              commitment to accessibility.
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <a href="/services#quickscan" className="btn btn-p">Start Free</a>
              <a href="/services#fullaudit" className="btn btn-g">View All Plans</a>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            FREE / QUICK SCAN
        ════════════════════════════════════════════════ */}
        <section id="quickscan" className="sec" style={{ scrollMarginTop: 80 }}>
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>Start here</div>
              <h2 className="h2">Start Here — Completely Free</h2>
              <p className="lead" style={{ maxWidth: 520, margin: '12px auto 0' }}>
                Get immediate insights into your current digital experience
              </p>
            </div>

            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              <div className="free-card">
                <div className="free-card-bar" />
                <div className="free-card-badge">{freeAudit.highlight}</div>

                <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 16 }}>
                  <div style={{ marginBottom: 10, color: 'var(--t4)' }}><PlanSvgIcon id="freeAudit" /></div>
                  <h3 className="h3" style={{ marginBottom: 8 }}>{freeAudit.name}</h3>
                  <div style={{ fontFamily: 'var(--ffd)', fontSize: 32, fontWeight: 700, color: 'var(--t4)', marginBottom: 14 }}>
                    {freeAudit.price}
                  </div>
                  <p className="lead" style={{ maxWidth: 480, margin: '0 auto' }}>{freeAudit.description}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center' }}>
                  <div>
                    <p className="free-card-label" style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
                      What you get
                    </p>
                    {freeAudit.features.map((f, i) => (
                      <div key={i} className="svc-plan-feature">
                        <CheckIcon />
                        <span className="free-card-feature" style={{ fontSize: 14 }}>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <a href="/?openScan=1" className="btn btn-d" style={{ display: 'inline-flex', marginBottom: 14 }}>
                      {freeAudit.cta}
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ marginLeft: 6 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                      </svg>
                    </a>
                    <p className="free-card-note" style={{ fontSize: 12, marginBottom: 14 }}>No credit card required</p>
                    <a href="/subscription" className="btn btn-o" style={{ display: 'inline-flex' }}>
                      Get Full Audit Here
                    </a>
                    <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 12 }}>
                      <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>Tablet &amp; Mobile testing available with{' '}
                      <a href="/subscription" style={{ color: 'var(--t6)', textDecoration: 'underline' }}>paid subscriptions</a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            PLANS & PRICING
        ════════════════════════════════════════════════ */}
        <section id="fullaudit" className="sec-sand" style={{ scrollMarginTop: 80 }}>
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>Pricing</div>
              <h2 className="h2">Our Plans &amp; Pricing</h2>
              <p className="lead" style={{ maxWidth: 460, margin: '12px auto 28px' }}>
                Choose the plan that fits your business needs
              </p>

              {/* Billing toggle */}
              <div className="billing-toggle">
                <button
                  type="button"
                  className={`billing-opt${billingCycle === 'yearly' ? ' active' : ''}`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Billed Yearly
                </button>
                <button
                  type="button"
                  className={`billing-opt${billingCycle === 'monthly' ? ' active' : ''}`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Billed Monthly
                </button>
              </div>
            </div>

            {loading ? (
              <div className="svc-spinner" />
            ) : (
              <div className="svc-plans-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, maxWidth: 1100, margin: '0 auto' }}>
                {plans.map((plan) => {
                  const currentPrice  = getCurrentPrice(plan);
                  const priceDisplay  = (!plan.contactSales && !plan.isOneTime && plan.type !== 'one-time') ? getPriceDisplay(plan) : null;
                  const isCurrentPlan = currentSubscription && currentSubscription.planId === plan.id && currentSubscription.status === 'active';
                  const isTeamMember  = currentSubscription && currentSubscription.isTeamMember;
                  const features      = getDisplayFeatures(plan);
                  const buttonInfo    = getPlanButtonInfo(plan);

                  const cardClass = [
                    'svc-plan',
                    plan.contactSales          ? 'dark-plan'    : '',
                    plan.popular && !isCurrentPlan ? 'featured' : '',
                    isCurrentPlan              ? 'current-plan' : '',
                  ].filter(Boolean).join(' ');

                  return (
                    <div id={plan.id} key={plan.id} className={cardClass} style={{ scrollMarginTop: 80 }}>
                      <div className="svc-plan-bar" />

                      {/* Badge */}
                      {isCurrentPlan && (
                        <div className="svc-plan-pop green">{isTeamMember ? 'Team Plan' : 'Your Plan'}</div>
                      )}
                      {!isCurrentPlan && plan.popular && (
                        <div className="svc-plan-pop teal">Most Popular</div>
                      )}

                      {/* Header */}
                      <div style={{ paddingTop: (isCurrentPlan || plan.popular) ? 20 : 4, marginBottom: 14 }}>
                        <div className="svc-plan-icon" style={{ color: 'var(--t4)' }}><PlanSvgIcon id={plan.id} /></div>
                        <div className="svc-plan-name">{plan.name}</div>

                        {plan.contactSales ? (
                          <div className="svc-plan-price" style={{ fontSize: 26 }}>Contact us</div>
                        ) : plan.isOneTime || plan.type === 'one-time' ? (
                          <div className="svc-plan-price">{formatPrice(currentPrice)}</div>
                        ) : (
                          <>
                            <div className="svc-plan-price">
                              {priceDisplay.main}
                              <span className="svc-plan-price-suffix">{priceDisplay.suffix}</span>
                            </div>
                            <div className="svc-plan-caption">{priceDisplay.caption}</div>
                          </>
                        )}
                      </div>

                      <hr className="svc-plan-divider" />

                      {plan.description && (
                        <p className="svc-plan-desc">{plan.description}</p>
                      )}

                      {/* Features */}
                      <div style={{ flex: 1, marginBottom: 20 }}>
                        {features.map((f, i) => (
                          <div key={i} className="svc-plan-feature">
                            <CheckIcon />
                            {f}
                          </div>
                        ))}
                      </div>

                      {/* CTA */}
                      {(() => {
                        const btnClass = planBtnClass(plan, isCurrentPlan);
                        const style    = { width: '100%', justifyContent: 'center', opacity: buttonInfo.isDisabled ? 0.5 : 1 };

                        if (plan.isOneTime || plan.type === 'one-time') {
                          const hasOneTimeScans = currentSubscription && currentSubscription.oneTimeScans > 0;
                          return hasOneTimeScans
                            ? <a href="/start-audit" className={btnClass} style={style}>{buttonInfo.text}</a>
                            : <button onClick={() => handleOneTimePurchase(plan.id)} className={btnClass} style={style}>{buttonInfo.text}</button>;
                        }
                        return <a href={buttonInfo.link} className={btnClass} style={style}>{buttonInfo.text}</a>;
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            HOW TO CHOOSE
        ════════════════════════════════════════════════ */}
        <section className="sec">
          <div className="wrap">
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>Guidance</div>
              <h2 className="h2">How to Choose Your Package</h2>
              <p className="lead" style={{ maxWidth: 460, margin: '12px auto 0' }}>
                Not sure which package is right for you? Here's our guide
              </p>
            </div>

            <div className="g2" style={{ maxWidth: 720, margin: '0 auto' }}>
              {[
                { title: 'Start with a Quick Scan', desc: 'Get a quick snapshot of your digital experience.', cta: 'Get Quick Scan Report', link: '/?openScan=1' },
                (() => {
                  const starterPlan = plans.find(p => p.id === 'starter') || { id: 'starter' };
                  const buttonInfo  = getPlanButtonInfo(starterPlan);
                  return { title: 'SilverSurfers Starter', desc: 'Want a simple analysis? Perfect for small businesses.', cta: buttonInfo.text, link: buttonInfo.link };
                })(),
              ].map((item, i) => (
                <div key={i} className="choose-card">
                  <div className="choose-card-bar" />
                  <h3 className="h3" style={{ marginBottom: 8, marginTop: 4 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--ink6)', lineHeight: 1.65, flex: 1, marginBottom: 20 }}>{item.desc}</p>
                  <a href={item.link} className="btn btn-p" style={{ display: 'inline-flex' }}>{item.cta}</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════════ */}
        <section className="cta-sec">
          <div className="wrap">
            <h2 className="h2" style={{ marginBottom: 14 }}>Ready to Get Started?</h2>
            <p className="lead" style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 520, margin: '0 auto' }}>
              Join the growing community of businesses elevating their digital experience with SilverSurfers.ai
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <a href="/?openScan=1" className="btn btn-p">Get Quick Scan Report</a>
              <a href="/contact"     className="btn btn-g">Contact Us</a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

/* ── Shared icons ────────────────────────────────────────────── */
const CheckIcon = () => (
  <svg className="svc-check" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
  </svg>
);

const PLAN_ICONS = {
  starter: (
    <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
  ),
  pro: (
    <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
    </svg>
  ),
  oneTime: (
    <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
  ),
  custom: (
    <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
    </svg>
  ),
  freeAudit: (
    <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
  ),
};

const PlanSvgIcon = ({ id, size }) => PLAN_ICONS[id] || null;

export default Services;
