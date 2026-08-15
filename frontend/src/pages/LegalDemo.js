import React, { useState } from 'react';
import LegalDocumentViewer from '../components/LegalDocumentViewer';
import LegalAcceptanceModal from '../components/LegalAcceptanceModal';

const LegalDemo = () => {
  const [showModal, setShowModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState('terms-of-use');

  const documents = [
    {
      type: 'terms-of-use',
      title: 'Terms of Use',
      description: 'Our terms and conditions for using the service'
    },
    {
      type: 'privacy-policy',
      title: 'Privacy Policy',
      description: 'How we collect, use, and protect your information'
    }
  ];

  const handleAccept = (result) => {
    console.log('Document accepted:', result);
    alert(`Successfully accepted ${selectedDocument}!`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-green-900 to-teal-900 pt-24 pb-8"> {/* Dark background for header visibility */}
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Legal Documents Demo
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            See how legal documents are displayed and managed in the Silver Surfers application.
            Click on any document below to view it, or try the acceptance modal.
          </p>
        </div>

        {/* Document Selection */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {documents.map((doc) => (
            <div key={doc.type} className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {doc.title}
              </h3>
              <p className="text-gray-600 mb-4">
                {doc.description}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedDocument(doc.type);
                    setShowModal(true);
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  style={{ fontSize: '16px' }}
                >
                  View & Accept
                </button>
                <button
                  onClick={() => setSelectedDocument(doc.type)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  style={{ fontSize: '16px' }}
                >
                  View Only
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Live Document Viewer */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Live Document Viewer
          </h3>
          <p className="text-gray-600 mb-6">
            This shows how the document appears when accessed directly via URL:
          </p>
          
          <LegalDocumentViewer 
            type={selectedDocument}
            onAccept={handleAccept}
            showAcceptButton={true}
          />
        </div>

        {/* Features List */}
        <div className="mt-12 bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Features Demonstrated
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Database-driven content management</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Version control and change tracking</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>User acceptance tracking</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Responsive design</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Modal acceptance flow</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Admin management interface</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Legal compliance tracking</span>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Multi-language support</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Acceptance Modal */}
      <LegalAcceptanceModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAccept={handleAccept}
        documentType={selectedDocument}
        title={documents.find(d => d.type === selectedDocument)?.title}
        required={true}
      />
    </div>
  );
};

export default LegalDemo;