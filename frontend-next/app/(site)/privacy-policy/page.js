// Duplicate path for /privacy — see app/terms-of-use/page.js for why.
import LegalPageShell from '../../../components/legal/LegalPageShell';
import LegalDocumentView from '../../../components/legal/LegalDocumentView';

export const metadata = {
  title: 'Privacy Policy | SilverSurfers',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell>
      <LegalDocumentView type="privacy-policy" />
    </LegalPageShell>
  );
}
