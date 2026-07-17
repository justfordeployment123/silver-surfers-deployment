import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { confirmSubscriptionSuccess, getSubscription } from '../api';

const SubscriptionSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [subscription, setSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      confirmSubscription(sessionId);
    } else {
      setError('No session ID found');
      setLoading(false);
    }
    
    // Fetch subscription data to check if user is a team member
    fetchSubscription();
  }, [searchParams]);

  const fetchSubscription = async () => {
    try {
      const result = await getSubscription();
      if (result && !result.error) {
        setSubscription(result.subscription);
      }
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const confirmSubscription = async (sessionId) => {
    try {
      const result = await confirmSubscriptionSuccess(sessionId);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError('Failed to confirm subscription');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-green-950 via-teal-950 to-cyan-900 pt-24 pb-10">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Confirming your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-green-950 via-teal-950 to-cyan-900 flex items-center justify-center pt-24 pb-10 px-4">
      <div className="max-w-2xl mx-auto text-center">
        {success ? (
          <div className="bg-white rounded-3xl p-12 shadow-2xl">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to SilverSurfers!</h1>
            <p className="text-xl text-gray-600 mb-8">
              Your subscription has been successfully activated. You can now access all the features of your plan.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-center space-x-2 text-green-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Subscription activated</span>
              </div>
              <div className="flex items-center justify-center space-x-2 text-green-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Payment processed</span>
              </div>
              <div className="flex items-center justify-center space-x-2 text-green-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Account upgraded</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Only show "Manage Subscription" button if user is not a team member */}
              {!subscriptionLoading && subscription && !subscription.isTeamMember && (
                <button
                  onClick={() => navigate('/subscription')}
                  className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 via-green-600 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                >
                  Manage Subscription
                </button>
              )}
              
              {/* Show team member message if they are a team member */}
              {!subscriptionLoading && subscription && subscription.isTeamMember && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-blue-800 text-sm text-center">
                    You're using a team plan. Contact the plan owner to manage the subscription.
                  </p>
                </div>
              )}
              
              <button
                onClick={() => navigate('/')}
                className="w-full py-3 px-6 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-12 shadow-2xl">
            <div className="text-6xl mb-6">❌</div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Subscription Error</h1>
            <p className="text-xl text-gray-600 mb-8">
              {error || 'There was an issue confirming your subscription. Please contact support.'}
            </p>
            
            <div className="space-y-4">
              <button
                onClick={() => navigate('/subscription')}
                className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 via-green-600 to-teal-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              >
                Try Again
              </button>
              
              <button
                onClick={() => navigate('/contact')}
                className="w-full py-3 px-6 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Contact Support
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
