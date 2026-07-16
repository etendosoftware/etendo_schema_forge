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
});
