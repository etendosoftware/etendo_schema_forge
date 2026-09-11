import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsReceiptSecondaryActions.jsx'), 'utf8');

// ETP-5260 — goods-receipt is the "worst case" from the plan: primaries
// ("Crear devolución", "Crear factura") and secondaries used to be
// INTERCALATED in GoodsReceiptActions.jsx. Both primaries stay there,
// unaffected by this migration — see GoodsReceiptActions.test.js for their
// own coverage.
describe('GoodsReceiptSecondaryActions', () => {
  it('exports a default function component named GoodsReceiptSecondaryActions', () => {
    assert.match(src, /export default function GoodsReceiptSecondaryActions/);
  });

  it('delegates Copy link to the shared DocumentSecondaryActions component', () => {
    assert.match(src, /import DocumentSecondaryActions from '@\/windows\/custom\/shared\/DocumentSecondaryActions'/);
    assert.match(src, /<DocumentSecondaryActions/);
    assert.match(src, /windowName="goods-receipt"/);
  });

  // goods-receipt clones through its own bespoke CloneReceiptModal (fetches
  // receipt lines, then POSTs cloneRecord — a different shape than the
  // generic CloneOrderModal), so DocumentSecondaryActions' built-in clone
  // config is explicitly disabled and Clone is rendered via `children` instead.
  it('disables DocumentSecondaryActions\' built-in clone config (clone={false})', () => {
    assert.match(src, /clone=\{false\}/);
  });

  it('imports CloneReceiptModal from the generated GoodsReceiptActions module', () => {
    assert.match(src, /import \{ CloneReceiptModal \} from '@generated\/goods-receipt\/custom\/GoodsReceiptActions'/);
  });

  it('renders its own CloneButton as a child, wired to open CloneReceiptModal', () => {
    assert.match(src, /import CloneButton from '@\/windows\/custom\/shared\/CloneButton\.jsx'/);
    assert.match(src, /<CloneButton[\s\S]*?onClick=\{\(\) => setShowClone\(true\)\}/);
    assert.match(src, /showClone && createPortal\(\s*<CloneReceiptModal/);
  });

  it('navigates to the cloned receipt after a successful clone', () => {
    assert.match(src, /navigate\(`\/goods-receipt\/\$\{newId\}`\)/);
  });

  it('has no showSend/onSendClick wiring — this window never had a Send button', () => {
    assert.doesNotMatch(src, /showSend/);
    assert.doesNotMatch(src, /onSendClick/);
  });
});
