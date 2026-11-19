import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import RequiredMark from '@/components/ui/required-mark.jsx';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';
import { SelectorInput } from '@/components/contract-ui/SelectorInput.jsx';
import { DeleteConfirmDialog } from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useLocaleSwitch } from '@/i18n';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { buildLineSelectorContext } from '@/lib/selectorContext.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { translateBackendErrorResponse } from '@/lib/backendErrors.js';
import { normalizeDateInputValue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';
import SiiPanelCard from '@/windows/custom/shared/SiiPanelCard.jsx';
import { useFeatureFlag, SII_IMPORT_DUA } from '@/lib/flags';

/**
 * ETP-6284 — "Impuestos de importación" card of the purchase-invoice SII panel, right after
 * "Importación (DUA)" and behind the same `sii-import-dua` flag.
 *
 * Classic parity (module SII, purchase invoice "Tax" tab): an import is declared by adding manual
 * tax lines (`C_InvoiceTax` with `Recalculate = 'N'`) next to the ones the invoice lines generate.
 * The core trigger `C_INVOICETAX_TRG2` adds a manual line's tax amount to the invoice grand total,
 * and `C_Invoice_Post` keeps those lines on completion (and copies them, negated, on a reversal).
 * With "Varios DUA" on the header, each line carries its own DUA and DUA date
 * (`C_InvoiceTax.EM_Aeatsii_Dua` / `EM_Aeatsii_Fecha_Dua`).
 *
 * Inline editable table: Impuesto*, Tipo (rate, read-only), Base imponible*, Cuota (read-only,
 * computed by the Classic callout `SL_InvoiceTax_Amt` — base x rate, currency precision — through
 * the NEO callout endpoint) and a delete icon; with "Varios DUA" each line gets a sub-row with
 * DUA* / Fecha DUA* (no extra columns, so no horizontal scroll).
 *
 * Saving: each row saves ITSELF as soon as it is complete — on choosing the tax, on committing the
 * base (blur / Enter), on leaving the DUA field, on picking the DUA date. An incomplete row stays a
 * local draft with its empty required cells outlined in red; nothing is sent until it is complete.
 * A saved row only PATCHes when a value really changed. Each write re-reads the rows and the header
 * totals (`onHeaderRefresh`).
 *
 * DUA / DUA date are REQUIRED per line with "Varios DUA". Classic declares that rule in
 * `InvoiceTaxEventHandler` but its `showMsg` never throws, so the backend does not enforce it —
 * this card is the only place it holds.
 *
 * Tax picker: the purchase-line tax selector (`/lines/selectors/tax`, `C_Tax_IsSOTrx_Date` rule:
 * purchase or both, valid at the invoice date). Its items carry the rate shown in the Tipo column
 * (`labelPrefix`, the same rate the line pickers show); a saved row falls back to `tax.rate`.
 */
const DUA_TYPE_KEYS = new Set(['F5', 'LC']);
// The card is mounted on purchase invoices only (SifTab's `isPurchaseInvoice` gate).
const WINDOW_CATEGORY = 'purchases';
const CATALOG_PAGE = 100;
const CATALOG_MAX_PAGES = 5;
const ERROR_OUTLINE = 'border-destructive focus-visible:ring-destructive focus-within:ring-destructive';
const TAX_FIELD = { id: 'sif-importTax-tax', key: 'tax', column: 'tax', required: true };

let draftSeq = 0;

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
 * The required cells a row still lacks (`tax`, `taxableAmount`, and with Multiple DUA `aeatsiiDua`
 * and `aeatsiiFechaDua`). `taxAmount` is not a cell the user fills: it comes from the callout, and a
 * row without it is simply not saved yet.
 */
export function missingImportTaxFields(row, multiDua) {
  const missing = new Set();
  if (!row?.tax) missing.add('tax');
  if (row?.taxableAmount == null) missing.add('taxableAmount');
  if (multiDua) {
    if (!String(row?.aeatsiiDua ?? '').trim()) missing.add('aeatsiiDua');
    if (!row?.aeatsiiFechaDua) missing.add('aeatsiiFechaDua');
  }
  return missing;
}

/** Request body of a save. DUA fields travel only while Multiple DUA is checked. */
export function buildImportTaxBody(row, multiDua) {
  const body = {
    tax: row.tax,
    taxableAmount: row.taxableAmount,
    taxAmount: row.taxAmount,
  };
  if (multiDua) {
    body.aeatsiiDua = String(row.aeatsiiDua ?? '').trim();
    body.aeatsiiFechaDua = row.aeatsiiFechaDua;
  }
  return body;
}

/** True when a saved row's editable values differ from what the server holds. */
export function isImportTaxRowDirty(row, persisted, multiDua) {
  if (!persisted) return true;
  const body = buildImportTaxBody(row, multiDua);
  const stored = buildImportTaxBody(persisted, multiDua);
  return Object.keys(body).some(k => (body[k] ?? '') !== (stored[k] ?? ''));
}

/** Sums of the import-tax rows (`total` = base + tax amount). */
export function summarizeImportTaxes(rows) {
  let base = 0;
  let amount = 0;
  for (const r of rows ?? []) {
    base += toNumberOrNull(r?.taxableAmount) ?? 0;
    amount += toNumberOrNull(r?.taxAmount) ?? 0;
  }
  return { base, amount, total: base + amount };
}

function serverRowToRow(row) {
  return {
    key: row.id,
    id: row.id,
    tax: row.tax ?? '',
    taxLabel: row['tax$_identifier'] ?? '',
    serverRate: toNumberOrNull(row['tax$rate']),
    taxableAmount: toNumberOrNull(row.taxableAmount),
    taxAmount: toNumberOrNull(row.taxAmount),
    aeatsiiDua: row.aeatsiiDua ?? '',
    aeatsiiFechaDua: normalizeDateInputValue(row.aeatsiiFechaDua ?? ''),
  };
}

function newDraftRow() {
  draftSeq += 1;
  return {
    key: `draft-${draftSeq}`,
    id: null,
    tax: '',
    taxLabel: '',
    serverRate: null,
    taxableAmount: null,
    taxAmount: null,
    aeatsiiDua: '',
    aeatsiiFechaDua: '',
  };
}

/** Reads one amount out of a NEO callout `updates` map (entries are `{ value }` or raw). */
function calloutAmount(updates, key) {
  if (!updates || !(key in updates)) return undefined;
  const entry = updates[key];
  return toNumberOrNull(entry && typeof entry === 'object' ? entry.value : entry);
}

function createdId(body) {
  const data = body?.response?.data;
  if (Array.isArray(data)) return data[0]?.id ?? null;
  return data?.id ?? body?.id ?? null;
}

function rateLabel(row, rateMap) {
  const prefix = row.tax ? rateMap[row.tax] : null;
  if (prefix != null && prefix !== '') return `${prefix} %`;
  if (row.serverRate != null) return `${formatGroupedNumber(row.serverRate, { maximumFractionDigits: 4 })} %`;
  return '—';
}

function HeaderCell({ children, required, align = 'left', testId }) {
  return (
    <th className={`px-2 py-1.5 text-xs font-medium text-muted-foreground text-${align} whitespace-nowrap`} data-testid={testId}>
      {children}
      {required && <RequiredMark aria-hidden="true" data-testid={`${testId}_required`} />}
    </th>
  );
}

function ReadOnlyAmount({ currency, value, testId }) {
  return (
    <div
      className="h-8 w-full rounded-lg bg-muted px-2 flex items-center justify-end text-sm tabular-nums text-muted-foreground"
      data-testid={testId}>
      {value == null ? '—' : formatCurrency(currency, value)}
    </div>
  );
}

function DuaSubRowLabel({ ui, labelKey, required, testId }) {
  return (
    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap" data-testid={testId}>
      {ui(labelKey)}
      {required && <RequiredMark aria-hidden="true" data-testid={`${testId}_required`} />}
    </span>
  );
}

/**
 * "Varios DUA": the line's DUA and DUA date live on a sub-row right below it (same `<tbody>` row
 * group, indented under Impuesto, spanning the table), so the table keeps its 4 columns + delete
 * and never needs a horizontal scroll.
 */
function DuaSubRow({ ui, row, editable, locale, missing, disabled, colSpan, onDuaChange, onDuaBlur, onDateChange }) {
  return (
    <tr className="border-b border-border/20" data-testid={`SiiImportTaxesSection__duaRow_${row.key}`}>
      <td colSpan={colSpan} className="pl-6 pr-2 pb-2 pt-0" data-testid="SiiImportTaxesSection__tdDuaGroup">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="SiiImportTaxesSection__duaFields">
          <div className="flex items-center gap-2 min-w-0" data-testid="SiiImportTaxesSection__tdDua">
            <DuaSubRowLabel ui={ui} labelKey="sifDataTabs.field.dua" required={editable} testId="SiiImportTaxesSection__duaLabel" data-testid="DuaSubRowLabel__dua" />
            {editable ? (
              <Input
                type="text"
                maxLength={255}
                value={row.aeatsiiDua}
                onChange={e => onDuaChange(row, e.target.value)}
                onBlur={() => onDuaBlur(row)}
                disabled={disabled}
                aria-label={ui('sifDataTabs.field.dua')}
                aria-invalid={missing.has('aeatsiiDua') || undefined}
                className={`h-8 w-48 bg-card ${missing.has('aeatsiiDua') ? ERROR_OUTLINE : ''}`}
                data-testid="Input__siiImportTaxDua" />
            ) : (
              <span className="text-sm" data-testid="SiiImportTaxesSection__duaValue">{row.aeatsiiDua || '—'}</span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0" data-testid="SiiImportTaxesSection__tdDuaDate">
            <DuaSubRowLabel ui={ui} labelKey="sifDataTabs.field.duaDate" required={editable} testId="SiiImportTaxesSection__duaDateLabel" data-testid="DuaSubRowLabel__duaDate" />
            {editable ? (
              <div className="w-44" data-testid="SiiImportTaxesSection__duaDateField">
                <DateField
                  value={row.aeatsiiFechaDua}
                  onChange={iso => onDateChange(row, iso ?? '')}
                  disabled={disabled}
                  className={missing.has('aeatsiiFechaDua') ? ERROR_OUTLINE : undefined}
                  data-testid="DateField__siiImportTaxDuaDate" />
              </div>
            ) : (
              <span className="text-sm" data-testid="SiiImportTaxesSection__duaDateValue">
                {row.aeatsiiFechaDua ? formatCalendarDate(row.aeatsiiFechaDua, locale) : '—'}
              </span>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function ImportTaxRow({
  ui, row, multiDua, editable, currency, locale, rateMap, selectorUrl, selectorContext, token,
  onTaxChange, onBaseCommit, onDuaChange, onDuaBlur, onDateChange, onDelete,
}) {
  const cell = 'px-2 py-1.5 align-middle';
  const missing = editable ? missingImportTaxFields(row, multiDua) : new Set();
  const disabled = Boolean(row.saving);
  const mainRowClass = multiDua ? '' : 'border-b border-border/20';
  const subRow = multiDua && (
    <DuaSubRow
      ui={ui}
      row={row}
      editable={editable}
      locale={locale}
      missing={missing}
      disabled={disabled}
      colSpan={editable ? 5 : 4}
      onDuaChange={onDuaChange}
      onDuaBlur={onDuaBlur}
      onDateChange={onDateChange}
      data-testid="DuaSubRow__siiImportTax" />
  );
  if (!editable) {
    return (
      <tbody data-testid={`SiiImportTaxesSection__group_${row.key}`}>
        <tr className={mainRowClass} data-testid={`SiiImportTaxesSection__row_${row.key}`}>
          <td className={cell} data-testid="SiiImportTaxesSection__tdTax">{row.taxLabel || row.tax}</td>
          <td className={`${cell} tabular-nums`} data-testid="SiiImportTaxesSection__tdRate">{rateLabel(row, rateMap)}</td>
          <td className={`${cell} text-right tabular-nums`} data-testid="SiiImportTaxesSection__tdBase">
            {formatCurrency(currency, row.taxableAmount)}
          </td>
          <td className={`${cell} text-right tabular-nums`} data-testid="SiiImportTaxesSection__tdAmount">
            {formatCurrency(currency, row.taxAmount)}
          </td>
        </tr>
        {subRow}
      </tbody>
    );
  }
  return (
    <tbody data-testid={`SiiImportTaxesSection__group_${row.key}`}>
      <tr className={mainRowClass} data-testid={`SiiImportTaxesSection__row_${row.key}`}>
        <td className={`${cell} min-w-40`} data-testid="SiiImportTaxesSection__tdTax">
          <SelectorInput
            entityName="tax"
            field={TAX_FIELD}
            value={row.tax}
            displayValue={row.taxLabel}
            onChange={(val, lbl) => onTaxChange(row, val ?? '', lbl ?? '')}
            catalogs={null}
            resolvedLabel={ui('tax')}
            selectorUrl={selectorUrl}
            selectorContext={selectorContext}
            token={token}
            compact
            triggerClassName={`w-full h-8 text-sm text-text-primary bg-card focus:ring-2 focus:ring-primary ${missing.has('tax') ? ERROR_OUTLINE : ''}`}
            data-testid="SelectorInput__siiImportTax" />
        </td>
        <td className={`${cell} tabular-nums text-muted-foreground whitespace-nowrap`} data-testid="SiiImportTaxesSection__tdRate">
          {rateLabel(row, rateMap)}
        </td>
        <td className={`${cell} w-32`} data-testid="SiiImportTaxesSection__tdBase">
          <MaskedAmountInput
            bare
            currency={currency}
            value={row.taxableAmount}
            onCommit={parsed => onBaseCommit(row, parsed)}
            disabled={disabled}
            aria-label={ui('sifDataTabs.importTaxes.taxableAmount')}
            aria-invalid={missing.has('taxableAmount') || undefined}
            className={`h-8 ${missing.has('taxableAmount') ? ERROR_OUTLINE : ''}`}
            data-testid="MaskedAmountInput__siiImportTaxBase" />
        </td>
        <td className={`${cell} w-28`} data-testid="SiiImportTaxesSection__tdAmount">
          <ReadOnlyAmount currency={currency} value={row.taxAmount} testId="SiiImportTaxesSection__amount" data-testid="ReadOnlyAmount__siiImportTax" />
        </td>
        <td className={`${cell} w-10 text-right`} data-testid="SiiImportTaxesSection__tdActions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={ui('delete')}
            onClick={() => onDelete(row)}
            disabled={disabled}
            data-testid="Button__siiImportTaxDelete">
            <Trash2 data-testid="Trash2__siiImportTax" />
          </Button>
        </td>
      </tr>
      {subRow}
    </tbody>
  );
}

function SummaryLine({ label, value, strong, testId }) {
  return (
    <div className={`flex items-center justify-between gap-6 text-sm ${strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}`} data-testid={testId}>
      <span data-testid={`${testId}_label`}>{label}</span>
      <span className="tabular-nums" data-testid={`${testId}_value`}>{value}</span>
    </div>
  );
}

function useTaxRateCatalog(apiFetch, selectorUrl, selectorContext) {
  const [rateMap, setRateMap] = useState({});
  const contextKey = JSON.stringify(selectorContext ?? {});
  useEffect(() => {
    if (!selectorUrl) return undefined;
    let cancelled = false;
    (async () => {
      const map = {};
      for (let page = 0; page < CATALOG_MAX_PAGES; page += 1) {
        const url = buildUrlWithParams(selectorUrl, { ...selectorContext, limit: CATALOG_PAGE, offset: page * CATALOG_PAGE });
        const res = await apiFetch(url, { baseUrl: '' });
        if (!res.ok) break;
        const body = await res.json();
        const items = body?.items ?? body?.response?.data ?? [];
        for (const item of items) if (item?.id) map[item.id] = item.labelPrefix ?? null;
        if (items.length < CATALOG_PAGE) break;
      }
      if (!cancelled) setRateMap(map);
    })().catch(() => { /* the Tipo column falls back to the saved tax rate */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, selectorUrl, contextKey]);
  return rateMap;
}

function ImportTaxesBlock({ ui, multiDua, recordId, data, apiBaseUrl, token, readOnly, onHeaderRefresh, step }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const { locale } = useLocaleSwitch();
  const [allServerRows, setAllServerRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const persistedRef = useRef({});

  const currency = data?.['currency$_identifier'] || '';
  const editable = !readOnly && Boolean(recordId);
  const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/lines/selectors/tax` : null;
  const selectorContext = buildLineSelectorContext({ windowCategory: WINDOW_CATEGORY, parentId: recordId, headerRecord: data });
  const rateMap = useTaxRateCatalog(apiFetch, editable ? selectorUrl : null, selectorContext);

  const load = useCallback(async () => {
    if (!recordId || !apiBaseUrl) return;
    try {
      const res = await apiFetch(`/tax?parentId=${encodeURIComponent(recordId)}&_extraProperties=tax.rate`);
      if (!res.ok) return;
      const body = await res.json();
      const list = body?.response?.data ?? (Array.isArray(body) ? body : []);
      const all = Array.isArray(list) ? list : [];
      const manual = selectImportTaxRows(all).map(serverRowToRow);
      persistedRef.current = Object.fromEntries(manual.map(r => [r.id, r]));
      setAllServerRows(all);
      // Keep the local drafts (not saved yet) after the saved rows.
      setRows(prev => [...manual, ...prev.filter(r => !r.id)]);
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    }
  }, [recordId, apiBaseUrl, apiFetch, ui]);

  useEffect(() => { load(); }, [load]);

  const patchRow = useCallback((key, patch) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  // Classic SL_InvoiceTax_Amt: the tax amount follows the base and the tax. Best effort — on
  // failure the row keeps no amount and is not saved.
  const withCalloutAmount = useCallback(async (row) => {
    if (!row.tax || row.taxableAmount == null) return row;
    try {
      const res = await apiFetch('/tax/callout', {
        method: 'POST',
        body: JSON.stringify({
          field: 'taxableAmount',
          value: row.taxableAmount,
          formState: { tax: row.tax, invoice: recordId, taxableAmount: row.taxableAmount, taxAmount: row.taxAmount },
        }),
      });
      if (!res.ok) return row;
      const amount = calloutAmount((await res.json())?.updates, 'taxAmount');
      return amount === undefined ? row : { ...row, taxAmount: amount };
    } catch {
      return row;
    }
  }, [apiFetch, recordId]);

  const saveRow = useCallback(async (row) => {
    if (!row || row.saving) return;
    if (missingImportTaxFields(row, multiDua).size > 0 || row.taxAmount == null) return;
    if (row.id && !isImportTaxRowDirty(row, persistedRef.current[row.id], multiDua)) return;
    patchRow(row.key, { saving: true });
    try {
      const body = buildImportTaxBody(row, multiDua);
      const res = row.id
        ? await apiFetch(`/tax/${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/tax', {
          method: 'POST',
          body: JSON.stringify({ ...body, parentId: recordId, lineNo: nextTaxLineNo(allServerRows), recalculate: false }),
        });
      if (!res.ok) {
        toast.error(await translateBackendErrorResponse(res, ui));
        patchRow(row.key, { saving: false });
        return;
      }
      if (!row.id) {
        // The draft becomes the saved row; the reload below replaces it with the server version.
        const id = createdId(await res.json().catch(() => null));
        setRows(prev => (id == null
          ? prev.filter(r => r.key !== row.key)
          : prev.map(r => (r.key === row.key ? { ...r, id, key: id, saving: false } : r))));
      }
      await load();
      onHeaderRefresh?.();
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
      patchRow(row.key, { saving: false });
    }
  }, [multiDua, patchRow, apiFetch, recordId, allServerRows, load, onHeaderRefresh, ui]);

  const recomputeAndSave = useCallback(async (row) => {
    const next = await withCalloutAmount(row);
    patchRow(row.key, { taxAmount: next.taxAmount });
    await saveRow(next);
  }, [withCalloutAmount, patchRow, saveRow]);

  const onTaxChange = useCallback((row, tax, taxLabel) => {
    const next = { ...row, tax, taxLabel, serverRate: null, taxAmount: row.tax === tax ? row.taxAmount : null };
    patchRow(row.key, { tax, taxLabel, serverRate: null, taxAmount: next.taxAmount });
    recomputeAndSave(next);
  }, [patchRow, recomputeAndSave]);

  const onBaseCommit = useCallback((row, parsed) => {
    if (parsed === row.taxableAmount) return;
    const next = { ...row, taxableAmount: parsed, taxAmount: null };
    patchRow(row.key, { taxableAmount: parsed, taxAmount: null });
    recomputeAndSave(next);
  }, [patchRow, recomputeAndSave]);

  const onDuaChange = useCallback((row, value) => patchRow(row.key, { aeatsiiDua: value }), [patchRow]);
  const onDuaBlur = useCallback((row) => {
    saveRow(rowsRef.current.find(r => r.key === row.key));
  }, [saveRow]);
  const onDateChange = useCallback((row, iso) => {
    patchRow(row.key, { aeatsiiFechaDua: iso });
    saveRow({ ...rowsRef.current.find(r => r.key === row.key), aeatsiiFechaDua: iso });
  }, [patchRow, saveRow]);

  const onDelete = useCallback((row) => {
    if (row.id) setDeleteTarget(row);
    else setRows(prev => prev.filter(r => r.key !== row.key));
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/tax/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await translateBackendErrorResponse(res, ui));
        return;
      }
      setRows(prev => prev.filter(r => r.key !== deleteTarget.key));
      toast.success(ui('sifDataTabs.importTaxes.deleted'));
      await load();
      onHeaderRefresh?.();
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, apiFetch, load, onHeaderRefresh, ui]);

  const summary = summarizeImportTaxes(rows);

  return (
    <SiiPanelCard
      step={step}
      title={ui('sifDataTabs.importTaxes.title')}
      subtitle={ui('sifDataTabs.importTaxes.subtitle')}
      testId="SiiImportTaxesSection__card"
      data-testid="SiiPanelCard__siiImportTaxes">
      {!recordId ? (
        <p className="text-xs text-muted-foreground" data-testid="SiiImportTaxesSection__saveFirst">
          {ui('sifDataTabs.importTaxes.saveFirst')}
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <div className="overflow-x-auto" data-testid="SiiImportTaxesSection__tableWrap">
              <table className="w-full table-auto text-sm" data-testid="SiiImportTaxesSection__table">
                <thead data-testid="SiiImportTaxesSection__thead">
                  <tr className="border-b border-border/40" data-testid="SiiImportTaxesSection__headRow">
                    <HeaderCell required={editable} testId="SiiImportTaxesSection__thTax" data-testid="HeaderCell__tax">{ui('tax')}</HeaderCell>
                    <HeaderCell testId="SiiImportTaxesSection__thRate" data-testid="HeaderCell__rate">{ui('sifDataTabs.importTaxes.rate')}</HeaderCell>
                    <HeaderCell required={editable} align="right" testId="SiiImportTaxesSection__thBase" data-testid="HeaderCell__base">
                      {ui('sifDataTabs.importTaxes.taxableAmount')}
                    </HeaderCell>
                    <HeaderCell align="right" testId="SiiImportTaxesSection__thAmount" data-testid="HeaderCell__amount">
                      {ui('sifDataTabs.importTaxes.taxAmount')}
                    </HeaderCell>
                    {editable && <th aria-hidden="true" data-testid="SiiImportTaxesSection__thActions" />}
                  </tr>
                </thead>
                  {rows.map(row => (
                    <ImportTaxRow
                      key={row.key}
                      ui={ui}
                      row={row}
                      multiDua={multiDua}
                      editable={editable}
                      currency={currency}
                      locale={locale}
                      rateMap={rateMap}
                      selectorUrl={selectorUrl}
                      selectorContext={selectorContext}
                      token={token}
                      onTaxChange={onTaxChange}
                      onBaseCommit={onBaseCommit}
                      onDuaChange={onDuaChange}
                      onDuaBlur={onDuaBlur}
                      onDateChange={onDateChange}
                      onDelete={onDelete}
                      data-testid="ImportTaxRow__siiImportTax" />
                  ))}
              </table>
            </div>
          )}
          {rows.length === 0 && !editable && (
            <p className="text-xs text-muted-foreground" data-testid="SiiImportTaxesSection__empty">
              {ui('sifDataTabs.importTaxes.empty')}
            </p>
          )}
          <div className="flex flex-wrap items-start justify-between gap-4" data-testid="SiiImportTaxesSection__footer">
            {editable ? (
              <button
                type="button"
                onClick={() => setRows(prev => [...prev, newDraftRow()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-control px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                data-testid="Button__siiImportTaxAdd">
                <Plus className="h-4 w-4" data-testid="Plus__siiImportTax" />
                {ui('sifDataTabs.importTaxes.add')}
              </button>
            ) : <span data-testid="SiiImportTaxesSection__footerSpacer" />}
            <div className="min-w-56 space-y-1.5" data-testid="SiiImportTaxesSection__summary">
              <SummaryLine
                label={ui('sifDataTabs.importTaxes.taxableAmount')}
                value={formatCurrency(currency, summary.base)}
                testId="SiiImportTaxesSection__sumBase"
                data-testid="SummaryLine__base" />
              <SummaryLine
                label={ui('sifDataTabs.importTaxes.summaryTaxAmount')}
                value={formatCurrency(currency, summary.amount)}
                testId="SiiImportTaxesSection__sumAmount"
                data-testid="SummaryLine__amount" />
              <div className="border-t border-border/60" data-testid="SiiImportTaxesSection__sumSeparator" />
              <SummaryLine
                label={ui('total')}
                value={formatCurrency(currency, summary.total)}
                strong
                testId="SiiImportTaxesSection__sumTotal"
                data-testid="SummaryLine__total" />
            </div>
          </div>
        </>
      )}
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        count={1}
        deleting={deleting}
        onConfirm={confirmDelete}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        testIdScope="sii-import-tax-delete"
        data-testid="DeleteConfirmDialog__siiImportTax" />
    </SiiPanelCard>
  );
}

export default function SiiImportTaxesSection({
  ui, siiTypeKey, multiDua, recordId, data, apiBaseUrl, token, readOnly, onHeaderRefresh, step,
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
      step={step}
      data-testid="ImportTaxesBlock__siiImportTax" />
  );
}
