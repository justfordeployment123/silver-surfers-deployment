import React, { useState, useEffect } from 'react';

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

  const getScoreColor = (score) => {
    if (score >= 80) return 'from-green-500 to-emerald-600';
    if (score >= 60) return 'from-yellow-500 to-orange-600';
    return 'from-red-500 to-pink-600';
  };

  const getScoreGradientColors = (score) => {
    if (score >= 80) return { start: '#22c55e', end: '#16a34a' }; // green
    if (score >= 60) return { start: '#eab308', end: '#f59e0b' }; // yellow
    return { start: '#ef4444', end: '#dc2626' }; // red
  };

  const getScoreTextColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreMessage = (score) => {
    if (score >= 80) return 'Excellent AI Visibility';
    if (score >= 60) return 'Good AI Visibility';
    if (score >= 40) return 'Room to Improve';
    return 'Significant Room for Improvement';
  };

  const getSummaryText = (score, summary) => {
    if (score >= 80) {
      return `Your website scored ${score} out of 100 on our AI Visibility scale. You're in a great position for AI-driven search, but there may be a few areas to further strengthen your presence. Below are the top findings from our analysis.`;
    } else if (score >= 60) {
      return `Your website scored ${score} out of 100 on our AI Visibility scale. You're doing well, but there's still room to boost your visibility and become the top answer. Here are the most impactful opportunities we found.`;
    } else if (score >= 40) {
      return `Your website scored ${score} out of 100 on our AI Visibility scale. There's room to improve your AI findability. Below are the key areas to focus on for better results.`;
    } else {
      return `Your website scored ${score} out of 100 on our AI Visibility scale. This means there's significant room for improvement. Below are the top findings from our analysis.`;
    }
  };

  if (!isVisible) return null;

  const displayScore = Number.isFinite(Number(scanData?.score)) ? Math.round(Number(scanData.score)) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Close Button */}
        <div className="sticky top-0 bg-white rounded-t-3xl border-b border-gray-100 px-6 py-4 flex justify-end z-10">
          <button 
            onClick={onClose}
            className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors duration-200 text-gray-600 hover:text-gray-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Analyzing your website...</h2>
            <p className="text-gray-600 text-center">Our AI is scanning your site for visibility factors</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Oops! Something went wrong</h2>
            <p className="text-gray-600 mb-6 text-center">{error}</p>
            <button 
              onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300"
            >
              Try Another Scan
            </button>
          </div>
        )}

        {!loading && !error && scanData && (
          <div className="p-6 space-y-8">
            {/* Results Header */}
            <div className="text-center bg-gradient-to-br from-purple-50 to-blue-50/50 rounded-2xl p-8 border border-purple-100">
              <div className="mb-6">
                <div className="w-24 h-24 mx-auto mb-4 relative">
                  <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="2"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={`url(#gradient-${displayScore})`}
                      strokeWidth="2"
                      strokeDasharray={`${displayScore}, 100`}
                      className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                      <linearGradient id={`gradient-${displayScore}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={getScoreGradientColors(scanData.score).start} />
                        <stop offset="100%" stopColor={getScoreGradientColors(scanData.score).end} />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${getScoreTextColor(displayScore)}`}>{displayScore}%</span>
                  </div>
                </div>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                AI Findability Score: {displayScore}/100
              </h1>
              <p className="text-lg text-gray-600 mb-6">Your site's AI visibility at a glance</p>
              <div className={`inline-flex items-center px-6 py-3 bg-gradient-to-r ${getScoreColor(displayScore)} text-white font-semibold rounded-full`}>
                {getScoreMessage(displayScore)}
              </div>
            </div>

            {/* Summary Section */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <svg className="w-6 h-6 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Summary
              </h3>
              <p className="text-gray-700 leading-relaxed">{getSummaryText(displayScore, scanData.summary)}</p>
            </div>

            {/* Key Findings */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <svg className="w-6 h-6 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Key Findings & Opportunities
              </h2>
              <div className="space-y-4">
                {(scanData.recommendations || []).slice(0, 5).map((rec, idx) => (
                  <div key={idx} className="flex items-start space-x-3 p-4 bg-gradient-to-r from-purple-50 to-blue-50/50 rounded-xl border border-purple-100">
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-r from-purple-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {idx + 1}
                    </div>
                    <p className="text-gray-700 leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Section */}
            <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl p-8 text-white">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-3">Ready to Improve Your Score?</h3>
                <p className="text-purple-100">See our full report and strategy for improving your AI visibility</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a 
                  href="/services" 
                  className="px-8 py-4 bg-white text-purple-600 font-semibold rounded-xl hover:bg-gray-100 transition-all duration-300 text-center"
                >
                  Get My Detailed Report
                </a>
                <a 
                  href="/contact" 
                  className="px-8 py-4 bg-white/20 backdrop-blur-sm border-2 border-white/30 text-white font-semibold rounded-xl hover:bg-white/30 transition-all duration-300 text-center"
                >
                  Talk to an Expert
                </a>
              </div>
            </div>

            {/* Email Notice */}
            <div className="bg-green-50 rounded-2xl p-6 border border-green-200">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-green-800 mb-1">Results Sent!</h4>
                  <p className="text-green-700">
                    A copy of these results has been sent to <strong>{scanData.email}</strong>. 
                    Check your inbox for your AI Visibility Score and next steps.
                  </p>
                </div>
              </div>
            </div>

            {/* Lead Capture */}
            <div className="bg-gradient-to-br from-gray-50 to-purple-50/30 rounded-2xl p-8 border border-purple-100">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Turn Your Score of {scanData.score} into 90+
                </h3>
                <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                  Our experts can help you improve your AI visibility significantly. Pick a plan below to get started.
                </p>
                <div className="bg-white rounded-xl p-6 border border-purple-100 mb-6">
                  <div className="flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                  <p className="text-gray-700 font-medium mb-4">
                    Next Step: Get a professional AI Visibility Report for a full diagnosis and custom action plan.
                  </p>
                  <a 
                    href="/services" 
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300"
                  >
                    Explore Improvement Options
                    <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Privacy Notice */}
            <div className="text-center">
              <p className="text-sm text-gray-500">
                We only use your URL to perform this one-time analysis. We won't share your data. Unsubscribe anytime.{' '}
                <a href="/privacy" className="text-purple-600 hover:text-purple-700 underline">
                  Privacy Policy
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanResultsModal;
