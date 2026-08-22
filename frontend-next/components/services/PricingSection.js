// Client island: billing toggle + plans grid + "How to Choose" section.
// Ported from the personalized half of frontend/src/pages/Services.js.
//
// This stays client-rendered rather than server-rendered because its core
// content is genuinely personalized per viewer (button text/links change
// based on the viewer's own subscription state), and that state only
// exists via a bearer token in localStorage — invisible to the server
// with no cookie-based auth in this app. Server-rendering a generic/
// anonymous version first would need a second client-side pass to
// personalize anyway, which is what this already does; splitting it
// further wasn't worth the added complexity for this pass.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSubscriptionPlans, getSubscription, createCheckoutSession } from '../../lib/apiClient';
import { CheckIcon, PlanSvgIcon } from './planIcons';

function getDefaultPlans() {
  return [
    {
      id: 'starter', name: 'Starter', icon: '🚀', description: '',
      yearlyPrice: 144000, monthlyPrice: 14000, currency: 'usd',
      limits: { scansPerMonth: 60, maxUsers: 1, features: ['60 reports per year', 'Select device per report', 'up to 25 subpages scanned', '1 user account', 'PDF reports', 'Actionable recommendations', 'Priority email support'] },
      popular: false,
    },
    {
      id: 'pro', name: 'Pro', icon: '⭐', description: '',
      yearlyPrice: 478800, monthlyPrice: 46000, currency: 'usd',
      limits: { scansPerMonth: 144, maxUsers: 3, features: ['144 reports per year', 'All devices tested together', 'up to 25 subpages scanned', '3 team users', 'SilverSurfers Seal', 'Priority support', 'Historical tracking', 'White-label reports', 'Quarterly consultation'] },
      popular: true,
    },
    {
      id: 'oneTime', name: 'One-Time', icon: '📊', description: 'Perfect for getting started',
      price: 39700, monthlyPrice: null, yearlyPrice: null, currency: 'usd', type: 'one-time',
      limits: { scansPerMonth: 1, maxUsers: 1, features: ['One device tested', 'up to 25 subpages scanned', 'Detailed PDF report', 'Actionable recommendations', '17-category analysis', 'Email support'] },
      popular: false, isOneTime: true,
    },
    {
      id: 'custom', name: 'Custom', icon: '🏆', description: 'Tailored solutions for enterprise-level accessibility needs.',
      monthlyPrice: null, yearlyPrice: null, currency: 'usd',
      limits: { scansPerMonth: -1, maxUsers: -1, features: ['SilverSurfers Score', 'Unlimited scans', 'SilverSurfers Seal of Approval', 'Unlimited team users', 'Advanced analytics', 'API access', 'White labeling options', 'Dedicated support', 'Custom integrations'] },
      popular: false, contactSales: true,
    },
  ];
}

const formatPrice = (price) => {
  if (!price) return 'Contact us';
  return `$${parseInt((price / 100).toFixed(0)).toLocaleString()}`;
};

