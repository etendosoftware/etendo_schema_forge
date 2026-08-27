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

  describe('ETP-4717 — no emailAction (row-hover "Enviar" removed)', () => {
    // QA (Emilio Polliotti) rejected the ETP-4718 "Enviar" action for this
    // window: the frontend derived the email contract name as
    // `${windowName}-send` (`return-to-vendor-shipment-send`), but the
    // backend only registers `ReturnToVendorSendEmailContract.NAME` =
    // `return-to-vendor-send`, so every send failed with "Unknown email
    // contract". `decisions.json → window.sendDocument.enabled: false`
    // already suppresses the row-hover Email icon via `sendDocument`
    // (which RowQuickActions prioritizes over `documentPreview`); the
    // `emailAction` prop itself was removed as dead-code cleanup, matching
    // the sibling `return-material-receipt/index.jsx` (no `emailAction`
    // either). These assertions guard against `emailAction` (and its
    // now-unused imports) creeping back in.
    it('does not import useReturnToVendorPdf', () => {
      assert.doesNotMatch(src, /import\s*\{\s*useReturnToVendorPdf\s*\}\s*from\s*['"]\.\/useReturnToVendorPdf\.js['"]/);
    });

    it('does not import useMenuLabel from @/i18n', () => {
      assert.doesNotMatch(src, /import\s*\{\s*useMenuLabel\s*\}\s*from\s*['"]@\/i18n['"]/);
    });

    it('does not resolve a tMenu const via useMenuLabel()', () => {
      assert.doesNotMatch(src, /const tMenu = useMenuLabel\(\);/);
    });

    it('does not pass an emailAction prop to ReturnWindowShell', () => {
      assert.doesNotMatch(src, /emailAction=/);
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
