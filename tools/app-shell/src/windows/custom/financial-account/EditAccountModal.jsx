import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw, Unlink2, Archive, AlertTriangle, Plug, Settings2, Calculator, RotateCcw, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useHasCapability, useAuth } from '@/auth/AuthContext.jsx';
import { useAccountMutations } from '@/hooks/useAccountMutations.js';
import { useBankConnectionActions, launchSaltEdgePopup } from '@/hooks/useBankConnectionActions';
import { useFinancialAccountAccounting } from '@/hooks/useFinancialAccountAccounting.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { DateInput, Field, ChipSelect } from '@/components/forms/fields';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { useGLItemLookup } from '@/hooks/useMovementLookups.js';
import { ACCOUNT_TYPE } from '@/components/financial-accounts/tokens';
import { canConnectToSaltEdge } from '@/components/financial-accounts/saltEdgeEligibility.js';
import { normalizeIban } from '@/lib/validateIban.js';
import { translateBackendError } from '@/lib/backendErrors.js';
import { validateIbanForCountry, countryLacksIbanConfig } from '@/lib/countryIban.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { useSplitButtonDropdown } from './useSplitButtonDropdown';
import BankConnectionDeleteConfirmModal from './BankConnectionDeleteConfirmModal';

const EDIT_TAB_GENERAL = 'general';
const EDIT_TAB_ACCOUNTING = 'accounting';

// ETP-4872 — the 9 accounting fields, grouped the way the "Contabilidad" tab renders them.
// Banco renders all 3 groups (9 fields); Caja/Tarjeta render only paymentIn/paymentOut (6 fields)
// — the "General" group is OMITTED for those types, not merely hidden (see
// AccountingConfigurationSection). No field is required (Global Constraints, ETP-4872 plan).
const ACCOUNTING_FIELD_GROUPS = {
  general: [
    { key: 'fINBankrevaluationgainAcct', id: 'edit-account-bank-revaluation-gain-acct', labelKey: 'financeAccountsAccountingBankRevaluationGain' },
    { key: 'fINBankrevaluationlossAcct', id: 'edit-account-bank-revaluation-loss-acct', labelKey: 'financeAccountsAccountingBankRevaluationLoss' },
    { key: 'fINBankfeeAcct', id: 'edit-account-bank-fee-acct', labelKey: 'financeAccountsAccountingBankFee' },
  ],
  paymentIn: [
    { key: 'inTransitPaymentAccountIN', id: 'edit-account-in-transit-payment-in-acct', labelKey: 'financeAccountsAccountingInTransitIn' },
    { key: 'depositAccount', id: 'edit-account-deposit-acct', labelKey: 'financeAccountsAccountingDeposit' },
    { key: 'clearedPaymentAccount', id: 'edit-account-cleared-payment-in-acct', labelKey: 'financeAccountsAccountingClearedIn' },
  ],
  paymentOut: [
    { key: 'fINOutIntransitAcct', id: 'edit-account-in-transit-payment-out-acct', labelKey: 'financeAccountsAccountingInTransitOut' },
    { key: 'withdrawalAccount', id: 'edit-account-withdrawal-acct', labelKey: 'financeAccountsAccountingWithdrawal' },
    { key: 'clearedPaymentAccountOUT', id: 'edit-account-cleared-payment-out-acct', labelKey: 'financeAccountsAccountingClearedOut' },
  ],
};

const ACCOUNTING_FIELDS = [
  ...ACCOUNTING_FIELD_GROUPS.general,
  ...ACCOUNTING_FIELD_GROUPS.paymentIn,
  ...ACCOUNTING_FIELD_GROUPS.paymentOut,
].map((fieldMeta) => fieldMeta.key);

// The "General" group (bank revaluation/fee accounts) only applies to Banco — mirrors the group
// selection AccountingConfigurationSection renders (see its own `groups` derivation below).
const ACCOUNTING_FIELDS_ALL_TYPES = [
  ...ACCOUNTING_FIELD_GROUPS.paymentIn,
  ...ACCOUNTING_FIELD_GROUPS.paymentOut,
].map((fieldMeta) => fieldMeta.key);

/**
 * Accounting field keys that actually belong to `accountType`'s rendered layout (ETP-4872 BUG-1).
 * `accounting.values` is always keyed on all 9 fields regardless of type — the field state map
 * itself is never reset when Type changes mid-edit, since a value picked while a since-hidden
 * group was still visible must not be silently thrown away if the user flips Type back before
 * Save. This helper is consulted only at save time (`persistAccountEdits`), so a value that
 * belongs to a group no longer applicable to the type actually being saved is nulled out in the
 * payload rather than carried over onto a row it doesn't apply to.
 */
function accountingFieldsForType(accountType) {
  return accountType === ACCOUNT_TYPE.BANK ? ACCOUNTING_FIELDS : ACCOUNTING_FIELDS_ALL_TYPES;
}

const GROUPING_OPTIONS = ['1BD', '1BW', '1BM', '1BE'];
const FIELD_INPUT = 'bg-card shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]';

// ETP-4896 — Country field. `CreatableSearchSelect` over the live `C_Country_ID` selector, NOT
// the Radix `Select` Currency/Type use: 239 active countries in an unfiltered `SelectContent`
// (no search box) is unusable, whereas Currency's ~20 options are fine in a plain dropdown.
// Deliberately not "made consistent" with Currency — see the field's own comment below.
const EDIT_COUNTRY_FIELD = { key: 'edit-account-country', id: 'edit-account-country' };
const COUNTRY_SELECTOR_URL = `${getApiBase()}/sws/neo/financial-account/account/selectors/C_Country_ID`;

/**
 * Maps a validateIbanForCountry() error code to its i18n key — same base mapping as
 * AccountFormStep, plus `missingCountry` (EditAccountModal-only: Country isn't mandatory here the
 * way it is on the New Account form, so clearing it while a real IBAN remains is its own error,
 * not a code `validateIbanForCountry` itself produces).
 */
const IBAN_ERROR_KEYS = {
  invalid: 'financeAccountsNewIbanInvalid',
  countryMismatch: 'financeAccountsNewIbanCountryMismatch',
  lengthMismatch: 'financeAccountsNewIbanLengthMismatch',
  missingCountry: 'financeAccountsNewCountryRequiredForIban',
  noIbanConfig: 'financeAccountsNewIbanCountryNoConfig',
};

/**
 * Picks which IBAN error to surface. A plain function rather than a nested ternary (Sonar S3358,
 * the same reason ETP-4871 extracted the previous one in this file). The two country-derived codes
 * win over `validateIbanForCountry`'s own: they describe what the user just DID (cleared the
 * country, or picked one that cannot hold an IBAN), which is more actionable than the generic
 * checksum/format complaint that a mismatched pair also produces.
 */
function resolveIbanErrorCode(countryRequiredForIban, countryNoIbanConfig, checkCode) {
  if (countryRequiredForIban) return 'missingCountry';
  if (countryNoIbanConfig) return 'noIbanConfig';
  return checkCode;
}

// ---------------------------------------------------------------------------
// Pure helpers (kept top-level so the component/hooks stay simple)
// ---------------------------------------------------------------------------

/**
 * The tab the modal opens on: General, for every account type.
 *
 * Cash accounts used to land on Accounting, on the reasoning that it was the more relevant tab for
 * them. Two things undid that. ETP-4795 gave General real content for cash — the GL Item Difference
 * selector backing the cash-close residual — so Accounting was no longer the only tab with anything
 * to show. And landing on Accounting means the first thing the user sees is the required, empty
 * "Cuenta bancaria" field with Save disabled, which reads as an error the modal is reporting rather
 * than as the relevant place to start.
 *
 * Kept as a function, rather than inlining the constant, because both the initial state and the
 * reset-on-open effect have to agree on it — and the test asserts exactly that.
 */
export function initialEditTab() {
  return EDIT_TAB_GENERAL;
}

function formatTypeLabel(type, ui) {
  const labels = {
    [ACCOUNT_TYPE.BANK]: ui('financeAccountsNewTypeBank'),
    [ACCOUNT_TYPE.CASH]: ui('financeAccountsNewTypeCash'),
    [ACCOUNT_TYPE.CARD]: ui('financeAccountsNewTypeCard'),
  };
  return labels[type] || type;
}

/**
 * `true` when the modal's destructive footer action should offer a real delete instead of
 * archiving (ETP-4871): the account is not archived AND the row confirmed it has zero dependent
 * records anywhere (`deletable`, injected server-side — every FK into `FIN_Financial_Account` is
 * RESTRICT). Mirrors {@link isUnarchiveMode}'s style (a small pure predicate over the account
 * record) but lives here rather than in `ArchiveAccountDialog.jsx`: this is what picks WHICH
 * dialog the footer opens, one level above the direction `isUnarchiveMode` picks inside the
 * archive dialog itself.
 *
 * Deliberately independent of `isUnarchiveMode`: an archived account never enters delete mode
 * (it must be unarchived first), but a deletable, still-active account is offered Eliminar
 * instead of Archivar — Archivar/Desarchivar and Eliminar are separate actions, not two directions
 * of the same one, so the account can still be archived if the user prefers it over deleting.
 */
export function isDeleteMode(account) {
  return account?.active !== false && account?.deletable === true;
}

/** Localized re-auth banner text, or '' when no consent expiry should be shown. */
function buildReauthMessage(status, locale, ui) {
  if (status?.connected !== true || !status?.consentExpiresAt) {
    return '';
  }
  const date = formatCalendarDate(status.consentExpiresAt, locale);
  const days = status.daysUntilExpires;
  if (typeof days === 'number' && days <= 0) {
    return ui('financeAccountsBankConnectionReauthExpired', { date });
  }
  return ui('financeAccountsBankConnectionReauthBanner', { days, date });
}

/** Maps the bridge sync result ({status, message}) to a toast. */
function notifySyncResult(res, ui) {
  // ETP-4891 follow-up: com.etendoerp.psd2 ships no real es_ES translation for these AD_MESSAGEs
  // (see backendErrors.js), so Core always resolves the English text regardless of session
  // locale — route it through the same frontend translation map every other untranslated backend
  // message uses, same fix as ImportedStatementsTab's identical sync-result handler.
  const msg = res?.message ? translateBackendError(res.message, ui) : res?.message;
  if (res?.status === 'ERROR') {
    toast.error(msg || ui('financeAccountsBankConnectionSyncError'));
  } else if (res?.status === 'WARNING') {
    toast.info(msg || ui('financeAccountsBankConnectionSyncDone'));
  } else {
    toast.success(msg || ui('financeAccountsBankConnectionSyncDone'));
  }
}

async function copyIbanToClipboard(account, ui) {
  try {
    await navigator.clipboard.writeText((account.iban || '').replace(/\s+/g, ''));
    toast.success(ui('financeAccountsBankConnectionIbanCopied'));
  } catch { /* ignore */ }
}