export default function PricingSection() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('yearly');
  const [currentSubscription, setCurrentSubscription] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [plansResult, subscriptionResult] = await Promise.all([
          getSubscriptionPlans(),
          getSubscription().catch(() => ({ error: 'No subscription' })),
        ]);
        if (plansResult.plans) setPlans(plansResult.plans);
        if (subscriptionResult.subscription) setCurrentSubscription(subscriptionResult.subscription);
        if (!plansResult.plans) setPlans(getDefaultPlans());
      } catch (error) {
        console.error('Failed to load plans:', error);
        setPlans(getDefaultPlans());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    const isCurrentPlan = currentSubscription && currentSubscription.planId === plan.id;
    const hasActiveSubscription = currentSubscription && currentSubscription.status === 'active';
    const isTeamMember = currentSubscription && currentSubscription.isTeamMember;
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

  const planBtnClass = (plan, isCurrentPlan) => {
    if (plan.contactSales) return 'btn btn-o';
    if (isCurrentPlan) return 'btn btn-d';
    return 'btn btn-p';
  };

  return (
    <>
      {/* ══════════════════════════════════════════════
          PLANS & PRICING
      ══════════════════════════════════════════════ */}
      <section id="fullaudit" className="sec-sand" style={{ scrollMarginTop: 80 }}>
        <div className="wrap">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Pricing</div>
            <h2 className="h2">Our Plans &amp; Pricing</h2>
            <p className="lead" style={{ maxWidth: 460, margin: '12px auto 28px' }}>
              Choose the plan that fits your business needs
            </p>

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
                const currentPrice = getCurrentPrice(plan);
                const priceDisplay = (!plan.contactSales && !plan.isOneTime && plan.type !== 'one-time') ? getPriceDisplay(plan) : null;
                const isCurrentPlan = currentSubscription && currentSubscription.planId === plan.id && currentSubscription.status === 'active';
                const isTeamMember = currentSubscription && currentSubscription.isTeamMember;
                const features = getDisplayFeatures(plan);
                const buttonInfo = getPlanButtonInfo(plan);

                const cardClass = [
                  'svc-plan',
                  plan.contactSales ? 'dark-plan' : '',
                  plan.popular && !isCurrentPlan ? 'featured' : '',
                  isCurrentPlan ? 'current-plan' : '',
                ].filter(Boolean).join(' ');

                return (
                  <div id={plan.id} key={plan.id} className={cardClass} style={{ scrollMarginTop: 80 }}>
                    <div className="svc-plan-bar" />

                    {isCurrentPlan && (
                      <div className="svc-plan-pop green">{isTeamMember ? 'Team Plan' : 'Your Plan'}</div>
                    )}
                    {!isCurrentPlan && plan.popular && (
                      <div className="svc-plan-pop teal">Most Popular</div>
                    )}

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

                    <div style={{ flex: 1, marginBottom: 20 }}>
                      {features.map((f, i) => (
                        <div key={i} className="svc-plan-feature">
                          <CheckIcon />
                          {f}
                        </div>
                      ))}
                    </div>

                    {(() => {
                      const btnClass = planBtnClass(plan, isCurrentPlan);
                      const style = { width: '100%', justifyContent: 'center', opacity: buttonInfo.isDisabled ? 0.5 : 1 };

                      if (plan.isOneTime || plan.type === 'one-time') {
                        const hasOneTimeScans = currentSubscription && currentSubscription.oneTimeScans > 0;
                        return hasOneTimeScans
                          ? <Link href="/start-audit" className={btnClass} style={style}>{buttonInfo.text}</Link>
                          : <button type="button" onClick={() => handleOneTimePurchase(plan.id)} className={btnClass} style={style}>{buttonInfo.text}</button>;
                      }
                      return <Link href={buttonInfo.link} className={btnClass} style={style}>{buttonInfo.text}</Link>;
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          HOW TO CHOOSE
      ══════════════════════════════════════════════ */}
      <section className="sec">
        <div className="wrap">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Guidance</div>
            <h2 className="h2">How to Choose Your Package</h2>
            <p className="lead" style={{ maxWidth: 460, margin: '12px auto 0' }}>
              Not sure which package is right for you? Here&rsquo;s our guide
            </p>
          </div>

          <div className="g2" style={{ maxWidth: 720, margin: '0 auto' }}>
            {[
              { title: 'Start with a Quick Scan', desc: 'Get a quick snapshot of your digital experience.', cta: 'Get Quick Scan Report', link: '/?openScan=1' },
              (() => {
                const starterPlan = plans.find((p) => p.id === 'starter') || { id: 'starter' };
                const buttonInfo = getPlanButtonInfo(starterPlan);
                return { title: 'SilverSurfers Starter', desc: 'Want a simple analysis? Perfect for small businesses.', cta: buttonInfo.text, link: buttonInfo.link };
              })(),
            ].map((item, i) => (
              <div key={i} className="choose-card">
                <div className="choose-card-bar" />
                <h3 className="h3" style={{ marginBottom: 8, marginTop: 4 }}>{item.title}</h3>
                <p style={{ fontSize: 16, color: 'var(--ink6)', lineHeight: 1.65, flex: 1, marginBottom: 20 }}>{item.desc}</p>
                <Link href={item.link} className="btn btn-p" style={{ display: 'inline-flex' }}>{item.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
