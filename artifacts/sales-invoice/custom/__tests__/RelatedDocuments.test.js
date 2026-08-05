import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArSubtype } from '../invoiceSubtype.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'RelatedDocuments.jsx'), 'utf8');

// The shared doc-chip registry both this file and the classification below rely on.
// Read as text too (constants.jsx embeds JSX and can't be `import`ed from node:test).
const appShellSrcDir = join(__dirname, '..', '..', '..', '..', 'tools', 'app-shell', 'src');
const docChipTypesSrc = readFileSync(join(appShellSrcDir, 'components', 'related-documents', 'docChipTypes.jsx'), 'utf8');
const esLocale = readFileSync(join(appShellSrcDir, 'locales', 'es_ES.json'), 'utf8');

describe('sales-invoice RelatedDocuments', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function RelatedDocuments/);
  });

  it('imports useUI from @/i18n and the shared doc-chip helpers', () => {
    assert.match(src, /from\s+['"]@\/i18n['"]/);
    assert.match(src, /useUI/);
    assert.match(src, /docChipProps/);
    assert.match(src, /from\s+['"]@\/components\/related-documents['"]/);
  });

  describe('linkedShipments classification (regression: ETP-4534)', () => {
    it('reads data.linkedShipments unconditionally, not derived from salesOrder', () => {
      assert.match(src, /Array\.isArray\(data\.linkedShipments\)/);
      assert.match(src, /const linked = Array\.isArray\(data\.linkedShipments\) \? data\.linkedShipments : \[\]/);
      assert.match(src, /setShipments\(linked\)/);
    });

    it('does not gate linkedShipments behind an order-scoped goods-shipment fetch anymore', () => {
      assert.doesNotMatch(src, /fetchByCriteria\('goods-shipment'/);
    });

    it('classifies each linked shipment via the server-provided isReturn flag, not movementType', () => {
      // movementType only ever takes 'C-' (all sales-side docs, shipments AND returns
      // alike) or 'V+' (purchase side) — see M_INOUT_TRG_PROV.xml. It can never
      // discriminate a return. isReturn comes from a C_DocType join server-side
      // (SalesInvoiceHeaderHandler#enrichLinkedShipments).
      assert.match(src, /const isReturn = s\.isReturn === true/);
      assert.doesNotMatch(src, /s\.movementType === 'C\+'/);
    });

    it('renders the chip type from isReturn via the shared docChipProps registry', () => {
      assert.match(
        src,
        /docChipProps\(\{\s*type:\s*isReturn \? 'return-material-receipt' : 'shipment',\s*doc:\s*s,\s*ui,\s*navigate\s*\}\)/
      );
    });

    it('does not render the dropped sourceReturnReceipt chip branch', () => {
      assert.doesNotMatch(src, /sourceReturnReceipt/);
    });
  });

  // ETP-4737: this used to be an obsolete regression guard asserting the
  // source does NOT use getArSubtype at all. RelatedDocuments.jsx was
  // correctly changed in this ticket to gate the original-invoices fetch on
  // getArSubtype(data) === 'RECTIFICATIVA' (replacing a fragile
  // `transactionDocument$_identifier.includes('credit')` string check that
  // could never recognize the new unified "Factura Rectificativa" doc type).
  // These tests verify the real gating behavior, not just its absence of the
  // old check.
  describe('original-invoices fetch gating via getArSubtype (ETP-4737)', () => {
    it('declares the isRectificativa gate using getArSubtype(data)', () => {
      assert.match(src, /const isRectificativa = getArSubtype\(data\) === 'RECTIFICATIVA'/);
      assert.match(src, /if \(isRectificativa\) \{/);
    });

    it('gates the fetch open for a RECTIFICATIVA row (server-injected subtype)', () => {
      const rectificativaRow = { arInvoiceSubtype: 'RECTIFICATIVA' };
      assert.equal(getArSubtype(rectificativaRow) === 'RECTIFICATIVA', true);
    });

    it('keeps the fetch closed for a plain FAC row (server-injected subtype)', () => {
      const facRow = { arInvoiceSubtype: 'FAC' };
      assert.equal(getArSubtype(facRow) === 'RECTIFICATIVA', false);
    });

    it('gates open for a legacy invoice (no arInvoiceSubtype yet) via the identifier fallback', () => {
      // The former ".includes('credit')"-only check recognized this legacy
      // wording, but would have silently missed the new unified doc type below.
      const legacyCreditNote = { 'transactionDocument$_identifier': 'Nota de Crédito' };
      assert.equal(getArSubtype(legacyCreditNote) === 'RECTIFICATIVA', true);
    });

    it('gates open for the new unified "Factura Rectificativa" doc type, which a raw "credit" substring match would have missed', () => {
      const newRectificativa = { 'transactionDocument$_identifier': 'Factura Rectificativa' };
      assert.equal(getArSubtype(newRectificativa) === 'RECTIFICATIVA', true);
    });

    it('keeps the fetch closed for a plain "Standard Invoice" identifier', () => {
      const plainInvoice = { 'transactionDocument$_identifier': 'Standard Invoice' };
      assert.equal(getArSubtype(plainInvoice) === 'RECTIFICATIVA', false);
    });
  });

  describe('sourceInvoice chip', () => {
    it('still renders a sales-invoice chip when data.sourceInvoice is present', () => {
      assert.match(src, /if \(data\?\.sourceInvoice\)/);
      assert.match(
        src,
        /docChipProps\(\{\s*type:\s*'sales-invoice',\s*doc:\s*data\.sourceInvoice,\s*ui,\s*navigate\s*\}\)/
      );
    });
  });

  describe('empty state (no data)', () => {
    it('delegates loading/empty rendering to RelatedDocumentsShell, no local empty-state markup', () => {
      assert.match(src, /<RelatedDocumentsShell loading=\{loading\} onRefresh=\{[^}]+\}>/);
      assert.doesNotMatch(src, /noRelatedDocuments/);
    });
  });
});

// ---------------------------------------------------------------------------
// Behavioral: isReturn → chip type → route/label mapping.
//
// Mirrors the exact classification expression from the source
// (`s.isReturn === true ? 'return-material-receipt' : 'shipment'`,
// verified above via regex) and resolves the result through the REAL shared
// registry text (docChipTypes.jsx) + the REAL es_ES locale, so a drift in
// either the routePrefix or the translated label would break this test.
//
// isReturn is populated server-side (SalesInvoiceHeaderHandler#
// enrichLinkedShipments) from a C_DocType.IsReturn join — NOT from
// M_InOut.MovementType, which per M_INOUT_TRG_PROV.xml only ever takes 'C-'
// (all sales-side docs, shipments AND returns alike) or 'V+' (purchase side)
// and can never discriminate a return (ETP-4534).
// ---------------------------------------------------------------------------

function extractChipTypeConfig(registrySrc, type) {
  const re = new RegExp(`(?:'${type}'|${type.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}):\\s*\\{([^}]*)\\}`);
  const m = registrySrc.match(re);
  assert.ok(m, `expected DOCUMENT_CHIP_TYPES to declare an entry for "${type}"`);
  const block = m[1];
  const titleKeyMatch = block.match(/titleKey:\s*'([^']+)'/);
  const routePrefixMatch = block.match(/routePrefix:\s*'([^']+)'/);
  return { titleKey: titleKeyMatch?.[1], routePrefix: routePrefixMatch?.[1] };
}

function extractLocaleLabel(localeSrc, key) {
  const re = new RegExp(`"${key}":\\s*"([^"]+)"`);
  const m = localeSrc.match(re);
  assert.ok(m, `expected es_ES.json to declare a translation for "${key}"`);
  return m[1];
}

function classify(shipment) {
  const isReturn = shipment.isReturn === true;
  return isReturn ? 'return-material-receipt' : 'shipment';
}

describe('sales-invoice RelatedDocuments — isReturn classification (behavioral)', () => {
  it('classifies a linked shipment with isReturn=true as a return, routed to /return-material-receipt/{id} and labeled "Devolución"', () => {
    const type = classify({ id: 'ship-1', isReturn: true, movementType: 'C-' });
    assert.equal(type, 'return-material-receipt');

    const cfg = extractChipTypeConfig(docChipTypesSrc, 'return-material-receipt');
    assert.equal(cfg.routePrefix, '/return-material-receipt');
    assert.equal(cfg.titleKey, 'returnDoc');

    const label = extractLocaleLabel(esLocale, cfg.titleKey);
    assert.match(label, /^Devolución/);
  });

  it('classifies a linked shipment with isReturn=false as a normal shipment, routed to /goods-shipment/{id} and labeled "Envío", even though movementType is the same "C-" as a return', () => {
    const type = classify({ id: 'ship-2', isReturn: false, movementType: 'C-' });
    assert.equal(type, 'shipment');

    const cfg = extractChipTypeConfig(docChipTypesSrc, 'shipment');
    assert.equal(cfg.routePrefix, '/goods-shipment');
    assert.equal(cfg.titleKey, 'shipmentDoc');

    const label = extractLocaleLabel(esLocale, cfg.titleKey);
    assert.match(label, /^Envío/);
  });

  it('classifies a shipment with a missing/undefined isReturn as a normal shipment (safe default)', () => {
    assert.equal(classify({ id: 'ship-3' }), 'shipment');
  });

  it('handles an empty linkedShipments array the same way the component does (no chips produced)', () => {
    const shipments = [];
    const chips = shipments.map(classify);
    assert.deepEqual(chips, []);
  });

  it('classifies a mixed batch independently per entry', () => {
    const shipments = [
      { id: 'a', isReturn: true },
      { id: 'b', isReturn: false },
      { id: 'c', isReturn: true },
    ];
    const types = shipments.map(classify);
    assert.deepEqual(types, ['return-material-receipt', 'shipment', 'return-material-receipt']);
  });
});

// ---------------------------------------------------------------------------
// ETP-4737: data.originInvoice — set when this rectificativa was created via
// the "Import from Source Invoice" popup (manual correction). Independent of
// sourceInvoice above, which only covers the auto-generated-from-return case.
// Server injects just the id (+ _identifier), not the full record, so the
// component fetches it via fetchById inside the same effect.
// ---------------------------------------------------------------------------

describe('sales-invoice RelatedDocuments — originInvoice chip (ETP-4737)', () => {
  it('declares an originInvoice state slot', () => {
    assert.match(src, /const \[originInvoice, setOriginInvoice\] = useState\(null\)/);
  });

  it('fetches originInvoice via fetchById when data.originInvoice is present', () => {
    assert.match(src, /if \(data\.originInvoice\) \{/);
    assert.match(
      src,
      /fetchById\('sales-invoice', 'header', data\.originInvoice, token, apiBaseUrl\)/
    );
  });

  it('resets originInvoice to null when data.originInvoice is absent (no stale chip on re-fetch)', () => {
    assert.match(src, /\} else \{\s*setOriginInvoice\(null\);\s*\}/);
  });

  it('renders the origin-invoice chip with type "sales-invoice", gated on the fetched originInvoice state', () => {
    assert.match(src, /if \(originInvoice\) \{/);
    assert.match(
      src,
      /docChipProps\(\{\s*type:\s*'sales-invoice',\s*doc:\s*originInvoice,\s*ui,\s*navigate\s*\}\)/
    );
  });

  it('keeps the sourceInvoice chip gate separate and independent from the originInvoice gate', () => {
    // Both are their own top-level `if` blocks — not an if/else pair — so one
    // being present never suppresses the other.
    assert.match(src, /if \(data\?\.sourceInvoice\) \{/);
    assert.doesNotMatch(src, /if \(data\?\.sourceInvoice\)[\s\S]{0,40}\belse\b/);
  });
});

// ---------------------------------------------------------------------------
// Behavioral: chip-list composition mirrors the exact push order in the
// source (order -> shipments -> originalInvoices -> sourceInvoice ->
// originInvoice), verifying the new origin-invoice chip is additive and never
// replaces or hides any pre-existing chip.
// ---------------------------------------------------------------------------

function buildChipKinds({ order, shipments = [], originalInvoices = [], sourceInvoice, originInvoice } = {}) {
  const kinds = [];
  if (order) kinds.push('order');
  for (const s of shipments) kinds.push(s.isReturn === true ? 'return-material-receipt' : 'shipment');
  for (const _inv of originalInvoices) kinds.push('invoice');
  if (sourceInvoice) kinds.push('source-invoice');
  if (originInvoice) kinds.push('origin-invoice');
  return kinds;
}

describe('sales-invoice RelatedDocuments — chip composition with originInvoice (behavioral)', () => {
  it('produces no chips when nothing is set', () => {
    assert.deepEqual(buildChipKinds(), []);
  });

  it('renders only the origin-invoice chip when it is the sole related document', () => {
    assert.deepEqual(buildChipKinds({ originInvoice: { id: 'o1' } }), ['origin-invoice']);
  });

  it('renders nothing when originInvoice is absent, even with other data present', () => {
    assert.deepEqual(
      buildChipKinds({ order: { id: 'ord' } }),
      ['order']
    );
  });

  it('is additive alongside the pre-existing sourceInvoice chip (both render, neither replaces the other)', () => {
    const kinds = buildChipKinds({ sourceInvoice: { id: 's1' }, originInvoice: { id: 'o1' } });
    assert.deepEqual(kinds, ['source-invoice', 'origin-invoice']);
  });

  it('is additive alongside order, shipment and original-invoice chips (full house)', () => {
    const kinds = buildChipKinds({
      order: { id: 'ord' },
      shipments: [{ id: 'sh1', isReturn: true }, { id: 'sh2', isReturn: false }],
      originalInvoices: [{ id: 'oi1' }],
      sourceInvoice: { id: 's1' },
      originInvoice: { id: 'o1' },
    });
    assert.deepEqual(kinds, [
      'order',
      'return-material-receipt',
      'shipment',
      'invoice',
      'source-invoice',
      'origin-invoice',
    ]);
  });
});
