import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTIFACTS = join(ROOT, 'artifacts');

// All 16 windows that opted into inline-editable lines layout
const INLINE_WINDOWS = [
  'contacts',
  'goods-movements',
  'goods-receipt',
  'goods-shipment',
  'internal-consumption',
  'payment-out',
  'physical-inventory',
  'purchase-invoice',
  'purchase-order',
  'return-from-customer',
  'return-material-receipt',
  'return-to-vendor',
  'return-to-vendor-shipment',
  'sales-invoice',
  'sales-order',
  'sales-quotation',
];

// Canonical lines-entity table per window. Used to verify the generated forwardRef pattern.
// Each file must import InlineLinesPanel and branch on linesLayout === 'inlineEditable'.
const LINES_TABLE = {
  'contacts':                  'contacts/ContactTable.jsx',
  'goods-movements':           'goods-movements/MovementLineTable.jsx',
  'goods-receipt':             'goods-receipt/GoodsReceiptLineTable.jsx',
  'goods-shipment':            'goods-shipment/GoodsShipmentLineTable.jsx',
  'internal-consumption':      'internal-consumption/InternalConsumptionLineTable.jsx',
  'payment-out':               'payment-out/LinesTable.jsx',
  'physical-inventory':        'physical-inventory/InventoryLineTable.jsx',
  'purchase-invoice':          'purchase-invoice/LinesTable.jsx',
  'purchase-order':            'purchase-order/LinesTable.jsx',
  'return-from-customer':      'return-from-customer/CustomerReturnLineTable.jsx',
  'return-material-receipt':   'return-material-receipt/ReturnMaterialReceiptLineTable.jsx',
  'return-to-vendor':          'return-to-vendor/LinesTable.jsx',
  'return-to-vendor-shipment': 'return-to-vendor-shipment/LinesTable.jsx',
  'sales-invoice':             'sales-invoice/LinesTable.jsx',
  'sales-order':               'sales-order/LinesTable.jsx',
  'sales-quotation':           'sales-quotation/QuotationLineTable.jsx',
};

describe('Inline-editable lines rollout — all 16 windows', () => {
  describe('decisions.json — linesLayout flag', () => {
    for (const win of INLINE_WINDOWS) {
      it(`${win} declares linesLayout: inlineEditable`, () => {
        const path = join(ARTIFACTS, win, 'decisions.json');
        const decisions = JSON.parse(readFileSync(path, 'utf8'));
        assert.equal(
          decisions.window?.linesLayout,
          'inlineEditable',
          `${win}/decisions.json: window.linesLayout must be "inlineEditable"`,
        );
      });
    }
  });

  describe('generated LinesTable — forwardRef + InlineLinesPanel branch', () => {
    for (const [win, relPath] of Object.entries(LINES_TABLE)) {
      const filename = relPath.split('/').pop();
      it(`${win}: ${filename} uses forwardRef and routes to InlineLinesPanel`, () => {
        const src = readFileSync(join(ARTIFACTS, win, 'generated/web', relPath), 'utf8');
        assert.match(src, /forwardRef/, `${win}: missing forwardRef`);
        assert.match(src, /InlineLinesPanel/, `${win}: missing InlineLinesPanel import/use`);
        assert.match(src, /linesLayout.*['"]inlineEditable['"]/, `${win}: missing inlineEditable branch condition`);
        assert.match(src, /export default /, `${win}: missing default export`);
      });
    }
  });

  describe('contacts secondary tabs — all three child tables use InlineLinesPanel', () => {
    const CONTACT_TABLES = [
      'ContactTable.jsx',
      'BankAccountTable.jsx',
      'LocationAddressTable.jsx',
    ];
    for (const file of CONTACT_TABLES) {
      it(`contacts/${file} uses InlineLinesPanel`, () => {
        const src = readFileSync(
          join(ARTIFACTS, 'contacts/generated/web/contacts', file),
          'utf8',
        );
        assert.match(src, /InlineLinesPanel/, `contacts/${file}: missing InlineLinesPanel`);
        assert.match(src, /forwardRef/, `contacts/${file}: missing forwardRef`);
      });
    }
  });

  describe('classic windows are NOT in the rollout', () => {
    // Spot-check windows that have decisions.json but should still use the classic layout.
    // Only include windows that actually have a decisions.json file.
    const CLASSIC_WINDOWS = [
      'assets',
      'tax',
    ];
    for (const win of CLASSIC_WINDOWS) {
      it(`${win} does NOT declare linesLayout: inlineEditable`, () => {
        const path = join(ARTIFACTS, win, 'decisions.json');
        const decisions = JSON.parse(readFileSync(path, 'utf8'));
        assert.notEqual(
          decisions.window?.linesLayout,
          'inlineEditable',
          `${win} unexpectedly opted into inline-editable`,
        );
      });
    }

    it('payment-in does NOT declare linesLayout (detailEntity is null)', () => {
      const path = join(ARTIFACTS, 'payment-in', 'decisions.json');
      const decisions = JSON.parse(readFileSync(path, 'utf8'));
      assert.notEqual(
        decisions.window?.linesLayout,
        'inlineEditable',
        'payment-in should not opt into inline-editable (detailEntity: null)',
      );
    });
  });
});
