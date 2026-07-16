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

    it('classifies each linked shipment via movementType === "C+"', () => {
      assert.match(src, /const isReturn = s\.movementType === 'C\+'/);
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
// Behavioral: movementType → chip type → route/label mapping.
//
// Mirrors the exact classification expression from the source
// (`s.movementType === 'C+' ? 'return-material-receipt' : 'shipment'`,
// verified above via regex) and resolves the result through the REAL shared
// registry text (docChipTypes.jsx) + the REAL es_ES locale, so a drift in
// either the routePrefix or the translated label would break this test.
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
  const isReturn = shipment.movementType === 'C+';
  return isReturn ? 'return-material-receipt' : 'shipment';
}

describe('sales-invoice RelatedDocuments — movementType classification (behavioral)', () => {
  it('classifies a C+ linked shipment as a return, routed to /return-material-receipt/{id} and labeled "Devolución"', () => {
    const type = classify({ id: 'ship-1', movementType: 'C+' });
    assert.equal(type, 'return-material-receipt');

    const cfg = extractChipTypeConfig(docChipTypesSrc, 'return-material-receipt');
    assert.equal(cfg.routePrefix, '/return-material-receipt');
    assert.equal(cfg.titleKey, 'returnDoc');

    const label = extractLocaleLabel(esLocale, cfg.titleKey);
    assert.match(label, /^Devolución/);
  });

  it('classifies a non-C+ linked shipment (e.g. C-) as a normal shipment, routed to /goods-shipment/{id} and labeled "Envío"', () => {
    const type = classify({ id: 'ship-2', movementType: 'C-' });
    assert.equal(type, 'shipment');

    const cfg = extractChipTypeConfig(docChipTypesSrc, 'shipment');
    assert.equal(cfg.routePrefix, '/goods-shipment');
    assert.equal(cfg.titleKey, 'shipmentDoc');

    const label = extractLocaleLabel(esLocale, cfg.titleKey);
    assert.match(label, /^Envío/);
  });

  it('classifies a shipment with a missing/undefined movementType as a normal shipment (safe default)', () => {
    assert.equal(classify({ id: 'ship-3' }), 'shipment');
  });

  it('handles an empty linkedShipments array the same way the component does (no chips produced)', () => {
    const shipments = [];
    const chips = shipments.map(classify);
    assert.deepEqual(chips, []);
  });

  it('classifies a mixed batch independently per entry', () => {
    const shipments = [
      { id: 'a', movementType: 'C+' },
      { id: 'b', movementType: 'C-' },
      { id: 'c', movementType: 'C+' },
    ];
    const types = shipments.map(classify);
    assert.deepEqual(types, ['return-material-receipt', 'shipment', 'return-material-receipt']);
  });
});
