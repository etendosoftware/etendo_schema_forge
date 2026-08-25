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
    // round2 is also imported (ETP-4504 amount-in-account conversion math).
    assert.match(src, /import \{ usePaymentBalance, formatPlain, round2 \} from '\.\/usePaymentBalance\.js'/);
    assert.match(src, /usePaymentBalance\(\{\s*total,\s*dir,\s*sources,\s*usedSources:/s);
  });

  // ETP-4314: fmtCur() (used for the read-only ExcessBand amount and the PIS
  // alert's "dinero"/"credito" clauses) used to interpolate formatPlain() (a
  // hand-rolled, en-US-style grouping helper backing the editable amount
  // <input>) with a separately Intl-resolved currency symbol — mixing en-US
  // digit grouping with an es-ES symbol. It must now delegate entirely to the
  // shared formatCurrency() instead of hand-rolling any Intl/formatPlain calls.
  it('delegates fmtCur entirely to the shared formatCurrency() (no more formatPlain/Intl mixing)', () => {
    assert.match(src, /import\s*\{[^}]*\bformatCurrency\b[^}]*\}\s*from\s*'@\/lib\/formatCurrency\.js';/);
    assert.match(
      src,
      /function fmtCur\(n, currency\) \{\s*\n\s*return formatCurrency\(currency, n\);\s*\n\s*\}/,
    );
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

  // ETP-4504 (Option C): both excess resolutions — "Dejar a crédito" and
  // "Dar vuelto"/refund — render on the SAME gate (canLeaveCredit: a receipt whose
  // invoice is in the org currency); otherwise only the inline error shows.
  it('offers both the "leave credit" and "refund" options on excess and an inline error otherwise', () => {
    assert.match(src, /ui\('cpLeaveCredit'\)/);
    assert.match(src, /ui\('cpExcessInline'/);
    // the refund / "dar vuelto" option is present again
    assert.match(src, /ui\('cpGiveChange'\)/);
    assert.match(src, /cp-excess-refund/);
    // both cards share the canLeaveCredit gate (credit) / canRefund (refund)
    assert.match(src, /canLeaveCredit/);
    assert.match(src, /balance\.canRefund/);
  });

  // ETP-4504: multi-currency conversion — conversion fields + amount-in-account
  // readout when the account currency differs from the invoice currency, and the
  // conversionRate is sent in the register payload only in that foreign case.
  describe('multi-currency conversion (ETP-4504)', () => {
    it('imports and uses the useConversionRate hook for the (invoice→account) prefill', () => {
      assert.match(src, /import \{ useConversionRate \} from '\.\/useConversionRate\.js'/);
      assert.match(src, /useConversionRate\(\{\s*fromCode: currency, toCode: accountCurrency/s);
    });

    it('gates canLeaveCredit on a receipt whose invoice is in the org currency (useDocumentCurrency)', () => {
      assert.match(src, /import \{ useDocumentCurrency \} from '\.\/useDocumentCurrency\.js'/);
      assert.match(src, /const invoiceInOrgCurrency = !!orgCurrencyCode && currency === orgCurrencyCode;/);
      assert.match(src, /const canLeaveCredit = isReceipt && invoiceInOrgCurrency;/);
      assert.match(src, /usePaymentBalance\(\{[\s\S]*?canLeaveCredit,[\s\S]*?\}\)/);
    });

    it('derives isForeign from account currency ≠ invoice currency', () => {
      assert.match(src, /const accountCurrency = selectedAccount\?\.currency \|\| '';/);
      assert.match(src, /const isForeign = !!\(accountCurrency && currency && accountCurrency !== currency\);/);
    });

    // The converted amount is independently editable (mirroring Classic's Add Payment):
    // typing a rate recomputes the amount, and typing an amount recomputes the rate.
    // `skipAmountRecomputeRef` breaks the feedback loop that would otherwise re-trigger
    // the amount-recompute effect (and clobber what the user just typed) the instant the
    // amount-driven rate update lands.
    it('recomputes the amount from the rate, and derives the rate from a typed amount, via a shared skip-guard', () => {
      assert.match(
        src,
        /function deriveRateFromAmount\(accountAmount, invoiceAmount\) \{\s*\n\s*return String\(parseFloat\(\(accountAmount \/ invoiceAmount\)\.toFixed\(6\)\)\);\s*\n\s*\}/,
      );
      assert.match(src, /const skipAmountRecomputeRef = useRef\(false\);/);
      assert.match(
        src,
        /if \(skipAmountRecomputeRef\.current\) \{\s*\n\s*skipAmountRecomputeRef\.current = false;\s*\n\s*return;\s*\n\s*\}/,
      );
      assert.match(
        src,
        /setAmountStr\(formatPlain\(round2\(balance\.amount \* rate\)\)\);/,
      );
      // Typing in the amount field sets the skip guard BEFORE deriving the rate, so the
      // recompute effect's next run (triggered by the rate change) skips itself once
      // instead of reformatting the amount the user is mid-keystroke on.
      assert.match(
        src,
        /if \(Number\.isFinite\(n\) && n > 0 && balance\.amount > 0\) \{\s*\n\s*skipAmountRecomputeRef\.current = true;\s*\n\s*setRateStr\(deriveRateFromAmount\(n, balance\.amount\)\);/,
      );
    });

    // The pair moved into its own ConversionFields component when the modal was brought under its
    // cognitive-complexity limit (ETP-4895); the gate is now the `visible` prop it returns null on.
    it('renders the conversion fields only in the foreign case', () => {
      assert.match(src, /<ConversionFields\s+visible=\{isForeign\}/);
      assert.match(src, /function ConversionFields\(\{/);
      assert.match(src, /if \(!visible\) return null;/);
      assert.match(src, /data-testid="cp-conversion-fields"/);
      assert.match(src, /data-testid="cp-conversion-rate-input"/);
      assert.match(src, /data-testid="cp-amount-in-account-input"/);
    });

    it('sends conversionRate in the register body only when foreign (else undefined)', () => {
      assert.match(src, /conversionRate: \(isForeign && rate != null\) \? String\(rate\) : undefined,/);
    });
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

    it('derives missingRequired from funds (cash + used credit), date, methodId, accountId and rateInvalid', () => {
      // "Importe" is satisfied by the total applied (cash + used credit), not the
      // cash field alone — a credit/saldo a favor line covering 100% of the
      // invoice legitimately leaves the cash amount (balance.amount) at 0, so the
      // gate must read balance.funds, not balance.amount (ETP-4331 bug fix).
      // A foreign payment whose conversion rate is missing/non-positive OR exactly 1
      // (rateInvalid) also blocks Save and Confirm (ETP-4504 B1 + rate==1 gate).
      assert.match(
        src,
        /const missingRequired = balance\.funds <= 0 \|\| !date \|\| !methodId \|\| !accountId \|\| rateInvalid;/,
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

    // The seeding call site reads the ref once and hands the value to seedMethodAndAccount
    // (ETP-4895); the method-change one still reads it inline, where the ref is in scope.
    it('passes the BP-preferred account as the 3rd argument at both pickDefaultAccountId call sites', () => {
      assert.match(
        src,
        /setAccountId\(pickDefaultAccountId\(accList, defaultMethodId, bpPreferredAccountId\)\);/,
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

  // The seeding moved to the module-level seedMethodAndAccount when the component was brought
  // under its cognitive-complexity limit (ETP-4895). What these guard did not change: the defaults
  // still come from the raw accJson, and the BP-preferred account is still resolved before the
  // account is picked — it is now passed in rather than read from the ref inside the branch.
  describe('fetch effect resolves the default method/account from the invoice payload (ETP-4331)', () => {
    it('computes defaultMethodId via pickDefaultMethodId using the raw accJson', () => {
      assert.match(src, /const defaultMethodId = pickDefaultMethodId\(accJson, accList, methList\);/);
      assert.match(src, /setMethodId\(defaultMethodId\);/);
      assert.match(src, /setAccountId\(pickDefaultAccountId\(accList, defaultMethodId, bpPreferredAccountId\)\);/);
    });

    it('sets bpPreferredAccountIdRef.current before handing it to the seeding', () => {
      const refAssignIdx = src.indexOf("bpPreferredAccountIdRef.current = accJson?.bpPreferredAccountId || '';");
      const seedCallIdx = src.indexOf('bpPreferredAccountId: bpPreferredAccountIdRef.current,');
      assert.ok(refAssignIdx > -1, 'ref assignment must exist');
      assert.ok(seedCallIdx > -1, 'the seeding must be handed the ref');
      assert.ok(refAssignIdx < seedCallIdx, 'ref must be set before it is read by pickDefaultAccountId');
    });

    it('seeds method and account outside the effect, from a single entry point', () => {
      assert.match(src, /function seedMethodAndAccount\(\{/);
      assert.match(src, /seedMethodAndAccount\(\{/);
    });
  });

  // ETP-4406: the PIS "IBAN Destino" (SEPA / vendor transfer) is validated with the
  // shared isValidIban (ISO 13616 mod-97) from lib/validateIban.js. An invalid IBAN
  // must keep Confirmar disabled and surface an inline error under the field.
  describe('IBAN validation on the PIS transfer (ETP-4406)', () => {
    it('imports isValidIban and normalizeIban from the shared lib', () => {
      assert.match(src, /import \{ isValidIban, normalizeIban \} from '@\/lib\/validateIban\.js';/);
    });

    it('pisFieldsComplete derives ibanOk from isValidIban (only when an IBAN is present)', () => {
      assert.match(src, /const ibanOk = !f\.iban \|\| isValidIban\(f\.iban\);/);
    });

    it('SEPA (default) requires a present AND valid IBAN', () => {
      assert.match(src, /return !!f\.iban && ibanOk;/);
    });

    it('DOMESTIC still accepts any one identifier but also gates on a valid IBAN when present', () => {
      assert.match(
        src,
        /if \(template === PIS_TEMPLATE_DOMESTIC\) return !!\(f\.iban \|\| f\.bban \|\| f\.accountNumber\) && ibanOk;/,
      );
    });

    it('FPS is unaffected — still gated purely on sort code + account number', () => {
      assert.match(src, /if \(template === PIS_TEMPLATE_FPS\) return !!\(f\.sortCode && f\.accountNumber\);/);
    });

    it('pisReady feeds confirmDisabled through computePaymentModalState (invalid IBAN blocks Confirmar)', () => {
      assert.match(
        src,
        /const pisReady = !pisEligible \|\| pisFieldsComplete\(pisTemplate, \{\s*iban: pisIban,[\s\S]*?\}\);/,
      );
      // ETP-4891 wrapped the expression and appended `|| psd2Blocked` (a transfer aimed at an
      // account whose PSD2 connection is inactive), so the whole chain is matched across lines
      // rather than pinned to one.
      assert.match(
        src,
        /const confirmDisabled = saving \|\| missingRequired \|\| !balance\.canConfirm \|\| !!pisPolling\s*\|\| !pisReady \|\| psd2Blocked;/,
      );
    });

    it('buildPisPaymentFields normalizes the creditor IBAN with normalizeIban before sending it', () => {
      assert.match(
        src,
        /pisCreditorIban: show\.iban \? \(normalizeIban\(creditorValues\.iban\) \|\| undefined\) : undefined,/,
      );
    });

    it('PisTransferSection flags a structurally invalid, non-empty IBAN', () => {
      assert.match(src, /const ibanInvalid = \(iban \|\| ''\)\.trim\(\) !== '' && !isValidIban\(iban\);/);
    });

    it('renders the inline IBAN error (testid + i18n key) only while the IBAN is invalid', () => {
      assert.match(src, /\{ibanInvalid && \(/);
      assert.match(src, /data-testid="cp-pis-iban-error"/);
      assert.match(src, /\{ui\('financeAccountsNewIbanInvalid'\)\}/);
    });
  });
});
