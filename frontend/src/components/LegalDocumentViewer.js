import React, { useState, useEffect } from 'react';
import { getLegalDocument, acceptLegalDocument } from '../api';
import SimpleTextFormatter from './SimpleTextFormatter';

const LegalDocumentViewer = ({ type, onAccept, showAcceptButton = true, className = '' }) => {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    loadDocument();
  }, [type]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await getLegalDocument(type);
      
      if (result.error) {
        setError(result.error);
      } else {
        setDocument(result);
      }
    } catch (err) {
      setError('Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      setAccepting(true);
      const result = await acceptLegalDocument(type);
      
      if (result.error) {
        setError(result.error);
      } else {
        setAccepted(true);
        if (onAccept) {
          onAccept(result);
        }
      }
    } catch (err) {
      setError('Failed to accept document');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 bg-white rounded-xl border border-gray-200 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-700">Loading document...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-12 bg-white rounded-xl border border-gray-200 ${className}`}>
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-lg font-medium text-gray-900 mb-2">Error Loading Document</h1>
        <p className="text-gray-700 mb-4">{error}</p>
        <button
          onClick={loadDocument}
          className="px-4 py-2 min-h-11 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!document) {
    return (
      <div className={`text-center py-12 bg-white rounded-xl border border-gray-200 ${className}`}>
        <h1 className="text-lg font-medium text-gray-900 mb-2">Document Not Found</h1>
        <p className="text-gray-700">This document isn't available right now.</p>
      </div>
    );
  }

  return (
    <div className={`max-w-4xl mx-auto ${className}`}>
      {/* Document Header */}
      <div className="bg-white rounded-t-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{document.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>Version {document.version}</span>
              <span>•</span>
              <span>Effective {new Date(document.effectiveDate).toLocaleDateString()}</span>
              {document.acceptanceRequired && (
                <>
                  <span>•</span>
                  <span className="text-blue-600 font-medium">Acceptance Required</span>
                </>
              )}
            </div>
          </div>
          
          {showAcceptButton && document.acceptanceRequired && (
            <div className="flex flex-col items-end gap-2">
              {accepted ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">Accepted</span>
                </div>
              ) : (
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {accepting ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Accepting...</span>
                    </div>
                  ) : (
                    'Accept Terms'
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        
        {document.summary && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Summary</h3>
            <p className="text-blue-800">{document.summary}</p>
          </div>
        )}
      </div>

      {/* Document Content */}
      <div className="bg-white border-x border-b border-gray-200 rounded-b-xl p-6">
        <SimpleTextFormatter text={document.content} />
      </div>

      {/* Document Footer */}
      <div className="mt-6 text-center text-sm text-gray-500">
        <p>
          This document was last updated on {new Date(document.effectiveDate).toLocaleDateString()}. 
          Version {document.version}.
        </p>
      </div>
    </div>
  );
};

export default LegalDocumentViewer;