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

  describe('ETP-5124 — emailAction wired (row-hover "Enviar" re-added)', () => {
    // ETP-4717 had this action removed: the frontend derived the email
    // contract name as `${windowName}-send` (`return-to-vendor-shipment-send`),
    // but the backend only registered `ReturnToVendorSendEmailContract.NAME` =
    // `return-to-vendor-send`, so every send failed with "Unknown email
    // contract". The backend now registers the correctly-named contract
    // (`return-to-vendor-shipment-send`, via
    // `ReturnToVendorShipmentSendEmailContract`), so the mismatch no longer
    // applies and the `emailAction` prop is wired back in, mirroring the
    // sibling `return-material-receipt/index.jsx`. These assertions guard
    // the wiring stays present with the correct shape.
    it('imports useReturnToVendorPdf', () => {
      assert.match(src, /import\s*\{\s*useReturnToVendorPdf\s*\}\s*from\s*['"]\.\/useReturnToVendorPdf\.js['"]/);
    });

    it('imports useMenuLabel from @/i18n', () => {
      assert.match(src, /import\s*\{\s*useMenuLabel\s*\}\s*from\s*['"]@\/i18n['"]/);
    });

    it('resolves a tMenu const via useMenuLabel()', () => {
      assert.match(src, /const tMenu = useMenuLabel\(\);/);
    });

    it('passes an emailAction prop to ReturnWindowShell', () => {
      assert.match(src, /emailAction=\{\{/);
    });

    it('wires emailAction.usePdf to useReturnToVendorPdf', () => {
      assert.match(
        src,
        /emailAction=\{\{[\s\S]{0,200}usePdf:\s*useReturnToVendorPdf/,
      );
    });

    it('wires emailAction.documentType via tMenu(\'Return to Vendor Shipment\')', () => {
      assert.match(
        src,
        /emailAction=\{\{[\s\S]{0,200}documentType:\s*tMenu\('Return to Vendor Shipment'\)/,
      );
    });

    it('wires emailAction.visibleWhen to gate on documentStatus CO', () => {
      assert.match(
        src,
        /emailAction=\{\{[\s\S]{0,200}visibleWhen:\s*"@documentStatus@='CO'"/,
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

    it('wires BulkDocumentAction to labelKey="process" (ETP-5302)', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,200}labelKey="process"/,
      );
    });

    it('passes ReturnToVendorShipmentBulkActions as bulkActions to ReturnWindowShell', () => {
      assert.match(src, /bulkActions=\{ReturnToVendorShipmentBulkActions\}/);
    });
  });
});
