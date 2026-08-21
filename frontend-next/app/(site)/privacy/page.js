import LegalPageShell from '../../../components/legal/LegalPageShell';
import LegalDocumentView from '../../../components/legal/LegalDocumentView';

export const metadata = {
  title: 'Privacy Policy | SilverSurfers',
};

export default function PrivacyPage() {
  return (
    <LegalPageShell>
      <LegalDocumentView type="privacy-policy" />
    </LegalPageShell>
  );
}
