import { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw, Unlink2, Archive, AlertTriangle, Plug, Settings2, Calculator } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/OAuth2ClientDialog';
import { useUI, useLocaleSwitch } from '@/i18n';
import { useAccountMutations } from '@/hooks/useAccountMutations.js';
import { usePsd2Actions, launchSaltEdgePopup } from '@/hooks/usePsd2Actions';
import { useFinancialAccountAccounting } from '@/hooks/useFinancialAccountAccounting.js';
import { DateInput, Field } from '@/components/forms/fields';
import { CreatableSearchSelect } from '@/components/contract-ui/CreatableSearchSelect';
import { ACCOUNT_TYPE } from '@/components/financial-accounts/tokens';
import { isValidIban, normalizeIban } from '@/lib/validateIban.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';

const EDIT_TAB_GENERAL = 'general';
const EDIT_TAB_ACCOUNTING = 'accounting';

const GROUPING_OPTIONS = ['1BD', '1BW', '1BM', '1BE'];
const FIELD_INPUT = 'bg-white shadow-[0_1px_2px_rgba(18,18,23,0.05)]';

// ---------------------------------------------------------------------------
// Pure helpers (kept top-level so the component/hooks stay simple)
// ---------------------------------------------------------------------------

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
    return ui('financeAccountsPsd2ReauthExpired', { date });
  }
  return ui('financeAccountsPsd2ReauthBanner', { days, date });
}

/** Maps the bridge sync result ({status, message}) to a toast. */
function notifySyncResult(res, ui) {
  const msg = res?.message;
  if (res?.status === 'ERROR') {
    toast.error(msg || ui('financeAccountsPsd2SyncError'));
  } else if (res?.status === 'WARNING') {
    toast.info(msg || ui('financeAccountsPsd2SyncDone'));
  } else {
    toast.success(msg || ui('financeAccountsPsd2SyncDone'));
  }
}

async function copyIbanToClipboard(account, ui) {
  try {
    await navigator.clipboard.writeText((account.iban || '').replace(/\s+/g, ''));
    toast.success(ui('financeAccountsPsd2IbanCopied'));
  } catch { /* ignore */ }
}

/**
 * Persists the changed account fields (name/iban/currency/tolerances), PSD2 import settings and
 * the Tab Contabilidad accounting configuration (ETP-4530) in one go.
 */
async function persistAccountEdits({
  account, fields, settings, reconciliation, accounting, updateAccount, saveImportSettings,
  saveAccountingConfiguration,
}) {
  const updates = {};
  if (fields.nameDirty) updates.name = fields.name.trim();
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
    toast.error(err.message === 'PSD2_TIMEOUT' ? ui('financeAccountsPsd2Timeout') : err.message);
  } finally {
    setBusy(false);
  }
}

async function runReconnect({ account, reconnect, refresh, onSaved, ui, setBusy }) {
  setBusy(true);
  try {
    await launchSaltEdgePopup(() => reconnect(account.id));
    await refresh();
    onSaved?.();
    toast.success(ui('financeAccountsPsd2ReauthDone'));
  } catch (err) {
    toast.error(err.message === 'PSD2_TIMEOUT' ? ui('financeAccountsPsd2Timeout') : err.message);
  } finally {
    setBusy(false);
  }
}

