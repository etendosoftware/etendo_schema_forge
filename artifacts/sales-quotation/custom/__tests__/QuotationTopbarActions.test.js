import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'QuotationTopbarActions.jsx'), 'utf8');

describe('QuotationTopbarActions', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function QuotationTopbarActions/);
  });

  it('accepts data, recordId, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl.*\}/);
  });

  it('returns null when documentStatus is missing', () => {
    assert.match(src, /data\?\.documentStatus.*return null/s);
  });

  it('renders a SendDocumentButton', () => {
    assert.match(src, /SendDocumentButton/);
  });

  it('renders SendDocumentModal via createPortal when triggered', () => {
    assert.match(src, /createPortal/);
    assert.match(src, /SendDocumentModal/);
  });

  it('passes documentType from tMenu to SendDocumentModal', () => {
    assert.match(src, /documentType=\{tMenu\('Sales Quotation'\)\}/);
  });

  it('passes windowName sales-quotation to SendDocumentModal', () => {
    assert.match(src, /windowName="sales-quotation"/);
  });

  it('imports SendDocumentModal and SendDocumentButton from contract-ui', () => {
    assert.match(src, /from\s+['"]@\/components\/contract-ui\/SendDocumentModal['"]/);
  });

  it('imports CloneOrderModal from contract-ui', () => {
    assert.match(src, /import\s+CloneOrderModal\s+from\s+['"]@\/components\/contract-ui\/CloneOrderModal['"]/);
  });

  it('renders a Clone button wired to the clone modal', () => {
    assert.match(src, /setShowClone\(true\)/);
    assert.match(src, /cloneOrderBtn/);
  });

  it('delegates to the cloneRecord backend action', () => {
    assert.match(src, /cloneActionName="cloneRecord"/);
  });

  it('navigates to the new sales-quotation record after cloning', () => {
    assert.match(src, /navigate\(`\/sales-quotation\/\$\{newId\}`\)/);
  });

  describe('confirm flow via draftMode event (regression: button order)', () => {
    it('does not render an inline blue Confirmar button anymore', () => {
      assert.doesNotMatch(src, /background:\s*'#185FA5'/);
    });

    it('listens for the sales-quotation:open-confirm-modal custom event', () => {
      assert.match(src, /addEventListener\(\s*['"]sales-quotation:open-confirm-modal['"]/);
      assert.match(src, /removeEventListener\(\s*['"]sales-quotation:open-confirm-modal['"]/);
    });

    it('opens SendToEvaluationModal when status is DR', () => {
      assert.match(src, /status\s*===\s*'DR'.*setShowSendToEval\(true\)/s);
    });

    it('opens QuotationConfirmModal when status is UE', () => {
      assert.match(src, /status\s*===\s*'UE'.*setShowConfirm\(true\)/s);
    });
  });

  describe('reject flow via kebab event', () => {
    it('imports RejectQuotationModal', () => {
      assert.match(src, /import\s+RejectQuotationModal\s+from\s+['"]\.\/RejectQuotationModal['"]/);
    });

    it('listens for the sales-quotation:open-reject-modal custom event', () => {
      assert.match(src, /addEventListener\(\s*['"]sales-quotation:open-reject-modal['"]/);
      assert.match(src, /removeEventListener\(\s*['"]sales-quotation:open-reject-modal['"]/);
    });

    it('renders RejectQuotationModal via createPortal when triggered', () => {
      assert.match(src, /showReject\s*&&\s*createPortal\(\s*<RejectQuotationModal/);
    });

    it('has a setShowReject state setter wired to onClose', () => {
      assert.match(src, /setShowReject\(true\)/);
      assert.match(src, /onClose=\{\(\)\s*=>\s*setShowReject\(false\)\}/);
    });
  });

  // ETP-4468: "Confirmar" must not discard an unsaved header edit — this
  // component is the topbarRight custom component and must thread the new
  // onSave prop down to QuotationConfirmModal.
  describe('force-save before confirm (ETP-4468)', () => {
    it('accepts an onSave prop', () => {
      assert.match(src, /export default function QuotationTopbarActions\(\{[^}]*onSave[^}]*\}\)/);
    });

    it('threads onSave down to QuotationConfirmModal', () => {
      assert.match(src, /<QuotationConfirmModal[\s\S]*?onSave=\{onSave\}[\s\S]*?\/>/);
    });
  });

  // ETP-4779 — this component is the topbarRight custom component and must
  // thread the onRefresh prop DetailView already passes it down to
  // QuotationConfirmModal, so the confirm flow can refresh the header state
  // (and dispatch sales-quotation:document-created for the "Documentos"
  // section) without a full page reload.
  describe('partial refresh — threads onRefresh down (ETP-4779)', () => {
    it('accepts an onRefresh prop', () => {
      assert.match(src, /export default function QuotationTopbarActions\(\{[^}]*onRefresh[^}]*\}\)/);
    });

    it('threads onRefresh down to QuotationConfirmModal', () => {
      assert.match(src, /<QuotationConfirmModal[\s\S]*?onRefresh=\{onRefresh\}[\s\S]*?\/>/);
    });
  });

  // ETP-4717 (Pair 2 — P2): the Send button must NOT be available while the
  // quotation is still Draft (DR) — it must be visible from "Bajo evaluación"
  // (UE) onward. Today it renders unconditionally, with zero status gating.
  describe('Send button visibility gated by document status (ETP-4717)', () => {
    it('gates the Send button so it does not render while status is DR', () => {
      assert.match(
        src,
        /status\s*!==\s*['"]DR['"]\s*&&\s*<SendDocumentButton/,
        'SendDocumentButton must be gated behind a `status !== \'DR\'` check — today it renders ' +
          'unconditionally regardless of documentStatus',
      );
    });
  });
});
