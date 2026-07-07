import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'NewPaymentEntryModal.jsx'), 'utf8');

describe('NewPaymentEntryModal (step 2 — Nuevo cobro/pago)', () => {

  it('is the default export', () => {
    assert.match(src, /export default function NewPaymentEntryModal/);
  });

  it('drives the cuadre via the usePaymentBalance hook', () => {
    assert.match(src, /import \{ usePaymentBalance, formatPlain \} from '\.\/usePaymentBalance\.js'/);
    assert.match(src, /usePaymentBalance\(\{\s*total,\s*dir,\s*sources\s*\}\)/s);
  });

  it('renders the new-collection / new-payment title by direction', () => {
    assert.match(src, /ui\('cpNewCollection'\)/);
    assert.match(src, /ui\('cpNewPayment'\)/);
  });

  it('shows the four core fields (amount, date, method, account)', () => {
    assert.match(src, /data-testid="cp-amount-input"/);
    assert.match(src, /DateField/);
    assert.match(src, /ui\('cpPaymentMethod'\)/);
    assert.match(src, /ui\('account'\)/);
  });

  it('fetches accounts, methods, credit sources and the payment plan', () => {
    assert.match(src, /action\/invoiceAccounts|invoiceAccounts/);
    assert.match(src, /invoicePaymentMethods/);
    assert.match(src, /invoiceCreditSources/);
    assert.match(src, /paymentPlan/);
  });

  it('renders the unified credit / saldo-a-favor section with per-kind badges', () => {
    assert.match(src, /function CreditSection/);
    assert.match(src, /ui\('cpCreditSectionTitle'\)/);
    assert.match(src, /ui\('cpCreditSectionHint'\)/);
    // both kinds live in one section, distinguished by a badge per row
    assert.match(src, /ui\('cpCreditBadge'\)/);
    assert.match(src, /ui\('cpFavorBadge'\)/);
    // the section only renders when it has rows
    assert.match(src, /if \(!rows\.length\) return null/);
    // the old split-group structure must be gone
    assert.doesNotMatch(src, /function CreditGroup/);
    assert.doesNotMatch(src, /ui\('cpCreditGroupTitle'\)/);
    assert.doesNotMatch(src, /ui\('cpFavorGroupTitle'\)/);
  });

  it('only shows the credit section when there are consumable sources', () => {
    assert.match(src, /balance\.lines\.length > 0/);
  });

  it('shows a real-time balance summary with an Igualar action', () => {
    assert.match(src, /ui\('cpTotalInvoice'\)/);
    assert.match(src, /ui\('cpApplied'\)/);
    assert.match(src, /ui\('cpEqualize'\)/);
    assert.match(src, /balance\.equalize/);
  });

  it('offers credit/refund on excess for receipts and an inline error for payments', () => {
    assert.match(src, /ui\('cpLeaveCredit'\)/);
    assert.match(src, /ui\('cpGiveChange'\)/);
    assert.match(src, /ui\('cpExcessInline'/);
  });

  it('submits a draft on Guardar and a confirm on Confirmar', () => {
    assert.match(src, /submit\('draft'\)/);
    assert.match(src, /submit\('confirm'\)/);
    assert.match(src, /action\/registerPayment/);
  });

  it('sends process, creditSources and overpaymentAction in the payload', () => {
    assert.match(src, /process,/);
    assert.match(src, /creditSources:\s*balance\.consumedSources/);
    assert.match(src, /overpaymentAction:/);
  });

  it('disables Confirmar while the balance cannot be confirmed', () => {
    assert.match(src, /confirmDisabled/);
    assert.match(src, /balance\.canConfirm/);
  });

  describe('required-field markers and disabled-state wiring (ETP-4331 Figma redesign)', () => {
    it('Field renders a red trailing "*" when required is true', () => {
      assert.match(
        src,
        /function Field\(\{ label, required = false, children \}\)/,
      );
      assert.match(src, /\{label\}\{required && <span style=\{\{ color: RED_FG \}\}> \*<\/span>\}/);
    });

    it('passes required to all four mandatory fields (amount, date, method, account)', () => {
      assert.match(src, /<Field label=\{ui\('cpAmount'\)\} required/);
      assert.match(src, /<Field label=\{ui\('date'\)\} required/);
      assert.match(src, /<Field label=\{ui\('cpPaymentMethod'\)\} required/);
      assert.match(src, /<Field label=\{ui\('account'\)\} required/);
    });

    it('derives missingRequired from funds (cash + used credit), date, methodId and accountId', () => {
      // "Importe" is satisfied by the total applied (cash + used credit), not the
      // cash field alone — a credit/saldo a favor line covering 100% of the
      // invoice legitimately leaves the cash amount (balance.amount) at 0, so the
      // gate must read balance.funds, not balance.amount (ETP-4331 bug fix).
      assert.match(
        src,
        /const missingRequired = balance\.funds <= 0 \|\| !date \|\| !methodId \|\| !accountId;/,
      );
    });

    it('gates saveDisabled and confirmDisabled on missingRequired', () => {
      assert.match(
        src,
        /const saveDisabled = saving \|\| loading \|\| missingRequired;/,
      );
      assert.match(
        src,
        /const confirmDisabled = saving \|\| missingRequired \|\| !balance\.canConfirm[\s\S]*?;/,
      );
    });

    it('wires both footer buttons to the new disabled variables', () => {
      // Footer extracted into PaymentModalFooter (ETP-4406 cognitive-complexity refactor):
      // the disabled-state wiring now lives on the extracted buttons, and the parent wires
      // the same submit('draft') / submit('confirm') callbacks in as props.
      assert.match(src, /data-testid="cp-save-draft" onClick=\{onSaveDraft\} disabled=\{saveDisabled\}/);
      assert.match(src, /data-testid="cp-confirm" onClick=\{onConfirm\} disabled=\{confirmDisabled \|\| loading\}/);
      assert.match(src, /onSaveDraft=\{\(\) => submit\('draft'\)\}/);
      assert.match(src, /onConfirm=\{\(\) => submit\('confirm'\)\}/);
    });
  });

  // ETP-4331: default payment method from the invoice + account/method filtering.
  describe('mapAccounts / accountSupportsMethod (ETP-4331)', () => {
    it('passes paymentMethodIds through as-is (undefined for legacy backends)', () => {
      assert.match(src, /paymentMethodIds:\s*a\.paymentMethodIds/);
    });

    it('accountSupportsMethod treats a missing methodId or missing paymentMethodIds as "always matches"', () => {
      assert.match(
        src,
        /function accountSupportsMethod\(account, methodId\)\s*\{\s*return !methodId \|\| !account\.paymentMethodIds \|\| account\.paymentMethodIds\.includes\(methodId\);\s*\}/,
      );
    });
  });

  describe('pickDefaultMethodId (ETP-4331)', () => {
    it('prefers the invoice\'s own defaultMethodId when it is present in the method list', () => {
      assert.match(src, /function pickDefaultMethodId\(accJson, accList, methList\)/);
      assert.match(src, /const invoiceMethodId = accJson\?\.defaultMethodId;/);
      assert.match(src, /if \(invoiceMethodId && methList\.some\(m => m\.id === invoiceMethodId\)\) return invoiceMethodId;/);
    });

    it('falls back to the legacy pickMethodId heuristic otherwise', () => {
      assert.match(src, /return pickMethodId\(accList, methList\);/);
    });
  });

  describe('pickDefaultAccountId (ETP-4331)', () => {
    it('declares the 3-tier priority signature: accList, methodId, bpPreferredAccountId', () => {
      assert.match(src, /function pickDefaultAccountId\(accList, methodId, bpPreferredAccountId\)/);
    });

    // Bug fix (ETP-4331 follow-up): accountSupportsMethod(a, methodId) returns
    // `true` unconditionally when methodId is falsy (its "no filter" contract),
    // so without this guard an empty method would vacuously "match" tier 1/2/3
    // and silently refill the account after the user explicitly cleared it.
    // The guard MUST be the first statement — before any tier logic runs.
    it('guards against a falsy methodId as the very first statement (no vacuous match on the empty-method case)', () => {
      assert.match(src, /function pickDefaultAccountId\(accList, methodId, bpPreferredAccountId\) \{\s*\n\s*if \(!methodId\) return '';/);
      const guardIdx = src.indexOf("if (!methodId) return '';");
      const bpTierIdx = src.indexOf('const bpAccount = bpPreferredAccountId');
      assert.ok(guardIdx > -1, 'the empty-method guard must exist');
      assert.ok(bpTierIdx > -1, 'tier 1 (bpAccount) must exist');
      assert.ok(guardIdx < bpTierIdx, 'the empty-method guard must run before tier 1 (bpAccount)');
    });

    it('tier 1 — the BP-preferred account wins, but only if it supports the method', () => {
      assert.match(
        src,
        /const bpAccount = bpPreferredAccountId\s*\n\s*\? accList\.find\(a => a\.id === bpPreferredAccountId && accountSupportsMethod\(a, methodId\)\)\s*\n\s*: null;/,
      );
      assert.match(src, /if \(bpAccount\) return bpAccount\.id;/);
    });

    it('tier 2 — falls back to the account flagged default for the method (defaultForMethodIds)', () => {
      assert.match(
        src,
        /const flaggedDefault = accList\.find\(a => a\.defaultForMethodIds\?\.includes\(methodId\)\);/,
      );
      assert.match(src, /if \(flaggedDefault\) return flaggedDefault\.id;/);
    });

    it('tier 3 — legacy heuristic: the first account that supports the method, else empty (no more accList[0] fallback)', () => {
      assert.match(
        src,
        /const firstSupporting = accList\.find\(a => accountSupportsMethod\(a, methodId\)\);/,
      );
      assert.match(src, /return firstSupporting\?\.id \|\| '';/);
      // the old unconditional "first account overall" fallback must be gone —
      // otherwise the empty-method guard above would be the only thing
      // preventing a refill, and any future refactor could reintroduce it.
      assert.doesNotMatch(src, /accList\[0\]\)\?\.id \|\| ''/);
    });
  });

  describe('mapAccounts carries defaultForMethodIds (ETP-4331)', () => {
    it('maps defaultForMethodIds from the raw item, defaulting to [] for legacy backends', () => {
      assert.match(src, /defaultForMethodIds:\s*a\.defaultForMethodIds \|\| \[\]/);
    });
  });

  describe('bpPreferredAccountIdRef wiring (ETP-4331)', () => {
    it('declares a ref initialized to the empty string', () => {
      assert.match(src, /const bpPreferredAccountIdRef = useRef\(''\);/);
    });

    it('sets the ref once inside the fetch effect from the accJson response', () => {
      assert.match(
        src,
        /bpPreferredAccountIdRef\.current = accJson\?\.bpPreferredAccountId \|\| '';/,
      );
    });

    it('passes the ref value as the 3rd argument at both pickDefaultAccountId call sites', () => {
      assert.match(
        src,
        /setAccountId\(pickDefaultAccountId\(accList, defaultMethodId, bpPreferredAccountIdRef\.current\)\);/,
      );
      assert.match(
        src,
        /return stillValid \? prevAccountId : pickDefaultAccountId\(accounts, id, bpPreferredAccountIdRef\.current\);/,
      );
    });
  });

  describe('filteredAccounts / onMethodChange wiring (ETP-4331)', () => {
    it('recomputes filteredAccounts from accounts + methodId via useMemo', () => {
      assert.match(src, /const filteredAccounts = useMemo\(/);
      assert.match(src, /accounts\.filter\(a => accountSupportsMethod\(a, methodId\)\)/);
      assert.match(src, /\[accounts, methodId\]/);
    });

    it('onMethodChange re-validates the current account and reselects (via the hierarchy) if it no longer supports the new method', () => {
      assert.match(src, /const onMethodChange = useCallback\(\(id\) => \{/);
      assert.match(src, /setMethodId\(id\);/);
      assert.match(src, /const stillValid = account && accountSupportsMethod\(account, id\);/);
    });

    it('wires the method select to onMethodChange (not an inline setMethodId)', () => {
      assert.match(src, /data-testid="cp-method-select"/);
      assert.match(src, /onChange=\{onMethodChange\}/);
    });

    it('remounts the account select on method change and scopes it to filteredAccounts', () => {
      assert.match(src, /key=\{`account-\$\{methodId\}`\}/);
      assert.match(src, /data-testid="cp-account-select"/);
      assert.match(src, /staticOptions=\{filteredAccounts\}/);
      assert.match(src, /displayValue=\{filteredAccounts\.find\(a => a\.id === accountId\)\?\.name \|\| ''\}/);
    });
  });

  describe('fetch effect resolves the default method/account from the invoice payload (ETP-4331)', () => {
    it('computes defaultMethodId via pickDefaultMethodId using the raw accJson', () => {
      assert.match(src, /const defaultMethodId = pickDefaultMethodId\(accJson, accList, methList\);/);
      assert.match(src, /setMethodId\(defaultMethodId\);/);
      assert.match(src, /setAccountId\(pickDefaultAccountId\(accList, defaultMethodId, bpPreferredAccountIdRef\.current\)\);/);
    });

    it('sets bpPreferredAccountIdRef.current before computing the default account', () => {
      const refAssignIdx = src.indexOf("bpPreferredAccountIdRef.current = accJson?.bpPreferredAccountId || '';");
      const accountPickIdx = src.indexOf('setAccountId(pickDefaultAccountId(accList, defaultMethodId, bpPreferredAccountIdRef.current));');
      assert.ok(refAssignIdx > -1, 'ref assignment must exist');
      assert.ok(accountPickIdx > -1, 'account pick call must exist');
      assert.ok(refAssignIdx < accountPickIdx, 'ref must be set before it is read by pickDefaultAccountId');
    });
  });
});
