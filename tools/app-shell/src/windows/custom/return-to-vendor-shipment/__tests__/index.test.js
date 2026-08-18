import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('ReturnToVendorShipmentWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ReturnToVendorShipmentWindow/);
  });

  it('delegates to ReturnWindowShell', () => {
    assert.match(src, /<ReturnWindowShell/);
    assert.match(src, /import ReturnWindowShell from '\.\.\/shared\/ReturnWindowShell'/);
  });

  describe('ETP-4718 — emailAction wiring for row-hover "Enviar"', () => {
    it('imports useReturnToVendorPdf from the local PDF hook', () => {
      assert.match(src, /import\s*\{\s*useReturnToVendorPdf\s*\}\s*from\s*['"]\.\/useReturnToVendorPdf\.js['"]/);
    });

    it('imports useMenuLabel from @/i18n', () => {
      assert.match(src, /import\s*\{\s*useMenuLabel\s*\}\s*from\s*['"]@\/i18n['"]/);
    });

    it('resolves tMenu via useMenuLabel()', () => {
      assert.match(src, /const tMenu = useMenuLabel\(\);/);
    });

    it('passes an emailAction prop to ReturnWindowShell', () => {
      assert.match(src, /emailAction=\{\{/);
    });

    it('wires emailAction.usePdf to useReturnToVendorPdf', () => {
      assert.match(src, /emailAction=\{\{[\s\S]{0,300}usePdf:\s*useReturnToVendorPdf,/);
    });

    it("wires emailAction.documentType to tMenu('Return to Vendor Shipment')", () => {
      assert.match(
        src,
        /emailAction=\{\{[\s\S]{0,300}documentType:\s*tMenu\(['"]Return to Vendor Shipment['"]\),/,
      );
    });

    it("gates emailAction.visibleWhen to \"@documentStatus@='CO'\" (only Confirmado is sendable)", () => {
      assert.match(
        src,
        /emailAction=\{\{[\s\S]{0,300}visibleWhen:\s*"@documentStatus@='CO'",/,
      );
    });
  });

  describe('ETP-4857 — bulk "Confirmar" action for Borrador rows', () => {
    it('imports BulkDocumentAction and buildInOutActions from @/components/contract-ui/BulkDocumentAction', () => {
      assert.match(
        src,
        /import BulkDocumentAction,\s*\{\s*buildInOutActions\s*\}\s*from\s*['"]@\/components\/contract-ui\/BulkDocumentAction['"]/,
      );
    });

    it('defines ReturnToVendorShipmentBulkActions rendering BulkDocumentAction alongside CopyLinkButton', () => {
      assert.match(src, /function ReturnToVendorShipmentBulkActions\(props\)\s*\{/);
      assert.match(src, /<BulkDocumentAction/);
      assert.match(src, /<CopyLinkButton/);
    });

    it('wires BulkDocumentAction to entity="returnToVendorShipment"', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,200}entity="returnToVendorShipment"/,
      );
    });

    it('wires BulkDocumentAction to buildActions={buildInOutActions} (DR→CO only, no reactivate)', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,200}buildActions=\{buildInOutActions\}/,
      );
    });

    it('wires BulkDocumentAction to labelKey="confirmBulk"', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,200}labelKey="confirmBulk"/,
      );
    });

    it('passes ReturnToVendorShipmentBulkActions as bulkActions to ReturnWindowShell', () => {
      assert.match(src, /bulkActions=\{ReturnToVendorShipmentBulkActions\}/);
    });
  });
});
