import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ConfirmGoodsReceiptModal.jsx'), 'utf8');

describe('ConfirmGoodsReceiptModal', () => {
  it('exports a default function component named ConfirmGoodsReceiptModal', () => {
    assert.match(src, /export default function ConfirmGoodsReceiptModal/);
  });

  it('imports ConfirmInOutModal from @/components/contract-ui', () => {
    assert.match(src, /import ConfirmInOutModal from '@\/components\/contract-ui\/ConfirmInOutModal'/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /import\s*\{[^}]*useUI[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });

  it('passes recordId and base through from props, but never a credential', () => {
    assert.match(src, /base=\{base\}/);
    assert.doesNotMatch(src, /headers=\{headers\}/);  // ETP-4576: the child owns its credential now
    assert.match(src, /recordId=\{recordId\}/);
  });

  it('passes onConfirmed and onClose through from props', () => {
    assert.match(src, /onConfirmed=\{onConfirmed\}/);
    assert.match(src, /onClose=\{onClose\}/);
  });

  // ── ETP-4942: price-list picker wiring, purchase side ───────────────────────
  // Mirrors the sales-side fix (GoodsShipmentConfirmModal): a receipt with no
  // linked purchase order has no price list of its own, and the Business
  // Partner's purchase tariff is often unset, so the tariff picker is required
  // in that case (hasLinkedOrder=false) and optional/pre-filled otherwise.
  // Unlike the sales modal, isSOTrx must be explicitly false here — this is the
  // purchase-side flow (Goods Receipt -> Purchase Invoice), so the picker must
  // filter on PURCHASE price lists, never sales ones.
  describe('price-list picker (ETP-4942)', () => {
    it('passes showPriceListPicker (boolean shorthand) to ConfirmInOutModal', () => {
      assert.match(src, /showPriceListPicker(?!=)/);
    });

    it('passes isSOTrx={false} to ConfirmInOutModal', () => {
      assert.match(src, /isSOTrx=\{false\}/);
    });

    it('does not pass isSOTrx as a truthy boolean shorthand (regression guard)', () => {
      // The sales-side modal uses the `isSOTrx` shorthand (implicitly true); the
      // purchase-side modal must always pass the explicit ={false} form instead.
      assert.doesNotMatch(src, /isSOTrx(?!=)/);
      assert.doesNotMatch(src, /isSOTrx=\{true\}/);
    });

    it('passes hasLinkedOrder={hasLinkedOrder} to ConfirmInOutModal', () => {
      assert.match(src, /hasLinkedOrder=\{hasLinkedOrder\}/);
    });

    it('derives hasLinkedOrder from data.linkedOrders being a non-empty array', () => {
      assert.match(
        src,
        /const hasLinkedOrder = Array\.isArray\(data\?\.linkedOrders\) && data\.linkedOrders\.length > 0;/,
      );
    });
  });

  // ── ETP-5052: resolved price list wiring, purchase side ─────────────────────
  // GoodsReceiptHeaderHandler#enrichResolvedPriceList computes the tariff to
  // preselect (linked purchase order's, else the Business Partner's own PURCHASE
  // price list) server-side and puts it on data.resolvedPriceListId. This modal
  // must forward it as defaultPriceListId so the picker (usePriceListPicker)
  // preselects it instead of always falling back to the system-default price
  // list — exact mirror of GoodsShipmentConfirmModal's own wiring for sales.
  describe('resolved price-list wiring (ETP-5052)', () => {
    it('passes defaultPriceListId={data?.resolvedPriceListId} to ConfirmInOutModal', () => {
      assert.match(src, /defaultPriceListId=\{data\?\.resolvedPriceListId\}/);
    });

    it('does not pass a hardcoded or differently-derived defaultPriceListId (regression guard)', () => {
      // Only one defaultPriceListId= occurrence should exist, and it must be the
      // exact data?.resolvedPriceListId derivation asserted above.
      const matches = src.match(/defaultPriceListId=\{[^}]*\}/g) || [];
      assert.equal(matches.length, 1);
      assert.equal(matches[0], 'defaultPriceListId={data?.resolvedPriceListId}');
    });
  });
});

// ── hasLinkedOrder derivation — isolated boolean-logic coverage (ETP-4942) ────
//
// The derivation itself (`Array.isArray(data?.linkedOrders) && data.linkedOrders.length > 0`)
// is a plain expression with no JSX/React dependency, so it is re-declared here,
// verbatim, and exercised directly — giving genuine empty/null/non-empty behavioral
// coverage without needing a component render harness (none is wired for this
// directory; mirrors the pattern already used for GoodsShipmentConfirmModal). Any
// change to the real expression in ConfirmGoodsReceiptModal.jsx must be mirrored
// here, and the source-match test above (`derives hasLinkedOrder from...`) fails
// loudly if the two ever drift apart.
function deriveHasLinkedOrder(data) {
  return Array.isArray(data?.linkedOrders) && data.linkedOrders.length > 0;
}

describe('hasLinkedOrder derivation logic (ETP-4942)', () => {
  it('returns false when data is undefined', () => {
    assert.equal(deriveHasLinkedOrder(undefined), false);
  });

  it('returns false when data.linkedOrders is undefined', () => {
    assert.equal(deriveHasLinkedOrder({}), false);
  });

  it('returns false when data.linkedOrders is null', () => {
    assert.equal(deriveHasLinkedOrder({ linkedOrders: null }), false);
  });

  it('returns false when data.linkedOrders is an empty array', () => {
    assert.equal(deriveHasLinkedOrder({ linkedOrders: [] }), false);
  });

  it('returns false when data.linkedOrders is not an array', () => {
    assert.equal(deriveHasLinkedOrder({ linkedOrders: 'not-an-array' }), false);
  });

  it('returns true when data.linkedOrders has one element', () => {
    assert.equal(deriveHasLinkedOrder({ linkedOrders: [{ id: 'order-1' }] }), true);
  });

  it('returns true when data.linkedOrders has multiple elements', () => {
    assert.equal(
      deriveHasLinkedOrder({ linkedOrders: [{ id: 'order-1' }, { id: 'order-2' }] }),
      true,
    );
  });
});