async function runDisconnect({ account, disconnect, onSaved, onClose, ui, setBusy }) {
  // Confirmation is handled by a styled ConfirmDialog at the EditAccountModal render level,
  // so this just performs the disconnect (no native window.confirm).
  setBusy(true);
  try {
    await disconnect(account.id);
    toast.success(ui('financeAccountsPsd2DisconnectDone'));
    onSaved?.();
    onClose?.();
  } catch (err) {
    toast.error(err.message || ui('financeAccountsPsd2DisconnectError'));
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
 * - IBAN is editable while the account is not PSD2-connected (owned by the bank once linked).
 * - Currency is editable only while the account is BOTH not PSD2-connected AND has no registered
 *   transactions yet (ETP-4530) — a stricter, distinct condition from the IBAN/connection one:
 *   an offline account can accumulate movements (manual statements, transfers) without ever
 *   connecting to PSD2, and the currency must lock the moment real history exists so past
 *   balances/journal entries stay consistent.
 */
function useAccountFields(open, account, psd2Connected, hasTransactions) {
  const { fetchDefaults } = useAccountMutations();
  const [name, setName] = useState('');
  const [iban, setIban] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [ibanTouched, setIbanTouched] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [snapshot, setSnapshot] = useState({ name: '', iban: '', currencyId: '' });

  useEffect(() => {
    if (!open || !account) return;
    setName(account.name ?? '');
    setIban(account.iban ?? '');
    setCurrencyId(account.currencyId ?? '');
    setSnapshot({
      name: account.name ?? '',
      iban: account.iban ?? '',
      currencyId: account.currencyId ?? '',
    });
    setIbanTouched(false);
  }, [open, account]);

  const currencyEditable = !psd2Connected && !hasTransactions;

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

  const isCash = account?.type === ACCOUNT_TYPE.CASH;
  const ibanEditable = !psd2Connected && !isCash;
  const ibanInvalid = ibanEditable && iban.trim() !== '' && !isValidIban(iban);
  const nameDirty = name.trim() !== snapshot.name.trim();
  const ibanDirty = ibanEditable && normalizeIban(iban) !== normalizeIban(snapshot.iban);
  const currencyDirty = currencyEditable && currencyId !== snapshot.currencyId;

  return {
    name, setName, iban, setIban, currencyId, setCurrencyId, ibanTouched, setIbanTouched,
    currencies, currencyEditable, ibanInvalid, nameDirty, ibanDirty, currencyDirty,
  };
}

/** PSD2 connection panel state + actions (connected accounts). */
function usePsd2Connection(open, account, psd2Connected, onSaved, onClose) {
  const ui = useUI();
  const { fetchStatus, sync, disconnect, reconnect } = usePsd2Actions();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ importFromDate: '', importToDate: '', statementGrouping: '' });
  const [initial, setInitial] = useState({ importFromDate: '', importToDate: '', statementGrouping: '' });

  const refresh = useCallback(async () => {
    if (!account || !psd2Connected) return;
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
  }, [account, psd2Connected, fetchStatus]);

  useEffect(() => {
    if (open && psd2Connected) refresh();
  }, [open, psd2Connected, refresh]);

  const handleSync = useCallback(
    () => runSync({ account, sync, refresh, onSaved, ui, setBusy }),
    [account, sync, refresh, onSaved, ui],
  );
  const handleReconnect = useCallback(
    () => runReconnect({ account, reconnect, refresh, onSaved, ui, setBusy }),
    [account, reconnect, refresh, onSaved, ui],
  );
  const handleDisconnect = useCallback(
    () => runDisconnect({ account, disconnect, onSaved, onClose, ui, setBusy }),
    [account, disconnect, onSaved, onClose, ui],
  );

  const connected = status?.connected === true;
  const settingsDirty = psd2Connected && (
    form.importFromDate !== initial.importFromDate
    || form.importToDate !== initial.importToDate
    || form.statementGrouping !== initial.statementGrouping
  );

  return {
    status, loading, busy, form, setForm, refresh, connected, settingsDirty,
    handleSync, handleReconnect, handleDisconnect,
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
    <div className="mt-4 border-b border-[#E8EAEF] pb-4" data-testid="reconciliation-settings-section">
      <p className="text-sm font-medium text-[#1E1E2C] mb-3">
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
// Accounting configuration hook + section (ETP-4530 — Tab Contabilidad)
// ---------------------------------------------------------------------------

/**
 * Loads and saves the account's accounting configuration (Cuenta bancaria / Cuenta transitoria)
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

  useEffect(() => {
    if (!open || !account) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchAccountingConfiguration(account.id)
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
  }, [open, account, fetchAccountingConfiguration]);

  const dirty = assetAcct !== snapshot.assetAcct || transitoryAcct !== snapshot.transitoryAcct;
  // "Cuenta bancaria" is required, but only blocks Save once the user actually touches this tab —
  // editing Name/PSD2/reconciliation on an account that never configured accounting must not be
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
      <p className="mt-4 text-xs text-[#6C6C89]" data-testid="accounting-configuration-loading">
        {ui('financeAccountsAccountingLoading')}
      </p>
    );
  }

  if (!accounting.ledgerConfigured) {
    return (
      <p className="mt-4 text-xs text-[#6C6C89]" data-testid="accounting-configuration-unconfigured">
        {ui('financeAccountsAccountingNoLedger')}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4" data-testid="accounting-configuration-section">
      <p className="text-sm font-medium text-[#1E1E2C]">
        {ui('financeAccountsAccountingSection')}
      </p>
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
            <p className="text-xs text-[#F53D6B]" data-testid="edit-account-asset-acct-error">
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
 * replaced the former separate "Editar cuenta" and "Editar conexión PSD2" modals, since both
 * surfaced the same account data. Same width and footer (Archive / Cancel / Save changes) in
 * every state. The top section (Name | Type, IBAN | Currency) sits OUTSIDE both tabs, followed by
 * two tabs:
 *
 * - **General**: PSD2 connection configuration, then reconciliation configuration. The tab itself
 *   is not rendered for cash accounts (`isCash`), which have no bank connection and no statement
 *   reconciliation — rendering an empty, blank-content tab for Caja accounts was a QA regression
 *   fixed post-ETP-4530; the modal now defaults straight to Contabilidad when opened for a cash
 *   account.
 * - **Contabilidad**: the accounting accounts used when generating transaction journal entries —
 *   Cuenta bancaria (required) and Cuenta transitoria (optional). Backed by the
 *   `accountingConfiguration` entity / `FinancialAccountAccountingHandler` (ETP-4530).
 *
 * Field editability in the top section:
 * - **Name** is always editable. **Type** is always read-only. Cash accounts have no IBAN.
 * - **IBAN** is editable while the account is not PSD2-connected (owned by the bank once linked).
 * - **Currency** is editable only while the account is BOTH not PSD2-connected AND has no
 *   registered transactions yet (`account.hasTransactions`, injected server-side) — a stricter,
 *   independent condition from the IBAN/connection one (ETP-4530).
 * - **Connection block** (General tab, non-cash only): connected shows the live PSD2 panel
 *   (provider, Sync now, import dates, statement grouping, re-auth banner) and a Disconnect
 *   footer button; not connected shows a single "Connect to PSD2" button.
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
  const { saveImportSettings } = usePsd2Actions();
  const { saveAccountingConfiguration } = useFinancialAccountAccounting();

  const isCash = account?.type === ACCOUNT_TYPE.CASH;
  const psd2Connected = account?.psd2Connected === true;
  const hasTransactions = account?.hasTransactions === true;
  const fields = useAccountFields(open, account, psd2Connected, hasTransactions);
  const psd2 = usePsd2Connection(open, account, psd2Connected, onSaved, onClose);
  const recon = useReconciliationSettings(open, account);
  const accounting = useAccountingConfiguration(open, account);
  const [editTab, setEditTab] = useState(EDIT_TAB_GENERAL);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset to the first AVAILABLE tab whenever the modal (re)opens for an account. Cash accounts
  // have no PSD2 connection and no statement reconciliation, so the General tab itself is not
  // rendered for them — defaulting to it would leave the modal on a tab whose trigger doesn't
  // exist, with no visible content and no tab shown as active.
  useEffect(() => {
    if (open) setEditTab(isCash ? EDIT_TAB_ACCOUNTING : EDIT_TAB_GENERAL);
  }, [open, account?.id, isCash]);

  if (!account) return null;

  const typeLabel = formatTypeLabel(account.type, ui);
  const reauthMessage = buildReauthMessage(psd2.status, locale, ui);
  const dirty = fields.nameDirty || fields.ibanDirty || fields.currencyDirty || psd2.settingsDirty
    || (!isCash && recon.dirty) || accounting.dirty;
  const canSave = dirty && !saving && fields.name.trim() !== '' && !fields.ibanInvalid
    && !accounting.assetAcctMissing;
  const busy = saving || psd2.busy;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await persistAccountEdits({
        account,
        fields,
        settings: { dirty: psd2.settingsDirty, form: psd2.form },
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
      <DialogContent className="max-w-[1020px] bg-white" data-testid="edit-account-modal">
        <DialogHeader data-testid="DialogHeader__73027d">
          <DialogTitle data-testid="DialogTitle__73027d">{ui('financeAccountsEditTitle')}</DialogTitle>
        </DialogHeader>

        <AccountFieldsGrid
          ui={ui}
          account={account}
          isCash={isCash}
          psd2Connected={psd2Connected}
          typeLabel={typeLabel}
          fields={fields}
          data-testid="AccountFieldsGrid__73027d" />

        <Tabs value={editTab} onValueChange={setEditTab} className="mt-2" data-testid="EditAccountTabs__73027d">
          <TabsList data-testid="EditAccountTabsList__73027d">
            {/* Cash accounts have no bank connection and no statement reconciliation, so the
                General tab (PSD2 + reconciliation config) has nothing to show for them — hide the
                tab itself rather than rendering it with empty content. */}
            {!isCash ? (
              <TabsTrigger value={EDIT_TAB_GENERAL} icon={Settings2} data-testid="edit-account-tab-general">
                {ui('financeAccountsEditTabGeneral')}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value={EDIT_TAB_ACCOUNTING} icon={Calculator} data-testid="edit-account-tab-accounting">
              {ui('financeAccountsEditTabAccounting')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {!isCash && editTab === EDIT_TAB_GENERAL ? (
          <>
            <Psd2ConnectionSection
              ui={ui}
              psd2Connected={psd2Connected}
              psd2={psd2}
              busy={busy}
              reauthMessage={reauthMessage}
              onConnect={handleConnectClick}
              data-testid="Psd2ConnectionSection__73027d" />

            <ReconciliationSettingsSection
              ui={ui}
              recon={recon}
              data-testid="ReconciliationSettingsSection__73027d" />
          </>
        ) : null}

        {editTab === EDIT_TAB_ACCOUNTING ? (
          <AccountingConfigurationSection
            ui={ui}
            accounting={accounting}
            data-testid="AccountingConfigurationSection__73027d" />
        ) : null}

        {/* Cuenta bancaria is validated on the Contabilidad tab, but Save is disabled regardless
            of which tab is active — surface a summary here so the reason isn't invisible when the
            user is looking at General (the field-level error inside AccountingConfigurationSection
            already covers the Contabilidad tab itself, so this is skipped there to avoid a
            duplicate message, ETP-4530 / BUG-1). */}
        {accounting.assetAcctMissing && editTab !== EDIT_TAB_ACCOUNTING ? (
          <p className="text-xs text-[#F53D6B]" data-testid="edit-account-accounting-error-summary">
            {ui('financeAccountsAccountingBankAssetRequiredSummary')}
          </p>
        ) : null}

        {error ? (
          <p className="text-xs text-[#F53D6B]" data-testid="edit-account-error">{error}</p>
        ) : null}

        <EditFooter
          ui={ui}
          account={account}
          psd2Connected={psd2Connected}
          connected={psd2.connected}
          busy={busy}
          canSave={canSave}
          onArchive={onArchive}
          onDisconnect={() => setConfirmDisconnectOpen(true)}
          onCancel={onClose}
          onSave={handleSave}
          data-testid="EditFooter__73027d" />
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={confirmDisconnectOpen}
      onOpenChange={(o) => { if (!o) setConfirmDisconnectOpen(false); }}
      title={ui('financeAccountsMenuDisconnect')}
      description={ui('financeAccountsPsd2DisconnectConfirm')}
      confirmLabel={ui('financeAccountsPsd2DisconnectAction')}
      cancelLabel={ui('cancel')}
      variant="destructive"
      loading={psd2.busy}
      onConfirm={async () => { setConfirmDisconnectOpen(false); await psd2.handleDisconnect(); }}
      data-testid="DisconnectPsd2ConfirmDialog__73027d" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccountFieldsGrid({ ui, account, isCash, psd2Connected, typeLabel, fields }) {
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-[#E8EAEF] pb-4 sm:grid-cols-2">
      <EditField
        label={ui('financeAccountsPsd2FieldName')}
        data-testid="EditField__73027d">
        <Input
          value={fields.name}
          onChange={(e) => fields.setName(e.target.value)}
          maxLength={60}
          data-testid="edit-account-name"
          className={FIELD_INPUT}
        />
      </EditField>
      <ReadField
        label={ui('financeAccountsPsd2FieldType')}
        value={typeLabel}
        data-testid="ReadField__73027d" />
      {!isCash && psd2Connected ? (
        <ReadField
          label={ui('financeAccountsPsd2FieldIban')}
          value={account.iban}
          onCopy={account.iban ? () => copyIbanToClipboard(account, ui) : undefined}
          copyLabel={ui('financeAccountsCopyIban')}
          data-testid="ReadField__73027d" />
      ) : null}
      {!isCash && !psd2Connected ? (
        <EditField
          label={ui('financeAccountsPsd2FieldIban')}
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
            <p className="text-xs text-[#F53D6B]" data-testid="edit-account-iban-error">
              {ui('financeAccountsNewIbanInvalid')}
            </p>
          ) : null}
        </EditField>
      ) : null}
      {!fields.currencyEditable ? (
        <ReadField
          label={ui('financeAccountsPsd2FieldCurrency')}
          value={account.currencyIso}
          data-testid="ReadField__73027d" />
      ) : (
        <EditField
          label={ui('financeAccountsPsd2FieldCurrency')}
          data-testid="EditField__73027d">
          <Select value={fields.currencyId} onValueChange={fields.setCurrencyId} data-testid="Select__73027d">
            <SelectTrigger data-testid="edit-account-currency" className="bg-white">
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
      )}
    </div>
  );
}

function Psd2ConnectionSection({ ui, psd2Connected, psd2, busy, reauthMessage, onConnect }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold leading-5 text-[#121217]">{ui('financeAccountsEditConnectionSection')}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-[#282833]">{ui('financeAccountsPsd2AutoSyncSubtitle')}</span>
            {psd2Connected ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${
                psd2.connected ? 'bg-[#EEFBF4] text-[#17663A]' : 'bg-[#F5F7F9] text-[#6C6C89]'
              }`}>
                {psd2.connected ? `✓ ${ui('financeAccountsPsd2StatusConnected')}` : ui('financeAccountsPsd2StatusDisconnected')}
              </span>
            ) : null}
          </div>
        </div>
        {!psd2Connected ? (
          <button
            type="button"
            onClick={onConnect}
            data-testid="edit-account-connect-psd2"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#121217] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217]"
          >
            <Plug className="h-4 w-4" data-testid="Plug__73027d" />
            {ui('financeAccountsMenuConnect')}
          </button>
        ) : null}
      </div>
      {psd2Connected && psd2.loading ? (
        <p className="text-xs text-[#6C6C89]">{ui('financeAccountsPsd2Loading')}</p>
      ) : null}
      {psd2Connected && !psd2.loading ? (
        <Psd2Panel
          ui={ui}
          psd2={psd2}
          busy={busy}
          reauthMessage={reauthMessage}
          data-testid="Psd2Panel__73027d" />
      ) : null}
    </div>
  );
}

function Psd2Panel({ ui, psd2, busy, reauthMessage }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#F5F7F9] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[#121217]">
          {psd2.status?.providerName || ui('financeAccountsPsd2StatusConnected')}
        </span>
        <button
          type="button"
          disabled={busy || !psd2.connected}
          onClick={psd2.handleSync}
          data-testid="psd2-edit-sync"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D1D4DB] bg-white px-3 py-1.5 text-sm font-medium text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9] disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4 text-[#828FA3]" data-testid="RefreshCw__73027d" />
          {ui('financeAccountsMenuSyncNow')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DateInput
          label={ui('financeAccountsPsd2ImportFrom')}
          name="psd2-import-from"
          value={psd2.form.importFromDate || ''}
          onChange={(v) => psd2.setForm((f) => ({ ...f, importFromDate: v }))}
          data-testid="DateInput__73027d" />
        <DateInput
          label={ui('financeAccountsPsd2ImportTo')}
          name="psd2-import-to"
          value={psd2.form.importToDate || ''}
          onChange={(v) => psd2.setForm((f) => ({ ...f, importToDate: v }))}
          data-testid="DateInput__73027d" />
        <Field label={ui('financeAccountsPsd2Grouping')} data-testid="Field__73027d">
          {/* White wrapper: the picker's box is bg-transparent (built for white cards),
              so on this gray card it blends in — the white backing makes it stand out. */}
          <div className="rounded-lg bg-white">
            <CreatableSearchSelect
              field={{ name: 'statementGrouping' }}
              value={psd2.form.statementGrouping || ''}
              displayValue={psd2.form.statementGrouping
                ? ui(`financeAccountsPsd2Grouping_${psd2.form.statementGrouping}`) : ''}
              onChange={(id) => psd2.setForm((f) => ({ ...f, statementGrouping: id || '' }))}
              formData={psd2.form}
              resolvedLabel={ui('financeAccountsPsd2Grouping')}
              emptyOptionLabel={ui('financeAccountsPsd2GroupingNone')}
              staticOptions={GROUPING_OPTIONS.map((o) => ({
                id: o, name: ui(`financeAccountsPsd2Grouping_${o}`),
              }))}
              data-testid="psd2-edit-grouping" />
          </div>
        </Field>
      </div>

      {reauthMessage ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[#FFF9EB] px-3 py-3" data-testid="psd2-edit-reauth-banner">
          <span className="flex items-center gap-2 text-sm font-medium text-[#8A6100]">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-[#C28800]"
              data-testid="AlertTriangle__73027d" />
            {reauthMessage}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={psd2.handleReconnect}
            data-testid="psd2-edit-reauth-link"
            className="shrink-0 text-sm font-medium text-[#8A6100] underline disabled:opacity-50"
          >
            {ui('financeAccountsPsd2Reauth')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EditFooter({ ui, account, psd2Connected, connected, busy, canSave, onArchive, onDisconnect, onCancel, onSave }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <FooterButton
          icon={Archive}
          label={ui('financeAccountsPsd2EditArchive')}
          onClick={() => onArchive?.(account)}
          disabled={busy}
          danger
          data-testid="FooterButton__73027d" />
        {psd2Connected ? (
          <FooterButton
            icon={Unlink2}
            label={ui('financeAccountsMenuDisconnect')}
            onClick={onDisconnect}
            disabled={busy || !connected}
            data-testid="FooterButton__73027d" />
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          data-testid="edit-account-cancel"
          className="rounded-full border border-[#D1D4DB] bg-white px-4 py-2 text-sm font-medium text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9]"
        >
          {ui('cancel')}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={onSave}
          data-testid="edit-account-save"
          className="rounded-full bg-[#121217] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217] disabled:bg-[#D1D4DB] disabled:text-white disabled:hover:bg-[#D1D4DB] disabled:hover:text-white"
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
      <span className="text-sm font-medium leading-6 text-[#121217]">{label}</span>
      {children}
    </div>
  );
}

function ReadField({ label, value, onCopy, copyLabel }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium leading-6 text-[#121217]">{label}</span>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-[#D1D4DB] bg-white px-3 shadow-[0_1px_2px_rgba(18,18,23,0.05)]">
        <span className="min-w-0 flex-1 truncate text-sm text-[#121217]">{value || '—'}</span>
        {onCopy ? (
          <button type="button" onClick={onCopy} aria-label={copyLabel} className="text-[#828FA3] hover:text-[#121217]">
            <Copy className="h-4 w-4" data-testid="Copy__73027d" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FooterButton({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm font-medium shadow-[0_1px_2px_rgba(18,18,23,0.05)] disabled:opacity-50 ${
        danger ? 'border-[#FBB1C4] text-[#D50B3E] hover:bg-[#FDEEF2]' : 'border-[#D1D4DB] text-[#121217] hover:bg-[#F5F7F9]'
      }`}
    >
      <Icon
        className={`h-5 w-5 ${danger ? 'text-[#D50B3E]' : 'text-[#828FA3]'}`}
        data-testid="Icon__73027d" />
      {label}
    </button>
  );
}
