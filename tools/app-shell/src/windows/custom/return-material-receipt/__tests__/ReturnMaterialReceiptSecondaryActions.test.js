import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReturnMaterialReceiptSecondaryActions.jsx'), 'utf8');

// ETP-5260 defect fix — CopyRecordLinkButton used to render inside
// ConfirmWithCreditButton.jsx (topbarRight, ETP-4721), to the RIGHT of
// Save/Confirm against the DF. It moved here (topbarSecondary, LEFT of
// Save/Confirm). ETP-5408: return-material-receipt's Borrador Confirmar is the generic draftMode Confirm.
describe('ReturnMaterialReceiptSecondaryActions', () => {
  it('exports a default function component named ReturnMaterialReceiptSecondaryActions', () => {
    assert.match(src, /export default function ReturnMaterialReceiptSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="return-material-receipt"', () => {
    assert.match(src, /windowName="return-material-receipt"/);
  });

  it('only renders Copy link — no Clone, no Send for this window', () => {
    assert.match(src, /clone=\{false\}/);
    assert.match(src, /showSend=\{false\}/);
  });
});
