import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsShipmentConfirmModal.jsx'), 'utf8');

describe('GoodsShipmentConfirmModal', () => {
  it('exports a default function component named GoodsShipmentConfirmModal', () => {
    assert.match(src, /export default function GoodsShipmentConfirmModal/);
  });

  it('imports ConfirmInOutModal from @/components/contract-ui', () => {
    assert.match(src, /import ConfirmInOutModal from '@\/components\/contract-ui\/ConfirmInOutModal'/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /import\s*\{[^}]*useUI[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });

  // ── ETP-4848: invoice checkbox default ─────────────────────────────────────
  // GoodsShipmentConfirmModal is only ever mounted by GoodsShipmentActions when
  // data.invoiceStatus < 100 (see the `!isCompleted && showConfirmModal &&` branch,
  // the fully-invoiced case renders ConfirmShipmentInvoicedModal instead), so this
  // modal can hardcode defaultCreateInvoice=true unconditionally.
  describe('invoice checkbox default (ETP-4848)', () => {
    it('passes defaultCreateInvoice={true} to ConfirmInOutModal', () => {
      assert.match(src, /defaultCreateInvoice=\{true\}/);
    });

    it('does not pass defaultCreateInvoice={false} (regression guard)', () => {
      assert.doesNotMatch(src, /defaultCreateInvoice=\{false\}/);
    });

    it('passes a non-empty invoiceAction so the toggle actually renders', () => {
      assert.match(src, /invoiceAction="createDraftInvoice"/);
    });
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

  // ── ETP-4942: price-list picker wiring ──────────────────────────────────────
  // A shipment with no linked sales order has no price list of its own, so the
  // confirm popup's tariff picker is required in that case (hasLinkedOrder=false)
  // and optional/pre-filled otherwise. Behavioral coverage of the hasLinkedOrder
  // derivation itself (empty/null linkedOrders → false, non-empty → true) lives in
  // the isolated boolean-logic tests below, run via node:test with no JSX/React
  // involved — mirroring the plain-source-regex style already used throughout
  // this file (no runtime render harness is wired for artifacts/**/custom under
  // node:test, so this file always asserts source shape, never mounts JSX).
  describe('price-list picker (ETP-4942)', () => {
    it('passes showPriceListPicker (boolean shorthand) to ConfirmInOutModal', () => {
      assert.match(src, /showPriceListPicker(?!=)/);
    });

    it('passes isSOTrx (boolean shorthand) to ConfirmInOutModal', () => {
      assert.match(src, /isSOTrx(?!=)/);
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

  // ── ETP-5052: resolved price list wiring ────────────────────────────────────
  // GoodsShipmentHeaderHandler#enrichResolvedPriceList computes the tariff to
  // preselect (linked order's, else the Business Partner's) server-side and puts
  // it on data.resolvedPriceListId. This modal must forward it as
  // defaultPriceListId so the picker (usePriceListPicker) preselects it instead
  // of always falling back to the system-default price list.
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
// directory; see the comment above). Any change to the real expression in
// GoodsShipmentConfirmModal.jsx must be mirrored here, and the source-match test
// above (`derives hasLinkedOrder from...`) fails loudly if the two ever drift apart.
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
