import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('ReturnMaterialReceiptWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ReturnMaterialReceiptWindow/);
  });

  it('delegates to ReturnWindowShell', () => {
    assert.match(src, /<ReturnWindowShell/);
    assert.match(src, /import ReturnWindowShell from '\.\.\/shared\/ReturnWindowShell'/);
  });

  // ETP-5404 — the Contacto (BusinessPartner) selector never offered "create a
  // new contact" inline on this window, unlike Purchase Order / Sales Order /
  // Sales Quotation / Purchase Invoice / Sales Invoice / Goods Shipment. Fixed
  // by wrapping ReturnWindowShell in CreateContactContext.Provider (fed by
  // useCreateContactModal) and rendering its portal alongside it.
  describe('ETP-5404 — Contacto selector create-new-contact wiring', () => {
    it('imports CreateContactContext and useCreateContactModal', () => {
      assert.match(
        src,
        /import\s*\{\s*CreateContactContext\s*\}\s*from\s*['"]@\/components\/contract-ui\/CreateContactContext\.js['"]/,
      );
      assert.match(
        src,
        /import\s*\{\s*useCreateContactModal\s*\}\s*from\s*['"]@\/components\/contract-ui\/useCreateContactModal\.jsx['"]/,
      );
    });

    it('derives createContactCtxValue/contactPortal from useCreateContactModal with documentType: "sale"', () => {
      assert.match(
        src,
        /const\s*\{\s*createContactCtxValue,\s*contactPortal\s*\}\s*=\s*\n?\s*useCreateContactModal\(\{[\s\S]{0,120}documentType:\s*'sale'/,
      );
    });

    it('wraps ReturnWindowShell in CreateContactContext.Provider', () => {
      assert.match(
        src,
        /<CreateContactContext\.Provider value=\{createContactCtxValue\}>[\s\S]*<ReturnWindowShell/,
      );
    });

    it('renders {contactPortal} inside the CreateContactContext.Provider, after ReturnWindowShell', () => {
      assert.match(
        src,
        /<ReturnWindowShell[\s\S]*\{contactPortal\}[\s\S]*<\/CreateContactContext\.Provider>/,
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

    it('defines ReturnMaterialReceiptBulkActions rendering BulkDocumentAction alongside CopyLinkButton', () => {
      assert.match(src, /function ReturnMaterialReceiptBulkActions\(props\)\s*\{/);
      assert.match(src, /<BulkDocumentAction/);
      assert.match(src, /<CopyLinkButton/);
    });

    it('wires BulkDocumentAction to entity="returnMaterialReceipt"', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,200}entity="returnMaterialReceipt"/,
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

    it('passes ReturnMaterialReceiptBulkActions as bulkActions to ReturnWindowShell', () => {
      assert.match(src, /bulkActions=\{ReturnMaterialReceiptBulkActions\}/);
    });
  });
});
