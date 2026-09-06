import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ElderlyAccessibilityPDFGenerator } from '../src/features/audits/scanner/pdf-generator.js';
import { PDFDocument as PDFLib } from 'pdf-lib';

// P3-04 — rexlondon.com's "No Keyboard Trap" (WCAG 2.1.2) audit failed on
// every page with zero evidence, because ss-no-keyboard-trap-audit had no
// AUDIT_INFO entry at all (invisible in both the per-category evidence
// table and the Appendix, regardless of what the scanner captured) and the
// Appendix required a non-null score, which a "manual" (needs-review)
// audit never has even when it names a real suspect element. This exercises
// the real ElderlyAccessibilityPDFGenerator.addAppendix against a fixture
// shaped exactly like the fixed camoufox_auditor.py now emits, and confirms
// the evidence actually reaches the rendered PDF instead of being silently
// dropped.
test('addAppendix surfaces a "manual" audit\'s real evidence instead of dropping it for having no numeric score', async (t) => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf-appendix-'));
  t.after(() => fs.promises.rm(tmpDir, { recursive: true, force: true }));

  const generator = new ElderlyAccessibilityPDFGenerator({ imagePaths: {}, clientEmail: 'test@example.com' });
  const outPath = path.join(tmpDir, 'appendix.pdf');
  const stream = fs.createWriteStream(outPath);
  generator.doc.pipe(stream);
  generator.doc.registerFont('RegularFont', 'Helvetica');
  generator.doc.registerFont('BoldFont', 'Helvetica-Bold');
  generator.currentY = 40;
  generator.pageNumber = 1;

  // Spy on pdfkit's own .text() so the assertion checks what actually got
  // drawn, not just "some PDF was produced" — a weaker version of this test
  // (byte count / page count only) passed even before the fix, since
  // addAppendix always renders *a* page regardless of whether this specific
  // audit's evidence made it into auditsWithDetails.
  const renderedStrings: string[] = [];
  const originalText = generator.doc.text.bind(generator.doc);
  generator.doc.text = ((str: unknown, ...rest: unknown[]) => {
    renderedStrings.push(String(str));
    return originalText(str as string, ...(rest as []));
  }) as typeof generator.doc.text;

  const reportData = {
    finalUrl: 'https://example.com/',
    audits: {
      'ss-no-keyboard-trap-audit': {
        score: null,
        scoreDisplayMode: 'manual',
        displayValue: '2 of 3 dialog(s) lack a recognizable close control - manual keyboard test recommended',
        details: {
          type: 'table',
          headings: [
            { key: 'selector', itemType: 'code', text: 'Element' },
            { key: 'role', itemType: 'text', text: 'Role' },
          ],
          items: [
            { selector: 'div#nav-mega-menu', role: 'dialog' },
            { selector: 'div.promo-modal', role: 'alertdialog' },
          ],
        },
      },
    },
  };

  assert.doesNotThrow(() => generator.addAppendix(reportData));
  generator.doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  const bytes = await fs.promises.readFile(outPath);
  assert.ok(bytes.byteLength > 500, 'PDF should contain real rendered content, not an empty shell');
  const pdf = await PDFLib.load(bytes);
  assert.ok(pdf.getPageCount() >= 1, 'the appendix must actually render a page for this audit');

  assert.ok(
    renderedStrings.some((s) => s.includes('div#nav-mega-menu')),
    'the actual suspect element selector must reach the rendered PDF, not just an empty "Technical Specifications" shell',
  );
  assert.ok(
    renderedStrings.some((s) => s.toLowerCase().includes('no keyboard trap')),
    'the audit needs an AUDIT_INFO title to appear as a section heading at all',
  );
});

// P3-08 — every report cover printed the requesting account's raw email
// address with zero name-fallback logic, even in production (not just
// internal test runs, which is what originally surfaced this). Confirms the
// per-page cover now prefers a display name when one is on file, and still
// falls back to the email exactly as before when it isn't.
async function renderIntroPageText(options: { clientEmail: string; clientName?: string }): Promise<string[]> {
  const generator = new ElderlyAccessibilityPDFGenerator({ imagePaths: {}, ...options });
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf-intro-'));
  const outPath = path.join(tmpDir, 'intro.pdf');
  const stream = fs.createWriteStream(outPath);
  generator.doc.pipe(stream);
  generator.doc.registerFont('RegularFont', 'Helvetica');
  generator.doc.registerFont('BoldFont', 'Helvetica-Bold');

  const renderedStrings: string[] = [];
  const originalText = generator.doc.text.bind(generator.doc);
  generator.doc.text = ((str: unknown, ...rest: unknown[]) => {
    renderedStrings.push(String(str));
    return originalText(str as string, ...(rest as []));
  }) as typeof generator.doc.text;

  generator.addIntroPage({ finalUrl: 'https://example.com/' }, { finalScore: 82 }, 'pro');
  generator.doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
  await fs.promises.rm(tmpDir, { recursive: true, force: true });

  return renderedStrings;
}

test('addIntroPage shows the account\'s display name instead of its raw email when one is on file', async () => {
  const rendered = await renderIntroPageText({ clientEmail: 'jane.doe@example.com', clientName: 'Jane Doe' });

  assert.ok(
    rendered.some((s) => s === 'Report prepared for: Jane Doe'),
    'must render the display name, not the raw email, when a name is on file',
  );
  assert.ok(
    !rendered.some((s) => s.includes('jane.doe@example.com')),
    'must not print the raw email address when a display name is available',
  );
});

test('addIntroPage falls back to the raw email when no display name is on file', async () => {
  const rendered = await renderIntroPageText({ clientEmail: 'jane.doe@example.com' });

  assert.ok(
    rendered.some((s) => s === 'Report prepared for: jane.doe@example.com'),
    'must fall back to the email exactly as before when no name is on file',
  );
});
