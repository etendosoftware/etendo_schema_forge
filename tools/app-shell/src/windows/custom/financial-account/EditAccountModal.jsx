import { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw, Unlink2, Archive, AlertTriangle, Plug, Settings2, Calculator, ChevronDown, Trash2 } from 'lucide-react';
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
import { useHasCapability } from '@/auth/AuthContext.jsx';
import { useAccountMutations } from '@/hooks/useAccountMutations.js';
import { useBankConnectionActions, launchSaltEdgePopup } from '@/hooks/useBankConnectionActions';
import { useFinancialAccountAccounting } from '@/hooks/useFinancialAccountAccounting.js';
import { DateInput, Field } from '@/components/forms/fields';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { ACCOUNT_TYPE } from '@/components/financial-accounts/tokens';
import { isValidIban, normalizeIban } from '@/lib/validateIban.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { useSplitButtonDropdown } from './useSplitButtonDropdown';
import BankConnectionDeleteConfirmModal from './BankConnectionDeleteConfirmModal';

const EDIT_TAB_GENERAL = 'general';
const EDIT_TAB_ACCOUNTING = 'accounting';

const GROUPING_OPTIONS = ['1BD', '1BW', '1BM', '1BE'];
const FIELD_INPUT = 'bg-card shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]';

// ---------------------------------------------------------------------------
// Pure helpers (kept top-level so the component/hooks stay simple)
// ---------------------------------------------------------------------------

/** The tab a cash account (no General tab trigger/content) must open on. */
export function initialEditTab(isCash) {
  return isCash ? EDIT_TAB_ACCOUNTING : EDIT_TAB_GENERAL;
}

function formatTypeLabel(type, ui) {
  const labels = {
    [ACCOUNT_TYPE.BANK]: ui('financeAccountsNewTypeBank'),
    [ACCOUNT_TYPE.CASH]: ui('financeAccountsNewTypeCash'),
    [ACCOUNT_TYPE.CARD]: ui('financeAccountsNewTypeCard'),
  };
  return labels[type] || type;
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
  const msg = res?.message;
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
  account, fields, settings, reconciliation, accounting, updateAccount, saveImportSettings,
  saveAccountingConfiguration,
}) {
  const updates = {};
  if (fields.nameDirty) updates.name = fields.name.trim();
  if (fields.typeDirty) updates.type = fields.type;
  if (fields.ibanDirty) updates.iban = normalizeIban(fields.iban);
  if (fields.currencyDirty) updates.currencyId = fields.currencyId;
  if (reconciliation?.dateDirty) updates.dateTolerance = reconciliation.dateTolerance;
  if (reconciliation?.amountDirty) updates.amountTolerance = reconciliation.amountTolerance;
  if (Object.keys(updates).length > 0) {
    await updateAccount(account.id, updates);
  }
  if (settings.dirty) {
    await saveImportSettings({ financialAccountId: account.id, ...settings.form });
  }
  if (accounting?.dirty) {
    await saveAccountingConfiguration(account.id, {
      fINAssetAcct: accounting.assetAcct,
      fINTransitoryAcct: accounting.transitoryAcct,
    });
  }
}

