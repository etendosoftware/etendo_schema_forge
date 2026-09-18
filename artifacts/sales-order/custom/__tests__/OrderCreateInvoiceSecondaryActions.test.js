import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OrderCreateInvoiceSecondaryActions.jsx'), 'utf8');

// ETP-5260 — the Send button itself moved here from OrderCreateInvoice.jsx
// (topbarRight). See OrderCreateInvoice.test.js's "SendDocumentModal
// integration (ETP-5260 — button moved out, modal stays)" for the sibling
// coverage of the modal that remains in topbarRight.
describe('OrderCreateInvoiceSecondaryActions', () => {
  it('exports a default function component named OrderCreateInvoiceSecondaryActions', () => {
    assert.match(src, /export default function OrderCreateInvoiceSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="sales-order" for the copy-link URL and default clone navigation target', () => {
    assert.match(src, /windowName="sales-order"/);
  });

  it('enables Clone with the DocumentSecondaryActions defaults (bare `clone`, matching the pre-ETP-5260 inline behavior)', () => {
    assert.match(src, /\bclone\b(?!=)/);
  });

  it('gates Send on isCompleted (documentStatus === CO), matching the grid row quick-action gate (ETP-4717)', () => {
    assert.match(src, /const isCompleted = props\.data\?\.documentStatus === 'CO'/);
    assert.match(src, /showSend=\{isCompleted\}/);
  });

  it('dispatches the sales-order:open-send-modal window event on Send click', () => {
    assert.match(
      src,
      /onSendClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\('sales-order:open-send-modal'\)\)\}/,
    );
  });
});