/**
 * Persists the changed account fields (name/iban/currency/tolerances), bank import settings and
 * the Accounting tab's accounting configuration (ETP-4530) in one go.
 */
async function persistAccountEdits({
  account, fields, settings, reconciliation, glItemDifference, accounting, updateAccount,
  saveImportSettings, saveAccountingConfiguration,
}) {
  const updates = {};
  if (fields.nameDirty) updates.name = fields.name.trim();
  if (fields.typeDirty) updates.type = fields.type;
  if (fields.ibanDirty) updates.iban = normalizeIban(fields.iban);
  if (fields.currencyDirty) updates.currencyId = fields.currencyId;
  // Country (ETP-4896) — always editable, so this can fire on its own even when nothing else on
  // the form changed; the `Object.keys(updates).length > 0` gate below already turns that into a
  // real PUT.
  if (fields.countryDirty) updates.countryId = fields.countryId;
  // Same normalization the New Account form applies (AccountFormStep), so a BIC saved from either
  // surface is stored identically. Sent only when dirty: an untouched field means no `swiftCode`
  // key in the PUT body, which the backend leaves at its stored value.
  if (fields.swiftDirty) updates.swiftCode = fields.swiftCode.trim().toUpperCase();
  // The `*Value` fields, never the raw strings the inputs hold — see useReconciliationSettings.
  if (reconciliation?.dateDirty) updates.dateTolerance = reconciliation.dateToleranceValue;
  if (reconciliation?.amountDirty) updates.amountTolerance = reconciliation.amountToleranceValue;
  // '' clears the limit back to "unset"; the mutation maps it to null.
  if (reconciliation?.writeoffDirty) updates.writeoffLimit = reconciliation.writeoffLimit;
  if (glItemDifference?.dirty) updates.glItemDifferenceId = glItemDifference.value?.id || '';
  if (Object.keys(updates).length > 0) {
    await updateAccount(account.id, updates);
  }
  if (settings.dirty) {
    await saveImportSettings({ financialAccountId: account.id, ...settings.form });
  }
  if (accounting?.dirty) {
    // ETP-4872 BUG-1: build the payload against the type actually being saved — the pending
    // Type selection if it changed this edit, else the account's persisted type — not blindly
    // off `accounting.values`. A field whose group no longer applies to that type (e.g. a
    // Banco-only "General" field after switching to Cash pre-Save) is explicitly nulled here so
    // a stale, now-invisible value is never persisted against the new type's row.
    const applicableFields = accountingFieldsForType(fields.type || account.type);
    const payload = {};
    ACCOUNTING_FIELDS.forEach((field) => {
      payload[field] = applicableFields.includes(field)
        ? (accounting.values[field]?.value || null)
        : null;
    });
    await saveAccountingConfiguration(account.id, payload);
  }
}

/**
 * Runs a "Sincronizar ahora", persisting the pending edits first (ETP-5104).
 *
 * Saving before syncing is not a convenience — it is the fix for two symptoms of the same bug. The
 * bridge reads the import date range from the DB, so an unsaved range was silently ignored and the
 * import ran with the previously stored dates; and `refresh()` below rewrites both `form` and
 * `initial` from the server, so whatever the user had typed was then overwritten in place ("los
 * campos se restablecen"). Persisting first makes the sync use the values on screen AND makes the
 * refresh a no-op for them.
 *
 * `beforeSync` is a REF, not a plain callback: it is filled in by the modal body, which is where
 * the other form hooks (fields / reconciliation / accounting) are declared — long after this hook
 * runs. It throws to abort, which is exactly what the `catch` below already handles.
 */
async function runSync({ account, sync, refresh, onSaved, ui, setBusy, beforeSync }) {
  setBusy(true);
  try {
    await beforeSync?.current?.();
    const res = await sync(account.id);
    await refresh();
    onSaved?.();
    notifySyncResult(res, ui);
  } catch (err) {
    // `handled` marks a failure beforeSync already reported with the save path's own wording —
    // toasting `err.message` on top of it would show the same problem twice, the second time raw.
    if (err?.handled) return;
    toast.error(err.message === 'BANK_CONNECTION_TIMEOUT' ? ui('financeAccountsBankConnectionTimeout') : err.message);
  } finally {
    setBusy(false);
  }
}

async function runReconnect({ account, reconnect, finishReconnect, refresh, onSaved, ui, setBusy }) {
  setBusy(true);
  try {
    const connectionId = await launchSaltEdgePopup(() => reconnect(account.id));
    // The popup resolves to null when the user closed it without finishing the bank's flow —
    // nothing was re-authorized, so leave the connection as it was.
    if (!connectionId) return;
    // Salt Edge redirects to an app route that only relays the id back here, so the SPA has to
    // ask the bridge to reactivate the connection. Skipping this leaves it inactive and the
    // account stuck showing as deactivated no matter how often the user reconnects.
    await finishReconnect(account.id, connectionId);
    await refresh();
    onSaved?.();
    toast.success(ui('financeAccountsBankConnectionReauthDone'));
  } catch (err) {
    toast.error(err.message === 'BANK_CONNECTION_TIMEOUT' ? ui('financeAccountsBankConnectionTimeout') : err.message);
  } finally {
    setBusy(false);
  }
}

/**
 * Performs a disconnect in one of the two modes offered by the footer split button.
 *
 * Confirmation is handled by the dialogs at the EditAccountModal render level, so this just runs
 * the call (no native window.confirm).
 *
 * Both modes close the modal: the account it was opened with is now stale (its `bankConnected` /
 * `bankReconnectable` flags no longer match reality), and the surrounding list re-reads them via
 * `onSaved`. Reopening then shows the correct state — including the "Reconectar" action after a
 * soft disconnect. Only the success message differs, and it reports what the bridge says actually
 * happened rather than what was requested, because a connection shared with other accounts is
 * always unlinked even when a soft disconnect was asked for.
 */
