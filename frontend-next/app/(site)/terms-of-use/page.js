// Duplicate path for /terms — both render the same shared content
// components (LegalPageShell + LegalDocumentView), matching the original
// react-router setup where /terms and /terms-of-use both rendered
// pages/TermsOfUse.js.
import LegalPageShell from '../../../components/legal/LegalPageShell';
import LegalDocumentView from '../../../components/legal/LegalDocumentView';

export const metadata = {
  title: 'Terms of Use | SilverSurfers',
};

export default function TermsOfUsePage() {
  return (
    <LegalPageShell>
      <LegalDocumentView type="terms-of-use" />
    </LegalPageShell>
  );
}
