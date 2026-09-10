import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useUI } from '@/i18n';
import BillingPreferencesForm from './BillingPreferencesForm';
import FiscalDefaultsSection from './FiscalDefaultsSection';
import ContactsSummaryWidget from './ContactsSummaryWidget';


import { useApiFetch } from '@/auth/useApiFetch.js';
import { useRecordWriteQueue } from '@/hooks/useRecordWriteQueue.js';
/**
 * Credit-limit field: a number input plus -/+ steppers, with ONE commit path (ETP-5263).
 *
 * The bug this shape exists to prevent: the input used to call `onBlur` directly while `step()`
 * armed its own 400 ms debounced `onBlur`, so a "+" click followed by clicking away inside the
 * debounce window fired the save TWICE. Both requests then carried the same optimistic-locking
 * `updated` token (the second one was built before the first one's response had refreshed the
 * version cache), and the server correctly refused the second with 409 `stale_record` — against a
 * change the user themself had made 400 ms earlier. It only reproduced when the first PATCH was
 * slower than the debounce, which is why it looked intermittent.
 *
 * So every trigger now goes through {@link commit}, and `commit` cancels whatever debounce is
 * pending before firing. The debounce is kept ONLY to coalesce rapid +/- clicks into one write;
 * it is no longer load-bearing for correctness. The guarantee that two writes can never overlap
 * lives in `persistCreditTaxField`'s in-flight check, not in a timeout — a time-based guess is
 * what caused this in the first place.
 *
 * `saving` deliberately does NOT lock the field: freezing the input mid-save would drop a
 * keystroke the user has already typed. A save triggered while another is in flight is queued by
 * the parent instead (see `persistCreditTaxField`).
 */
function CreditLimitStepper({ value, readOnly, onChange, onBlur, saving }) {
  const ui = useUI();
  const num = value === '' || value == null ? 0 : Number(value);
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /**
   * The single persistence path. Cancels a pending debounce first, so an armed +/- timer can
   * never fire a second save behind a blur that already saved.
   */
  function commit() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onBlur();
  }

  function step(delta) {
    if (readOnly) return;
    const next = Math.max(0, num + delta);
    onChange(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onBlur();
    }, 400);
  }

  return (
    <div className="flex flex-col gap-2 w-[236px]" aria-busy={!!saving}>
      <div className="flex items-center gap-1 h-6">
        <span className="text-sm font-medium text-text-primary">{ui('creditLimitField')}</span>
        <span className="text-sm text-destructive">*</span>
      </div>
      <div className="flex flex-row items-center h-10 border border-border-control rounded-lg shadow-[0px_1px_2px_rgba(18,18,23,0.05)] overflow-hidden bg-card hover:bg-muted focus-within:ring-1 focus-within:ring-focus-ring transition-colors">
        <input
          type="number"
          value={num}
          readOnly={readOnly}
          onChange={e => !readOnly && onChange(e.target.value)}
          onBlur={commit}
          className="flex-1 px-3 text-sm text-text-primary bg-transparent outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={readOnly}
          className="w-10 h-[38px] flex items-center justify-center border-l border-border-structural text-icon-secondary hover:bg-muted disabled:bg-muted disabled:text-text-disabled shrink-0"
        >
          <Minus size={16} data-testid="Minus__d55d36" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={readOnly}
          className="w-10 h-[38px] flex items-center justify-center border-l border-border-structural text-icon-secondary hover:bg-muted disabled:bg-muted disabled:text-text-disabled shrink-0"
        >
          <Plus size={16} data-testid="Plus__d55d36" />
        </button>
      </div>
    </div>
  );
}

