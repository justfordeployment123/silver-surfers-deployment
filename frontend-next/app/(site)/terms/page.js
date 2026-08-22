import LegalPageShell from '../../../components/legal/LegalPageShell';
import LegalDocumentView from '../../../components/legal/LegalDocumentView';

export const metadata = {
  title: 'Terms of Use | SilverSurfers',
};

export default function TermsPage() {
  return (
    <LegalPageShell>
      <LegalDocumentView type="terms-of-use" />
    </LegalPageShell>
  );
}
