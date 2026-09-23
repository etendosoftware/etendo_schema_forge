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
        /import BulkDocumentAction,\s*\{[^}]*\bbuildInOutActions\b[^}]*\}\s*from\s*['"]@\/components\/contract-ui\/BulkDocumentAction['"]/,
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

  // ETP-5378 — bulk Contabilizar, at parity with Goods Shipment. The window previously
  // offered no way to post from the list at all.
  describe('ETP-5378 — bulk "Contabilizar" action', () => {
    it('also imports buildPostActions and postRowFilter from BulkDocumentAction', () => {
      assert.match(src, /import BulkDocumentAction,\s*\{[^}]*\bbuildPostActions\b[^}]*\}/);
      assert.match(src, /import BulkDocumentAction,\s*\{[^}]*\bpostRowFilter\b[^}]*\}/);
    });

    it('renders a second BulkDocumentAction wired to the neoAction mode', () => {
      assert.match(src, /actionMode="neoAction"/);
      assert.match(src, /buildActions=\{buildPostActions\}/);
      assert.match(src, /rowFilter=\{postRowFilter\}/);
      assert.match(src, /labelKey="post"/);
    });

    it('targets the returnMaterialReceipt entity, like the confirm button next to it', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,300}actionMode="neoAction"[\s\S]{0,300}entity="returnMaterialReceipt"|<BulkDocumentAction[\s\S]{0,300}entity="returnMaterialReceipt"[\s\S]{0,300}actionMode="neoAction"/,
      );
    });

    // The confirm button's own label is ETP-5302's "process" (it was "confirmBulk"
    // before that rename); what this pins is that Contabilizar was ADDED beside it.
    // The count went 2 → 3 with the ETP-5378 QA follow-up below (bulk Descontabilizar);
    // it stays asserted exactly so that a fourth instance appearing by copy-paste has to
    // be a deliberate edit here too.
    it('keeps the confirm button — Contabilizar is added, not a replacement', () => {
      assert.match(src, /labelKey="process"/);
      assert.equal((src.match(/<BulkDocumentAction/g) || []).length, 3);
    });
  });

  // ETP-5378 QA follow-up (SEL-05 / SEL-06) — a Completed + "Contabilizado" row offered
  // "Descontabilizar" in the row-hover kebab but produced a selection bar with no document
  // action at all: the only two bulk instances were buildInOutActions and buildPostActions,
  // and the latter only fires for a `processed && !posted` row.
  //
  // These are STRUCTURAL assertions only. The wiring's semantics — that the shared helper
  // references are passed through rather than local copies, and that the union of the
  // mounted builders is non-empty for a posted row — are asserted by reference in
  // `index.vitest.jsx`, which a regex cannot do.
  describe('ETP-5378 QA follow-up — bulk "Descontabilizar" action', () => {
    it('also imports buildUnpostActions and unpostRowFilter from BulkDocumentAction', () => {
      assert.match(src, /import BulkDocumentAction,\s*\{[^}]*\bbuildUnpostActions\b[^}]*\}/);
      assert.match(src, /import BulkDocumentAction,\s*\{[^}]*\bunpostRowFilter\b[^}]*\}/);
    });

    it('renders a third BulkDocumentAction wired to the unpost pair on the neoAction path', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,400}actionMode="neoAction"[\s\S]{0,400}buildActions=\{buildUnpostActions\}[\s\S]{0,400}rowFilter=\{unpostRowFilter\}[\s\S]{0,400}labelKey="unpost"/,
      );
    });

    it('targets the returnMaterialReceipt entity, like the two instances before it', () => {
      assert.match(
        src,
        /entity="returnMaterialReceipt"[\s\S]{0,400}buildActions=\{buildUnpostActions\}/,
      );
    });

    // PRODUCT RULE: on this window the accounting reversal is a standalone action, so it is
    // never chained as a pre-step of another one (that opt-in belongs to the invoice windows).
    it('does not opt into preUnpostActions', () => {
      assert.doesNotMatch(src, /preUnpostActions/);
    });
  });
  // ETP-5378 — row-hover "Confirmar", opening the same popup the form's
  // ConfirmWithCreditButton already shows on this window (topbarRight, Borrador only).
  describe('ETP-5378 — row-hover "Confirmar" (confirmAction)', () => {
    it('imports its own row confirm modal', () => {
      assert.match(src, /import ReturnMaterialReceiptRowConfirmModal from '\.\/ReturnMaterialReceiptRowConfirmModal\.jsx';/);
    });

    it('passes confirmAction to ReturnWindowShell with the modal and spec/entity names', () => {
      assert.match(src, /confirmAction=\{\{[\s\S]{0,400}ConfirmModal: ReturnMaterialReceiptRowConfirmModal[\s\S]{0,400}\}\}/);
      assert.match(src, /confirmAction=\{\{[\s\S]{0,400}specName: 'return-material-receipt'[\s\S]{0,400}\}\}/);
      assert.match(src, /confirmAction=\{\{[\s\S]{0,400}entityName: 'returnMaterialReceipt'[\s\S]{0,400}\}\}/);
    });

    it("wires the invoice-result title, doc type and route for the popup's \"create invoice\" branch", () => {
      assert.match(src, /invoiceResultTitleKey: 'rmrInvoiceCreatedTitle'/);
      assert.match(src, /invoiceDocType: 'facturaVenta'/);
      assert.match(src, /invoiceRoute: '\/sales-invoice'/);
    });
  });
});