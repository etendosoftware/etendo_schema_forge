import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, Info } from 'lucide-react';
import { toast } from 'sonner';
import { AccountSelect, useAccountSelectorPages } from '@/components/contract-ui';
import { useUI, useLabel } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { extractErrorMessage } from '@/hooks/useEntity.js';
import { rememberRecordVersion } from '@etendosoftware/app-shell-core/lib/recordVersions.js';
import { SquareCheckbox } from '@/windows/custom/shared/SquareCheckbox.jsx';
import {
  ACCOUNT_SECTIONS, accountSelectorUrl, countCheckedTypes, isChecked,
} from './bpCategoryContactTypes.js';
import { useAssociatedContactsNotice } from './useAssociatedContactsNotice.js';
import { useBpCategoryWindow } from './bpCategoryWindowContext.js';

const ACCOUNTING_ENTITY = 'accounting';

/**
 * One account of a card: the shared `AccountSelect` fed by the field's NEO selector (posting
 * accounts only) instead of a static catalog. The selected label is the row's `$_identifier`.
 */
function AccountField({ account, row, apiBaseUrl, label, onPick }) {
  const loadPage = useAccountSelectorPages(accountSelectorUrl(apiBaseUrl, ACCOUNTING_ENTITY, account));
  return (
    <AccountSelect
      label={label}
      required={!!account.required}
      value={row[account.key] ?? null}
      displayValue={row[`${account.key}$_identifier`] ?? ''}
      loadPage={loadPage}
      onChange={(id, name) => onPick(account.key, id ?? null, name ?? '')}
      data-testid={`bp-category-acct-${account.key}`}
    />
  );
}

/** A one-line muted message inside a checked card, where its account selects would be. */
function CardMessage({ children, testId }) {
  return (
    <p className="text-sm leading-5 text-[hsl(var(--muted-foreground))]" data-testid={testId}>
      {children}
    </p>
  );
}

/**
 * The informative alert shown above the cards while no type is checked (Figma "Configuración
 * contable"). Literal Figma info colours with a dark-mode remap, the same pair the order
 * global-discount tag uses (`useOrderGlobalDiscountImport.jsx`): no token resolves to #EBEFFF.
 */
function AccountingSetupAlert({ ui }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg bg-[#EBEFFF] px-2 py-3 dark:bg-primary/25"
      data-testid="bp-category-accounts-no-type">
      <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" data-testid="Info__bpCategoryAccountsNoType" />
      <p className="flex min-w-0 flex-wrap gap-x-2 text-sm leading-5 text-[#2B48BC] dark:text-sidebar-accent-foreground">
        <span className="font-medium">{ui('bpCategoryAccountingSetupTitle')}</span>
        <span>{ui('bpCategoryNoTypeAccounts')}</span>
      </p>
    </div>
  );
}

/**
 * Contact category — Accounting tab (ETP-5791, `contact-category-type` flag on), passed by the
 * window wrapper as DetailView's `CustomLines`. Figma "Form View Categoría de contacto".
 *
 * Left column: the "Tipo de contacto *" caption and its "(Lo heredan solo los contactos nuevos)"
 * hint. Right column: one muted card per contact type — Cliente (receivables, prepayment,
 * write-off) and Proveedor/Acreedor (liability, prepayment) — headed by the type checkbox. A
 * checked card lists its accounts (`AccountSelect`, 3 per row); an unchecked one collapses to its
 * header, and its account values are kept. With no type checked an info alert sits above the
 * cards. The tab badge (`onCountChange`) is the number of checked types.
 *
 * The type checkboxes ARE the header fields `etgoIscustomer` / `etgoIsvendor`: they read
 * DetailView's editing record (`data`) and write through the header form's own callbacks
 * (`formBridge` of the window context, filled by the form wrapper), so a toggle autosaves like a
 * form checkbox, an N/N category is refused by the backend (`ETGO_BPGroupContactTypeRequired`)
 * and the toggle rolls back, and the "saved with associated contacts" notice fires on the save.
 *
 * New (unsaved) category: the type cards work — the types are header fields and are saved with
 * the category — but the accounts belong to the `C_BP_Group_Acct` row the backend creates with
 * the category, so a checked card shows "Guarda la categoría…" instead of its selects.
 *
 * Each account selection is PATCHed on its own, so the mandatory accounts of an unchecked type
 * never take part in a save: they keep the values the accounting schema pre-filled when the
 * category was created (c_bp_group_trg).
 */
