import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, startAudit, precheckUrl, getSubscription } from '../api';

const Checkout = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [lockedEmail, setLockedEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('desktop'); // Default device selection
  const [creditType, setCreditType] = useState(null); // 'subscription' or 'oneTime'
  const [loading, setLoading] = useState(false);
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [oneTimeScans, setOneTimeScans] = useState(0);

  // Load user data and subscription information
  useEffect(() => {
    const loadUserData = async () => {
      try {
        setSubscriptionLoading(true);
        
        // Load user email and subscription data in parallel
        const [userResult, subscriptionResult] = await Promise.all([
          getMe(),
          getSubscription()
        ]);
        
        // Set email
        if (userResult.user && userResult.user.email) {
          setEmail(userResult.user.email);
          setLockedEmail(userResult.user.email);
        } else {
          // Fallback to localStorage if available
          const savedEmail = localStorage.getItem('userEmail') || localStorage.getItem('email') || localStorage.getItem('authEmail');
          if (savedEmail) {
            setEmail(savedEmail);
            setLockedEmail(savedEmail);
          }
        }
        
        // Set subscription data
        if (subscriptionResult.subscription) {
          setSubscription(subscriptionResult.subscription);
        }
        
        // Set one-time scans
        if (subscriptionResult.oneTimeScans !== undefined) {
          setOneTimeScans(subscriptionResult.oneTimeScans);
        }
        
        // Auto-select credit type based on availability
        // Prefer subscription if active AND has scans remaining, otherwise one-time
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
        // Fallback to localStorage if available
        const savedEmail = localStorage.getItem('userEmail') || localStorage.getItem('email') || localStorage.getItem('authEmail');
        if (savedEmail) {
          setEmail(savedEmail);
          setLockedEmail(savedEmail);
        }
      } finally {
        setSubscriptionLoading(false);
      }
    };
    
    loadUserData();
  }, []);

  // Auto-switch to one-time if subscription has 0 scans but one-time is available
  useEffect(() => {
    const remainingScans = getRemainingScans();
    if (creditType === 'subscription' && remainingScans === 0 && oneTimeScans > 0) {
      setCreditType('oneTime');
    }
  }, [creditType, subscription, oneTimeScans, subscription?.usage?.scansThisMonth, subscription?.limits?.scansPerMonth]);

  // Helper function to calculate remaining scans
  const getRemainingScans = () => {
    if (!subscription || !subscription.limits) return 0;
    
    const maxScans = subscription.limits.scansPerMonth;
    const usedScans = subscription.usage?.scansThisMonth || 0;
    
    return Math.max(0, maxScans - usedScans);
  };

  // Helper function to check if user can start audit
  const canStartAudit = () => {
    if (!creditType) return false;
    
    if (creditType === 'oneTime') {
      return oneTimeScans > 0;
    } else if (creditType === 'subscription') {
      if (!subscription || subscription.status !== 'active') return false;
      return getRemainingScans() > 0;
    }
    
    return false;
  };
  
  // Check if user has both subscription and one-time scans
  const hasBothOptions = () => {
    // User has both options if:
    // 1. Has active subscription (even if scans exhausted) AND has one-time scans, OR
    // 2. Has active subscription with scans remaining AND has one-time scans
    const hasActiveSubscription = subscription && subscription.status === 'active';
    const hasOneTime = oneTimeScans > 0;
    return hasActiveSubscription && hasOneTime;
  };
  
  // Check if device selection should be shown
  const shouldShowDeviceSelection = () => {
    if (creditType === 'oneTime') {
      return true; // Always show for one-time scans
    } else if (creditType === 'subscription') {
      // Only show for Starter plan, not Pro
      return subscription && subscription.planId === 'starter';
    }
    return false;
  };

  // Helper function to get usage status color
  const getUsageStatusColor = () => {
    const remaining = getRemainingScans();
    if (remaining === 0) return 'text-red-600 bg-red-100';
    if (remaining <= 2) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const auditEmail = lockedEmail || email;

    if (!url || !auditEmail) {
      setError('Please fill in all fields');
      return;
    }

    // Ensure credit type is selected
    if (!creditType) {
      // Auto-select based on what's actually available
      // If subscription has scans, use subscription; otherwise use one-time if available
      if (subscription && subscription.status === 'active' && getRemainingScans() > 0) {
        setCreditType('subscription');
      } else if (oneTimeScans > 0) {
        setCreditType('oneTime');
      } else {
        setError('You need an active subscription or one-time scan credit to start an audit. Please purchase a plan or one-time scan.');
        return;
      }
    }
    
    // If creditType is subscription but no scans remaining, switch to one-time if available
    if (creditType === 'subscription' && getRemainingScans() === 0 && oneTimeScans > 0) {
      setCreditType('oneTime');
    }
    
    // Validate device selection for one-time scans
    if (creditType === 'oneTime' && !selectedDevice) {
      setError('Please select a device type for your one-time scan.');
      return;
    }
    
    // Validate device selection for Starter plan
    if (creditType === 'subscription' && subscription && subscription.planId === 'starter' && !selectedDevice) {
      setError('Please select a device type for your Starter plan scan.');
      return;
    }

    // Check if user can start audit
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

    setLoading(true);
    setPrecheckLoading(true);
    setError('');
    setSuccess('');

    try {
      // First, precheck the URL
      setPrecheckLoading(true);
      const precheckResult = await precheckUrl(url);
      
      if (precheckResult.error || precheckResult.success === false) {
        setError(precheckResult.error || 'URL not reachable. Please check the domain and try again.');
        return;
      }

      setPrecheckLoading(false);
      setSuccess('✅ URL validated successfully! Starting audit...');

      // Determine device selection based on credit type
      // For Pro subscription, don't pass device (backend will test all devices)
      // For Starter or one-time, pass the selected device
      let deviceToUse = null;
      if (creditType === 'oneTime') {
        deviceToUse = selectedDevice; // Required for one-time scans
      } else if (creditType === 'subscription' && subscription && subscription.planId === 'starter') {
        deviceToUse = selectedDevice; // Required for Starter plan
      }
      // For Pro plan, deviceToUse remains null (backend handles all devices)

      // Now start the actual audit with device selection and credit type
      const auditResult = await startAudit(auditEmail, url, deviceToUse, firstName, lastName, creditType);
      
      if (auditResult.error) {
        setError(auditResult.error);
        setSuccess('');
      } else {
        setSuccess('🎉 Audit request submitted successfully! You will receive an email with your comprehensive accessibility report shortly.');
        
        // Clear the URL field only
        setUrl('');
      }
      
    } catch (err) {
      setError('Failed to submit audit request. Please try again.');
      setSuccess('');
    } finally {
      setLoading(false);
      setPrecheckLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-green-950 via-teal-950 to-cyan-900 pt-24 pb-10 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Start Your Accessibility Audit</h1>
          <p className="text-xl text-gray-200">Enter your website URL to begin a comprehensive accessibility analysis</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          {/* Subscription Status and Usage Information */}
          {subscriptionLoading ? (
            <div className="mb-6 p-4 bg-gray-100 rounded-lg">
              <div className="animate-pulse flex items-center">
                <div className="h-4 bg-gray-300 rounded w-3/4"></div>
              </div>
            </div>
          ) : subscription && subscription.status === 'active' ? (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Subscription Status</h3>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  {subscription.isTeamMember ? 'Team Member' : 'Active'}
                </span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{subscription.plan?.name || 'Plan'}</div>
                  <div className="text-sm text-gray-600">Current Plan</div>
                </div>
                
                <div className="text-center">
                  <div className={`text-2xl font-bold ${getUsageStatusColor().split(' ')[0]}`}>
                    {getRemainingScans()}
                  </div>
                  <div className="text-sm text-gray-600">Scans Remaining</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{subscription.limits?.scansPerMonth || 0}</div>
                  <div className="text-sm text-gray-600">Yearly Limit</div>
                </div>
              </div>
              
              <div className={`p-3 rounded-lg ${getUsageStatusColor()}`}>
                {getRemainingScans() === 0 ? (
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">No scans remaining this year. Upgrade your plan or wait for next year.</span>
                  </div>
                ) : getRemainingScans() <= 2 ? (
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Warning: Only {getRemainingScans()} scan{getRemainingScans() !== 1 ? 's' : ''} remaining this month.</span>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">You have {getRemainingScans()} scan{getRemainingScans() !== 1 ? 's' : ''} remaining this month.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            (!oneTimeScans || oneTimeScans === 0) && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="font-medium text-red-800">No Active Subscription</div>
                    <div className="text-sm text-red-600">You need an active subscription to start audits.</div>
                  </div>
                </div>
              </div>
            )
          )}
          
          {/* One-time scans display */}
          {oneTimeScans > 0 && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="font-semibold text-orange-800">One-Time Scan Credits</div>
                    <div className="text-sm text-orange-600">You have {oneTimeScans} one-time scan{oneTimeScans !== 1 ? 's' : ''} available</div>
                  </div>
                </div>
                <div className="text-2xl font-bold text-orange-600">{oneTimeScans}</div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                Website URL
              </label>
              <input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={lockedEmail || email}
                onChange={(e) => {
                  if (lockedEmail) {
                    e.currentTarget.value = lockedEmail;
                    setEmail(lockedEmail);
                    return;
                  }
                  setEmail(e.target.value);
                }}
                onInput={(e) => {
                  if (lockedEmail && e.currentTarget.value !== lockedEmail) {
                    e.currentTarget.value = lockedEmail;
                    setEmail(lockedEmail);
                  }
                }}
                onPaste={(e) => {
                  if (lockedEmail) {
                    e.preventDefault();
                    setEmail(lockedEmail);
                  }
                }}
                placeholder="your@email.com"
                readOnly={Boolean(lockedEmail)}
                aria-readonly={Boolean(lockedEmail)}
                autoComplete={lockedEmail ? 'off' : 'email'}
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 ${
                  lockedEmail
                    ? 'bg-gray-100 cursor-not-allowed focus:ring-0 focus:border-gray-300'
                    : 'focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                }`}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  autoComplete="given-name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  required
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  autoComplete="family-name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  required
                />
              </div>
            </div>

            {/* Credit Type Selection - Show when user has both subscription and one-time scans */}
            {hasBothOptions() && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Credit Type to Use
                </label>
                <div className="space-y-3">
                  <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-blue-300">
                    <input
                      type="radio"
                      name="creditType"
                      value="subscription"
                      checked={creditType === 'subscription'}
                      onChange={(e) => setCreditType(e.target.value)}
                      className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="font-medium text-gray-900">
                        Use Subscription ({subscription.plan?.name || 'Plan'})
                      </div>
                      <div className="text-sm text-gray-600">
                        {getRemainingScans()} scan{getRemainingScans() !== 1 ? 's' : ''} remaining this month
                        {subscription.planId === 'pro' && ' • Tests all devices (Desktop, Tablet, Mobile)'}
                        {subscription.planId === 'starter' && ' • Select one device type per scan'}
                      </div>
                    </div>
                  </label>
                  
                  <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-orange-300">
                    <input
                      type="radio"
                      name="creditType"
                      value="oneTime"
                      checked={creditType === 'oneTime'}
                      onChange={(e) => setCreditType(e.target.value)}
                      className="w-5 h-5 text-orange-600 focus:ring-orange-500"
                    />
                    <div className="ml-3 flex-1">
                      <div className="font-medium text-gray-900">
                        Use One-Time Scan Credit
                      </div>
                      <div className="text-sm text-gray-600">
                        {oneTimeScans} credit{oneTimeScans !== 1 ? 's' : ''} available • Select one device type per scan
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Device Selection - Show only when needed */}
            {shouldShowDeviceSelection() && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Device Type
                </label>
                <p className="text-xs text-gray-600 mb-3">
                  {creditType === 'oneTime'
                    ? 'Select which device type to audit for this one-time scan. One-time scans audit one device type per scan.'
                    : 'Your Starter plan allows auditing for one device type per scan.'}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDevice('desktop')}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      selectedDevice === 'desktop'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <svg className="w-8 h-8 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm font-medium">Desktop</div>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setSelectedDevice('tablet')}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      selectedDevice === 'tablet'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <svg className="w-8 h-8 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" />
                    </svg>
                    <div className="text-sm font-medium">Tablet</div>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setSelectedDevice('mobile')}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      selectedDevice === 'mobile'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    <svg className="w-8 h-8 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <div className="text-sm font-medium">Mobile</div>
                  </button>
                </div>
              </div>
            )}

            {/* Info message for Pro plan - only show when subscription is selected */}
            {creditType === 'subscription' && subscription && subscription.planId === 'pro' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-green-700">
                    <strong>Pro Plan:</strong> Your audit will test all devices (Desktop, Tablet, and Mobile)
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canStartAudit()}
              className={`w-full bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-300 flex items-center justify-center ${
                !canStartAudit() ? 'cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {precheckLoading ? 'Validating URL...' : 'Starting Audit...'}
                </>
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

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/subscription')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Subscription
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
