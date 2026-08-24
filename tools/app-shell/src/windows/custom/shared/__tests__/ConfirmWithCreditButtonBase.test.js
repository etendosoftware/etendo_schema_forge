import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ConfirmWithCreditButtonBase.jsx'), 'utf8');

describe('ConfirmWithCreditButtonBase', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports ConfirmWithCreditButtonBase as the default export', () => {
    assert.match(src, /export default function ConfirmWithCreditButtonBase/);
  });

  // ── Imports ────────────────────────────────────────────────────────────────

  it('imports useConfirmWithCredit from local hook', () => {
    assert.match(src, /import.*useConfirmWithCredit.*from '\.\/useConfirmWithCredit'/);
  });

  it('does NOT import PrintButton (printing is unified in DocumentPrintDrawer)', () => {
    assert.doesNotMatch(src, /PrintButton/);
  });

  it('imports ConfirmInOutModal from @/components/contract-ui', () => {
    assert.match(src, /import ConfirmInOutModal from '@\/components\/contract-ui\/ConfirmInOutModal'/);
  });

  it('imports CreateInvoiceConfirmModal from @/components/contract-ui', () => {
    assert.match(src, /import CreateInvoiceConfirmModal from '@\/components\/contract-ui\/CreateInvoiceConfirmModal'/);
  });

  it('imports ConfirmResultModal from @/components/contract-ui', () => {
    assert.match(src, /import.*ConfirmResultModal.*from '@\/components\/contract-ui\/ConfirmResultModal'/);
  });

  // ── Props contract ─────────────────────────────────────────────────────────

  it('accepts data, recordId, token, apiBaseUrl props', () => {
    assert.match(src, /data, recordId, token, apiBaseUrl/);
  });

  it('accepts entitySegment, invoiceRoute, invoiceType props', () => {
    assert.match(src, /entitySegment, invoiceRoute, invoiceType/);
  });

  it('accepts extraActions prop', () => {
    assert.match(src, /extraActions/);
  });

  it('accepts extraPortals prop', () => {
    assert.match(src, /extraPortals/);
  });

  // ── Early-return guard ─────────────────────────────────────────────────────

  it('returns null when status is not DR or CO', () => {
    assert.match(src, /if\s*\(status !== 'DR' && status !== 'CO'\)\s*return null/);
  });

  // ── data-testid attributes ─────────────────────────────────────────────────

  it('renders DR confirm button with data-testid="action-confirm-with-credit"', () => {
    assert.match(src, /data-testid="action-confirm-with-credit"/);
  });

  it('renders CO invoice button with data-testid="action-create-return-invoice"', () => {
    assert.match(src, /data-testid="action-create-return-invoice"/);
  });

  // ── Slots ──────────────────────────────────────────────────────────────────

  it('renders extraActions slot', () => {
    assert.match(src, /\{extraActions\}/);
  });

  it('renders extraPortals slot', () => {
    assert.match(src, /\{extraPortals\}/);
  });

  // ── Portals ────────────────────────────────────────────────────────────────

  it('uses createPortal for CO and result modals', () => {
    assert.match(src, /createPortal/);
  });

  it('mounts CO modal on document.body', () => {
    assert.match(src, /document\.body/);
  });

  // ── i18n (no hardcoded user-visible strings) ───────────────────────────────

  it('calls ui() for createReturnInvoice key (no hardcoded string)', () => {
    assert.match(src, /ui\('createReturnInvoice'\)/);
  });

  // ── ETP-4940 follow-up: save pending edits before confirm ─────────────────

  it('imports maybeSaveBeforeConfirm from detailViewHelpers', () => {
    assert.match(
      src,
      /import \{ maybeSaveBeforeConfirm \} from '@\/components\/contract-ui\/detailViewHelpers\.jsx'/,
    );
  });

  it('accepts onSave and isDirty props', () => {
    assert.match(src, /onSave, isDirty/);
  });

  it('guards the DR confirm click with maybeSaveBeforeConfirm before opening the modal', () => {
    const drButton = src.match(/action-confirm-with-credit[\s\S]*?disabled=\{confirmDisabled\}/);
    assert.ok(drButton, 'expected the DR confirm button block');
    assert.match(drButton[0], /maybeSaveBeforeConfirm\(\{ isDirty, handleSave: onSave \}\)/);
    assert.match(drButton[0], /setShowModal\(true\)/);
  });

});