export default function BpCategoryAccountingPanel({ recordId, data, apiBaseUrl, isNew, editing, onCountChange }) {
  const ui = useUI();
  const t = useLabel();
  const apiFetch = useApiFetch(apiBaseUrl);
  const notifyContacts = useAssociatedContactsNotice();
  const windowState = useBpCategoryWindow();
  const [row, setRow] = useState(null);
  const [status, setStatus] = useState('idle');
  // `editing` is `false` when the window is read-only for this role (panelEditing).
  const readOnly = editing === false;

  // The tab badge: number of checked types. The callback is a new arrow on every DetailView
  // render, so it is read through a ref and the effect runs only when the count changes.
  const checkedCount = countCheckedTypes(data);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  useEffect(() => { onCountChangeRef.current?.(checkedCount); }, [checkedCount]);

  const load = useCallback(async (isStale = () => false) => {
    if (!recordId || isNew) return;
    setStatus('loading');
    try {
      const res = await apiFetch(`/${ACCOUNTING_ENTITY}?parentId=${encodeURIComponent(recordId)}&_startRow=0&_endRow=1`);
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      const first = (body?.response?.data ?? body?.data ?? [])[0] ?? null;
      if (isStale()) return;
      if (first) rememberRecordVersion(first, ACCOUNTING_ENTITY);
      setRow(first);
      setStatus('ready');
    } catch {
      if (!isStale()) setStatus('error');
    }
  }, [apiFetch, recordId, isNew]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  const handlePick = useCallback(async (key, value, label) => {
    if (!row) return;
    const previous = row;
    setRow((prev) => ({ ...prev, [key]: value, [`${key}$_identifier`]: value ? label : '' }));
    try {
      const res = await apiFetch(`/${ACCOUNTING_ENTITY}/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        toast.error(await extractErrorMessage(res, ui));
        setRow(previous);
        return;
      }
      const body = await res.json().catch(() => null);
      const saved = body?.response?.data?.[0] ?? null;
      if (saved) {
        rememberRecordVersion(saved, ACCOUNTING_ENTITY);
        setRow((prev) => ({ ...prev, ...saved }));
      }
      notifyContacts(recordId);
    } catch (err) {
      toast.error(err?.message || ui('error'));
      setRow(previous);
    }
  }, [apiFetch, row, ui, notifyContacts, recordId]);

  // A type toggle is a header edit: the form's own onChange, then its blur hook (deferred like
  // EntityForm's checkbox, so the autosave sees the committed flip — ETP-4670).
  const toggleType = useCallback((section) => {
    const form = windowState?.formBridge?.current;
    if (readOnly || !form?.onChange) return;
    form.onChange(section.typeField, !isChecked(data?.[section.typeField]), section.typeColumn);
    setTimeout(() => form.onFieldBlur?.(section.typeField), 0);
  }, [windowState, readOnly, data]);

  const renderCardBody = (section) => {
    if (isNew || !recordId) return <CardMessage testId="bp-category-accounts-save-first">{ui('bpCategoryAccountsSaveFirst')}</CardMessage>;
    if (status === 'error') return <CardMessage testId="bp-category-accounts-load-error">{ui('bpCategoryAccountsLoadError')}</CardMessage>;
    if (status === 'ready' && !row) return <CardMessage testId="bp-category-accounts-no-row">{ui('bpCategoryNoAccountingRow')}</CardMessage>;
    if (status !== 'ready') return null;
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {section.accounts.map((account) => (
          <AccountField
            key={account.key}
            account={account}
            row={row}
            apiBaseUrl={apiBaseUrl}
            label={account.labelKey ? ui(account.labelKey) : (t(account.column) ?? account.key)}
            onPick={handlePick}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 px-5 pb-3 pt-2 md:flex-row" data-testid="bp-category-accounting-panel">
      <div className="shrink-0 md:w-[148px]" data-testid="bp-category-contact-type">
        <p className="text-sm font-medium leading-5 text-[hsl(var(--foreground))]">
          {ui('bpCategoryContactType')}
          <span className="ml-0.5 text-[hsl(var(--destructive))]">*</span>
        </p>
        <p className="mt-1 text-xs leading-4 text-[hsl(var(--muted-foreground))]">{ui('bpCategoryContactTypeHint')}</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {checkedCount === 0 && <AccountingSetupAlert ui={ui} />}
        {ACCOUNT_SECTIONS.map((section) => {
          const checked = isChecked(data?.[section.typeField]);
          return (
            <section
              key={section.key}
              className="flex flex-col gap-3 rounded-lg bg-[hsl(var(--muted))] p-3"
              data-checked={checked ? 'true' : 'false'}
              data-testid={`bp-category-accounts-${section.key}`}>
              <div className="flex min-h-6 items-center">
                <SquareCheckbox
                  label={t(section.typeColumn)}
                  checked={checked}
                  disabled={readOnly}
                  onChange={() => toggleType(section)}
                  data-testid={`field-${section.typeField}`} />
              </div>
              {checked && renderCardBody(section)}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// Icon of this tab in DetailView's tab strip (`CustomLines.tabIcon`, see tabIcons.js).
BpCategoryAccountingPanel.tabIcon = Calculator;