async function runDisconnect({
  account, disconnect, onSaved, onClose, ui, setBusy, permanentDeletion = false,
}) {
  setBusy(true);
  try {
    const res = await disconnect(account.id, { permanentDeletion });
    const wasPermanent = res?.permanent ?? permanentDeletion;
    toast.success(ui(wasPermanent
      ? 'financeAccountsBankConnectionDeleteDone'
      : 'financeAccountsBankConnectionDisconnectDone'));
    onSaved?.();
    onClose?.();
  } catch (err) {
    toast.error(err.message || ui(permanentDeletion
      ? 'financeAccountsBankConnectionDeleteError'
      : 'financeAccountsBankConnectionDisconnectError'));
  } finally {
    setBusy(false);
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Editable account fields.
 *
 * - Name is always editable.
 * - Currency is editable only while the account BOTH has no bank link AND has no registered
 *   transactions yet (ETP-4530) — a stricter, distinct condition from the IBAN/connection one:
 *   an offline account can accumulate movements (manual statements, transfers) without ever
 *   connecting to the bank, and the currency must lock the moment real history exists so past
 *   balances/journal entries stay consistent.
 *
 * "Has a bank link" is deliberately broader than "is connected": a soft-disconnected account
 * (ETP-4764) is still bound to one specific Salt Edge account and can be revived with Reconectar,
 * so its type/currency must stay locked. Letting the currency change while deactivated would
 * silently desync the account from the bank account it re-binds to — the link filters the bank's
 * accounts by currency. These only unlock once the connection is deleted for good.
 *
 * - **Country** (ETP-4896) is always editable, in every state, unlike Type/Currency above: it is
 *   descriptive metadata, not something that rewrites past balances or that a Salt Edge link pins
 *   the way Currency does. Changing it does re-run the IBAN↔country pair check (see
 *   `validateIbanForCountry`), same as the New Account form.
 * - **IBAN** (ETP-4896 follow-up) is likewise always editable for non-cash accounts, including a
 *   live-connected one — this REVERSES the pre-ETP-4896 stance ("owned by the bank once linked").
 *   Locking it made an inconsistent (IBAN, country) pair on an already-linked account
 *   unfixable from this modal: Country could be changed freely but the IBAN it must pair with
 *   could not, so a legacy mismatch (or the demo/seed data kind) permanently blocked Save with no
 *   way out short of un-linking the bank first. A hand-edited IBAN here is metadata on this
 *   record, same as Country — it does not reach into Salt Edge and rewrite what the live
 *   connection itself considers the account's IBAN, so it cannot desync the sync feed the way
 *   changing Currency could.
 */
function useAccountFields(open, account, hasBankLink, hasTransactions) {
  const { fetchDefaults } = useAccountMutations();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [iban, setIban] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [countryId, setCountryId] = useState('');
  // The picker's display label, sourced from `account.countryName` (both the W and R specs emit
  // it, ETP-4896) — NOT derived from `countryIbanRules` below, which only covers the ~45
  // countries with IBAN metadata and would render blank for the ~198 majority that lack it.
  const [countryLabel, setCountryLabel] = useState('');
  // ETP-4896 QA follow-up: BIC/SWIFT was only ever on the New Account form, so the field could
  // not be maintained from here at all. Optional and format-unvalidated, matching Classic (which
  // has no SWIFT format validation — only the FIN_FINACC_SHOWSWIFT_CHK presence constraint).
  const [swiftCode, setSwiftCode] = useState('');
  const [ibanTouched, setIbanTouched] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  // ETP-4896: the ≤45-country IBAN-metadata catalog, same source/shape as AccountFormStep's —
  // used ONLY to cross-check the typed IBAN against the selected country, never as the picker's
  // option list (that comes from the live C_Country_ID selector in AccountFieldsGrid).
  const [countryIbanRules, setCountryIbanRules] = useState([]);
  const [snapshot, setSnapshot] = useState({
    name: '', type: '', iban: '', currencyId: '', countryId: '', swiftCode: '',
  });

  useEffect(() => {
    if (!open || !account) return;
    setName(account.name ?? '');
    setType(account.type ?? '');
    setIban(account.iban ?? '');
    setCurrencyId(account.currencyId ?? '');
    setCountryId(account.countryId ?? '');
    setCountryLabel(account.countryName ?? '');
    setSwiftCode(account.swiftCode ?? '');
    setSnapshot({
      name: account.name ?? '',
      type: account.type ?? '',
      iban: account.iban ?? '',
      currencyId: account.currencyId ?? '',
      countryId: account.countryId ?? '',
      swiftCode: account.swiftCode ?? '',
    });
    setIbanTouched(false);
  }, [open, account]);

  // Type and Currency lock the moment real movement history exists (or the account is
  // bank-connected, where both are owned by the bank link) — a stricter condition than the
  // IBAN/connection one. Changing either on an account with movements would break past
  // balances/journal entries, so they become read-only info instead of inputs (ETP-4581).
  const typeEditable = !hasBankLink && !hasTransactions;
  const currencyEditable = !hasBankLink && !hasTransactions;
  // Country never locks (see the hook's own doc comment above) — kept as an explicit `true`
  // constant, not a computed condition, so the intent reads the same as its siblings above.
  const countryEditable = true;

  // ETP-4896: no longer gated on `currencyEditable` — the Country field needs this same catalog
  // for its IBAN cross-check regardless of whether Currency itself is locked, and Country is
  // always editable. Same single call as before, just one fewer condition, not an extra request.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    fetchDefaults()
      .then((data) => {
        if (cancelled) return;
        setCurrencies(Array.isArray(data.currencies) ? data.currencies : []);
        setCountryIbanRules(Array.isArray(data.countryIbanRules) ? data.countryIbanRules : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, fetchDefaults]);

  // Reactive to the pending Type selection (falling back to the persisted value) so that
  // switching to/from Cash immediately reflows the IBAN field and the General tab before saving.
  const currentType = type || account?.type;
  const isCash = currentType === ACCOUNT_TYPE.CASH;
  // ETP-4896 follow-up: no longer gated on `hasBankLink` — see the hook's own doc comment above.
  const ibanEditable = !isCash;
  // Only the ~45 countries with IBAN metadata match here; for the rest `validateIbanForCountry`
  // skips the prefix/length checks and falls back to plain mod-97 (see `@/lib/countryIban.js`).
  const selectedCountryMeta = countryIbanRules.find((c) => c.id === countryId) || null;
  // Bank-type gate, NOT `ibanEditable`: the IBAN↔country pair must be re-checked even when the
  // IBAN box itself is read-only (bank-linked accounts), because Country stays editable there —
  // clearing Country while the account still has a real, stored IBAN is exactly as invalid as
  // typing a mismatched one. Without this, that combination sailed past every frontend check and
  // came back as the backend's raw, untranslated `A bank account with an IBAN must have a
  // country.` 400 (ETP-4896 follow-up).
  const isBankType = currentType === ACCOUNT_TYPE.BANK;
  const ibanCheck = isBankType
    ? validateIbanForCountry(iban, selectedCountryMeta)
    : { ok: true, code: null };
  // Distinct from `ibanCheck`: `validateIbanForCountry(iban, null)` deliberately treats "no
  // country yet" as nothing-to-cross-check (the New Account form's in-progress-typing case). Here
  // it must additionally require `countryId !== snapshot.countryId` (an ACTIVE clear during this
  // edit, not merely "this legacy account never had one") — mirroring the backend's own
  // `isExplicitClear` guard and its trigger-mirroring no-op rule: an account whose country was
  // already blank when the modal opened, left untouched, sends no `country` key in the PUT body
  // at all, so the backend never re-validates it either (same COALESCE-based no-op the trigger
  // uses). Without the dirty check, every legacy account with a stored IBAN and no country (a
  // common pre-ETP-4896 state) would show this error — and block Save — on open, for an edit that
  // has nothing to do with either field.
  const countryRequiredForIban = isBankType && iban.trim() !== ''
    && countryId === '' && countryId !== snapshot.countryId;
  // The country IS set, but to one that cannot carry an IBAN (the ~198 without IBAN metadata) —
  // which the DB trigger rejects. Carries the SAME `countryId !== snapshot.countryId` dirty guard
  // as countryRequiredForIban above, and for the same reason: a legacy account already stored with
  // an IBAN and such a country, left untouched, sends no `country` key at all, so the backend
  // never re-validates the pair either. Without the guard, opening such an account to rename it
  // would show this error and block Save (ETP-4896 QA follow-up).
  const countryNoIbanConfig = isBankType && iban.trim() !== ''
    && countryId !== snapshot.countryId
    && countryLacksIbanConfig(countryId, countryIbanRules);
  const ibanInvalid = isBankType && iban.trim() !== ''
    && (!ibanCheck.ok || countryRequiredForIban || countryNoIbanConfig);
  const ibanErrorCode = resolveIbanErrorCode(
    countryRequiredForIban, countryNoIbanConfig, ibanCheck.code,
  );
  const nameDirty = name.trim() !== snapshot.name.trim();
  const typeDirty = typeEditable && type !== snapshot.type;
  const ibanDirty = ibanEditable && normalizeIban(iban) !== normalizeIban(snapshot.iban);
  const currencyDirty = currencyEditable && currencyId !== snapshot.currencyId;
  const countryDirty = countryEditable && countryId !== snapshot.countryId;
  // Compared case-insensitively on the normalized value actually persisted (trimmed + upper-cased,
  // same as AccountFormStep), so merely re-typing "bbvaesmm" over a stored "BBVAESMM" is not a
  // change. Bank-type-gated like the IBAN: the field is not even rendered for Cash/Card, and a
  // stale stored value on such an account must not make the form look dirty.
  const swiftDirty = isBankType
    && swiftCode.trim().toUpperCase() !== (snapshot.swiftCode ?? '').trim().toUpperCase();

  return {
    name, setName, type, setType, iban, setIban, currencyId, setCurrencyId,
    countryId, setCountryId, countryLabel, setCountryLabel, countryIbanRules,
    swiftCode, setSwiftCode,
    ibanTouched, setIbanTouched, currencies, isCash, isBankType,
    typeEditable, currencyEditable, countryEditable,
    ibanInvalid, ibanErrorCode, ibanEditable,
    nameDirty, typeDirty, ibanDirty, currencyDirty, countryDirty, swiftDirty,
  };
}

/**
 * True when both import dates are set and "Importar desde" is later than "Importar hasta".
 *
 * Compares the ISO strings exactly as `DateInput` emits them (`yyyy-mm-dd`, see
 * components/forms/fields.jsx) — in that format lexicographic order IS chronological order, so the
 * check is exact and completely timezone-free. Deliberately NOT `parseCalendarDate`: no `Date` is
 * ever constructed here, so the date-only shift this repo guards against (ETP-4850) cannot occur,
 * and pulling in a parser would only add a way to get it wrong.
 *
 * An empty box means "no bound" and never invalidates: a range with only one end is legal, and
 * blocking Save on a half-typed form would be worse than the bug this guards.
 */
function isImportRangeInvalid({ importFromDate, importToDate } = {}) {
  if (!importFromDate || !importToDate) return false;
  return importFromDate > importToDate;
}

/**
 * Bank connection panel state + actions.
 *
 * Covers both live connections and soft-disconnected ones: a deactivated connection still needs
 * its status fetched so the panel can offer "Reconectar" instead of pretending the account never
 * had a bank link (ETP-4764).
 */
function useBankConnection(
  open, account, bankConnected, onSaved, onClose, bankReconnectable, beforeSync,
) {
  const ui = useUI();
  const { fetchStatus, sync, disconnect, reconnect, finishReconnect } = useBankConnectionActions();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ importFromDate: '', importToDate: '', statementGrouping: '' });
  const [initial, setInitial] = useState({ importFromDate: '', importToDate: '', statementGrouping: '' });
  const hasBankLink = bankConnected || bankReconnectable;

  const refresh = useCallback(async () => {
    if (!account || !hasBankLink) return;
    setLoading(true);
    try {
      const data = await fetchStatus(account.id);
      setStatus(data);
      const values = {
        importFromDate: data.importFromDate ?? '',
        importToDate: data.importToDate ?? '',
        statementGrouping: data.statementGrouping ?? '',
      };
      setForm(values);
      setInitial(values);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [account, hasBankLink, fetchStatus]);

  // The modal stays mounted while closed, so a status left over from a previous open would still
  // be here on the next one. That matters for an account that has since lost its bank link (its
  // connection was deleted): nothing refetches for it, and the stale status would keep reporting
  // the old connection as live. Clear it explicitly instead.
  useEffect(() => {
    if (!open) return;
    if (hasBankLink) {
      refresh();
    } else {
      setStatus(null);
      setLoading(false);
    }
  }, [open, hasBankLink, refresh]);

  // ETP-5104 CP-4: an inverted range never reaches the bridge. Without this the sync fails deep
  // inside the PSD2 module (SaltEdgeConnectionHelper.validateDateRange), whose OBException is
  // caught and re-wrapped into PSD2_ErrorRetrievingRransactionsForTheAccount — an untranslated
  // toast carrying the Salt Edge connection id and raw Java timestamps.
  const handleSync = useCallback(
    () => {
      if (isImportRangeInvalid(form)) {
        toast.error(ui('financeAccountsBankConnectionImportRangeInvalid'));
        return Promise.resolve();
      }
      return runSync({ account, sync, refresh, onSaved, ui, setBusy, beforeSync });
    },
    [account, sync, refresh, onSaved, ui, form, beforeSync],
  );
  const handleReconnect = useCallback(
    () => runReconnect({ account, reconnect, finishReconnect, refresh, onSaved, ui, setBusy }),
    [account, reconnect, finishReconnect, refresh, onSaved, ui],
  );
  const handleDisconnect = useCallback(
    () => runDisconnect({ account, disconnect, onSaved, onClose, ui, setBusy }),
    [account, disconnect, onSaved, onClose, ui],
  );
  const handleDeleteConnection = useCallback(
    () => runDisconnect({
      account, disconnect, onSaved, onClose, ui, setBusy, permanentDeletion: true,
    }),
    [account, disconnect, onSaved, onClose, ui],
  );

  // `connected` is deliberately live-only: while the status is loading or its fetch failed we
  // must not claim the connection is usable just because the account record said so.
  const connected = status?.connected === true;
  // `reconnectable` prefers the live status and falls back to the record — the record goes stale
  // the moment the user reconnects from inside the modal.
  const reconnectable = status ? status.reconnectable === true : bankReconnectable === true;
  // Monotonic on purpose: the modal can only ever GAIN connectivity while open (a disconnect or a
  // delete closes it), so the record is a reliable lower bound. Without the record side, an
  // account whose status fetch failed would look like it never had a bank link at all.
  const liveHasBankLink = bankConnected || bankReconnectable || connected || reconnectable;
  const settingsDirty = bankConnected && (
    form.importFromDate !== initial.importFromDate
    || form.importToDate !== initial.importToDate
    || form.statementGrouping !== initial.statementGrouping
  );

  return {
    status, loading, busy, form, setForm, refresh, connected, reconnectable,
    hasBankLink: liveHasBankLink, settingsDirty, rangeInvalid: isImportRangeInvalid(form),
    handleSync, handleReconnect, handleDisconnect, handleDeleteConnection,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation settings hook + section
// ---------------------------------------------------------------------------

/**
 * The two tolerances reach this modal under DIFFERENT key names depending on where it was
 * opened from, so both spellings have to be accepted (ETP-4764 follow-up):
 *   - from the Cuentas LIST, the row comes from the generic W spec, which names them by their
 *     contract/DAL key — `eTGODateTolerance` / `eTGOAmountTolerance`;
 *   - from the account DETAIL, the record comes from the older `financial-accounts-page` R spec
 *     (`FinancialAccountsPageHandler`), which hand-builds its JSON with the flat `dateTolerance`
 *     / `amountTolerance` names.
 * Reading only the flat names made the list-opened modal always fall back to the 3/0 defaults:
 * it never showed the stored values, and — because the dirty check compares against that wrong
 * snapshot — re-entering the stored value looked like "nothing changed" and was never sent,
 * while any other value saved fine but still redisplayed as 3/0 on reopen. Both read as "no se
 * persiste". Contract key first: it is the canonical one, the R spec is the legacy path.
 */
function readTolerances(account) {
  return {
    dateTolerance: Number(account.eTGODateTolerance ?? account.dateTolerance ?? 3),
    amountTolerance: Number(account.eTGOAmountTolerance ?? account.amountTolerance ?? 0),
  };
}

/**
 * The numeric value a raw tolerance input stands for. An empty box means "no tolerance" (0) —
 * the same value the field would otherwise have to spell out — and a half-typed `-`/`.` is not a
 * number yet, so both settle on 0 rather than propagating NaN into the payload.
 */
function toleranceValue(raw) {
  if (String(raw).trim() === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Highest amount tolerance that means anything: 100 % of the line is the whole line. */
const MAX_AMOUNT_TOLERANCE_PCT = 100;

/**
 * Constrains the amount tolerance to 0…100 — the last line of defence for the saved value.
 *
 * The input carries `min={0} max={100}`, but on `<input type="number">` those only bound the spinner
 * arrows and native form validation, and this modal saves through its own handler. Out-of-range
 * input is REJECTED visibly by {@link isAmountToleranceInvalid} rather than clamped behind the
 * user's back; this clamp stays as a belt-and-braces guard on the payload itself (the column is
 * `numeric(10,2)`, so a wild value would otherwise overflow it) and mirrors the server-side bound in
 * `FinancialAccountHandler.validateAmountTolerance`.
 */
function clampTolerancePct(value) {
  return Math.min(MAX_AMOUNT_TOLERANCE_PCT, Math.max(0, value));
}

/**
 * True when what the user typed is a real value outside 0…100. An empty box is not invalid — it
 * means "no tolerance" and settles on 0 — so clearing the field never blocks saving.
 */
function isAmountToleranceInvalid(raw) {
  const text = String(raw).trim();
  if (text === '') return false;
  const n = Number(text);
  return !Number.isFinite(n) || n < 0 || n > MAX_AMOUNT_TOLERANCE_PCT;
}

/**
 * Both tolerances are held as the RAW STRING the user typed, not as a number, so the box can be
 * emptied while editing. Storing `Number(e.target.value)` instead made the field impossible to
 * clear: `Number('')` is 0, so deleting the last character immediately re-rendered a "0" the
 * caret then sat behind, forcing every entry to read "0123" (ETP-4764 follow-up). Numbers are
 * recovered through `toleranceValue` at exactly two points — the dirty check and the save payload
 * — so an empty box still persists as 0 without ever forcing that 0 into the UI mid-edit.
 */
function useReconciliationSettings(open, account) {
  const [dateTolerance, setDateTolerance] = useState('3');
  const [amountTolerance, setAmountTolerance] = useState('0');
  // ETP-4797. Kept as a STRING so the box can be emptied: '' means "no limit", which is a real,
  // distinct value from a configured 0 (which would forbid every write-off). Coercing to a number
  // here would collapse the two.
  const [writeoffLimit, setWriteoffLimit] = useState('');
  const [snapshot, setSnapshot] = useState({ dateTolerance: 3, amountTolerance: 0, writeoffLimit: '' });

  useEffect(() => {
    if (!open || !account) return;
    const { dateTolerance: dt, amountTolerance: at } = readTolerances(account);
    const wl = account.writeoffLimit == null ? '' : String(account.writeoffLimit);
    setDateTolerance(String(dt));
    setAmountTolerance(String(at));
    setWriteoffLimit(wl);
    setSnapshot({ dateTolerance: dt, amountTolerance: at, writeoffLimit: wl });
  }, [open, account]);

  const dateToleranceValue = toleranceValue(dateTolerance);
  // Clamped here, at the single point where the raw string becomes the number that is both
  // dirty-checked and sent in the payload — so an out-of-range value can never be persisted, however
  // it was typed or pasted.
  const amountToleranceValue = clampTolerancePct(toleranceValue(amountTolerance));
  // Out-of-range input is surfaced, not silently rewritten: an earlier version clamped the text on
  // blur, which meant typing 500 and pressing Save stored 100 with no explanation and the value
  // "changed by itself" on reopening. The field now keeps what was typed, shows the error under it
  // and blocks Save via canSave's amountToleranceInvalid check.
  const amountToleranceInvalid = isAmountToleranceInvalid(amountTolerance);
  // Compared numerically, so re-typing the stored value in a different shape ("03", "3.0")
  // correctly reads as unchanged rather than triggering a pointless write.
  const dateDirty = dateToleranceValue !== snapshot.dateTolerance;
  const amountDirty = amountToleranceValue !== snapshot.amountTolerance;
  const writeoffDirty = String(writeoffLimit) !== String(snapshot.writeoffLimit);
  const dirty = dateDirty || amountDirty || writeoffDirty;
  return {
    dateTolerance, setDateTolerance, amountTolerance, setAmountTolerance,
    dateToleranceValue, amountToleranceValue, dateDirty, amountDirty,
    amountToleranceInvalid,
    writeoffLimit, setWriteoffLimit, writeoffDirty, dirty,
  };
}

// ETP-4797 — Classic gates the Write-off Limit field behind the AD_Field display logic
// `@WriteOffLimitPreference@='Y'`, and that preference does not exist in this instance, so Classic
// hides it here too; this hand-written modal does not go through the generic EntityForm, so it was
// rendering the field unconditionally. Hidden until functional confirms whether it should be exposed
// at all. Everything BEHIND it stays in place — the core column, the contract field, the state and
// save wiring below, and the server-side limit check in ReconciliationWriteoffSupport — so restoring
// it is just flipping this to true. With it hidden the value can never change, so `writeoffDirty`
// stays false and no write is ever attempted.
const SHOW_WRITEOFF_LIMIT_FIELD = false;

function ReconciliationSettingsSection({ ui, recon }) {
  return (
    <div className="mt-6 border-b border-[hsl(var(--border-subtle))] pb-4" data-testid="reconciliation-settings-section">
      <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">
        {ui('financeAccountsReconciliationSection')}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Field
          label={ui('financeAccountsReconciliationDateTolerance')}
          data-testid="Field__73027d">
          <Input
            type="number"
            min={0}
            step={1}
            value={recon.dateTolerance}
            onChange={(e) => recon.setDateTolerance(e.target.value)}
            className={FIELD_INPUT}
            data-testid="recon-date-tolerance-input"
          />
        </Field>
        <Field
          label={ui('financeAccountsReconciliationAmountTolerance')}
          data-testid="Field__73027d">
          <Input
            type="number"
            min={0}
            max={MAX_AMOUNT_TOLERANCE_PCT}
            step={0.1}
            value={recon.amountTolerance}
            onChange={(e) => recon.setAmountTolerance(e.target.value)}
            className={FIELD_INPUT}
            data-testid="recon-amount-tolerance-input"
          />
          {recon.amountToleranceInvalid ? (
            <p className="text-xs text-destructive" data-testid="recon-amount-tolerance-error">
              {ui('financeAccountsReconciliationAmountToleranceInvalid')}
            </p>
          ) : null}
        </Field>
        {SHOW_WRITEOFF_LIMIT_FIELD && (
          <Field
            label={ui('writeoffAccountLimitLabel')}
            data-testid="Field__writeoff-limit">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={recon.writeoffLimit}
              onChange={(e) => recon.setWriteoffLimit(e.target.value)}
              className={FIELD_INPUT}
              data-testid="recon-writeoff-limit-input"
            />
            <p className="text-xs text-[hsl(var(--text-disabled))]">
              {ui('writeoffAccountLimitHint')}
            </p>
          </Field>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GL Item Difference hook + section (ETP-4795) — the accounting concept the
// cash-close / reconciliation-difference flows post the residual against.
// Unlike the tolerance fields above, this applies to every account type
// (bank, card AND cash), so it renders unconditionally on the General tab.
// ---------------------------------------------------------------------------

function useGlItemDifference(open, account) {
  const [value, setValue] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!open || !account) return;
    const initial = account.glItemDifferenceId
      ? { id: account.glItemDifferenceId, name: account.glItemDifferenceName || '' }
      : null;
    setValue(initial);
    setSnapshot(initial);
  }, [open, account]);

  const dirty = (value?.id || '') !== (snapshot?.id || '');
  return { value, setValue, dirty };
}

/**
 * @param first when this is the tab's FIRST section, which drops the top margin.
 *
 * `mt-6` separates a section from the one above it (same as ReconciliationSettingsSection). For a
 * cash account the two sections that normally precede this one are skipped, so that margin would
 * sit directly under the tab row and stack with its own `pt-4` — 40px of dead space, against 16px
 * on the Accounting tab, which has no leading margin because its section is likewise the only one.
 */
function GlItemDifferenceSection({ ui, glItemDifference, first = false }) {
  return (
    <div
      className={`${first ? '' : 'mt-6 '}border-b border-[hsl(var(--border-subtle))] pb-4`}
      data-testid="gl-item-difference-section">
      <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-3">
        {ui('financeAccountsGlItemDifferenceSection')}
      </p>
      <Field
        label={ui('financeAccountsGlItemDifferenceLabel')}
        data-testid="Field__gid73027d">
        <ChipSelect
          value={glItemDifference.value}
          onChange={glItemDifference.setValue}
          useLookup={useGLItemLookup}
          placeholder={ui('financeAccountsGlItemDifferencePlaceholder')}
          testId="gl-item-difference"
          data-testid="ChipSelect__73027d" />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounting configuration hook + section (ETP-4530 — Accounting tab)
// ---------------------------------------------------------------------------

/** Builds an empty { [field]: { value: '', label: '' } } map for all 9 accounting fields. */
function emptyAccountingValues() {
  return ACCOUNTING_FIELDS.reduce((acc, field) => {
    acc[field] = { value: '', label: '' };
    return acc;
  }, {});
}

/**
 * Loads and saves the account's accounting configuration (ETP-4872 — 9 account-type-dependent
 * fields, replacing the old 2-field `fINAssetAcct`/`fINTransitoryAcct` set) used when generating
 * transaction journal entries. Backed by the `accountingConfiguration` entity, fully owned by
 * `FinancialAccountAccountingHandler`: GET resolves the account's ledger and finds-or-defaults
 * the row; save finds-or-creates it. The GET response also carries `catalogs.accounts` (active
 * accounting combinations for that ledger), used to populate every search select client-side
 * with no extra round-trip. No field is required (ETP-4872 plan, Global Constraints).
 */
function useAccountingConfiguration(open, account) {
  const { fetchAccountingConfiguration } = useFinancialAccountAccounting();
  const [values, setValues] = useState(emptyAccountingValues);
  const [catalog, setCatalog] = useState([]);
  const [ledgerConfigured, setLedgerConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState(emptyAccountingValues);

  const accountId = account?.id;

  useEffect(() => {
    if (!open || !accountId) return undefined;
    let cancelled = false;
    // Reset to a clean slate before fetching — otherwise a failed or slow fetch for a
    // NEW account (opened right after a previously-loaded one) would leave the previous
    // account's values/catalog/snapshot in memory, making dirty derive from the wrong account.
    setValues(emptyAccountingValues());
    setCatalog([]);
    setSnapshot(emptyAccountingValues());
    setLedgerConfigured(true);
    setLoading(true);
    fetchAccountingConfiguration(accountId)
      .then((row) => {
        if (cancelled) return;
        const next = ACCOUNTING_FIELDS.reduce((acc, field) => {
          acc[field] = {
            value: row?.[field] || '',
            label: row?.[`${field}$_identifier`] || '',
          };
          return acc;
        }, {});
        setValues(next);
        setCatalog(Array.isArray(row?.catalogs?.accounts) ? row.catalogs.accounts : []);
        setLedgerConfigured(row?.ledgerConfigured !== false);
        setSnapshot(next);
      })
      .catch(() => {
        if (!cancelled) setLedgerConfigured(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // Keyed on accountId (not the `account` object reference) so a re-render that
    // produces a new `account` object for the SAME id doesn't trigger an unnecessary refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId, fetchAccountingConfiguration]);

  const setFieldValue = useCallback((field, id, label) => {
    setValues((prev) => ({ ...prev, [field]: { value: id || '', label: label || '' } }));
  }, []);

  const dirty = ACCOUNTING_FIELDS.some((field) => values[field]?.value !== snapshot[field]?.value);

  return {
    values, setFieldValue, catalog, ledgerConfigured, loading, dirty,
  };
}

// ETP-4872 — no field is required anymore, so Save is never blocked by this tab: the old
// `assetAcctMissing` requiredness and the cross-tab `edit-account-accounting-error-summary`
// banner it drove are gone (see the caller in EditAccountModal below). The
// `financeAccountsAccountingBankAssetRequiredSummary` i18n key is left in the locale files —
// deliberately unused — pending QA confirmation the "no field required" behavior is final.
function AccountingConfigurationSection({ ui, accounting, accountType }) {
  if (accounting.loading) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="accounting-configuration-loading">
        {ui('financeAccountsAccountingLoading')}
      </p>
    );
  }

  if (!accounting.ledgerConfigured) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="accounting-configuration-unconfigured">
        {ui('financeAccountsAccountingNoLedger')}
      </p>
    );
  }

  // Banco gets all 3 groups (9 fields); Caja/Tarjeta omit the "General" group entirely (not just
  // hide it) — it has no bank connection, so bank revaluation/fee accounts don't apply.
  const groups = accountType === ACCOUNT_TYPE.BANK
    ? [
        { titleKey: 'financeAccountsEditTabGeneral', fields: ACCOUNTING_FIELD_GROUPS.general },
        { titleKey: 'financeAccountsAccountingSectionPaymentIn', fields: ACCOUNTING_FIELD_GROUPS.paymentIn },
        { titleKey: 'financeAccountsAccountingSectionPaymentOut', fields: ACCOUNTING_FIELD_GROUPS.paymentOut },
      ]
    : [
        { titleKey: 'financeAccountsAccountingSectionPaymentIn', fields: ACCOUNTING_FIELD_GROUPS.paymentIn },
        { titleKey: 'financeAccountsAccountingSectionPaymentOut', fields: ACCOUNTING_FIELD_GROUPS.paymentOut },
      ];

  return (
    <div className="flex flex-col gap-6" data-testid="accounting-configuration-section">
      {groups.map((group) => (
        <div key={group.titleKey} className="flex flex-col gap-3">
          <h4 className="text-sm font-medium text-foreground">{ui(group.titleKey)}</h4>
          {/* ETP-4872 — every group is fixed at exactly 3 fields (see ACCOUNTING_FIELD_GROUPS),
              so sm:grid-cols-3 fills the row instead of orphaning the 3rd field alone on a
              half-empty row under sm:grid-cols-2. Same 3-column convention BankConnectionPanel
              already uses above for its own fixed-3-item row. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {group.fields.map((fieldMeta) => (
              <Field
                key={fieldMeta.key}
                label={ui(fieldMeta.labelKey)}
                data-testid={`Field__accounting-${fieldMeta.key}`}>
                <CreatableSearchSelect
                  field={{ key: fieldMeta.key, id: fieldMeta.id }}
                  value={accounting.values[fieldMeta.key]?.value || ''}
                  displayValue={accounting.values[fieldMeta.key]?.label || ''}
                  onChange={(id, label) => accounting.setFieldValue(fieldMeta.key, id, label)}
                  formData={{}}
                  resolvedLabel={ui(fieldMeta.labelKey)}
                  staticOptions={accounting.catalog}
                  emptyOptionLabel={ui('financeAccountsAccountingNone')}
                  data-testid={fieldMeta.id} />
              </Field>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

/**
 * Unified "Edit account" modal (ETP-4097 / T3, tabs added in ETP-4530). A single entry point that
 * replaced the former separate "Edit account" and "Edit bank connection" modals, since both
 * surfaced the same account data. Same width and footer (Archive / Cancel / Save changes) in
 * every state. The top section (Name | Type, IBAN | Currency) sits OUTSIDE both tabs, followed by
 * two tabs:
 *
 * - **General**: bank connection configuration, then reconciliation configuration, then the GL
 *   Item Difference selector (ETP-4795). The first two blocks are skipped for cash accounts
 *   (`isCash`), which have no bank connection and no per-account amount/date tolerances to
 *   configure, but the GL Item Difference selector renders for every account type — it backs
 *   both the cash-close residual (ETP-4795) and the bank/card reconciliation-difference flow
 *   (ETP-4796). Every account type opens here (see {@link initialEditTab}).
 * - **Accounting**: the accounting accounts used when generating transaction journal entries —
 *   asset account (required) and transitory account (optional). Backed by the
 *   `accountingConfiguration` entity / `FinancialAccountAccountingHandler` (ETP-4530). Gated by
 *   the `showAccountingFields` capability (`useHasCapability`, ETP-4520/ETP-4530): the trigger
 *   and panel are both omitted entirely (not disabled) for a role without it, and the modal
 *   falls back to General if it was sitting on Accounting when the capability turns off (e.g. a
 *   role switch mid-session).
 *
 * Field editability in the top section:
 * - **Name** is always editable. **Type** is always read-only. Cash accounts have no IBAN.
 * - **IBAN** is editable while the account is not bank-connected (owned by the bank once linked).
 * - **Currency** is editable only while the account is BOTH not bank-connected AND has no
 *   registered transactions yet (`account.hasTransactions`, injected server-side) — a stricter,
 *   independent condition from the IBAN/connection one (ETP-4530).
 * - **Connection block** (General tab, non-cash only): connected shows the live bank connection panel
 *   (provider, Sync now, import dates, statement grouping, re-auth banner) and a Disconnect
 *   footer button; not connected shows a single "Connect bank" button.
 *
 * Save persists every changed field across both tabs in one call.
 *
 * @param {{
 *   open: boolean,
 *   account: object,
 *   onClose: () => void,
 *   onSaved?: () => void,
 *   onArchive?: (account: object) => void,
 *   onDelete?: (account: object) => void,
 *   onConnect?: (account: object) => void,
 * }} props
 */
export function EditAccountModal({
  open, onClose, onSaved, account, onArchive, onDelete, onConnect,
}) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const { token } = useAuth();
  const { updateAccount } = useAccountMutations();
  const { saveImportSettings } = useBankConnectionActions();
  const { saveAccountingConfiguration } = useFinancialAccountAccounting();

  const bankConnected = account?.bankConnected === true;
  // Soft-disconnected: not connected, but the bank link survives so it can be revived through the
  // reconnect flow.
  const bankReconnectable = account?.bankReconnectable === true;
  const hasTransactions = account?.hasTransactions === true;
  // Filled in below, once every form hook exists. "Sincronizar ahora" persists the whole form
  // before syncing (ETP-5104), and the connection hook is declared before the hooks holding the
  // rest of the form — a ref is the only way to hand it something it cannot see yet.
  const beforeSyncRef = useRef(null);
  const bankConnection = useBankConnection(
    open, account, bankConnected, onSaved, onClose, bankReconnectable, beforeSyncRef,
  );
  // Anything that must not diverge from the linked bank account keys off this, not off
  // `bankConnected`: a deactivated account is still bound to one Salt Edge account (ETP-4764).
  // Taken from the connection hook so it tracks a reconnect done from inside the modal, where the
  // account record this modal was opened with is already out of date.
  const hasBankLink = bankConnection.hasBankLink;
  const fields = useAccountFields(open, account, hasBankLink, hasTransactions);
  // Reactive to the pending Type selection (see useAccountFields) so the tab layout and IBAN
  // field reflow when the Type is changed on an account without transactions.
  const isCash = fields.isCash;
  const recon = useReconciliationSettings(open, account);
  const glItemDifference = useGlItemDifference(open, account);
  const accounting = useAccountingConfiguration(open, account);
  // ETP-4530 — the Accounting tab is only reachable for roles granted this capability (resolved
  // server-side, admin roles always pass). Fails closed to `false` until the capabilities map
  // loads, so it can flip false → true shortly after the modal mounts, or true → false mid-session
  // on a role switch — both handled by the reset effect below.
  const canSeeAccounting = useHasCapability('showAccountingFields');
  const [editTab, setEditTab] = useState(() => initialEditTab());
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [confirmDeleteConnectionOpen, setConfirmDeleteConnectionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset to the default tab whenever the modal (re)opens for an account (see initialEditTab).
  useEffect(() => {
    if (open) setEditTab(initialEditTab());
  }, [open, account?.id]);

  // The modal stays mounted while closed, so a confirmation left open when it was dismissed
  // would still be showing the next time it opens. Clear both on close.
  useEffect(() => {
    if (!open) {
      setConfirmDisconnectOpen(false);
      setConfirmDeleteConnectionOpen(false);
    }
  }, [open]);

  // ETP-4530 — showAccountingFields capability gate. Kept as its own effect (rather than folded
  // into the reset-on-open effect above) so it reacts purely to the Accounting tab becoming
  // unreachable — it must NOT re-run the general open/account-id reset logic, which would
  // incorrectly force non-cash accounts back to General any time the capability flag changes
  // while the user is legitimately on that tab. Only corrects the one broken case: the modal is
  // currently showing the Accounting tab (last-used tab, or just-completed reset above) and the
  // capability has since resolved/changed to false, e.g. the role was switched mid-session.
  useEffect(() => {
    if (editTab === EDIT_TAB_ACCOUNTING && !canSeeAccounting) {
      setEditTab(EDIT_TAB_GENERAL);
    }
  }, [editTab, canSeeAccounting]);

  if (!account) return null;

  const typeLabel = formatTypeLabel(account.type, ui);
  const reauthMessage = buildReauthMessage(bankConnection.status, locale, ui);
  const dirty = fields.nameDirty || fields.typeDirty || fields.ibanDirty || fields.currencyDirty
    || fields.countryDirty || fields.swiftDirty
    || bankConnection.settingsDirty || (!isCash && recon.dirty) || glItemDifference.dirty
    || accounting.dirty;
  // What makes the form unsavable, independently of whether anything changed. Split out of
  // `canSave` because "Sincronizar ahora" needs the same verdict without the `dirty`/`saving`
  // terms: it must refuse to sync a form it cannot persist rather than sync stale dates.
  const saveBlocked = fields.name.trim() === '' || fields.ibanInvalid
    || recon.amountToleranceInvalid || bankConnection.rangeInvalid;
  const canSave = dirty && !saving && !saveBlocked;
  const busy = saving || bankConnection.busy;

  // Persists everything the modal holds and nothing else — no toast, no close. Shared by
  // "Guardar cambios" and by the save-before-sync step (ETP-5104), which must not close the modal.
  const persistAll = async () => {
    setSaving(true);
    setError(null);
    try {
      await persistAccountEdits({
        account,
        fields,
        settings: { dirty: bankConnection.settingsDirty, form: bankConnection.form },
        reconciliation: isCash ? null : recon,
        glItemDifference,
        accounting,
        updateAccount,
        saveImportSettings,
        saveAccountingConfiguration,
      });
    } finally {
      setSaving(false);
    }
  };

  const reportSaveError = (err) => {
    if (err.status === 409) {
      setError(ui('financeAccountsNewNameExists'));
    } else {
      // The shared mechanism (`@/lib/backendErrors.js`), not a local table: it already covers
      // this window's whole 400 family — including the String.format-interpolated country/IBAN
      // messages that an exact-match table structurally cannot reach (ETP-4896 QA follow-up).
      // useAccountFields' own pre-check is meant to catch these BEFORE the request fires; this
      // stays the safety net for what slips past (a stale/empty countryIbanRules, a race with
      // another tab, an API/MCP-shaped body).
      toast.error(translateBackendError(err.message, ui) || ui('financeAccountsEditError'));
    }
  };

  const handleSave = async () => {
    try {
      await persistAll();
      toast.success(ui('financeAccountsEditSuccess'));
      onSaved?.();
      onClose?.();
    } catch (err) {
      reportSaveError(err);
    }
  };

  // ETP-5104: "Sincronizar ahora" saves first. Anything it reports is reported HERE, with the
  // save-path wording, and re-thrown carrying `handled` so runSync aborts the sync without
  // toasting the same failure a second time in its own (raw `err.message`) wording.
  beforeSyncRef.current = async () => {
    if (!dirty) return;
    if (saveBlocked) {
      toast.error(ui('financeAccountsEditError'));
      throw Object.assign(new Error('EDIT_ACCOUNT_FORM_INVALID'), { handled: true });
    }
    try {
      await persistAll();
    } catch (err) {
      reportSaveError(err);
      throw Object.assign(err, { handled: true });
    }
  };

  const handleConnectClick = () => {
    onClose?.();
    onConnect?.(account);
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onClose?.(); }}
      data-testid="Dialog__73027d">
      {/* The delete-connection cartel portals to <body>, so it lives OUTSIDE this content in the
          DOM: without these guards Radix reads every click on it (including its own Cancel and
          X) as an outside interaction and closes the edit modal instead. Escape is guarded for
          the same reason — it must dismiss the cartel, not the modal underneath it. */}
      <DialogContent
        // ETP-4872 — `flex … flex-col` + `max-h-[90vh]` caps the modal's own height and lets the
        // body below scroll internally instead of growing past the viewport (the Accounting tab
        // went from 2 to 9 fields and started pushing Save off screen). Deliberately NOT paired
        // with `overflow-hidden` (unlike the sibling Import/Manual statement modals): the footer's
        // `FooterSplitButton` menu is a plain absolutely-positioned child, not portaled, and relies
        // on DialogContent clipping nothing so its dropdown can render past the box edge (see that
        // component's own doc comment below) — `max-h` alone already bounds the visible layout via
        // flexbox without clipping that popover.
        className="flex max-h-[90vh] flex-col max-w-[1020px] bg-card p-0"
        onPointerDownOutside={(e) => { if (confirmDeleteConnectionOpen) e.preventDefault(); }}
        onInteractOutside={(e) => { if (confirmDeleteConnectionOpen) e.preventDefault(); }}
        onEscapeKeyDown={(e) => {
          if (confirmDeleteConnectionOpen) {
            e.preventDefault();
            setConfirmDeleteConnectionOpen(false);
          }
        }}
        data-testid="edit-account-modal">
        <DialogHeader className="px-6 pt-6" data-testid="DialogHeader__73027d">
          <div className="flex items-center justify-between gap-6 pr-8">
            <DialogTitle data-testid="DialogTitle__73027d">{ui('financeAccountsEditTitle')}</DialogTitle>
            {!fields.typeEditable ? (
              <AccountStatusInfo
                ui={ui}
                account={account}
                typeLabel={typeLabel}
                data-testid="AccountStatusInfo__73027d" />
            ) : null}
          </div>
        </DialogHeader>

        {/* ETP-4872 — the only scrollable region: header and footer stay pinned outside it (same
            shape as ImportStatementModal's body wrapper) so the 9-field Accounting tab can grow
            without pushing Cancel/Save out of view. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <AccountFieldsGrid
            ui={ui}
            account={account}
            isCash={isCash}
            hasBankLink={hasBankLink}
            fields={fields}
            token={token}
            data-testid="AccountFieldsGrid__73027d" />

          <Tabs value={editTab} onValueChange={setEditTab} className="-mt-3" data-testid="EditAccountTabs__73027d">
            <TabsList className="w-full border-b border-border-subtle" data-testid="EditAccountTabsList__73027d">
              {/* ETP-4795: the General tab always renders now — a cash account has no bank
                  connection and no amount/date tolerances (see below), but it DOES have the GL
                  Item Difference concept used to close the difference of a cash-close. */}
              <TabsTrigger value={EDIT_TAB_GENERAL} icon={Settings2} data-testid="edit-account-tab-general">
                {ui('financeAccountsEditTabGeneral')}
              </TabsTrigger>
              {/* ETP-4530 — the Accounting tab trigger itself must not render at all for a role
                  without the showAccountingFields capability (not just disabled/hidden via CSS). */}
              {canSeeAccounting ? (
                <TabsTrigger value={EDIT_TAB_ACCOUNTING} icon={Calculator} data-testid="edit-account-tab-accounting">
                  {ui('financeAccountsEditTabAccounting')}
                </TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value={EDIT_TAB_GENERAL} className="pt-4" data-testid="edit-account-tabpanel-general">
              {!isCash ? (
                <>
                  <BankConnectionSection
                    ui={ui}
                    bankConnection={bankConnection}
                    busy={busy}
                    reauthMessage={reauthMessage}
                    onConnect={handleConnectClick}
                    onReconnect={bankConnection.handleReconnect}
                    connectEligible={canConnectToSaltEdge(account)}
                    data-testid="BankConnectionSection__73027d" />

                  <ReconciliationSettingsSection
                    ui={ui}
                    recon={recon}
                    data-testid="ReconciliationSettingsSection__73027d" />
                </>
              ) : null}

              <GlItemDifferenceSection
                ui={ui}
                glItemDifference={glItemDifference}
                first={isCash}
                data-testid="GlItemDifferenceSection__73027d" />
            </TabsContent>

            {/* ETP-4530 — panel is gated the same as its trigger, so it's never mounted for a
                role without the showAccountingFields capability. */}
            {canSeeAccounting ? (
              <TabsContent value={EDIT_TAB_ACCOUNTING} className="pt-4" data-testid="edit-account-tabpanel-accounting">
                <AccountingConfigurationSection
                  ui={ui}
                  accounting={accounting}
                  accountType={fields.type || account?.type}
                  data-testid="AccountingConfigurationSection__73027d" />
              </TabsContent>
            ) : null}
          </Tabs>

          {/* ETP-4872 — no accounting field is required anymore, so Save is never blocked by the
              Contabilidad tab; the cross-tab error summary this used to show (ETP-4530 / BUG-1) is
              gone along with the requiredness that drove it. */}

          {error ? (
            <p className="text-xs text-[hsl(var(--destructive))]" data-testid="edit-account-error">{error}</p>
          ) : null}
        </div>

        <EditFooter
          ui={ui}
          account={account}
          connected={bankConnection.connected}
          reconnectable={bankConnection.reconnectable}
          busy={busy}
          canSave={canSave}
          deleteMode={isDeleteMode(account)}
          onArchive={onArchive}
          onDelete={onDelete}
          onDisconnect={() => setConfirmDisconnectOpen(true)}
          onDeleteConnection={() => setConfirmDeleteConnectionOpen(true)}
          onCancel={onClose}
          onSave={handleSave}
          data-testid="EditFooter__73027d" />
      </DialogContent>
    </Dialog>
    {/* Deliberately NOT `variant="destructive"`: the soft disconnect only deactivates the
        connection and is fully reversible. Reserving the red treatment — and the fuller warning
        cartel — for the permanent deletion is what keeps that warning meaningful. */}
    <ConfirmDialog
      open={confirmDisconnectOpen}
      onOpenChange={(o) => { if (!o) setConfirmDisconnectOpen(false); }}
      title={ui('financeAccountsBankConnectionDisconnectConfirm')}
      description={ui('financeAccountsBankConnectionDisconnectBody')}
      confirmLabel={ui('financeAccountsBankConnectionDisconnectAction')}
      cancelLabel={ui('cancel')}
      loading={bankConnection.busy}
      onConfirm={async () => { setConfirmDisconnectOpen(false); await bankConnection.handleDisconnect(); }}
      data-testid="DisconnectBankConfirmDialog__73027d" />
    {confirmDeleteConnectionOpen ? (
      <BankConnectionDeleteConfirmModal
        onConfirm={async () => {
          setConfirmDeleteConnectionOpen(false);
          await bankConnection.handleDeleteConnection();
        }}
        onClose={() => setConfirmDeleteConnectionOpen(false)}
        data-testid="DeleteConnectionConfirmModal__73027d" />
    ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// `hasBankLink`, not `bankConnected`: a deactivated-but-reconnectable account still belongs to the
// bank, so its IBAN stays a read-only value rather than turning back into an input (ETP-4764).
function AccountFieldsGrid({ ui, account, isCash, hasBankLink, fields, token }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <EditField
        label={ui('financeAccountsBankConnectionFieldName')}
        data-testid="EditField__73027d">
        <Input
          value={fields.name}
          onChange={(e) => fields.setName(e.target.value)}
          maxLength={60}
          data-testid="edit-account-name"
          className={FIELD_INPUT}
        />
      </EditField>
      {/* Country (ETP-4896) — always editable, in every account state, unlike the IBAN/Type/
          Currency fields below which lock progressively. Placed right after Name so it reads
          before the IBAN it cross-checks against, mirroring AccountFormStep's field order. */}
      <EditField
        label={ui('financeAccountsBankConnectionFieldCountry')}
        data-testid="EditField__country">
        <CreatableSearchSelect
          field={EDIT_COUNTRY_FIELD}
          value={fields.countryId}
          displayValue={fields.countryLabel}
          onChange={(id, label) => {
            fields.setCountryId(id || '');
            fields.setCountryLabel(label || '');
            // Reuses the IBAN "touched" gate: a country change can flip `ibanInvalid` (mismatch,
            // or the missing-country case) on its own, without the IBAN input itself ever being
            // touched — without this, the error would compute correctly and Save would disable,
            // but nothing would explain why.
            fields.setIbanTouched(true);
          }}
          formData={{}}
          resolvedLabel={ui('financeAccountsBankConnectionFieldCountry')}
          selectorUrl={COUNTRY_SELECTOR_URL}
          token={token}
          serverSearch
          data-testid="edit-account-country" />
      </EditField>
      {!isCash ? (
        <EditField
          label={ui('financeAccountsBankConnectionFieldIban')}
          data-testid="EditField__73027d">
          {/* ETP-4896 follow-up: editable even while bank-linked (see useAccountFields' own doc
              comment) — the copy button is kept alongside it for a connected/linked account so
              that existing convenience isn't lost just because the field became editable. */}
          <div className="flex items-center gap-2">
            <Input
              value={fields.iban}
              onChange={(e) => fields.setIban(e.target.value)}
              onBlur={() => fields.setIbanTouched(true)}
              placeholder={ui('financeAccountsNewFieldIbanPlaceholder')}
              maxLength={42}
              data-testid="edit-account-iban"
              className={FIELD_INPUT}
            />
            {hasBankLink && account.iban ? (
              <button
                type="button"
                onClick={() => copyIbanToClipboard(account, ui)}
                aria-label={ui('financeAccountsCopyIban')}
                className="shrink-0 text-[hsl(var(--text-disabled))] hover:text-[hsl(var(--foreground))]">
                <Copy className="h-4 w-4" data-testid="Copy__73027d" />
              </button>
            ) : null}
          </div>
          {fields.ibanInvalid && fields.ibanTouched ? (
            <p className="text-xs text-[hsl(var(--destructive))]" data-testid="edit-account-iban-error">
              {ui(IBAN_ERROR_KEYS[fields.ibanErrorCode] || IBAN_ERROR_KEYS.invalid)}
            </p>
          ) : null}
        </EditField>
      ) : null}
      {/* BIC/SWIFT (ETP-4896 QA follow-up). Gated on `isBankType`, NOT on `!isCash`, to honour the
          contract's own `displayLogic: "@Type@='B'"` — `!isCash` would also surface it on card
          accounts, which have no BIC. Optional and deliberately unvalidated: Classic has no SWIFT
          format validation either (no regex, no length rule, no cross-check against country), so
          there is no existing rule for the Country field to feed into. */}
      {fields.isBankType ? (
        <EditField
          label={ui('financeAccountsNewFieldBic')}
          data-testid="EditField__73027d">
          <Input
            value={fields.swiftCode}
            onChange={(e) => fields.setSwiftCode(e.target.value)}
            placeholder={ui('financeAccountsNewFieldBicPlaceholder')}
            maxLength={20}
            data-testid="edit-account-bic"
            className={FIELD_INPUT}
          />
        </EditField>
      ) : null}
      {/* Type / Currency are editable form fields (below Name/IBAN) only while the account has no
          transactions and is not bank-connected. Once locked they move out of the form and read as
          account info beside the title (AccountStatusInfo). typeEditable === currencyEditable. */}
      {fields.typeEditable ? (
        <EditField
          label={ui('financeAccountsBankConnectionFieldType')}
          data-testid="EditField__73027d">
          <Select value={fields.type} onValueChange={fields.setType} data-testid="Select__73027d">
            <SelectTrigger data-testid="edit-account-type" className="bg-card">
              <SelectValue
                placeholder={ui('financeAccountsBankConnectionFieldType')}
                data-testid="SelectValue__73027d" />
            </SelectTrigger>
            <SelectContent side="bottom" avoidCollisions={false} data-testid="SelectContent__73027d">
              <SelectItem value={ACCOUNT_TYPE.BANK} data-testid="SelectItem__73027d">
                {ui('financeAccountsNewTypeBank')}
              </SelectItem>
              <SelectItem value={ACCOUNT_TYPE.CASH} data-testid="SelectItem__73027d">
                {ui('financeAccountsNewTypeCash')}
              </SelectItem>
              <SelectItem value={ACCOUNT_TYPE.CARD} data-testid="SelectItem__73027d">
                {ui('financeAccountsNewTypeCard')}
              </SelectItem>
            </SelectContent>
          </Select>
        </EditField>
      ) : null}
      {fields.currencyEditable ? (
        <EditField
          label={ui('financeAccountsBankConnectionFieldCurrency')}
          data-testid="EditField__73027d">
          <Select value={fields.currencyId} onValueChange={fields.setCurrencyId} data-testid="Select__73027d">
            <SelectTrigger data-testid="edit-account-currency" className="bg-card">
              <SelectValue
                placeholder={ui('financeAccountsNewFieldCurrencyPlaceholder')}
                data-testid="SelectValue__73027d" />
            </SelectTrigger>
            <SelectContent side="bottom" avoidCollisions={false} data-testid="SelectContent__73027d">
              {fields.currencies.map((currency) => (
                <SelectItem key={currency.id} value={currency.id} data-testid="SelectItem__73027d">
                  {currency.iso}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </EditField>
      ) : null}
    </div>
  );
}

/**
 * Type and Currency shown as read-only account info beside the modal title (ETP-4581), used only
 * once the account is locked (has transactions or is bank-connected). While they are still editable
 * they live in the form grid instead (AccountFieldsGrid) — the caller renders this only then.
 */
function AccountStatusInfo({ ui, account, typeLabel }) {
  return (
    <div className="flex shrink-0 items-start gap-6">
      <StatusItem
        label={ui('financeAccountsBankConnectionFieldType')}
        data-testid="StatusItem__73027d">
        <span className="text-sm font-semibold leading-6 text-foreground" data-testid="edit-account-type-info">
          {typeLabel || '—'}
        </span>
      </StatusItem>
      <StatusItem
        label={ui('financeAccountsBankConnectionFieldCurrency')}
        data-testid="StatusItem__73027d">
        <span
          className="inline-flex h-6 w-fit items-center rounded-md bg-muted px-2 text-sm font-medium text-foreground"
          data-testid="edit-account-currency-info">
          {account.currencyIso || '—'}
        </span>
      </StatusItem>
    </div>
  );
}

/** Compact label-over-value block used by the header status strip (Type / Currency). */
function StatusItem({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Status pill shown beside the auto-sync subtitle, in the same three states as the section that
 * owns it. Extracted so the label picks its wording through a plain if-chain: inline it was a
 * ternary nested inside another ternary inside the JSX, which is both a Sonar finding (S3358) and
 * most of what pushed `BankConnectionSection` over the cognitive-complexity limit (S3776).
 */
function BankConnectionStatusBadge({ ui, connected, deactivated }) {
  let label;
  if (connected) {
    label = `✓ ${ui('financeAccountsBankConnectionStatusConnected')}`;
  } else if (deactivated) {
    label = ui('financeAccountsBankConnectionStatusDeactivated');
  } else {
    label = ui('financeAccountsBankConnectionStatusDisconnected');
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-normal ${
        connected
          ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]'
          : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
      }`}
      data-testid="edit-account-connection-status-badge"
    >
      {label}
    </span>
  );
}

/**
 * Bank connection block, in one of three states (ETP-4764):
 *
 * - **connected** — the live panel with sync, import settings and the re-auth banner.
 * - **deactivated** (soft-disconnected) — the same panel, but with a "Reconectar" call to action
 *   instead of sync. The account still holds its bank link, so offering a from-scratch "Conectar
 *   banco" here would create a second connection and orphan the existing one.
 * - **unconnected** — just the "Conectar banco" button, and only when the account's country makes
 *   it eligible (ETP-4896, see `saltEdgeEligibility.js`); otherwise a disabled button plus the
 *   reason, since this is the one surface where the Country field that causes it is on screen.
 */
function BankConnectionSection({
  ui, bankConnection, busy, reauthMessage, onConnect, onReconnect, connectEligible,
}) {
  // All three states come from the connection hook's live view, never from the account record the
  // modal was opened with — reconnecting from inside the modal changes the state under it.
  const connected = bankConnection.connected;
  const deactivated = !connected && bankConnection.reconnectable;
  const hasBankLink = bankConnection.hasBankLink;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold leading-5 text-[hsl(var(--foreground))]">{ui('financeAccountsEditConnectionSection')}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-[hsl(var(--foreground))]">{ui('financeAccountsBankConnectionAutoSyncSubtitle')}</span>
            {hasBankLink ? (
              <BankConnectionStatusBadge
                ui={ui}
                connected={connected}
                deactivated={deactivated}
                data-testid="BankConnectionStatusBadge__73027d" />
            ) : null}
          </div>
        </div>
        {!hasBankLink ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={!connectEligible}
            data-testid="edit-account-connect-bank"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[hsl(var(--foreground))] px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground"
          >
            <Plug className="h-4 w-4" data-testid="Plug__73027d" />
            {ui('financeAccountsMenuConnect')}
          </button>
        ) : null}
        {deactivated ? (
          <button
            type="button"
            onClick={onReconnect}
            disabled={busy}
            data-testid="edit-account-reconnect-bank"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[hsl(var(--foreground))] px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" data-testid="ReconnectIcon__73027d" />
            {ui('financeAccountsBankConnectionReconnect')}
          </button>
        ) : null}
      </div>
      {hasBankLink && bankConnection.loading ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{ui('financeAccountsBankConnectionLoading')}</p>
      ) : null}
      {/* ETP-4896: the reason the button above is disabled. Spelled out only here — the list row
          and the row kebab hide their connect affordance outright, since neither has room to
          explain it, and this is the surface where the Country field that decides it is visible. */}
      {!hasBankLink && !connectEligible ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]" data-testid="edit-account-connect-country-hint">
          {ui('financeAccountsBankConnectionSpainOnly')}
        </p>
      ) : null}
      {deactivated && !bankConnection.loading ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]" data-testid="edit-account-deactivated-hint">
          {ui('financeAccountsBankConnectionDeactivatedHint')}
        </p>
      ) : null}
      {/* The panel also covers the "linked but not live" case (status still says disconnected, or
          its fetch failed): it renders with Sincronizar ahora disabled rather than vanishing, so
          the import settings stay reachable. Only the explicitly deactivated state replaces it
          with the Reconectar call to action. */}
      {hasBankLink && !deactivated && !bankConnection.loading ? (
        <BankConnectionPanel
          ui={ui}
          bankConnection={bankConnection}
          busy={busy}
          reauthMessage={reauthMessage}
          data-testid="BankConnectionPanel__73027d" />
      ) : null}
    </div>
  );
}

function BankConnectionPanel({ ui, bankConnection, busy, reauthMessage }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[hsl(var(--muted))] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {bankConnection.status?.providerName || ui('financeAccountsBankConnectionStatusConnected')}
        </span>
        <button
          type="button"
          disabled={busy || !bankConnection.connected}
          onClick={bankConnection.handleSync}
          data-testid="bank-connection-edit-sync"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4 text-[hsl(var(--text-disabled))]" data-testid="RefreshCw__73027d" />
          {ui('financeAccountsMenuSyncNow')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DateInput
          label={ui('financeAccountsBankConnectionImportFrom')}
          name="bank-connection-import-from"
          value={bankConnection.form.importFromDate || ''}
          onChange={(v) => bankConnection.setForm((f) => ({ ...f, importFromDate: v }))}
          data-testid="DateInput__73027d" />
        <DateInput
          label={ui('financeAccountsBankConnectionImportTo')}
          name="bank-connection-import-to"
          value={bankConnection.form.importToDate || ''}
          onChange={(v) => bankConnection.setForm((f) => ({ ...f, importToDate: v }))}
          data-testid="DateInput__73027d" />
        <Field label={ui('financeAccountsBankConnectionGrouping')} data-testid="Field__73027d">
          {/* White wrapper: the picker's box is bg-transparent (built for white cards),
              so on this gray card it blends in — the white backing makes it stand out. */}
          <div className="rounded-lg bg-card">
            <CreatableSearchSelect
              field={{ name: 'statementGrouping' }}
              value={bankConnection.form.statementGrouping || ''}
              displayValue={bankConnection.form.statementGrouping
                ? ui(`financeAccountsBankConnectionGrouping_${bankConnection.form.statementGrouping}`) : ''}
              onChange={(id) => bankConnection.setForm((f) => ({ ...f, statementGrouping: id || '' }))}
              formData={bankConnection.form}
              resolvedLabel={ui('financeAccountsBankConnectionGrouping')}
              emptyOptionLabel={ui('financeAccountsBankConnectionGroupingNone')}
              staticOptions={GROUPING_OPTIONS.map((o) => ({
                id: o, name: ui(`financeAccountsBankConnectionGrouping_${o}`),
              }))}
              data-testid="bank-connection-edit-grouping" />
          </div>
        </Field>
      </div>

      {/* ETP-5104. Sits under the whole grid rather than inside one Field: the error belongs to the
          PAIR of dates, and `Field` has no error slot anyway (components/forms/fields.jsx). Same
          shape as the amount-tolerance error in the reconciliation section. */}
      {bankConnection.rangeInvalid ? (
        <p className="text-xs text-destructive" data-testid="bank-connection-import-range-error">
          {ui('financeAccountsBankConnectionImportRangeInvalid')}
        </p>
      ) : null}

      {reauthMessage ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--status-warning-bg)] px-3 py-3" data-testid="bank-connection-edit-reauth-banner">
          <span className="flex items-center gap-2 text-sm font-medium text-[var(--status-warning-fg)]">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-[var(--status-warning-fg)]"
              data-testid="AlertTriangle__73027d" />
            {reauthMessage}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={bankConnection.handleReconnect}
            data-testid="bank-connection-edit-reauth-link"
            className="shrink-0 text-sm font-medium text-[var(--status-warning-fg)] underline disabled:opacity-50"
          >
            {ui('financeAccountsBankConnectionReauth')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EditFooter({
  ui, account, connected, reconnectable, busy, canSave, deleteMode,
  onArchive, onDelete, onDisconnect, onDeleteConnection, onCancel, onSave,
}) {
  const archived = account?.active === false;
  // Three reachable states for this one footer slot (ETP-4871):
  //   - archived           → the row kebab's inverse action, "Desarchivar" (not destructive).
  //                          Nothing to reveal here (an archived account isn't offered Eliminar
  //                          until it's unarchived, per `isDeleteMode`), so this stays a single
  //                          plain button, no chevron.
  //   - !archived+deletable → both Archivar AND Eliminar are genuinely available for this
  //                          account, so — mirroring the bank connection split button one row
  //                          down in this same footer — Archivar stays the always-visible
  //                          primary action, with Eliminar reachable via the chevron instead of
  //                          swapping it out.
  //   - !archived+!deletable→ only Archivar applies; a plain button (no chevron) is correct
  //                          since there's nothing else to reveal.
  function renderArchiveOrDeleteButton() {
    if (archived) {
      return (
        <FooterButton
          icon={RotateCcw}
          label={ui('financeAccountsMenuUnarchive')}
          onClick={() => onArchive?.(account)}
          disabled={busy}
          danger={false}
          data-testid="FooterButton__73027d" />
      );
    }
    if (deleteMode) {
      return (
        <FooterSplitButton
          icon={Archive}
          label={ui('financeAccountsBankConnectionEditArchive')}
          onClick={() => onArchive?.(account)}
          disabled={busy}
          menuIcon={Trash2}
          menuLabel={ui('financeAccountsMenuDelete')}
          onMenuClick={() => onDelete?.(account)}
          testId="archive-account-split"
          data-testid="FooterSplitButton__73027d" />
      );
    }
    return (
      <FooterButton
        icon={Archive}
        label={ui('financeAccountsBankConnectionEditArchive')}
        onClick={() => onArchive?.(account)}
        disabled={busy}
        danger
        data-testid="FooterButton__73027d" />
    );
  }
  return (
    // ETP-4872 — px-6/pb-6 replace the padding `DialogContent` used to provide on every side
    // (now `p-0`, see the modal's own className comment); the top gap to the scrollable body
    // above comes from DialogContent's own `gap-4` flex spacing instead of the old `mt-2`.
    <div className="flex items-center justify-between gap-2 px-6 pb-6">
      <div className="flex items-center gap-3">
        {renderArchiveOrDeleteButton()}
        {connected ? (
          <FooterSplitButton
            icon={Unlink2}
            label={ui('financeAccountsMenuDisconnect')}
            onClick={onDisconnect}
            disabled={busy}
            menuIcon={Trash2}
            menuLabel={ui('financeAccountsBankConnectionDeleteAction')}
            onMenuClick={onDeleteConnection}
            testId="bank-connection-disconnect"
            data-testid="FooterSplitButton__73027d" />
        ) : null}
        {/* Already deactivated: the soft disconnect no longer applies, but the user must still be
            able to release the surviving Salt Edge link without reconnecting first. */}
        {!connected && reconnectable ? (
          <FooterButton
            icon={Trash2}
            label={ui('financeAccountsBankConnectionDeleteAction')}
            onClick={onDeleteConnection}
            disabled={busy}
            danger
            testId="bank-connection-delete-only"
            data-testid="FooterButton__73027d" />
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          data-testid="edit-account-cancel"
          className="rounded-full border border-[hsl(var(--border-control))] bg-card px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))]"
        >
          {ui('cancel')}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          data-testid="edit-account-save"
          className="rounded-full bg-[hsl(var(--foreground))] px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground"
        >
          {ui('financeAccountsEditSave')}
        </button>
      </div>
    </div>
  );
}

function EditField({ label, children }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium leading-6 text-[hsl(var(--foreground))]">{label}</span>
      {children}
    </div>
  );
}

function FooterButton({ icon: Icon, label, onClick, disabled, danger, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm font-medium shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] disabled:opacity-50 ${
        danger ? 'border-[hsl(var(--destructive) / 0.3)] text-[hsl(var(--destructive))] hover:bg-[var(--status-destructive-bg)]' : 'border-[hsl(var(--border-control))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'
      }`}
    >
      <Icon
        className={`h-5 w-5 ${danger ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--text-disabled))]'}`}
        data-testid="Icon__73027d" />
      {label}
    </button>
  );
}

/**
 * Footer pill split into a primary action plus a chevron that reveals one extra, more destructive
 * action — the same shape as the toolbars' `ImportSplitButton` / `MovementsSplitButton`, restyled
 * as an outline pill to match `FooterButton`.
 *
 * The menu drops downward like those variants, just left-aligned to this button. It extends past
 * the modal's bottom edge, which is fine: `DialogContent` gained a `max-h-[90vh]` cap in ETP-4872
 * but deliberately no `overflow-hidden`, so this non-portaled popover is never clipped.
 */
function FooterSplitButton({
  icon: Icon, label, onClick, disabled, menuIcon: MenuIcon, menuLabel, onMenuClick, testId,
}) {
  const { open, setOpen, ref } = useSplitButtonDropdown();
  const base = 'inline-flex items-center gap-2 border bg-card py-2 text-sm font-medium shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] disabled:opacity-50 border-[hsl(var(--border-control))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]';
  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
        className={`${base} rounded-l-full pl-3 pr-2.5`}
      >
        <Icon className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="SplitIcon__73027d" />
        {label}
      </button>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        data-testid={`${testId}-split`}
        className={`${base} w-9 justify-center rounded-r-full border-l-0 px-0`}
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          data-testid="SplitChevron__73027d" />
      </button>
      {open ? (
        // Pill-shaped and padding-free, unlike the toolbars' square `rounded-lg` panels: this menu
        // hangs off a pill trigger and holds a single action, so panel and item are effectively
        // one control. `w-full` matches the trigger's own width (the wrapper is `relative`)
        // instead of the toolbars' fixed 229px, which made the menu noticeably wider than the
        // button it belongs to. The item fills the panel edge to edge and the panel's
        // `overflow-hidden` clips the hover to the rounded shape — inset padding would leave a
        // white frame around the highlight instead of covering the whole button.
        (<div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-full border border-[hsl(var(--border-subtle))] bg-card shadow-lg"
        >
          {/* `py-2` and `px-3`, i.e. the trigger's own padding, so both halves of the control end
              up exactly the same height and the labels line up vertically. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onMenuClick?.(); }}
            data-testid={`${testId}-menu-item`}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[hsl(var(--destructive))] hover:bg-[var(--status-destructive-bg)]"
          >
            {/* The glyph is h-4 rather than the trigger's h-5 because the trash carries more ink
                than the unlink icon and read as the larger of the two at equal box sizes. It
                still occupies a w-5 slot so that both labels start at exactly the same x — the
                icon box, not the glyph, is what sets the text offset — and is centred inside it
                so the smaller glyph sits on the same optical axis as the one above. */}
            <span className="flex w-5 shrink-0 justify-center">
              <MenuIcon className="h-4 w-4 text-[hsl(var(--destructive))]" data-testid="SplitMenuIcon__73027d" />
            </span>
            {menuLabel}
          </button>
        </div>)
      ) : null}
    </div>
  );
}