export default function ContactsFinancialPanel({ data, token, apiBaseUrl, catalogs, api, editing, onChange }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [creditTaxDraft, setCreditTaxDraft] = useState({});
  const [savingField, setSavingField] = useState(null);
  const draftRef = useRef({});
  /**
   * The value the SERVER last confirmed for each field — what the early-return in
   * `persistCreditTaxField` compares against (ETP-5263).
   *
   * It cannot compare against the `data` prop: that prop only changes once the parent re-renders
   * after our `onChange`, so for the whole window between "PATCH accepted" and "parent
   * re-rendered" the prop still holds the OLD value and a second trigger for the same field saw a
   * difference that was already persisted — and issued a duplicate write.
   */
  const persistedRef = useRef({});

  useEffect(() => {
    const fromServer = {
      creditLimit: data?.creditLimit ?? '',
      creditUsed: data?.creditUsed ?? '',
      active: data?.active ?? true,
    };
    // A field the user has edited since the last confirmed save must survive this sync. The prop
    // can arrive mid-flight (our own `onChange` re-renders the parent), and overwriting the draft
    // with it is exactly how a keystroke typed during a save would be silently discarded — worse
    // than the 409 this ticket removes, because nothing tells the user.
    const nextDraft = { ...fromServer };
    Object.keys(fromServer).forEach((key) => {
      const draft = draftRef.current[key];
      const persisted = persistedRef.current[key];
      if (String(draft ?? '') !== String(persisted ?? '')) nextDraft[key] = draft;
    });
    persistedRef.current = fromServer;
    draftRef.current = nextDraft;
    setCreditTaxDraft(nextDraft);
  }, [data?.creditLimit, data?.creditUsed, data?.active]);

  const creditTaxReadOnly = useMemo(() => (
    editing ? {} : { creditLimit: true, creditUsed: true, active: true }
  ), [editing]);

  /**
   * Sends one credit/tax field. Single-flight and the mid-flight queue are the write queue's job
   * (ETP-5255); what stays here is normalising the value, rolling back a refusal, and adopting
   * what the server actually stored.
   */
  const writeCreditTaxField = useCallback(async ({ recordId, fieldKey, value }) => {
    const originalValue = persistedRef.current[fieldKey] ?? '';
    // Re-checked HERE and not only where the write is requested, because a coalesced replay runs
    // later: a blur that arrived mid-flight is queued with the value it saw, and by the time the
    // open PATCH has settled that value may be exactly what the server now holds — the success
    // path below adopts it into the draft. Comparing only at request time turned that into a
    // second, redundant PATCH.
    if (String(value ?? '') === String(originalValue ?? '')) return true;
    setSavingField(fieldKey);
    try {
      const normalizedValue = fieldKey === 'creditLimit'
        ? (value === '' || value == null ? null : Number(value))
        : (value === '' ? null : value);
      const payload = { [fieldKey]: normalizedValue };
      const res = await apiFetch(`/businessPartner/${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Back to the last value the server confirmed, so what the user sees is what is stored.
        // Returning `false` drops any queued follow-up with it: the field has been reset to a
        // known state, and chaining another write onto a refused one would only replay the same
        // rejected token.
        setCreditTaxDraft(prev => ({ ...prev, [fieldKey]: originalValue }));
        draftRef.current = { ...draftRef.current, [fieldKey]: originalValue };
        return false;
      }

      const responseData = await res.json().catch(() => null);
      const saved = responseData?.response?.data?.[0] ?? responseData;
      const finalValue = saved?.[fieldKey] ?? payload[fieldKey];
      persistedRef.current = { ...persistedRef.current, [fieldKey]: finalValue ?? '' };
      // Only adopt the server's value when the draft has not moved on meanwhile; otherwise the
      // user's pending input would be overwritten by the value it supersedes. The queue replays
      // that newer draft right after this returns.
      if (String(draftRef.current[fieldKey] ?? '') === String(value ?? '')) {
        const nextDraft = { ...draftRef.current, [fieldKey]: finalValue ?? '' };
        draftRef.current = nextDraft;
        setCreditTaxDraft(nextDraft);
      }
      if (saved && typeof onChange === 'function') {
        onChange(fieldKey, finalValue);
      }
      return true;
    } finally {
      setSavingField(null);
    }
  }, [apiFetch, onChange]);

  /**
   * Serialises per BUSINESS PARTNER, not per field (ETP-5255).
   *
   * The in-flight map used to be keyed by field name, which is the wrong unit: `updated` is a
   * per-record token, and every field here PATCHes the same `/businessPartner/{id}`. That was
   * correct only by accident — exactly one field persists today, so the map never held two keys.
   * The second field to be wired up would have reintroduced the duplicate write with nothing to
   * catch it. Keying on the record makes it structural instead of incidental.
   */
  const { persist } = useRecordWriteQueue({ write: writeCreditTaxField });

  function persistCreditTaxField(fieldKey) {
    if (!data?.id || !apiBaseUrl || !token) return;
    if (creditTaxReadOnly[fieldKey]) return;

    const currentValue = draftRef.current[fieldKey] ?? '';
    const originalValue = persistedRef.current[fieldKey] ?? '';
    if (String(currentValue ?? '') === String(originalValue ?? '')) return;

    persist(data.id, fieldKey, currentValue);
  }

  function handleCreditTaxChange(fieldKey, value) {
    const next = { ...draftRef.current, [fieldKey]: value };
    draftRef.current = next;
    setCreditTaxDraft(next);
  }

  return (
    <div className="space-y-2 pb-6">
      <ContactsSummaryWidget
        data={data}
        optionalProvider={true}
        data-testid="ContactsSummaryWidget__d55d36" />
      {/* Crédito — layout fila: texto izquierda + stepper derecha */}
      <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-text-primary">{ui('creditTax')}</div>
          <div className="text-xs text-text-secondary">{ui('creditTaxDescription')}</div>
        </div>
        <div className="flex-1">
          <CreditLimitStepper
            value={creditTaxDraft.creditLimit}
            readOnly={!!creditTaxReadOnly.creditLimit}
            onChange={(val) => handleCreditTaxChange('creditLimit', val)}
            onBlur={() => persistCreditTaxField('creditLimit')}
            saving={savingField === 'creditLimit'}
            data-testid="CreditLimitStepper__d55d36" />
        </div>
      </div>
      <hr className="border-t border-border mx-5" />
      {/* Preferencias de facturación — layout fila: texto izquierda + contenido derecha */}
      <div className="flex flex-row items-start px-5 pt-2 pb-3 gap-5">
        <div className="flex flex-col gap-1 w-[148px] shrink-0">
          <div className="text-sm font-semibold text-text-primary">{ui('billingPreferences')}</div>
          <div className="text-xs text-text-secondary">{ui('billingPreferencesDesc')}</div>
        </div>
        <div className="flex-1">
          <BillingPreferencesForm
            data={data}
            entity="businessPartner"
            api={api}
            token={token}
            catalogs={catalogs}
            onChange={onChange}
            editing={editing}
            apiBaseUrl={apiBaseUrl}
            data-testid="BillingPreferencesForm__d55d36" />
        </div>
      </div>
      <hr className="border-t border-border mx-5" />
      {/* Fiscal defaults (SII / TicketBAI) — grouped block, ETP-4784 part 2 UX fix */}
      <FiscalDefaultsSection
        data={data}
        onChange={onChange}
        data-testid="FiscalDefaultsSection__d55d36" />
    </div>
  );
}
