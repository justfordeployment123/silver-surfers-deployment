import React, { useState } from 'react';
import LegalDocumentViewer from './LegalDocumentViewer';

const LegalAcceptanceModal = ({ 
  isOpen, 
  onClose, 
  onAccept, 
  documentType = 'terms-of-use',
  title = 'Terms & Conditions',
  required = true 
}) => {
  const [step, setStep] = useState('view'); // 'view' or 'accept'
  const [accepted, setAccepted] = useState(false);

  if (!isOpen) return null;

  const handleAccept = (result) => {
    setAccepted(true);
    if (onAccept) {
      onAccept(result);
    }
    // Close modal after successful acceptance
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleClose = () => {
    if (required && !accepted) {
      // Show confirmation if terms are required but not accepted
      if (window.confirm('You must accept the terms to continue. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={handleClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block w-full max-w-6xl px-4 pt-5 pb-4 overflow-hidden text-left align-bottom transition-all transform bg-white rounded-lg shadow-xl sm:my-8 sm:align-middle sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">
              {title}
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Success message */}
          {accepted && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-800 font-medium">
                  Terms accepted successfully! You can now continue.
                </span>
              </div>
            </div>
          )}

          {/* Document content */}
          <div className="max-h-96 overflow-y-auto">
            <LegalDocumentViewer 
              type={documentType}
              onAccept={handleAccept}
              showAcceptButton={!accepted}
              className="border-0 shadow-none"
            />
          </div>

          {/* Footer */}
          {!accepted && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {required ? (
                  <span className="text-red-600 font-medium">* Required to continue</span>
                ) : (
                  <span>Optional - you can continue without accepting</span>
                )}
              </div>
              
              <div className="flex gap-3">
                {!required && (
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    style={{ fontSize: '16px' }}
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  style={{ fontSize: '16px' }}
                >
                  {required ? 'Cancel' : 'Close'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LegalAcceptanceModal;