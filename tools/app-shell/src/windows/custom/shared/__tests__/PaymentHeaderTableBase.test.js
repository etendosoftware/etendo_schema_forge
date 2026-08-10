import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PaymentHeaderTableBase.jsx'), 'utf8');

describe('PaymentHeaderTableBase', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports PaymentHeaderTableBase as the default export', () => {
    assert.match(src, /export default function PaymentHeaderTableBase/);
  });

  // ── Props contract ─────────────────────────────────────────────────────────

  it('accepts dir and data props', () => {
    assert.match(src, /\bdir\b/);
    assert.match(src, /\bdata\b/);
  });

  // ── Amount formatting ──────────────────────────────────────────────────────

  it('delegates amount formatting to the shared formatCurrency() (not a hand-rolled Intl.NumberFormat/currencySymbol duplicate)', () => {
    assert.match(src, /import\s*\{\s*formatCurrency\s*\}\s*from\s*['"]@\/lib\/formatCurrency\.js['"]/);
    assert.match(src, /formatCurrency\(/);
    assert.doesNotMatch(src, /new Intl\.NumberFormat/);
    assert.doesNotMatch(src, /function currencySymbol/);
  });

  it('renders sign and amount for in/out direction', () => {
    assert.match(src, /sign/);
    assert.match(src, /fmtAmt/);
  });

  // ── Summary amount and currency ────────────────────────────────────────────

  it('has a hero amount display with tabular-nums class', () => {
    assert.match(src, /tabular-nums/);
    assert.match(src, /heroSign/);
  });

  it('passes currency to fmtAmt for summary rendering', () => {
    assert.match(src, /fmtAmt\(thisMonth,\s*currency\)/);
  });

  // ── i18n ───────────────────────────────────────────────────────────────────

  it('uses useUI hook from @/i18n', () => {
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
    assert.match(src, /useUI\(\)/);
  });

  // ── Reactivar/Eliminar integration (ETP-4500 — unified cartel) ─────────────

  it('imports and renders PaymentLifecycleConfirmModal for Reactivar/Eliminar', () => {
    assert.match(src, /import PaymentLifecycleConfirmModal from/);
    assert.match(src, /<PaymentLifecycleConfirmModal/);
  });

  it('dispatches neo:processSuccess after reactivation', () => {
    assert.match(src, /neo:processSuccess/);
    assert.match(src, /dispatchEvent/);
  });

  // ── DataTable integration ──────────────────────────────────────────────────

  it('renders DataTable without the generic hideDeleteWhenComplete gate', () => {
    // Deposited payments must also be deletable (via the eTPRRemovePayment
    // action) — only RPVOID is excluded, via actionsConfig.delete.visibleWhen.
    assert.match(src, /hideDeleteWhenComplete:\s*false/);
    assert.match(src, /delete:\s*{\s*visibleWhen:\s*"@status@!='RPVOID'"\s*}/);
  });

  // ── Confirm/delete-processed integration ───────────────────────────────────

  it('offers a Confirmar menu action for draft payments', () => {
    assert.match(src, /DRAFT_STATUS/);
    assert.match(src, /aPRMProcessPayment/);
  });

  it('always routes row deletion through the eTPRRemovePayment process (never a bare DELETE)', () => {
    // A bare header DELETE fails on FK constraints once any invoice has been
    // applied to the payment (FIN_PaymentDetail/ScheduleDetail) — the removal
    // process handles reactivate-if-needed + cleanup + invoice update safely,
    // for both drafts and deposited payments alike.
    assert.match(src, /action\/eTPRRemovePayment/);
    assert.doesNotMatch(src, /method:\s*'DELETE'/);
  });

  it('refreshes the list via onDataMutated after confirm/reactivate/delete', () => {
    // ListView passes onDataMutated={hook.refresh} to the Table — without calling
    // it back, a successful action leaves the stale row visible until reload.
    const matches = src.match(/onDataMutated\?\.\(\)/g) || [];
    assert.ok(matches.length >= 2, 'expected onDataMutated?.() in both runAction and the delete onSuccess');
  });

});