async function runSync({ account, sync, refresh, onSaved, ui, setBusy }) {
  setBusy(true);
  try {
    const res = await sync(account.id);
    await refresh();
    onSaved?.();
    notifySyncResult(res, ui);
  } catch (err) {
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
 * - IBAN is editable while the account has no bank link (owned by the bank once linked).
 * - Currency is editable only while the account BOTH has no bank link AND has no registered
 *   transactions yet (ETP-4530) — a stricter, distinct condition from the IBAN/connection one:
 *   an offline account can accumulate movements (manual statements, transfers) without ever
 *   connecting to the bank, and the currency must lock the moment real history exists so past
 *   balances/journal entries stay consistent.
 *
 * "Has a bank link" is deliberately broader than "is connected": a soft-disconnected account
 * (ETP-4764) is still bound to one specific Salt Edge account and can be revived with Reconectar,
 * so its IBAN/type/currency must stay locked. Letting the currency change while deactivated would
 * silently desync the account from the bank account it re-binds to — the link filters the bank's
 * accounts by currency. These only unlock once the connection is deleted for good.
 */
function useAccountFields(open, account, hasBankLink, hasTransactions) {
  const { fetchDefaults } = useAccountMutations();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [iban, setIban] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [ibanTouched, setIbanTouched] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [snapshot, setSnapshot] = useState({ name: '', type: '', iban: '', currencyId: '' });

  useEffect(() => {
    if (!open || !account) return;
    setName(account.name ?? '');
    setType(account.type ?? '');
    setIban(account.iban ?? '');
    setCurrencyId(account.currencyId ?? '');
    setSnapshot({
      name: account.name ?? '',
      type: account.type ?? '',
      iban: account.iban ?? '',
      currencyId: account.currencyId ?? '',
    });
    setIbanTouched(false);
  }, [open, account]);

  // Type and Currency lock the moment real movement history exists (or the account is
  // bank-connected, where both are owned by the bank link) — a stricter condition than the
  // IBAN/connection one. Changing either on an account with movements would break past
  // balances/journal entries, so they become read-only info instead of inputs (ETP-4581).
  const typeEditable = !hasBankLink && !hasTransactions;
  const currencyEditable = !hasBankLink && !hasTransactions;

  // Currency options are only needed while the currency field is editable.
  useEffect(() => {
    if (!open || !currencyEditable) return undefined;
    let cancelled = false;
    fetchDefaults()
      .then((data) => {
        if (!cancelled) setCurrencies(Array.isArray(data.currencies) ? data.currencies : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, currencyEditable, fetchDefaults]);

  // Reactive to the pending Type selection (falling back to the persisted value) so that
  // switching to/from Cash immediately reflows the IBAN field and the General tab before saving.
  const isCash = (type || account?.type) === ACCOUNT_TYPE.CASH;
  const ibanEditable = !hasBankLink && !isCash;
  const ibanInvalid = ibanEditable && iban.trim() !== '' && !isValidIban(iban);
  const nameDirty = name.trim() !== snapshot.name.trim();
  const typeDirty = typeEditable && type !== snapshot.type;
  const ibanDirty = ibanEditable && normalizeIban(iban) !== normalizeIban(snapshot.iban);
  const currencyDirty = currencyEditable && currencyId !== snapshot.currencyId;

  return {
    name, setName, type, setType, iban, setIban, currencyId, setCurrencyId,
    ibanTouched, setIbanTouched, currencies, isCash, typeEditable, currencyEditable,
    ibanInvalid, nameDirty, typeDirty, ibanDirty, currencyDirty,
  };
}

/**
 * Bank connection panel state + actions.
 *
 * Covers both live connections and soft-disconnected ones: a deactivated connection still needs
 * its status fetched so the panel can offer "Reconectar" instead of pretending the account never
 * had a bank link (ETP-4764).
 */
function useBankConnection(open, account, bankConnected, onSaved, onClose, bankReconnectable) {
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

  const handleSync = useCallback(
    () => runSync({ account, sync, refresh, onSaved, ui, setBusy }),
    [account, sync, refresh, onSaved, ui],
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
    hasBankLink: liveHasBankLink, settingsDirty,
    handleSync, handleReconnect, handleDisconnect, handleDeleteConnection,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation settings hook + section
// ---------------------------------------------------------------------------

function useReconciliationSettings(open, account) {
  const [dateTolerance, setDateTolerance] = useState(3);
  const [amountTolerance, setAmountTolerance] = useState(0);
  const [snapshot, setSnapshot] = useState({ dateTolerance: 3, amountTolerance: 0 });

  useEffect(() => {
    if (!open || !account) return;
    const dt = account.dateTolerance ?? 3;
    const at = Number(account.amountTolerance ?? 0);
    setDateTolerance(dt);
    setAmountTolerance(at);
    setSnapshot({ dateTolerance: dt, amountTolerance: at });
  }, [open, account]);

  const dateDirty = dateTolerance !== snapshot.dateTolerance;
  const amountDirty = Number(amountTolerance) !== Number(snapshot.amountTolerance);
  const dirty = dateDirty || amountDirty;
  return { dateTolerance, setDateTolerance, amountTolerance, setAmountTolerance, dateDirty, amountDirty, dirty };
}

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
            onChange={(e) => recon.setDateTolerance(Number(e.target.value))}
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
            max={100}
            step={0.1}
            value={recon.amountTolerance}
            onChange={(e) => recon.setAmountTolerance(Number(e.target.value))}
            className={FIELD_INPUT}
            data-testid="recon-amount-tolerance-input"
          />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounting configuration hook + section (ETP-4530 — Accounting tab)
// ---------------------------------------------------------------------------

/**
 * Loads and saves the account's accounting configuration (asset account / transitory account)
 * — the two accounts used when generating transaction journal entries. Backed by the
 * `accountingConfiguration` entity, fully owned by `FinancialAccountAccountingHandler`: GET
 * resolves the account's ledger and finds-or-defaults the row; save finds-or-creates it. The GET
 * response also carries `catalogs.accounts` (active accounting combinations for that ledger),
 * used to populate both search selects client-side with no extra round-trip.
 */
function useAccountingConfiguration(open, account) {
  const { fetchAccountingConfiguration } = useFinancialAccountAccounting();
  const [assetAcct, setAssetAcct] = useState('');
  const [assetAcctLabel, setAssetAcctLabel] = useState('');
  const [transitoryAcct, setTransitoryAcct] = useState('');
  const [transitoryAcctLabel, setTransitoryAcctLabel] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [ledgerConfigured, setLedgerConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState({ assetAcct: '', transitoryAcct: '' });

  const accountId = account?.id;

  useEffect(() => {
    if (!open || !accountId) return undefined;
    let cancelled = false;
    // Reset to a clean slate before fetching — otherwise a failed or slow fetch for a
    // NEW account (opened right after a previously-loaded one) would leave the previous
    // account's assetAcct/labels/catalog/snapshot in memory, making dirty/validation
    // derive from the wrong account.
    setAssetAcct('');
    setAssetAcctLabel('');
    setTransitoryAcct('');
    setTransitoryAcctLabel('');
    setCatalog([]);
    setSnapshot({ assetAcct: '', transitoryAcct: '' });
    setLedgerConfigured(true);
    setLoading(true);
    fetchAccountingConfiguration(accountId)
      .then((row) => {
        if (cancelled) return;
        const asset = row?.fINAssetAcct || '';
        const transitory = row?.fINTransitoryAcct || '';
        setAssetAcct(asset);
        setAssetAcctLabel(row?.['fINAssetAcct$_identifier'] || '');
        setTransitoryAcct(transitory);
        setTransitoryAcctLabel(row?.['fINTransitoryAcct$_identifier'] || '');
        setCatalog(Array.isArray(row?.catalogs?.accounts) ? row.catalogs.accounts : []);
        setLedgerConfigured(row?.ledgerConfigured !== false);
        setSnapshot({ assetAcct: asset, transitoryAcct: transitory });
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

  const dirty = assetAcct !== snapshot.assetAcct || transitoryAcct !== snapshot.transitoryAcct;
  // The asset account is required, but only blocks Save once the user actually touches this tab —
  // editing Name/bank connection/reconciliation on an account that never configured accounting must not be
  // blocked by an unrelated mandatory field (ETP-4530).
  const assetAcctMissing = dirty && !assetAcct;

  return {
    assetAcct, setAssetAcct, assetAcctLabel, setAssetAcctLabel,
    transitoryAcct, setTransitoryAcct, transitoryAcctLabel, setTransitoryAcctLabel,
    catalog, ledgerConfigured, loading, dirty, assetAcctMissing,
  };
}

function AccountingConfigurationSection({ ui, accounting }) {
  const accountField = { key: 'fINAssetAcct', id: 'edit-account-asset-acct', required: true };
  const transitoryField = { key: 'fINTransitoryAcct', id: 'edit-account-transitory-acct' };

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

  return (
    <div className="flex flex-col gap-4" data-testid="accounting-configuration-section">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={ui('financeAccountsAccountingBankAsset')}
          required
          data-testid="Field__accounting-asset">
          <CreatableSearchSelect
            field={accountField}
            value={accounting.assetAcct}
            displayValue={accounting.assetAcctLabel}
            onChange={(id, label) => { accounting.setAssetAcct(id || ''); accounting.setAssetAcctLabel(label || ''); }}
            formData={{}}
            resolvedLabel={ui('financeAccountsAccountingBankAsset')}
            staticOptions={accounting.catalog}
            data-testid="edit-account-asset-acct" />
          {accounting.assetAcctMissing ? (
            <p className="text-xs text-destructive" data-testid="edit-account-asset-acct-error">
              {ui('financeAccountsAccountingBankAssetRequired')}
            </p>
          ) : null}
        </Field>
        <Field
          label={ui('financeAccountsAccountingTransitory')}
          data-testid="Field__accounting-transitory">
          <CreatableSearchSelect
            field={transitoryField}
            value={accounting.transitoryAcct}
            displayValue={accounting.transitoryAcctLabel}
            onChange={(id, label) => { accounting.setTransitoryAcct(id || ''); accounting.setTransitoryAcctLabel(label || ''); }}
            formData={{}}
            resolvedLabel={ui('financeAccountsAccountingTransitory')}
            staticOptions={accounting.catalog}
            emptyOptionLabel={ui('financeAccountsAccountingNone')}
            data-testid="edit-account-transitory-acct" />
        </Field>
      </div>
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
 * - **General**: bank connection configuration, then reconciliation configuration. The tab itself
 *   is not rendered for cash accounts (`isCash`), which have no bank connection and no statement
 *   reconciliation — rendering an empty, blank-content tab for cash accounts was a QA regression
 *   fixed post-ETP-4530; the modal now defaults straight to Accounting when opened for a cash
 *   account.
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
 *   onConnect?: (account: object) => void,
 * }} props
 */
export function EditAccountModal({ open, onClose, onSaved, account, onArchive, onConnect }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const { updateAccount } = useAccountMutations();
  const { saveImportSettings } = useBankConnectionActions();
  const { saveAccountingConfiguration } = useFinancialAccountAccounting();

  const bankConnected = account?.bankConnected === true;
  // Soft-disconnected: not connected, but the bank link survives so it can be revived through the
  // reconnect flow.
  const bankReconnectable = account?.bankReconnectable === true;
  const hasTransactions = account?.hasTransactions === true;
  const bankConnection = useBankConnection(
    open, account, bankConnected, onSaved, onClose, bankReconnectable,
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
  const accounting = useAccountingConfiguration(open, account);
  // ETP-4530 — the Accounting tab is only reachable for roles granted this capability (resolved
  // server-side, admin roles always pass). Fails closed to `false` until the capabilities map
  // loads, so it can flip false → true shortly after the modal mounts, or true → false mid-session
  // on a role switch — both handled by the reset effect below.
  const canSeeAccounting = useHasCapability('showAccountingFields');
  // Initialize from account?.type (not a fixed EDIT_TAB_GENERAL default) so the very first
  // render is already consistent for cash accounts — the General tab's trigger/content are
  // not rendered for them, so an unconditional EDIT_TAB_GENERAL default would leave the first
  // paint with no active trigger and no visible content until the effect below corrects it.
  const [editTab, setEditTab] = useState(() => initialEditTab(isCash));
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [confirmDeleteConnectionOpen, setConfirmDeleteConnectionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset to the first AVAILABLE tab whenever the modal (re)opens for an account. Cash accounts
  // have no bank connection and no statement reconciliation, so the General tab itself is not
  // rendered for them — defaulting to it would leave the modal on a tab whose trigger doesn't
  // exist, with no visible content and no tab shown as active.
  useEffect(() => {
    if (open) setEditTab(initialEditTab(isCash));
  }, [open, account?.id, isCash]);

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
    || bankConnection.settingsDirty || (!isCash && recon.dirty) || accounting.dirty;
  const canSave = dirty && !saving && fields.name.trim() !== '' && !fields.ibanInvalid
    && !accounting.assetAcctMissing;
  const busy = saving || bankConnection.busy;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await persistAccountEdits({
        account,
        fields,
        settings: { dirty: bankConnection.settingsDirty, form: bankConnection.form },
        reconciliation: isCash ? null : recon,
        accounting,
        updateAccount,
        saveImportSettings,
        saveAccountingConfiguration,
      });
      toast.success(ui('financeAccountsEditSuccess'));
      onSaved?.();
      onClose?.();
    } catch (err) {
      if (err.status === 409) {
        setError(ui('financeAccountsNewNameExists'));
      } else {
        toast.error(err.message || ui('financeAccountsEditError'));
      }
    } finally {
      setSaving(false);
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
        className="max-w-[1020px] bg-card"
        onPointerDownOutside={(e) => { if (confirmDeleteConnectionOpen) e.preventDefault(); }}
        onInteractOutside={(e) => { if (confirmDeleteConnectionOpen) e.preventDefault(); }}
        onEscapeKeyDown={(e) => {
          if (confirmDeleteConnectionOpen) {
            e.preventDefault();
            setConfirmDeleteConnectionOpen(false);
          }
        }}
        data-testid="edit-account-modal">
        <DialogHeader data-testid="DialogHeader__73027d">
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

        <AccountFieldsGrid
          ui={ui}
          account={account}
          isCash={isCash}
          hasBankLink={hasBankLink}
          fields={fields}
          data-testid="AccountFieldsGrid__73027d" />

        <Tabs value={editTab} onValueChange={setEditTab} className="-mt-3" data-testid="EditAccountTabs__73027d">
          <TabsList className="w-full border-b border-border-subtle" data-testid="EditAccountTabsList__73027d">
            {/* Cash accounts have no bank connection and no statement reconciliation, so the
                General tab (bank connection + reconciliation config) has nothing to show for them — hide the
                tab itself rather than rendering it with empty content. */}
            {!isCash ? (
              <TabsTrigger value={EDIT_TAB_GENERAL} icon={Settings2} data-testid="edit-account-tab-general">
                {ui('financeAccountsEditTabGeneral')}
              </TabsTrigger>
            ) : null}
            {/* ETP-4530 — the Accounting tab trigger itself must not render at all for a role
                without the showAccountingFields capability (not just disabled/hidden via CSS). */}
            {canSeeAccounting ? (
              <TabsTrigger value={EDIT_TAB_ACCOUNTING} icon={Calculator} data-testid="edit-account-tab-accounting">
                {ui('financeAccountsEditTabAccounting')}
              </TabsTrigger>
            ) : null}
          </TabsList>

          {!isCash ? (
            <TabsContent value={EDIT_TAB_GENERAL} className="pt-4" data-testid="edit-account-tabpanel-general">
              <BankConnectionSection
                ui={ui}
                bankConnection={bankConnection}
                busy={busy}
                reauthMessage={reauthMessage}
                onConnect={handleConnectClick}
                onReconnect={bankConnection.handleReconnect}
                data-testid="BankConnectionSection__73027d" />

              <ReconciliationSettingsSection
                ui={ui}
                recon={recon}
                data-testid="ReconciliationSettingsSection__73027d" />
            </TabsContent>
          ) : null}

          {/* ETP-4530 — panel is gated the same as its trigger, so it's never mounted for a
              role without the showAccountingFields capability. */}
          {canSeeAccounting ? (
            <TabsContent value={EDIT_TAB_ACCOUNTING} className="pt-4" data-testid="edit-account-tabpanel-accounting">
              <AccountingConfigurationSection
                ui={ui}
                accounting={accounting}
                data-testid="AccountingConfigurationSection__73027d" />
            </TabsContent>
          ) : null}
        </Tabs>

        {/* The bank account's asset account is validated on the Accounting tab, but Save is
            disabled regardless of which tab is active — surface a summary here so the reason
            isn't invisible when the user is looking at General (the field-level error inside
            AccountingConfigurationSection already covers the Accounting tab itself, so this is
            skipped there to avoid a duplicate message, ETP-4530 / BUG-1). */}
        {accounting.assetAcctMissing && editTab !== EDIT_TAB_ACCOUNTING ? (
          <p className="text-xs text-destructive" data-testid="edit-account-accounting-error-summary">
            {ui('financeAccountsAccountingBankAssetRequiredSummary')}
          </p>
        ) : null}

        {error ? (
          <p className="text-xs text-[hsl(var(--destructive))]" data-testid="edit-account-error">{error}</p>
        ) : null}

        <EditFooter
          ui={ui}
          account={account}
          connected={bankConnection.connected}
          reconnectable={bankConnection.reconnectable}
          busy={busy}
          canSave={canSave}
          onArchive={onArchive}
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
function AccountFieldsGrid({ ui, account, isCash, hasBankLink, fields }) {
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
      {!isCash && hasBankLink ? (
        <ReadField
          label={ui('financeAccountsBankConnectionFieldIban')}
          value={account.iban}
          onCopy={account.iban ? () => copyIbanToClipboard(account, ui) : undefined}
          copyLabel={ui('financeAccountsCopyIban')}
          data-testid="ReadField__73027d" />
      ) : null}
      {!isCash && !hasBankLink ? (
        <EditField
          label={ui('financeAccountsBankConnectionFieldIban')}
          data-testid="EditField__73027d">
          <Input
            value={fields.iban}
            onChange={(e) => fields.setIban(e.target.value)}
            onBlur={() => fields.setIbanTouched(true)}
            placeholder={ui('financeAccountsNewFieldIbanPlaceholder')}
            maxLength={42}
            data-testid="edit-account-iban"
            className={FIELD_INPUT}
          />
          {fields.ibanInvalid && fields.ibanTouched ? (
            <p className="text-xs text-[hsl(var(--destructive))]" data-testid="edit-account-iban-error">
              {ui('financeAccountsNewIbanInvalid')}
            </p>
          ) : null}
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
 * Bank connection block, in one of three states (ETP-4764):
 *
 * - **connected** — the live panel with sync, import settings and the re-auth banner.
 * - **deactivated** (soft-disconnected) — the same panel, but with a "Reconectar" call to action
 *   instead of sync. The account still holds its bank link, so offering a from-scratch "Conectar
 *   banco" here would create a second connection and orphan the existing one.
 * - **unconnected** — just the "Conectar banco" button.
 */
function BankConnectionSection({
  ui, bankConnection, busy, reauthMessage, onConnect, onReconnect,
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
              <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${
                bankConnection.connected ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
              }`}>
                {bankConnection.connected
                  ? `✓ ${ui('financeAccountsBankConnectionStatusConnected')}`
                  : ui(deactivated
                    ? 'financeAccountsBankConnectionStatusDeactivated'
                    : 'financeAccountsBankConnectionStatusDisconnected')}
              </span>
            ) : null}
          </div>
        </div>
        {!hasBankLink ? (
          <button
            type="button"
            onClick={onConnect}
            data-testid="edit-account-connect-bank"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[hsl(var(--foreground))] px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))]"
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
  ui, account, connected, reconnectable, busy, canSave,
  onArchive, onDisconnect, onDeleteConnection, onCancel, onSave,
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <FooterButton
          icon={Archive}
          label={ui('financeAccountsBankConnectionEditArchive')}
          onClick={() => onArchive?.(account)}
          disabled={busy}
          danger
          data-testid="FooterButton__73027d" />
        {connected ? (
          <FooterSplitButton
            icon={Unlink2}
            label={ui('financeAccountsMenuDisconnect')}
            onClick={onDisconnect}
            disabled={busy}
            menuIcon={Trash2}
            menuLabel={ui('financeAccountsBankConnectionDeleteAction')}
            onMenuClick={onDeleteConnection}
            testId="bank-connection-disconnect" />
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
            testId="bank-connection-delete-only" />
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

function ReadField({ label, value, onCopy, copyLabel }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium leading-6 text-[hsl(var(--foreground))]">{label}</span>
      {/* bg-muted/50 + cursor-default matches the read-only styling EntityForm.jsx already
          uses everywhere else in the app (contract-ui's generic pipeline-generated forms) —
          this custom modal's ReadField had been left visually identical to an editable Input
          (a plain surface background), giving no visual cue that Tipo de cuenta/Moneda aren't editable. */}
      <div className="flex h-10 cursor-default items-center gap-2 rounded-lg border border-[hsl(var(--border-control))] bg-muted/50 px-3 shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]">
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{value || '—'}</span>
        {onCopy ? (
          <button type="button" onClick={onCopy} aria-label={copyLabel} className="text-[hsl(var(--text-disabled))] hover:text-[hsl(var(--foreground))]">
            <Copy className="h-4 w-4" data-testid="Copy__73027d" />
          </button>
        ) : null}
      </div>
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
 * the modal's bottom edge, which is fine: `DialogContent` sets no overflow clipping.
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
        <div
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
        </div>
      ) : null}
    </div>
  );
}
