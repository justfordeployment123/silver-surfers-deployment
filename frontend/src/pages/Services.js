import React, { useState, useEffect } from 'react';
import { getSubscriptionPlans, getSubscription, createCheckoutSession } from '../api';

const Services = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('yearly');
  const [currentSubscription, setCurrentSubscription] = useState(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const [plansResult, subscriptionResult] = await Promise.all([
        getSubscriptionPlans(),
        getSubscription().catch(() => ({ error: 'No subscription' })) // Don't fail if no subscription
      ]);
      
      if (plansResult.plans) {
        setPlans(plansResult.plans);
      }
      
      if (subscriptionResult.subscription) {
        setCurrentSubscription(subscriptionResult.subscription);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
      // Fallback to default plans if API fails
      setPlans(getDefaultPlans());
    } finally {
      setLoading(false);
    }
  };

  const getDefaultPlans = () => [
    {
      id: 'starter',
      name: "Starter",
      icon: "🚀",
      description: "",
      yearlyPrice: 144000, // $120/month billed yearly ($1,440/year)
      monthlyPrice: 14000, // $140/month billed monthly ($1,680/year)
      currency: 'usd',
      limits: {
        scansPerMonth: 60, // 60 scans per year
        maxUsers: 1,
        features: [
          "60 reports per year",
          "Select device per report",
          "up to 25 subpages scanned",
          "1 user account",
          "PDF reports",
          "Actionable recommendations",
          "Priority email support"
        ]
      },
      gradient: "from-blue-500 to-green-500",
      popular: false
    },
    {
      id: 'pro',
      name: "Pro",
      icon: "⭐",
      description: "",
      yearlyPrice: 478800, // $399/month billed annually ($4,788/year)
      monthlyPrice: 46000, // $460/month billed monthly ($5,520/year)
      currency: 'usd',
      limits: {
        scansPerMonth: 144, // 144 scans per year
        maxUsers: 3,
        features: [
          "144 reports per year",
          "All devices tested together",
          "up to 25 subpages scanned",
          "3 team users",
          "SilverSurfers Seal",
          "Priority support",
          "Historical tracking",
          "White-label reports",
          "Quarterly consultation"
        ]
      },
      gradient: "from-green-500 to-teal-500",
      popular: true
    },
    {
      id: 'oneTime',
      name: "One-Time",
      icon: "📊",
      description: "Perfect for getting started",
      price: 39700,
      monthlyPrice: null,
      yearlyPrice: null,
      currency: 'usd',
      type: 'one-time',
      limits: {
        scansPerMonth: 1,
        maxUsers: 1,
        features: [
          "One device tested",
          "up to 25 subpages scanned",
          "Detailed PDF report",
          "Actionable recommendations",
          "17-category analysis",
          "Email support"
        ]
      },
      gradient: "from-orange-500 to-red-500",
      popular: false,
      isOneTime: true
    },
    {
      id: 'custom',
      name: "Custom",
      icon: "🏆",
      description: "Tailored solutions for enterprise-level accessibility needs.",
      monthlyPrice: null,
      yearlyPrice: null,
      currency: 'usd',
      limits: {
        scansPerMonth: -1,
        maxUsers: -1,
        features: [
          "SilverSurfers Score",
          "Unlimited scans",
          "SilverSurfers Seal of Approval",
          "Unlimited team users",
          "Advanced analytics",
          "API access",
          "White labeling options",
          "Dedicated support",
          "Custom integrations"
        ]
      },
      gradient: "from-purple-500 to-blue-500",
      popular: false,
      contactSales: true
    }
  ];

  const formatPrice = (price) => {
    if (!price) return 'Contact us';
    const amount = (price / 100).toFixed(0);
    return `$${parseInt(amount).toLocaleString()}`;
  };

  const getCurrentPrice = (plan) => {
    if (plan.isOneTime || plan.type === 'one-time') {
      return plan.price;
    }
    return billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  };

  // Returns { main, suffix, caption } for subscription plan pricing based on the selected billing cycle.
  const getPriceDisplay = (plan) => {
    if (billingCycle === 'yearly') {
      const perMonth = plan.yearlyPrice / 12;
      return {
        main: formatPrice(perMonth),
        suffix: '/month',
        caption: `billed yearly (${formatPrice(plan.yearlyPrice)}/year)`,
      };
    }
    return {
      main: formatPrice(plan.monthlyPrice),
      suffix: '/Month',
      caption: `(${formatPrice(plan.monthlyPrice * 12)}/year)`,
    };
  };

  // Starter/Pro plans list their scan allotment as the first feature; recompute it for the selected cycle.
  const getDisplayFeatures = (plan) => {
    const scanLimit = plan.limits?.scansPerMonth;
    if (plan.isOneTime || plan.type === 'one-time' || plan.contactSales || scanLimit === -1 || scanLimit === undefined) {
      return plan.limits.features;
    }

    const effectiveScans = billingCycle === 'monthly' ? Math.floor(scanLimit / 12) : scanLimit;
    const scanLabel = `${effectiveScans} report${effectiveScans === 1 ? '' : 's'} per ${billingCycle === 'monthly' ? 'month' : 'year'}`;
    return [scanLabel, ...plan.limits.features.slice(1)];
  };

  const handleOneTimePurchase = async (planId) => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (!token) {
        // Redirect to login if not authenticated
        window.location.href = `/login?redirect=/services&plan=${planId}`;
        return;
      }

      const result = await createCheckoutSession(planId, 'monthly'); // billing cycle doesn't matter for one-time
      if (result.error) {
        alert(`Error: ${result.error}`);
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      alert('Failed to start checkout. Please try again.');
    }
  };

  const getPlanButtonInfo = (plan) => {
    const isCurrentPlan = currentSubscription && currentSubscription.planId === plan.id;
    const hasActiveSubscription = currentSubscription && currentSubscription.status === 'active';
    const isTeamMember = currentSubscription && currentSubscription.isTeamMember;

    if (plan.contactSales) {
      return {
        text: 'Contact Sales',
        link: '/contact',
        isDisabled: false
      };
    }

    // Handle one-time purchases - if user has scans, go to /checkout, else Stripe checkout
    if (plan.isOneTime || plan.type === 'one-time') {
      const hasOneTimeScans = currentSubscription && currentSubscription.oneTimeScans > 0;
      return {
        text: hasOneTimeScans ? 'Use One-Time Report' : 'Get Report',
        link: hasOneTimeScans ? '/checkout' : '/stripe-checkout',
        isDisabled: false
      };
    }

    if (isCurrentPlan && hasActiveSubscription) {
      return {
        text: 'Start Audit',
        link: '/checkout',
        isDisabled: false
      };
    }

    if (hasActiveSubscription && !isCurrentPlan) {
      if (isTeamMember) {
        return {
          text: 'Contact Owner',
          link: '/subscription',
          isDisabled: false
        };
      }

      return {
        text: 'Upgrade Plan',
        link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`,
        isDisabled: false
      };
    }

    if (isTeamMember) {
      return {
        text: 'Contact Owner',
        link: '/subscription',
        isDisabled: false
      };
    }

    return {
      text: 'Subscribe Now',
      link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`,
      isDisabled: false
    };
  };

  const freeAudit = {
    name: "Quick Scan Report",
    icon: "🔍",
    price: "Always free",
    description: "Quick Scan version of the SilverSurfers report – a quick snapshot and your SilverSurfers Score.",
    features: [
      "SilverSurfers Score (0-100)",
      "High-level improvement recommendations",
      "Email copy of results"
    ],
    cta: "Get Quick Scan Report",
    highlight: "Start here - No cost",
    gradient: "from-green-500 to-teal-500"
  };


  return (
    <div className="min-h-screen relative">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950 via-green-950 via-teal-950 to-cyan-900">
          <div className="absolute inset-0 bg-gradient-to-tl from-green-600/15 via-transparent to-blue-600/8"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,197,94,0.12),transparent_50%)] opacity-60"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.12),transparent_50%)] opacity-60"></div>
        </div>

        {/* Animated geometric shapes */}
        <div className="absolute top-20 left-10 w-48 h-48 bg-gradient-to-br from-blue-500/15 to-green-600/25 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-56 h-56 bg-gradient-to-br from-teal-400/20 to-cyan-600/15 rounded-full blur-3xl animate-pulse delay-700"></div>
        <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-gradient-to-br from-green-400/12 to-blue-500/18 rounded-full blur-2xl animate-pulse delay-1400"></div>
        <div className="absolute top-3/4 right-1/4 w-32 h-32 bg-gradient-to-br from-teal-400/10 to-blue-500/15 rounded-full blur-xl animate-pulse delay-2100"></div>

        {/* Hero content */}
        <div className="relative z-10 flex items-center justify-center py-20 px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32">
          <div className="max-w-4xl mx-auto text-center">
            <div className="mb-12">
              <h1 className="heading-hero text-white mb-6">
                <span className="block bg-gradient-to-r from-blue-300 via-green-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent leading-tight" style={{lineHeight: '1.2', paddingBottom: '0.1em'}}>
                  Service Packages & Pricing
                </span>
              </h1>
              
              <h2 className="text-xl sm:text-2xl text-gray-200 font-light leading-relaxed max-w-4xl mx-auto">
                We help businesses create digital experiences that engage and delight older adults — with expert digital experience assessments, actionable enhancements, and certification to showcase your commitment to accessibility.
              </h2>
            </div>
          </div>
        </div>
      </div>

      {/* Free Audit Section */}
      <section id="quickscan" className="py-20 bg-white scroll-mt-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">Start Here - Completely Free</h2>
            <p className="text-xl text-gray-600 leading-relaxed">Get immediate insights into your current digital experience</p>
          </div>
          
          <div className="relative bg-gradient-to-br from-blue-50 to-green-50 rounded-3xl p-8 lg:p-12 border-2 border-blue-200 shadow-xl">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
              <span className="bg-gradient-to-r from-blue-600 to-green-500 text-white px-6 py-2 rounded-full text-sm font-medium">
                {freeAudit.highlight}
              </span>
            </div>
            
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">{freeAudit.icon}</div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3">{freeAudit.name}</h3>
              <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-green-500 bg-clip-text text-transparent mb-6">
                {freeAudit.price}
              </div>
              <p className="text-gray-700 mb-8 text-lg leading-relaxed">{freeAudit.description}</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h4 className="text-xl font-semibold text-gray-900 mb-6">What you get:</h4>
                <ul className="space-y-4">
                  {freeAudit.features.map((feature, index) => (
                    <li key={index} className="flex items-start text-gray-700 text-lg leading-relaxed">
                      <svg className="w-6 h-6 text-green-500 mr-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="text-center">
                <a href="/?openScan=1" className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-500 via-green-600 to-teal-500 hover:from-blue-600 hover:via-blue-700 hover:to-green-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 text-lg">
                  {freeAudit.cta}
                  <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </a>
                <p className="text-lg text-gray-500 mt-4 leading-relaxed">No credit card required</p>
                
                {/* Get Full Audit Button */}
                <a href="/subscription" className="inline-block mt-4 px-6 py-3 bg-white border-2 border-blue-500 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-300">
                  Get Full Audit Here
                </a>
                
                {/* Additional note */}
                <p className="text-sm text-gray-600 mt-6 leading-relaxed">
                  🎁 Tablet and Mobile testing available with{' '}
                  <a href="/subscription" className="text-blue-600 hover:text-blue-700 font-medium underline">
                    paid subscriptions
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Packages */}
      <section id="fullaudit" className="py-20 bg-gradient-to-br from-gray-50 to-green-50/30 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Our Plans & Pricing</h2>
            <p className="text-xl text-gray-600 mb-8">Choose the plan that fits your business needs</p>

            <div className="inline-flex items-center bg-white border-2 border-gray-200 rounded-full p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                  billingCycle === 'yearly' ? 'bg-gradient-to-r from-blue-500 to-green-500 text-white shadow' : 'text-gray-600'
                }`}
              >
                Billed Yearly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                  billingCycle === 'monthly' ? 'bg-gradient-to-r from-blue-500 to-green-500 text-white shadow' : 'text-gray-600'
                }`}
              >
                Billed Monthly
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {plans.map((plan) => {
                const currentPrice = getCurrentPrice(plan);
                const priceDisplay = plan.contactSales || plan.isOneTime || plan.type === 'one-time' ? null : getPriceDisplay(plan);
                const isCurrentPlan = currentSubscription && currentSubscription.planId === plan.id && currentSubscription.status === 'active';
                const isTeamMember = currentSubscription && currentSubscription.isTeamMember;
                
                return (
                  <div id={plan.id} key={plan.id} className={`relative bg-white rounded-3xl p-8 shadow-xl border-2 transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 flex flex-col h-full scroll-mt-20 ${
                    isCurrentPlan ? 'border-green-500 scale-105 bg-green-50' : 
                    plan.popular ? 'border-blue-500 scale-105' : 'border-gray-200'
                  }`}>
                    {isCurrentPlan && (
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <span className="bg-green-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                          {isTeamMember ? 'Team Plan' : 'Your Plan'}
                        </span>
                      </div>
                    )}
                    {!isCurrentPlan && plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                          Most Popular
                    </span>
                  </div>
                )}
                
                    <div className="flex-grow flex flex-col">
                <div className="text-center mb-6">
                        <div className="text-5xl mb-4">{plan.icon}</div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-4">{plan.name}</h3>
                  
                        {plan.contactSales ? (
                          <div className="text-3xl font-bold text-gray-900 mb-2">Contact us</div>
                  ) : plan.isOneTime || plan.type === 'one-time' ? (
                    <div className="mb-2">
                            {/* One-Time Price - no "per year" text */}
                            <div className={`text-3xl font-bold bg-gradient-to-r ${plan.gradient} bg-clip-text text-transparent`}>
                              {formatPrice(currentPrice)}
                            </div>
                    </div>
                  ) : (
                    <div className="mb-2">
                            {/* Current Price */}
                            <div className={`text-3xl font-bold bg-gradient-to-r ${plan.gradient} bg-clip-text text-transparent`}>
                              {priceDisplay.main}
                              <span className="text-lg font-semibold text-gray-500">{priceDisplay.suffix}</span>
                            </div>

                            <div className="text-sm text-gray-500">
                              {priceDisplay.caption}
                      </div>
                    </div>
                  )}
                </div>

                      <div className="mb-6 flex-grow">
                        <p className="text-gray-600 mb-4 text-center">{plan.description}</p>
                        

                  <ul className="space-y-3">
                          {getDisplayFeatures(plan).map((feature, index) => (
                      <li key={index} className="flex items-start text-gray-700">
                        <svg className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                  </div>

                    <div className="text-center mt-auto">
                      {(() => {
                        const buttonInfo = getPlanButtonInfo(plan);
                        
                        // For one-time purchases, use a button with click handler or direct link if scan available
                        if (plan.isOneTime || plan.type === 'one-time') {
                          const hasOneTimeScans = currentSubscription && currentSubscription.oneTimeScans > 0;
                          if (hasOneTimeScans) {
                            return (
                              <a
                                href="/start-audit"
                                className={`inline-block px-8 py-4 bg-gradient-to-r ${plan.gradient} text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 ${buttonInfo.isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {buttonInfo.text}
                              </a>
                            );
                          } else {
                            return (
                              <button
                                onClick={() => handleOneTimePurchase(plan.id)}
                                className={`inline-block px-8 py-4 bg-gradient-to-r ${plan.gradient} text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 ${buttonInfo.isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {buttonInfo.text}
                              </button>
                            );
                          }
                        }
                        
                        // For all other plans, use regular link
                        return (
                          <a 
                            href={buttonInfo.link}
                            className={`inline-block px-8 py-4 bg-gradient-to-r ${plan.gradient} text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 ${buttonInfo.isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {buttonInfo.text}
                          </a>
                        );
                      })()}
                </div>
              </div>
                );
              })}
          </div>
          )}
        </div>
      </section>

      {/* How to Choose Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-blue-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How to Choose Your Package</h2>
            <p className="text-lg text-gray-600">Not sure which package is right for you? Here's our guide</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto items-stretch">
            {[
              { title: "Start with a Quick Scan", desc: "Get a quick snapshot of your digital experience.", cta: "Get Quick Scan Report", link: "/?openScan=1" },
              (() => {
                const starterPlan = plans.find(p => p.id === 'starter') || { id: 'starter' };
                const buttonInfo = getPlanButtonInfo(starterPlan);
                return { 
                  title: "SilverSurfers Starter", 
                  desc: "Want a simple analysis? Perfect for small businesses.", 
                  cta: buttonInfo.text, 
                  link: buttonInfo.link 
                };
              })()
            ].map((item, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 text-center flex flex-col h-full">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600 mb-6 text-base">{item.desc}</p>
                <div className="mt-auto">
                  <a href={item.link} className="inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-r from-blue-500 via-green-600 to-teal-500 text-white font-medium rounded-lg shadow-sm hover:shadow-md hover:from-blue-600 hover:via-blue-700 hover:to-green-600 transition-all duration-300 w-full sm:w-auto">
                    {item.cta}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-blue-950 via-green-950 via-teal-950 to-cyan-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">Ready to Get Started?</h2>
          <p className="text-xl text-gray-200 mb-8">Join the growing community of businesses elevating their digital experience with SilverSurfers.ai</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/?openScan=1" className="px-8 py-4 bg-gradient-to-r from-blue-500 via-green-600 to-teal-500 text-white font-semibold rounded-xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              Get Quick Scan Report
            </a>
            <a href="/contact" className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white border-2 border-white/30 font-semibold rounded-xl hover:bg-white/20 transition-all duration-300">
              Contact Us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Services;