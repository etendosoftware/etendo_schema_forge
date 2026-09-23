import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
const confirmBtnSrc = readFileSync(join(__dirname, '..', 'ConfirmWithCreditButton.jsx'), 'utf8');
// tools/app-shell/src/windows/custom/<window>/__tests__ → repo root is 6 levels up.
const decisions = JSON.parse(readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'artifacts', 'return-to-vendor-shipment', 'decisions.json'),
  'utf8',
));

describe('ReturnToVendorShipmentWindow custom wrapper', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function ReturnToVendorShipmentWindow/);
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

    it('derives createContactCtxValue/contactPortal from useCreateContactModal with documentType: "purchase"', () => {
      assert.match(
        src,
        /const\s*\{\s*createContactCtxValue,\s*contactPortal\s*\}\s*=\s*\n?\s*useCreateContactModal\(\{[\s\S]{0,120}documentType:\s*'purchase'/,
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
        /import BulkDocumentAction,\s*\{[^}]*\bbuildInOutActions\b[^}]*\}\s*from\s*['"]@\/components\/contract-ui\/BulkDocumentAction['"]/,
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

    it('targets the returnToVendorShipment entity, like the confirm button next to it', () => {
      assert.match(
        src,
        /<BulkDocumentAction[\s\S]{0,300}actionMode="neoAction"[\s\S]{0,300}entity="returnToVendorShipment"|<BulkDocumentAction[\s\S]{0,300}entity="returnToVendorShipment"[\s\S]{0,300}actionMode="neoAction"/,
      );
    });

    // The confirm button's own label is ETP-5302's "process" (it was "confirmBulk"
    // before that rename); what this pins is that Contabilizar was ADDED beside it.
    it('keeps the confirm button — Contabilizar is added, not a replacement', () => {
      assert.match(src, /labelKey="process"/);
      assert.equal((src.match(/<BulkDocumentAction/g) || []).length, 2);
    });
  });
  // ETP-5378 — row-hover "Confirmar", opening the same popup the form's
  // ConfirmWithCreditButton already shows on this window (topbarRight, Borrador only).
  describe('ETP-5378 — row-hover "Confirmar" (confirmAction)', () => {
    it('imports its own row confirm modal', () => {
      assert.match(src, /import ReturnToVendorShipmentRowConfirmModal from '\.\/ReturnToVendorShipmentRowConfirmModal\.jsx';/);
    });

    it('passes confirmAction to ReturnWindowShell with the modal and spec/entity names', () => {
      assert.match(src, /confirmAction=\{\{[\s\S]{0,400}ConfirmModal: ReturnToVendorShipmentRowConfirmModal[\s\S]{0,400}\}\}/);
      assert.match(src, /confirmAction=\{\{[\s\S]{0,400}specName: 'return-to-vendor-shipment'[\s\S]{0,400}\}\}/);
      assert.match(src, /confirmAction=\{\{[\s\S]{0,400}entityName: 'returnToVendorShipment'[\s\S]{0,400}\}\}/);
    });

    it("wires the invoice-result title, doc type and route for the popup's \"create invoice\" branch", () => {
      assert.match(src, /invoiceResultTitleKey: 'returnToVendor.invoiceCreatedTitle'/);
      assert.match(src, /invoiceDocType: 'facturaCompra'/);
      assert.match(src, /invoiceRoute: '\/purchase-invoice'/);
    });
  });
  // ETP-5408 — Borrador "Confirmar" renders through the GENERIC draftMode Save/Confirm
  // block (saveActions.jsx: `action-save-draft` + `action-save` with the Check icon),
  // exactly like goods-receipt / invoices / orders. This wrapper passes a `draftMode`
  // override whose only addition over decisions.json is `onConfirm`, which dispatches
  // the window's CONFIRM_EVENT; ConfirmWithCreditButton (topbarRight) listens for it.
  describe('ETP-5408 — generic draftMode Confirm wired to CONFIRM_EVENT', () => {
    // Comments stripped: these assertions are about code; the wrappers' explanatory notes
    // legitimately name removed pieces (e.g. the old `linesCount === 0` gate).
    const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const code = strip(src);
    const confirmCode = strip(confirmBtnSrc);
    const draftModeDecl = (code.match(/const DRAFT_MODE = \{[\s\S]*?\n\};/) || [''])[0];

    it('imports CONFIRM_EVENT from its own ConfirmWithCreditButton', () => {
      assert.match(code, /import \{ CONFIRM_EVENT \} from '\.\/ConfirmWithCreditButton\.jsx';/);
    });

    it('ConfirmWithCreditButton exports a window-scoped CONFIRM_EVENT and hands it to the base', () => {
      assert.match(confirmCode, /export const CONFIRM_EVENT = 'return-to-vendor-shipment:open-confirm-modal';/);
      assert.match(confirmCode, /confirmEventName=\{CONFIRM_EVENT\}/);
    });

    it('declares a module-level DRAFT_MODE (stable identity across renders)', () => {
      assert.ok(draftModeDecl, 'expected a top-level `const DRAFT_MODE = { ... };`');
      const declAt = code.indexOf('const DRAFT_MODE');
      const componentAt = code.indexOf('export default function');
      assert.ok(declAt < componentAt, 'DRAFT_MODE must live outside the component');
    });

    it('onConfirm dispatches CONFIRM_EVENT on window (and does nothing else)', () => {
      assert.match(
        draftModeDecl,
        /onConfirm: \(\) => window\.dispatchEvent\(new CustomEvent\(CONFIRM_EVENT\)\),/,
      );
    });

    it('passes draftMode={DRAFT_MODE} to ReturnWindowShell', () => {
      assert.match(code, /<ReturnWindowShell[\s\S]*draftMode=\{DRAFT_MODE\}/);
    });

    it('passes draftMode BEFORE {...rest} so a caller can still override it', () => {
      assert.ok(code.indexOf('draftMode={DRAFT_MODE}') < code.indexOf('{...rest}'));
    });

    it('uses the shared "confirm" i18n key for the button label', () => {
      assert.match(draftModeDecl, /label: 'confirm',/);
    });

    it('no longer uses the bespoke-button escape hatch hasExternalPrimaryAction', () => {
      assert.doesNotMatch(code, /hasExternalPrimaryAction/);
    });

    // decisions.json is what the generated Page (and the contract) are built from; the
    // override must not contradict it, or the pipeline output and the runtime diverge.
    it('matches decisions.json → window.draftMode on every behavioural key', () => {
      const dm = decisions.window?.draftMode;
      assert.ok(dm, 'decisions.json must declare window.draftMode');
      assert.equal(dm.enabled, true);
      assert.match(draftModeDecl, /enabled: true,/);
      assert.equal(dm.processField, 'documentAction');
      assert.match(draftModeDecl, /processField: 'documentAction',/);
      assert.equal(dm.processValue, 'CO');
      assert.match(draftModeDecl, /processValue: 'CO',/);
      // The replacement for the old `linesCount === 0` gate of the hand-rolled button.
      assert.equal(dm.disableWhenEmpty, true);
      assert.match(draftModeDecl, /disableWhenEmpty: true,/);
    });

    // Completed documents: nothing on the header is saveable, so the whole Save/Confirm
    // row must disappear (the same as goods-shipment) — keepSaveWhenCompletedFields
    // would bring Save back on CO.
    it('declares no keepSaveWhenCompletedFields (Save/Confirm row hidden on CO)', () => {
      assert.equal(decisions.window.draftMode.keepSaveWhenCompletedFields, undefined);
      assert.doesNotMatch(draftModeDecl, /keepSaveWhenCompletedFields/);
    });

    // The regenerated Page must carry the same declaration and let the wrapper's
    // override win: it spreads `{...props}` AFTER its own `draftMode={draftMode}`.
    it('the generated Page emits the draftMode from decisions and lets {...props} override it', () => {
      const pageSrc = readFileSync(join(
        __dirname, '..', '..', '..', '..', '..', '..', '..',
        'artifacts', 'return-to-vendor-shipment', 'generated', 'web', 'return-to-vendor-shipment', 'ReturnToVendorShipmentPage.jsx',
      ), 'utf8');
      assert.match(pageSrc, /const draftMode = \{[\s\S]*?"enabled": true[\s\S]*?"disableWhenEmpty": true[\s\S]*?\};/);
      const passedAt = pageSrc.indexOf('draftMode={draftMode}');
      assert.ok(passedAt > 0, 'generated Page must pass draftMode={draftMode}');
      assert.ok(passedAt < pageSrc.indexOf('{...props}', passedAt), '{...props} must follow draftMode');
    });

    it('keeps ConfirmWithCreditButton in topbarRight (it hosts the confirm flow)', () => {
      assert.equal(decisions.window.customComponents?.topbarRight, 'ConfirmWithCreditButton');
    });
  });
});