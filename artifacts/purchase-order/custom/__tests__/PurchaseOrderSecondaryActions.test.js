import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseOrderSecondaryActions.jsx'), 'utf8');

// ETP-5260 — this thin adapter is the topbarSecondary reference implementation
// other windows copy (per its own file header). It delegates all rendering to
// the shared DocumentSecondaryActions (already covered generically by
// DocumentSecondaryActions.vitest.jsx) — this suite only pins the WIRING
// specific to purchase-order.
describe('PurchaseOrderSecondaryActions', () => {
  it('exports a default function component named PurchaseOrderSecondaryActions', () => {
    assert.match(src, /export default function PurchaseOrderSecondaryActions/);
  });

  it('delegates to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
  });

  it('forwards windowName="purchase-order" for the copy-link URL and default clone navigation target', () => {
    assert.match(src, /windowName="purchase-order"/);
  });

  it('enables Clone with the DocumentSecondaryActions defaults (bare `clone`, not an override object)', () => {
    assert.match(src, /\bclone\b(?!=)/);
  });

  it('gates Send on isCompleted (documentStatus === CO)', () => {
    assert.match(src, /const isCompleted = props\.data\?\.documentStatus === 'CO'/);
    assert.match(src, /showSend=\{isCompleted\}/);
  });

  it('dispatches the purchase-order:open-send-modal window event on Send click', () => {
    assert.match(
      src,
      /onSendClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\('purchase-order:open-send-modal'\)\)\}/,
    );
  });
});
