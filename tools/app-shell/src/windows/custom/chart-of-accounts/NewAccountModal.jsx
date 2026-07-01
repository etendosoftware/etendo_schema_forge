import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import AccountCodeField from '@generated/chart-of-accounts/custom/AccountCodeField';

/**
 * NewAccountModal — quick create dialog for a new sub-account.
 *
 * Props:
 *   isOpen        — boolean, controls Dialog open state
 *   onClose       — () => void
 *   onSaved       — () => void — called after a successful POST (use to refresh the list)
 *   currentRecord — the row that was selected when the modal was opened
 *                   (used to derive the default parent account)
 *   allAccounts   — full flat list already loaded in the tree
 *                   (used to build the parent selector — no extra fetch)
 *   apiBaseUrl    — NEO base URL, e.g. "/sws/neo/chart-of-accounts"
 *   token         — JWT for Authorization header
 *
 * Parent auto-selection:
 *   - If `currentRecord.summaryLevel === 'Y'` and its code is 4 digits → use it as parent.
 *   - Otherwise, look at `currentRecord.searchKey.substring(0, 4)` and find the matching
 *     4-digit summary account in the available parent options.
 *   - Falls back to empty selection if nothing matches.
 *
 * POST body: { searchKey: <8-digit code>, name, accountType: "E" }
 */

const INPUT_CLS =
  'w-full h-10 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#121217] focus:border-transparent';

const SELECT_CLS =
  'w-full h-10 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#121217] focus:border-transparent cursor-pointer';

const FIELD_LABEL_CLS = 'block text-sm font-medium text-[#121217] mb-1.5';
const ERROR_CLS = 'mt-1 text-xs text-red-500';

/**
 * Derive the nearest 4-digit summary-account parent from the selected record.
 * Returns the parent account id string, or '' if none found.
 */
function deriveDefaultParentId(currentRecord, parentOptions) {
  if (!currentRecord) return '';
  const code = currentRecord.searchKey ?? '';

  // The current record IS a 4-digit summary — use it directly
  if (currentRecord.summaryLevel === 'Y' && code.length === 4) {
    return currentRecord.id;
  }

  // Look for a 4-digit summary account whose code matches the first 4 chars
  const prefix4 = code.substring(0, 4);
  if (!prefix4) return '';
  const match = parentOptions.find(
    (a) => a.summaryLevel === 'Y' && a.searchKey === prefix4,
  );
  return match ? match.id : '';
}

const EMPTY_FORM = { parentAccountId: '', name: '', searchKey: '' };

