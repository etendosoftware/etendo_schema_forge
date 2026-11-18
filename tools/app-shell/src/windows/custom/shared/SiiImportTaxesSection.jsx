import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import RequiredMark from '@/components/ui/required-mark.jsx';
import { AddLineButton } from '@/components/ui/add-line-button.jsx';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';
import { SelectorInput } from '@/components/contract-ui/SelectorInput.jsx';
import { DeleteConfirmDialog } from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { buildLineSelectorContext } from '@/lib/selectorContext.js';
import { translateBackendErrorResponse } from '@/lib/backendErrors.js';
import { normalizeDateInputValue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';
import { useFeatureFlag, SII_IMPORT_DUA } from '@/lib/flags';

/**
 * ETP-6284 (step 2) — "Impuestos de importación" block of the purchase-invoice SII panel, right
 * after "Importación (DUA)" and behind the same `sii-import-dua` flag.
 *
 * Classic parity (module SII, purchase invoice "Tax" tab): an import is declared by adding manual
 * tax lines (`C_InvoiceTax` with `Recalculate = 'N'`) next to the ones the invoice lines generate.
 * The core trigger `C_INVOICETAX_TRG2` adds a manual line's tax amount to the invoice grand total,
 * and `C_Invoice_Post` keeps those lines on completion (and copies them, negated, on a reversal).
 * With "Multiple DUA" checked on the header, each line carries its own DUA and DUA date
 * (`C_InvoiceTax.EM_Aeatsii_Dua` / `EM_Aeatsii_Fecha_Dua`).
 *
 * Only the manual lines are listed here: the automatic ones (`recalculate = true`) belong to the
 * invoice lines and are not editable in Classic either. The tax amount is computed by the Classic
 * callout `SL_InvoiceTax_Amt` (base x rate, currency precision) through the NEO callout endpoint,
 * and stays editable, as in Classic.
 *
 * DUA / DUA date are REQUIRED here while Multiple DUA is checked. Classic declares that rule in
 * `InvoiceTaxEventHandler` but its `showMsg` never throws, so the backend does not enforce it —
 * this block is the only place it holds.
 *
 * Tax picker: the purchase-line tax selector (`/lines/selectors/tax`, `C_Tax_IsSOTrx_Date` rule:
 * purchase or both, valid at the invoice date) — the normal purchase taxes. The tax entity's own
 * selector has no validation rule and would offer every tax of the client, sales ones included.
 *
 * Writes persist immediately (own CRUD on `/tax`), independent of the header save; after each one
 * the header totals are re-read (`onHeaderRefresh`) so the grand total reflects the new tax.
 */
const DUA_TYPE_KEYS = new Set(['F5', 'LC']);
// The block is mounted on purchase invoices only (SifTab's `isPurchaseInvoice` gate).
const WINDOW_CATEGORY = 'purchases';

const EMPTY_DRAFT = {
  id: null,
  tax: '',
  taxLabel: '',
  taxableAmount: null,
  taxAmount: null,
  aeatsiiDua: '',
  aeatsiiFechaDua: '',
};

const TAX_FIELD = { id: 'sif-importTax-tax', key: 'tax', column: 'tax', required: true };

function isTrue(value) {
  return value === true || value === 'Y';
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Manual (import) tax lines only — the automatic ones belong to the invoice lines. */
export function selectImportTaxRows(rows) {
  return (rows ?? []).filter(r => r && !isTrue(r.recalculate));
}

/** Next `Line` number over EVERY tax line of the invoice, like Classic's `MAX(LINE)+10` default. */
export function nextTaxLineNo(rows) {
  const max = (rows ?? []).reduce((acc, r) => Math.max(acc, Number(r?.lineNo) || 0), 0);
  return max + 10;
}

/**
 * Returns the i18n key of the first validation failure of a draft, or null when it can be saved.
 * With Multiple DUA, DUA and DUA date are required on every line.
 */
export function validateImportTaxDraft(draft, multiDua) {
  if (!draft?.tax || draft.taxableAmount == null || draft.taxAmount == null) {
    return 'sifDataTabs.importTaxes.missingFields';
  }
  if (multiDua && (!String(draft.aeatsiiDua ?? '').trim() || !draft.aeatsiiFechaDua)) {
    return 'sifDataTabs.importTaxes.duaRequired';
  }
  return null;
}

/** Request body of a save. DUA fields travel only while Multiple DUA is checked. */
export function buildImportTaxBody(draft, multiDua) {
  const body = {
    tax: draft.tax,
    taxableAmount: draft.taxableAmount,
    taxAmount: draft.taxAmount,
  };
  if (multiDua) {
    body.aeatsiiDua = String(draft.aeatsiiDua ?? '').trim();
    body.aeatsiiFechaDua = draft.aeatsiiFechaDua;
  }
  return body;
}

function rowToDraft(row) {
  return {
    id: row.id,
    tax: row.tax ?? '',
    taxLabel: row['tax$_identifier'] ?? '',
    taxableAmount: toNumberOrNull(row.taxableAmount),
    taxAmount: toNumberOrNull(row.taxAmount),
    aeatsiiDua: row.aeatsiiDua ?? '',
    aeatsiiFechaDua: normalizeDateInputValue(row.aeatsiiFechaDua ?? ''),
  };
}

/** Reads one amount out of a NEO callout `updates` map (entries are `{ value }` or raw). */
function calloutAmount(updates, key) {
  if (!updates || !(key in updates)) return undefined;
  const entry = updates[key];
  return toNumberOrNull(entry && typeof entry === 'object' ? entry.value : entry);
}

function TaxField({ label, htmlFor, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-sm text-foreground font-medium"
        data-testid={`Label__siiImportTax_${htmlFor}`}>
        {label}
        {required && <RequiredMark aria-hidden="true" data-testid={`RequiredMark__siiImportTax_${htmlFor}`} />}
      </Label>
      {children}
    </div>
  );
}

function ImportTaxForm({
  ui, draft, setDraft, multiDua, currency, saving, error, onSave, onCancel, onAmountChange,
  selectorUrl, selectorContext, token,
}) {
  return (
    <div
      className="col-span-2 grid grid-cols-2 gap-x-5 gap-y-4 rounded-md border border-border/60 p-3"
      data-testid="SiiImportTaxesSection__form">
      <div className="col-span-2" data-testid="SiiImportTaxesSection__taxCell">
        <TaxField label={ui('tax')} htmlFor="sif-importTax-tax" required data-testid="TaxField__tax">
          <SelectorInput
            entityName="tax"
            field={TAX_FIELD}
            value={draft.tax}
            displayValue={draft.taxLabel}
            onChange={(val, lbl) => onAmountChange('tax', { tax: val ?? '', taxLabel: lbl ?? '' })}
            catalogs={null}
            resolvedLabel={ui('tax')}
            selectorUrl={selectorUrl}
            selectorContext={selectorContext}
            token={token}
            data-testid="SelectorInput__siiImportTax" />
        </TaxField>
      </div>
      <TaxField
        label={ui('sifDataTabs.importTaxes.taxableAmount')}
        htmlFor="sif-importTax-base"
        required
        data-testid="TaxField__base">
        <MaskedAmountInput
          id="sif-importTax-base"
          bare
          currency={currency}
          value={draft.taxableAmount}
          onCommit={parsed => onAmountChange('taxableAmount', { taxableAmount: parsed })}
          disabled={saving}
          data-testid="MaskedAmountInput__siiImportTaxBase" />
      </TaxField>
      <TaxField
        label={ui('sifDataTabs.importTaxes.taxAmount')}
        htmlFor="sif-importTax-amount"
        required
        data-testid="TaxField__amount">
        <MaskedAmountInput
          id="sif-importTax-amount"
          bare
          currency={currency}
          value={draft.taxAmount}
          onCommit={parsed => onAmountChange('taxAmount', { taxAmount: parsed })}
          disabled={saving}
          data-testid="MaskedAmountInput__siiImportTaxAmount" />
      </TaxField>
      {multiDua && (
        <>
          <TaxField label={ui('sifDataTabs.field.dua')} htmlFor="sif-importTax-dua" required data-testid="TaxField__dua">
            <Input
              id="sif-importTax-dua"
              type="text"
              maxLength={255}
              value={draft.aeatsiiDua}
              onChange={e => setDraft(d => ({ ...d, aeatsiiDua: e.target.value }))}
              disabled={saving}
              aria-required
              className="bg-card"
              data-testid="Input__siiImportTaxDua" />
          </TaxField>
          <TaxField
            label={ui('sifDataTabs.field.duaDate')}
            htmlFor="sif-importTax-duaDate"
            required
            data-testid="TaxField__duaDate">
            <DateField
              id="sif-importTax-duaDate"
              value={draft.aeatsiiFechaDua}
              onChange={iso => setDraft(d => ({ ...d, aeatsiiFechaDua: iso ?? '' }))}
              disabled={saving}
              data-testid="DateField__siiImportTaxDuaDate" />
          </TaxField>
        </>
      )}
      {error && (
        <p className="col-span-2 text-xs text-destructive" role="alert" data-testid="SiiImportTaxesSection__error">
          {error}
        </p>
      )}
      <div className="col-span-2 flex justify-end gap-2" data-testid="SiiImportTaxesSection__formActions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          data-testid="Button__siiImportTaxCancel">
          {ui('cancel')}
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={saving} data-testid="Button__siiImportTaxSave">
          {saving ? ui('saving') : ui('save')}
        </Button>
      </div>
    </div>
  );
}

function ImportTaxesTable({ ui, rows, multiDua, currency, locale, editable, onEdit, onDelete }) {
  const cell = 'px-2 py-1.5 align-middle';
  return (
    <table className="w-full text-sm" data-testid="SiiImportTaxesSection__table">
      <thead data-testid="SiiImportTaxesSection__thead">
        <tr className="text-xs text-muted-foreground border-b border-border/40" data-testid="SiiImportTaxesSection__headRow">
          <th className={`${cell} text-left font-medium`} data-testid="SiiImportTaxesSection__thTax">{ui('tax')}</th>
          <th className={`${cell} text-right font-medium`} data-testid="SiiImportTaxesSection__thBase">
            {ui('sifDataTabs.importTaxes.taxableAmount')}
          </th>
          <th className={`${cell} text-right font-medium`} data-testid="SiiImportTaxesSection__thAmount">
            {ui('sifDataTabs.importTaxes.taxAmount')}
          </th>
          {multiDua && (
            <>
              <th className={`${cell} text-left font-medium`} data-testid="SiiImportTaxesSection__thDua">{ui('sifDataTabs.field.dua')}</th>
              <th className={`${cell} text-left font-medium`} data-testid="SiiImportTaxesSection__thDuaDate">
                {ui('sifDataTabs.field.duaDate')}
              </th>
            </>
          )}
          {editable && <th className={cell} aria-hidden="true" data-testid="SiiImportTaxesSection__thActions" />}
        </tr>
      </thead>
      <tbody data-testid="SiiImportTaxesSection__tbody">
        {rows.map(row => (
          <tr key={row.id} className="border-b border-border/20" data-testid={`SiiImportTaxesSection__row_${row.id}`}>
            <td className={cell} data-testid="SiiImportTaxesSection__tdTax">{row['tax$_identifier'] ?? row.tax}</td>
            <td className={`${cell} text-right tabular-nums`} data-testid="SiiImportTaxesSection__tdBase">
              {formatCurrency(currency, row.taxableAmount)}
            </td>
            <td className={`${cell} text-right tabular-nums`} data-testid="SiiImportTaxesSection__tdAmount">
              {formatCurrency(currency, row.taxAmount)}
            </td>
            {multiDua && (
              <>
                <td className={cell} data-testid="SiiImportTaxesSection__tdDua">{row.aeatsiiDua || '—'}</td>
                <td className={cell} data-testid="SiiImportTaxesSection__tdDuaDate">
                  {row.aeatsiiFechaDua ? formatCalendarDate(row.aeatsiiFechaDua, locale) : '—'}
                </td>
              </>
            )}
            {editable && (
              <td className={`${cell} text-right whitespace-nowrap`} data-testid="SiiImportTaxesSection__tdActions">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={ui('edit')}
                  onClick={() => onEdit(row)}
                  data-testid="Button__siiImportTaxEdit">
                  <Pencil data-testid="Pencil__siiImportTax" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={ui('delete')}
                  onClick={() => onDelete(row)}
                  data-testid="Button__siiImportTaxDelete">
                  <Trash2 data-testid="Trash2__siiImportTax" />
                </Button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImportTaxesBlock({ ui, multiDua, recordId, data, apiBaseUrl, token, readOnly, onHeaderRefresh }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const { locale } = useLocaleSwitch();
  const [allRows, setAllRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const currency = data?.['currency$_identifier'] || '';
  const rows = selectImportTaxRows(allRows);
  const editable = !readOnly && Boolean(recordId);

  const load = useCallback(async () => {
    if (!recordId || !apiBaseUrl) return;
    try {
      const res = await apiFetch(`/tax?parentId=${encodeURIComponent(recordId)}`);
      if (!res.ok) return;
      const body = await res.json();
      const list = body?.response?.data ?? (Array.isArray(body) ? body : []);
      setAllRows(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    }
  }, [recordId, apiBaseUrl, apiFetch, ui]);

  useEffect(() => { load(); }, [load]);

  const afterWrite = useCallback(async (messageKey) => {
    toast.success(ui(messageKey));
    await load();
    onHeaderRefresh?.();
  }, [load, onHeaderRefresh, ui]);

  // Mirrors Classic's SL_InvoiceTax_Amt: changing the base (or the tax) recomputes the tax
  // amount; changing the tax amount recomputes the base. Best effort — on failure the user's
  // values stay as typed.
  const runAmountCallout = useCallback(async (field, next) => {
    const sourceField = field === 'taxAmount' ? 'taxAmount' : 'taxableAmount';
    if (!next.tax || next[sourceField] == null) return;
    try {
      const res = await apiFetch('/tax/callout', {
        method: 'POST',
        body: JSON.stringify({
          field: sourceField,
          value: next[sourceField],
          formState: {
            tax: next.tax,
            invoice: recordId,
            taxableAmount: next.taxableAmount,
            taxAmount: next.taxAmount,
          },
        }),
      });
      if (!res.ok) return;
      const result = await res.json();
      const updates = result?.updates;
      const amount = calloutAmount(updates, 'taxAmount');
      const base = calloutAmount(updates, 'taxableAmount');
      setDraft(d => (d ? {
        ...d,
        ...(sourceField === 'taxableAmount' && amount !== undefined ? { taxAmount: amount } : {}),
        ...(sourceField === 'taxAmount' && base !== undefined ? { taxableAmount: base } : {}),
      } : d));
    } catch { /* keep the typed values */ }
  }, [apiFetch, recordId]);

  const onAmountChange = useCallback((field, patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    runAmountCallout(field, next);
  }, [draft, runAmountCallout]);

  const save = useCallback(async () => {
    const invalidKey = validateImportTaxDraft(draft, multiDua);
    if (invalidKey) { setError(ui(invalidKey)); return; }
    setError(null);
    setSaving(true);
    try {
      const body = buildImportTaxBody(draft, multiDua);
      const res = draft.id
        ? await apiFetch(`/tax/${encodeURIComponent(draft.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/tax', {
          method: 'POST',
          body: JSON.stringify({ ...body, parentId: recordId, lineNo: nextTaxLineNo(allRows), recalculate: false }),
        });
      if (!res.ok) {
        setError(await translateBackendErrorResponse(res, ui));
        return;
      }
      setDraft(null);
      await afterWrite('sifDataTabs.importTaxes.saved');
    } catch (err) {
      setError(err?.message || ui('networkError'));
    } finally {
      setSaving(false);
    }
  }, [draft, multiDua, apiFetch, recordId, allRows, afterWrite, ui]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/tax/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await translateBackendErrorResponse(res, ui));
        return;
      }
      await afterWrite('sifDataTabs.importTaxes.deleted');
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, apiFetch, afterWrite, ui]);

  const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/lines/selectors/tax` : null;
  const selectorContext = buildLineSelectorContext({
    windowCategory: WINDOW_CATEGORY,
    parentId: recordId,
    headerRecord: data,
  });

  return (
    <>
      <div className="col-span-2 pt-2 mt-1 border-t border-border/40" data-testid="SiiImportTaxesSection__title">
        <span className="text-xs font-semibold text-foreground">{ui('sifDataTabs.importTaxes.title')}</span>
      </div>
      <div className="col-span-2 space-y-3" data-testid="SiiImportTaxesSection__body">
        {!recordId && (
          <p className="text-xs text-muted-foreground" data-testid="SiiImportTaxesSection__saveFirst">
            {ui('sifDataTabs.importTaxes.saveFirst')}
          </p>
        )}
        {recordId && rows.length === 0 && !draft && (
          <p className="text-xs text-muted-foreground" data-testid="SiiImportTaxesSection__empty">
            {ui('sifDataTabs.importTaxes.empty')}
          </p>
        )}
        {rows.length > 0 && (
          <ImportTaxesTable
            ui={ui}
            rows={rows}
            multiDua={multiDua}
            currency={currency}
            locale={locale}
            editable={editable && !draft}
            onEdit={row => { setError(null); setDraft(rowToDraft(row)); }}
            onDelete={row => setDeleteTarget(row)}
            data-testid="ImportTaxesTable__siiImportTax" />
        )}
        {draft && (
          <ImportTaxForm
            ui={ui}
            draft={draft}
            setDraft={setDraft}
            multiDua={multiDua}
            currency={currency}
            saving={saving}
            error={error}
            onSave={save}
            onCancel={() => { setDraft(null); setError(null); }}
            onAmountChange={onAmountChange}
            selectorUrl={selectorUrl}
            selectorContext={selectorContext}
            token={token}
            data-testid="ImportTaxForm__siiImportTax" />
        )}
        {editable && !draft && (
          <AddLineButton
            label={ui('sifDataTabs.importTaxes.add')}
            onClick={() => { setError(null); setDraft({ ...EMPTY_DRAFT }); }}
            hideChevron
            data-testid="AddLineButton__siiImportTax" />
        )}
      </div>
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        count={1}
        deleting={deleting}
        onConfirm={confirmDelete}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        testIdScope="sii-import-tax-delete"
        data-testid="DeleteConfirmDialog__siiImportTax" />
    </>
  );
}

export default function SiiImportTaxesSection({
  ui, siiTypeKey, multiDua, recordId, data, apiBaseUrl, token, readOnly, onHeaderRefresh,
}) {
  const enabled = useFeatureFlag(SII_IMPORT_DUA) === true;
  if (!enabled || !DUA_TYPE_KEYS.has(siiTypeKey)) return null;
  return (
    <ImportTaxesBlock
      ui={ui}
      multiDua={multiDua}
      recordId={recordId}
      data={data}
      apiBaseUrl={apiBaseUrl}
      token={token}
      readOnly={readOnly}
      onHeaderRefresh={onHeaderRefresh}
      data-testid="ImportTaxesBlock__siiImportTax" />
  );
}
