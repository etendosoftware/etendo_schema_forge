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

  it('accepts onSave, isDirty and saveGate props', () => {
    assert.match(src, /onSave, isDirty, saveGate/);
  });

  it('guards the DR confirm click with maybeSaveBeforeConfirm before opening the modal', () => {
    const drButton = src.match(/action-confirm-with-credit[\s\S]*?disabled=\{confirmBlocked\}/);
    assert.ok(drButton, 'expected the DR confirm button block');
    assert.match(drButton[0], /maybeSaveBeforeConfirm\(\{ isDirty, handleSave: onSave \}\)/);
    assert.match(drButton[0], /setShowModal\(true\)/);
  });

  // ETP-4933: this button saves before it confirms, so leaving it outside the
  // required-field gate turns the gate into a no-op — Save blocked, Confirm persists
  // the incomplete record anyway.
  it('folds the required-field gate into the DR confirm blocked condition', () => {
    assert.match(src, /const confirmBlocked = confirmDisabled \|\| Boolean\(saveGate\?\.blocked\)/);
  });

  it('inherits ONLY the gate verdict, never isDirty (confirming an unmodified saved doc is normal)', () => {
    const decl = src.match(/const confirmBlocked = .*/)[0];
    assert.ok(!/isDirty/.test(decl), 'confirmBlocked must not consult isDirty');
  });

  it('explains the block on hover instead of showing a silently dead button', () => {
    const drButton = src.match(/action-confirm-with-credit[\s\S]*?\{confirmDrLabel\}/)[0];
    assert.match(drButton, /title=\{saveGate\?\.blocked \? saveGate\.title : undefined\}/);
  });

  it('gates the click handler too, not just the disabled attribute', () => {
    const drButton = src.match(/action-confirm-with-credit[\s\S]*?\{confirmDrLabel\}/)[0];
    assert.match(drButton, /if \(confirmBlocked\) return;/);
  });

});
