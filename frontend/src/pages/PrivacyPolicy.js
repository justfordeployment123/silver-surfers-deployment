import React from 'react';
import LegalDocumentViewer from '../components/LegalDocumentViewer';

const PrivacyPolicy = () => {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--t9)', paddingTop: '96px', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>
        <LegalDocumentViewer
          type="privacy-policy"
          showAcceptButton={false}
        />
      </div>
    </div>
  );
};

export default PrivacyPolicy;
