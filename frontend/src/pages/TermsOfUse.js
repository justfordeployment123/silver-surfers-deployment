import React from 'react';
import LegalDocumentViewer from '../components/LegalDocumentViewer';

const TermsOfUse = () => {
  const handleAccept = (result) => {
    console.log('Terms of Use accepted:', result);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--t9)', paddingTop: '96px', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>
        <LegalDocumentViewer
          type="terms-of-use"
          onAccept={handleAccept}
          showAcceptButton={false}
        />
      </div>
    </div>
  );
};

export default TermsOfUse;