export default function NewAccountModal({
  isOpen,
  onClose,
  onSaved,
  currentRecord,
  allAccounts = [],
  apiBaseUrl,
  token,
}) {
  const ui = useUI();
  const [loadedAccounts, setLoadedAccounts] = useState([]);
  const accountRows = allAccounts.length > 0 ? allAccounts : loadedAccounts;

  useEffect(() => {
    if (!isOpen || allAccounts.length > 0 || loadedAccounts.length > 0 || !apiBaseUrl) return;
    fetch(`${apiBaseUrl}/elementValue?_startRow=0&_endRow=9999`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setLoadedAccounts(data?.response?.data ?? []))
      .catch(() => setLoadedAccounts([]));
  }, [isOpen, allAccounts.length, loadedAccounts.length, apiBaseUrl, token]);

  const virtualParentOptions = useMemo(() => {
    const byCode = new Map();
    for (const account of accountRows) {
      const code = String(account.parentCode4 ?? '');
      if (code.length !== 4 || byCode.has(code)) continue;
      byCode.set(code, {
        id: `group-${code}`,
        searchKey: code,
        name: account.parentCode4Name ?? code,
        summaryLevel: 'Y',
        isVirtual: true,
      });
    }
    return [...byCode.values()].sort((a, b) => String(a.searchKey).localeCompare(String(b.searchKey)));
  }, [accountRows]);

  const summaryParentOptions = useMemo(
    () =>
      accountRows
        .filter((a) => a.summaryLevel === 'Y' && String(a.searchKey ?? '').length === 4)
        .sort((a, b) => String(a.searchKey).localeCompare(String(b.searchKey))),
    [accountRows],
  );

  // Derive 4-digit summary accounts for the parent selector. The API list contains
  // posting accounts only, so virtual group rows provide the visible parent options.
  const parentOptions = useMemo(() => [...summaryParentOptions, ...virtualParentOptions], [summaryParentOptions, virtualParentOptions]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const selectedParentCodePrefix = useMemo(() => {
    const parent = parentOptions.find((p) => p.id === form.parentAccountId);
    return parent ? String(parent.searchKey) : '';
  }, [form.parentAccountId, parentOptions]);

  // Re-initialise when modal opens or currentRecord changes
  useEffect(() => {
    if (!isOpen) return;
    const defaultParentId = deriveDefaultParentId(currentRecord, parentOptions);
    const defaultParent = parentOptions.find((p) => p.id === defaultParentId);
    const prefix = defaultParent ? String(defaultParent.searchKey) : '';
    setForm({ parentAccountId: defaultParentId, name: '', searchKey: prefix });
    setErrors({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentRecord, parentOptions]);

  // When parent changes, update the code prefix in the searchKey field
  const handleParentChange = useCallback(
    (e) => {
      const newId = e.target.value;
      const parent = parentOptions.find((p) => p.id === newId);
      const prefix = parent ? String(parent.searchKey) : '';
      setForm((prev) => ({ ...prev, parentAccountId: newId, searchKey: prefix }));
      setErrors((prev) => ({ ...prev, parentAccountId: undefined }));
    },
    [parentOptions],
  );

  const handleNameChange = useCallback((e) => {
    setForm((prev) => ({ ...prev, name: e.target.value }));
    setErrors((prev) => ({ ...prev, name: undefined }));
  }, []);

  const handleCodeChange = useCallback((fullCode) => {
    setForm((prev) => ({ ...prev, searchKey: fullCode }));
    setErrors((prev) => ({ ...prev, searchKey: undefined }));
  }, []);

  // Derive the record passed to AccountCodeField
  const accountCodeRecord = useMemo(() => {
    return {
      summaryLevel: 'N', // always leaf for a new account
      codePrefix: selectedParentCodePrefix,
    };
  }, [selectedParentCodePrefix]);

  const validate = useCallback(() => {
    const next = {};
    if (!form.parentAccountId) next.parentAccountId = ui('required');
    if (!form.name.trim()) next.name = ui('required');
    if (String(form.searchKey).length !== 8) next.searchKey = ui('codeExact8Digits');
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form, ui]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/elementValue`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchKey: form.searchKey,
          name: form.name.trim(),
          accountType: 'E',
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Error ${res.status}`);
      }

      toast.success(ui('newSubAccountSuccess'));
      onSaved?.();
    } catch (err) {
      toast.error(ui('newSubAccountError'));
      // eslint-disable-next-line no-console
      console.error('[NewAccountModal] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [form, validate, apiBaseUrl, token, onSaved, ui]);

  const handleOpenChange = useCallback(
    (open) => {
      if (!open) onClose?.();
    },
    [onClose],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      data-testid="Dialog__2c756f">
      <DialogContent
        className="max-w-md"
        data-testid="new-account-modal"
      >
        <DialogHeader data-testid="DialogHeader__2c756f">
          <DialogTitle
            className="text-lg font-semibold text-[#121217]"
            data-testid="DialogTitle__2c756f">
            {ui('newSubAccount')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* ── Parent Account ── */}
          <div>
            <label htmlFor="nam-parent" className={FIELD_LABEL_CLS}>
              {ui('parentAccount')}
              <span className="ml-1 text-red-500 select-none">*</span>
            </label>
            <select
              id="nam-parent"
              data-testid="new-account-modal-parent"
              className={SELECT_CLS}
              value={form.parentAccountId}
              onChange={handleParentChange}
            >
              <option value="">{ui('selectParentAccount')}</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.searchKey} — {p.name}
                </option>
              ))}
            </select>
            {errors.parentAccountId && (
              <p className={ERROR_CLS} role="alert">
                {errors.parentAccountId}
              </p>
            )}
          </div>

          {/* ── Name ── */}
          <div>
            <label htmlFor="nam-name" className={FIELD_LABEL_CLS}>
              {ui('name')}
              <span className="ml-1 text-red-500 select-none">*</span>
            </label>
            <input
              id="nam-name"
              data-testid="new-account-modal-name"
              type="text"
              className={INPUT_CLS}
              value={form.name}
              onChange={handleNameChange}
              placeholder={ui('name')}
              autoComplete="off"
            />
            {errors.name && (
              <p className={ERROR_CLS} role="alert">
                {errors.name}
              </p>
            )}
          </div>

          {/* ── Account Code ── */}
          <div>
            <label className={FIELD_LABEL_CLS}>
              {ui('accountCode')}
              <span className="ml-1 text-red-500 select-none">*</span>
            </label>
            <div data-testid="new-account-modal-code">
              <AccountCodeField
                value={form.searchKey}
                onChange={handleCodeChange}
                record={accountCodeRecord}
                readOnly={false}
                data-testid="AccountCodeField__2c756f"
              />
            </div>
            {errors.searchKey && (
              <p className={ERROR_CLS} role="alert">
                {errors.searchKey}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2" data-testid="DialogFooter__2c756f">
          <button
            type="button"
            data-testid="new-account-modal-cancel"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[#121217] bg-white border border-[#D1D4DB] rounded-full shadow-sm hover:bg-[#F9FAFB] disabled:opacity-50 transition-colors"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            data-testid="new-account-modal-save"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-[#121217] rounded-full hover:bg-[#28282F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? ui('loading') : ui('save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
