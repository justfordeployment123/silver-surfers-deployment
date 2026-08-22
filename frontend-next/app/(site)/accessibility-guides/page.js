import LegalPageShell from '../../../components/legal/LegalPageShell';
import LegalDocumentView from '../../../components/legal/LegalDocumentView';

export const metadata = {
  title: 'Accessibility Guides | SilverSurfers',
};

export default function AccessibilityGuidesPage() {
  return (
    <LegalPageShell>
      <LegalDocumentView type="accessibility-guides" />
    </LegalPageShell>
  );
}
