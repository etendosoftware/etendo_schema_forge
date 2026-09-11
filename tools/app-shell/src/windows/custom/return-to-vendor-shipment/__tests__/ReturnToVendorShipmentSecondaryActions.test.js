import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReturnToVendorShipmentSecondaryActions.jsx'), 'utf8');

// ETP-5260 defect fix — CopyRecordLinkButton used to render inside
// ConfirmWithCreditButton.jsx (topbarRight, ETP-4721), to the RIGHT of
// Save/Confirm against the DF. It moved here (topbarSecondary, LEFT of
// Save/Confirm). ConfirmWithCreditButtonBase — a PRIMARY action available in
// Borrador (ETP-4933) — stays in ConfirmWithCreditButton.jsx/topbarRight,
// untouched. See ConfirmWithCreditButton.spec.jsx's "renders nothing when
// status is not DR or CO" regression guard for the sibling coverage.
describe('ReturnToVendorShipmentSecondaryActions', () => {
  it('exports a default function component named ReturnToVendorShipmentSecondaryActions', () => {
    assert.match(src, /export default function ReturnToVendorShipmentSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="return-to-vendor-shipment"', () => {
    assert.match(src, /windowName="return-to-vendor-shipment"/);
  });

  it('only renders Copy link — no Clone, no Send for this window', () => {
    assert.match(src, /clone=\{false\}/);
    assert.match(src, /showSend=\{false\}/);
  });
});
