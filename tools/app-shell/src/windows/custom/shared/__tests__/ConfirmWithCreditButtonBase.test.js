import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Comments are stripped before matching: the component's own JSDoc/history notes name the
// removed pieces (maybeSaveBeforeConfirm, isDirty, GateTooltip...) on purpose, and a
// source-reading contract is about CODE, not prose.
const src = readFileSync(join(__dirname, '..', 'ConfirmWithCreditButtonBase.jsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

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

  // ── ETP-4933: the required-field gate still blocks the confirm flow ────────

  // ETP-5408: the generic draftMode Confirm (saveActions.jsx) already honours
  // saveGate before calling onConfirm; this second check is the backstop for an
  // event dispatched from anywhere else.
  it('derives the listener backstop from the required-field gate ONLY', () => {
    assert.match(src, /const saveBlocked = Boolean\(saveGate\?\.blocked\);/);
    const decl = src.match(/const saveBlocked = .*/)[0];
    assert.ok(!/isDirty/.test(decl), 'saveBlocked must not consult isDirty');
    assert.ok(!/linesCount/.test(decl), 'saveBlocked must not consult linesCount');
  });

  // The lines gate belongs to the generic button (draftMode.disableWhenEmpty reads the
  // live lines); re-checking the header's lagging linesCount here would turn an enabled
  // Confirm into a silent no-op right after the first line is added.
  it('no longer re-checks the lines count (confirmDisabled / confirmBlocked are gone)', () => {
    assert.doesNotMatch(src, /\bconfirmDisabled\b/);
    assert.doesNotMatch(src, /\bconfirmBlocked\b/);
    assert.doesNotMatch(src, /\blinesCount\b/);
  });

  // ── ETP-5408: Borrador "Confirmar" is the GENERIC draftMode Confirm ────────
  //
  // The bug was a hand-rolled DR button — the only Confirmar in the product without
  // the checkmark that Facturas / Pedidos / Albaranes show. The fix removes the button
  // from this component entirely: the window's index.jsx passes a `draftMode` whose
  // `onConfirm` dispatches `confirmEventName`, and this component only LISTENS and
  // opens the confirm modal. These assertions exist so a revert to a bespoke DR
  // button cannot land silently.

  const effectBlock = (() => {
    const i = src.indexOf('useEffect(() => {');
    return i < 0 ? '' : src.slice(i, src.indexOf('}, [', i));
  })();

  it('accepts a confirmEventName prop', () => {
    assert.match(src, /^\s*confirmEventName,\s*$/m);
  });

  it('registers a window listener for confirmEventName inside a useEffect', () => {
    assert.match(src, /import \{[^}]*\buseEffect\b[^}]*\} from 'react'/);
    assert.ok(effectBlock.length > 0, 'expected a useEffect block');
    assert.match(effectBlock, /window\.addEventListener\(confirmEventName, handler\)/);
  });

  it('removes the listener in the effect cleanup (no leak across unmount / event-name change)', () => {
    assert.match(effectBlock, /return \(\) => window\.removeEventListener\(confirmEventName, handler\)/);
  });

  it('skips registration when no confirmEventName is supplied', () => {
    assert.match(effectBlock, /if \(!confirmEventName\) return undefined;/);
  });

  it('the handler ignores the event outside Borrador and while blocked, else opens the modal', () => {
    assert.match(effectBlock, /if \(status !== 'DR' \|\| saveBlocked\) return;/);
    assert.match(effectBlock, /setShowModal\(true\)/);
  });

  it('re-subscribes when status / gate state change (no stale closure)', () => {
    assert.match(src, /\}, \[confirmEventName, status, saveBlocked, setShowModal\]\)/);
  });

  // Rules of Hooks: the effect must run on every render, so it has to sit ABOVE the
  // `status !== 'DR' && status !== 'CO'` early return.
  it('declares the listener effect before the early return', () => {
    const effectAt = src.indexOf('useEffect(() => {');
    const earlyReturnAt = src.indexOf("if (status !== 'DR' && status !== 'CO') return null");
    assert.ok(effectAt > 0 && earlyReturnAt > 0);
    assert.ok(effectAt < earlyReturnAt, 'useEffect must precede the early return');
  });

  // runDraftModeConfirm (saveActions.jsx) already saved a dirty header through
  // maybeSaveBeforeConfirm before calling onConfirm — saving again here would be a
  // second PATCH racing the first.
  it('never saves: no onSave / isDirty / maybeSaveBeforeConfirm wiring left', () => {
    assert.doesNotMatch(src, /maybeSaveBeforeConfirm/);
    assert.doesNotMatch(src, /\bonSave\b/);
    assert.doesNotMatch(src, /\bisDirty\b/);
    assert.doesNotMatch(effectBlock, /handleSave|save\(/i);
  });

  it('renders no Borrador confirm button of its own', () => {
    assert.doesNotMatch(src, /action-confirm-with-credit/);
    assert.doesNotMatch(src, /\{status === 'DR' && \(/);
    // The only raw <button> left is the completed-state create-invoice action.
    assert.equal((src.match(/<button\b/g) || []).length, 1);
    assert.match(src, /\{status === 'CO' && !hasReturnInvoice && \(\s*<button[^>]*data-testid="action-create-return-invoice"/);
  });

  it('carries none of the bespoke DR-button styling / imports', () => {
    assert.doesNotMatch(src, /CONFIRM_BTN_CLS/);
    assert.doesNotMatch(src, /from '@\/components\/ui\/button\.jsx'/);
    assert.doesNotMatch(src, /GateTooltip/);
    assert.doesNotMatch(src, /getButtonClass|getSaveBtnCls/);
    assert.doesNotMatch(src, /from 'lucide-react'/);
  });

  it('still forwards confirmDrLabel to ConfirmInOutModal as its confirm label', () => {
    assert.match(src, /<ConfirmInOutModal[\s\S]*?confirmLabel=\{confirmDrLabel\}/);
  });

});
