import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
      assert.doesNotMatch(src, /getArSubtype/);
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
