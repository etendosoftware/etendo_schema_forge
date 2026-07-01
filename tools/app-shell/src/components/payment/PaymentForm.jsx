// Generic, reusable payment workspace ("Agregar pago"). Single source of truth
// for the payment UI, state, validations and totals. Used:
//   - embedded inside the New Movement wizard (account from context → no
//     "Ingresar en" field, no modal chrome), and
//   - inside the standalone AddPaymentModal (own chrome, "Ingresar en" shown).
//
// Differences per context are driven by props (see PaymentForm below). Invoice
// data is still the prototype sample set; real outstanding-invoices + payment
// registration land in a later wiring phase.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet, FileText, Percent, Search, Filter, Plus, Trash2,
  Check, ChevronRight, X,
} from 'lucide-react';
import { useBPartnerLookup, useGLItemLookup, useOutstandingInvoices } from '@/hooks/useMovementLookups';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AdvancedFilterBuilder } from '@/components/contract-ui/AdvancedFilterBuilder';
import {
  Field, ReadOnly, TextInput, Select, DateInput, AmountInput, MoneyInput, LookupPicker,
} from '@/components/forms/fields';
import { formatAmount } from '@/lib/formatAmount';
import {
  fmtAmount, parseAmount, todayISO, filterInvoices,
} from './paymentData';
import { buildInvoiceFilterColumns, applyInvoiceAdvancedFilter } from './paymentInvoiceFilter';

function DueDot({ d, date }) {
  let cls = 'bg-[#A9A9BC]';
  let title = 'Al día';
  if (d < 0) { cls = 'bg-[#F3164E]'; title = `Vencida hace ${Math.abs(d)} día(s)`; }
  else if (d === 0) { cls = 'bg-[#FAAF00]'; title = 'Vence hoy'; }
  else if (d <= 7) { cls = 'bg-[#FAAF00]'; title = `Vence en ${d} día(s)`; }
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={title}>
      <span className={`h-[9px] w-[9px] shrink-0 rounded-full ${cls}`} />
      {date ? <span className="text-sm tabular-nums text-[#121217]">{date}</span> : null}
    </span>
  );
}

// Filterable columns for the invoice table — built once (Spanish literal labels).
const INVOICE_FILTER_COLUMNS = buildInvoiceFilterColumns();

// ── Search box + "filtro por condiciones" (shared AdvancedFilterBuilder) ──────
function InvoiceFilter({ q, setQ, advFilter, setAdvFilter, rows }) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef(null);
  const count = (advFilter?.conditions || []).filter((c) => c.field && c.operator).length;

  // Collapsed by default to a magnifier button; expands to the input on click,
  // and stays expanded while there is a query. The X clears and collapses.
  const expanded = searchOpen || !!q;
  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);
  const collapseSearch = () => { setQ(''); setSearchOpen(false); };

  return (
    <div className="relative inline-flex items-center gap-2">
      {expanded ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[#8A8AA3]"
            data-testid="Search__bca0e2" />
          <input
            ref={inputRef}
            className="h-[34px] w-[230px] box-border rounded-lg border border-[#D1D4DB] bg-white pl-8 pr-8 text-[13px] leading-[18px] text-[#121217] placeholder:text-[#8A8AA3] focus:outline-none focus:border-[#121217] focus:ring-2 focus:ring-[#121217]/20"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => { if (!q) setSearchOpen(false); }}
          />
          <button
            type="button"
            onClick={collapseSearch}
            title="Cerrar búsqueda"
            className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-[#8A8AA3] hover:text-[#121217]"
          >
            <X className="h-3.5 w-3.5" data-testid="X__bca0e2" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          title="Buscar"
          onClick={() => setSearchOpen(true)}
          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#D1D4DB] bg-white text-[#3F3F50] hover:bg-[#F5F7F9]"
        >
          <Search className="h-4 w-4" data-testid="Search__bca0e2" />
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen} data-testid="Popover__bca0e2">
        <PopoverTrigger asChild data-testid="PopoverTrigger__bca0e2">
          <button
            type="button"
            title="Filtro por condiciones"
            className="relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#D1D4DB] bg-white text-[#3F3F50] hover:bg-[#F5F7F9]"
          >
            <Filter className="h-4 w-4" data-testid="Filter__bca0e2" />
            {count ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#121217] px-1 text-[10px] font-semibold leading-none text-white">{count}</span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="w-auto p-4"
          data-testid="PopoverContent__bca0e2">
          <AdvancedFilterBuilder
            columns={INVOICE_FILTER_COLUMNS}
            rows={rows}
            value={advFilter}
            onApply={(next) => setAdvFilter(next)}
            onClear={() => setAdvFilter(null)}
            onClose={() => setOpen(false)}
            data-testid="AdvancedFilterBuilder__bca0e2" />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Role-scoped bpartner hooks — defined at module scope so React's rules of hooks
// are satisfied (same hook called unconditionally every render).
function useBPartnerCustomer(q) { return useBPartnerLookup(q, 'customer'); }
function useBPartnerVendor(q) { return useBPartnerLookup(q, 'vendor'); }

// Presentational "Datos del pago" card — fully controlled by PaymentForm.
function PaymentFields({
  doc, pago, onPagoChange, methodOptions, metodo, setMetodo, tercero, setTercero,
  fechaPago, setFechaPago, referencia, setReferencia,
  showAccountField, account, accountOptions, accountId, setAccountId, requireAccount,
}) {
  const bpartnerHook = doc === 'in' ? useBPartnerCustomer : useBPartnerVendor;
  const accountLabel = doc === 'in' ? 'Ingresar en' : 'Pagar desde';

  // "Ingresar en / Pagar desde": hidden when the account is fixed by context,
  // read-only when an account is provided, or a required selector otherwise.
  const renderAccountField = () => {
    if (!showAccountField) return null;
    if (account) {
      return <Field label={accountLabel} data-testid="Field__bca0e2"><ReadOnly data-testid="ReadOnly__bca0e2">{account.label}</ReadOnly></Field>;
    }
    return (
      <Select
        label={accountLabel}
        required={requireAccount}
        value={accountId}
        onChange={setAccountId}
        options={accountOptions}
        placeholder="Seleccionar cuenta…"
        data-testid="Select__bca0e2" />
    );
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#E8EAEF] bg-white p-[18px]">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#121217]">
          <Wallet className="h-4 w-4" data-testid="Wallet__bca0e2" /> Datos del pago
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-[18px] gap-y-3.5 lg:grid-cols-3">
        <Field
          label={doc === 'in' ? 'Recibido de' : 'Pagado a'}
          data-testid="Field__bca0e2">
          <LookupPicker
            value={tercero}
            onChange={setTercero}
            useLookup={bpartnerHook}
            placeholder="Buscar contacto…"
            data-testid="LookupPicker__bca0e2" />
        </Field>
        <Select
          label="Método de pago"
          value={metodo}
          onChange={setMetodo}
          options={methodOptions}
          data-testid="Select__bca0e2" />
        {renderAccountField()}
        <AmountInput
          label="Importe del pago"
          value={Number(pago) ? fmtAmount(pago) : ''}
          placeholder="0.00"
          onChange={onPagoChange}
          data-testid="AmountInput__bca0e2" />
        <DateInput
          label="Fecha de pago"
          value={fechaPago}
          onChange={setFechaPago}
          data-testid="DateInput__bca0e2" />
        <Field label="Nº de referencia" data-testid="Field__bca0e2">
          <TextInput
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Opcional · nº de operación…"
            data-testid="TextInput__bca0e2" />
        </Field>
      </div>
    </div>
  );
}

// Columns mirror the Classic "Add Payment" invoice grid: Doc No · Payment Method
// · Business Partner · Expected (due) Date · Invoiced / Expected / Outstanding
// amounts · Amount to pay (input) · Writeoff. Secondary fields (invoice date,
// project, cost center) stay in the expandable detail row.
const NCOLS = 11;

// Message shown when the table has no rows: loading vs. no invoices at all vs.
// filtered-out. Extracted to avoid a nested ternary in the JSX.
function invoiceEmptyMessage(loading, total, emptyHint) {
  if (loading) return 'Cargando facturas…';
  if (total === 0) return emptyHint || 'Sin facturas pendientes.';
  return 'Ninguna factura coincide con los filtros.';
}

function InvoiceTable({ invoices, sel, toggle, setAmt, exp, setExp, wo, setWo, q, setQ, advFilter, setAdvFilter, filterRows, loading, emptyHint }) {
  // Free-text search + advanced "by conditions" filter (the payment-method
  // default is seeded into advFilter as a condition by PaymentForm).
  const rows = applyInvoiceAdvancedFilter(filterInvoices(invoices, q, []), advFilter);
  // Header + amount styling mirrors the Sales Invoice list (DataTable): dark
  // semibold labels (no uppercase), white background, and amounts via the shared
  // formatAmount() helper so currency reads identically across the app.
  const TH = 'sticky top-0 z-10 border-b border-[#E8EAEF] bg-white px-2 py-2 text-left text-xs leading-4 font-semibold tracking-normal text-text-primary whitespace-nowrap';
  const TD = 'border-b border-[#E8EAEF] px-2 py-2 text-[13px] text-[#121217] align-middle';
  const AMT = 'tabular-nums text-right whitespace-nowrap';
  return (
    <div className="overflow-hidden rounded-xl border border-[#E8EAEF] bg-white">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#E8EAEF] px-3.5 py-3">
        <InvoiceFilter
          q={q}
          setQ={setQ}
          advFilter={advFilter}
          setAdvFilter={setAdvFilter}
          rows={filterRows ?? invoices}
          data-testid="InvoiceFilter__bca0e2" />
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-[#121217]">
          <FileText className="h-4 w-4" data-testid="FileText__bca0e2" /> Facturas
          {Object.keys(sel).length ? (
            <span className="whitespace-nowrap rounded-full bg-[#121217] px-2 py-0.5 text-[11px] font-semibold text-white">{Object.keys(sel).length} sel.</span>
          ) : null}
          <span className="text-xs font-medium text-[#8A8AA3]">· {rows.length} de {invoices.length}</span>
        </span>
      </div>
      {/* ~10 rows tall, then scroll; header stays pinned (sticky). */}
      <div className="max-h-[440px] overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={`${TH} w-11`} />
              <th className={TH}>Nº factura</th>
              <th className={TH}>Método de pago</th>
              <th className={`${TH} w-full`}>Contacto</th>
              <th className={TH}>Vencimiento</th>
              <th className={`${TH} text-right`}>Importe facturado</th>
              <th className={`${TH} text-right`}>Importe esperado</th>
              <th className={`${TH} text-right`}>Pendiente</th>
              <th className={`${TH} text-right`}>Importe a pagar</th>
              <th className={`${TH} text-center`}>Descuento</th>
              <th className={`${TH} w-10`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = sel[r.id] != null;
              const op = exp[r.id];
              const bg = on ? 'bg-[#F5F7F9]' : '';
              return (
                <Fragment key={r.id} data-testid="Fragment__bca0e2">
                  <tr>
                    <td className={`${TD} ${bg} w-11`}>
                      <button
                        type="button"
                        onClick={() => toggle(r)}
                        className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border-[1.5px] ${on ? 'border-[#121217] bg-[#121217] text-white' : 'border-[#A9A9BC] bg-white text-transparent'}`}
                      >
                        <Check className="h-3 w-3" data-testid="Check__bca0e2" />
                      </button>
                    </td>
                    <td className={`${TD} ${bg} whitespace-nowrap`}>
                      <span className="block max-w-[160px] font-semibold text-[#121217]">
                        {r.no}
                        {r.desc ? <small className="block truncate text-[11px] font-normal text-[#8A8AA3]" title={r.desc}>{r.desc}</small> : null}
                      </span>
                    </td>
                    <td className={`${TD} ${bg} whitespace-nowrap`}>{r.metodo}</td>
                    <td className={`${TD} ${bg}`}>{r.bp}</td>
                    <td className={`${TD} ${bg}`}><DueDot d={r.dias} date={r.venc} data-testid="DueDot__bca0e2" /></td>
                    <td className={`${TD} ${bg} ${AMT}`}>{formatAmount(r.total, r.mon)}</td>
                    <td className={`${TD} ${bg} ${AMT}`}>{formatAmount(r.expected, r.mon)}</td>
                    <td className={`${TD} ${bg} ${AMT}`}>{formatAmount(r.pend, r.mon)}</td>
                    <td className={`${TD} ${bg} text-right`}>
                      <MoneyInput
                        className="h-[30px] w-[104px] box-border rounded-md border border-[#D1D4DB] bg-white px-2 text-right text-[13px] font-medium tabular-nums text-[#121217] focus:outline-none focus:border-[#121217] focus:ring-2 focus:ring-[#121217]/20 disabled:cursor-not-allowed disabled:text-[#8A8AA3]"
                        disabled={!on}
                        value={on ? fmtAmount(sel[r.id]) : ''}
                        placeholder="0.00"
                        onChange={(e) => setAmt(r.id, e.target.value)}
                        data-testid="MoneyInput__bca0e2" />
                    </td>
                    <td className={`${TD} ${bg} text-center`}>
                      <button
                        type="button"
                        onClick={() => setWo((w) => ({ ...w, [r.id]: !w[r.id] }))}
                        title={wo[r.id] ? 'Con descuento' : 'Sin descuento'}
                        className={`inline-flex w-[42px] items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${wo[r.id] ? 'border-[#121217] bg-[#121217] text-white' : 'border-[#D1D4DB] bg-white text-[#8A8AA3] hover:border-[#A9A9BC]'}`}
                      >
                        {wo[r.id] ? 'Sí' : 'No'}
                      </button>
                    </td>
                    <td className={`${TD} ${bg} w-10`}>
                      <button
                        type="button"
                        onClick={() => setExp((s) => ({ ...s, [r.id]: !s[r.id] }))}
                        className={`grid h-7 w-7 place-items-center rounded-md text-[#6C6C89] transition-transform hover:bg-[#EDEFF3] hover:text-[#121217] ${op ? 'rotate-90' : ''}`}
                      >
                        <ChevronRight className="h-4 w-4" data-testid="ChevronRight__bca0e2" />
                      </button>
                    </td>
                  </tr>
                  {op ? (
                    <tr>
                      <td colSpan={NCOLS} className="bg-[#F5F7F9] p-0">
                        <div className="grid grid-cols-4 gap-x-6 gap-y-3 px-[18px] pb-4 pt-3.5 pl-14">
                          {[
                            ['Fecha de factura', r.fecha], ['Nº de orden', r.orderNo || '—'],
                          ].map(([k, v]) => (
                            <div className="flex flex-col gap-0.5" key={k}>
                              <span className="text-[11px] font-medium uppercase tracking-[0.03em] text-[#8A8AA3]">{k}</span>
                              <span className="text-[13px] text-[#121217]">{v}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={NCOLS} className="px-3.5 py-[22px] text-center text-[13px] text-[#8A8AA3]">
                  {invoiceEmptyMessage(loading, invoices.length, emptyHint)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Commissions / G/L concepts — mirrors Classic's "GL Items" grid: only three
// columns (G/L Item, Received In, Paid Out) plus delete / add.
const GL_GRID = { gridTemplateColumns: '1fr 150px 150px 34px' };
const GL_AMT = 'h-[34px] w-full box-border rounded-lg border border-[#D1D4DB] bg-white pl-2.5 pr-7 text-right text-[13px] tabular-nums text-[#121217] focus:outline-none focus:border-[#121217] focus:ring-2 focus:ring-[#121217]/20';

function Commissions({ gl, addGl, delGl, setGlField }) {
  if (gl.length === 0) {
    return (
      <button
        type="button"
        onClick={addGl}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[#D1D4DB] bg-[#F5F7F9] px-4 py-3.5 text-left hover:border-[#A9A9BC]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#121217] text-white"><Plus className="h-[18px] w-[18px]" data-testid="Plus__bca0e2" /></span>
        <span className="flex flex-col gap-px">
          <span className="text-sm font-semibold text-[#121217]">Añadir comisiones y conceptos (GL)</span>
          <span className="text-xs text-[#6C6C89]">Opcional · comisiones bancarias y otros conceptos contables</span>
        </span>
      </button>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[#E8EAEF] bg-white">
      <div className="flex items-center gap-3 border-b border-[#E8EAEF] px-3.5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#121217]">
          <Percent className="h-4 w-4" data-testid="Percent__bca0e2" /> Comisiones y conceptos (GL)
          <span className="whitespace-nowrap rounded-full bg-[#121217] px-2 py-0.5 text-[11px] font-semibold text-white">
            {gl.length}
          </span>
        </span>
      </div>
      <div className="grid items-center gap-2.5 border-b border-[#E8EAEF] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6C6C89]" style={GL_GRID}>
        <span>Concepto G/L</span>
        <span className="text-right">Recibido</span>
        <span className="text-right">Pagado</span>
        <span />
      </div>
      {gl.map((g) => (
        <div key={g.id} className="grid items-center gap-2.5 border-b border-[#E8EAEF] px-3.5 py-3 last:border-b-0" style={GL_GRID}>
          <LookupPicker
            value={g.item}
            onChange={(v) => setGlField(g.id, { item: v })}
            useLookup={useGLItemLookup}
            placeholder="Buscar concepto G/L…"
            data-testid="LookupPicker__bca0e2" />
          <div className="relative">
            <MoneyInput
              className={GL_AMT}
              value={fmtAmount(g.receivedIn)}
              onChange={(e) => setGlField(g.id, { receivedIn: parseAmount(e.target.value) })}
              data-testid="MoneyInput__bca0e2" />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8A8AA3]">€</span>
          </div>
          <div className="relative">
            <MoneyInput
              className={GL_AMT}
              value={fmtAmount(g.paidOut)}
              onChange={(e) => setGlField(g.id, { paidOut: parseAmount(e.target.value) })}
              data-testid="MoneyInput__bca0e2" />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8A8AA3]">€</span>
          </div>
          <button type="button" onClick={() => delGl(g.id)} title="Eliminar" className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[#D1D4DB] bg-white text-[#8A8AA3] hover:border-[#FBB1C4] hover:bg-[#FEF0F4] hover:text-[#D50B3E]"><Trash2 className="h-[15px] w-[15px]" data-testid="Trash2__bca0e2" /></button>
        </div>
      ))}
      <button type="button" onClick={addGl} className="m-3.5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#A9A9BC] px-3 py-2 text-[13px] font-semibold text-[#121217] hover:border-[#121217] hover:bg-[#F5F7F9]">
        <Plus className="h-3.5 w-3.5" data-testid="Plus__bca0e2" /> Añadir concepto
      </button>
    </div>
  );
}

export function TotalsBar({ totF, totGL, total, pago, diff, cuadra }) {
  const glSign = totGL < 0 ? '−' : '';
  const diffText = `${diff < 0 ? '−' : ''}${fmtAmount(Math.abs(diff))} €`;
  return (
    <div className="flex items-center gap-0 rounded-xl border border-[#E8EAEF] bg-white px-1.5">
      <span className="flex items-baseline gap-1.5 whitespace-nowrap px-[11px] py-[11px] text-xs text-[#6C6C89]">Facturas <b className="text-[13px] font-semibold tabular-nums text-[#121217]">{fmtAmount(totF)} €</b></span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap px-[11px] py-[11px] text-xs text-[#6C6C89]">Comisiones <b className={`text-[13px] font-semibold tabular-nums ${totGL < 0 ? 'text-[#D50B3E]' : 'text-[#121217]'}`}>{glSign}{fmtAmount(Math.abs(totGL))} €</b></span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap px-[11px] py-[11px] text-xs text-[#6C6C89]">Total <b className="text-[13px] font-semibold tabular-nums text-[#121217]">{fmtAmount(total)} €</b></span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap px-[11px] py-[11px] text-xs text-[#6C6C89]">Pago <b className="text-[13px] font-semibold tabular-nums text-[#121217]">{fmtAmount(pago)} €</b></span>
      <span className={`my-[7px] ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold ${cuadra ? 'border-[#B2EECC] bg-[#EEFBF4] text-[#17663A]' : 'border-[#FBB1C4] bg-[#FEF0F4] text-[#D50B3E]'}`}>
        {cuadra ? '✓ Cuadra' : <>Dif. <span className="tabular-nums">{diffText}</span></>}
      </span>
    </div>
  );
}

/**
 * Generic payment workspace. Single source of truth for the "Agregar pago" UI.
 *
 * @param {{
 *   doc?: 'in' | 'out',                 // Cobro (in) / Pago (out)
 *   initialAmount?: number,             // pre-fills "Importe del pago"
 *   paymentMethods?: Array<{ id, name, payinAllow, payoutAllow, isDefault }>,
 *   account?: { id, label } | null,     // financial account from context
 *   accounts?: Array<{ id, label }>,    // selectable accounts when no context
 *   showAccountField?: boolean,         // render "Ingresar en / Pagar desde"
 *   requireAccount?: boolean,           // required when shown and no account
 *   invoices?: Array<object>,           // outstanding invoices (defaults to sample)
 *   allowCommissions?: boolean,
 *   note?: React.ReactNode,             // contextual note above the form
 *   onChange?: (snapshot) => void,      // emits fields + selection + totals
 * }} props
 */
export function PaymentForm({
  doc = 'in',
  initialAmount = 0,
  initialTercero = null,
  paymentMethods = [],
  account = null,
  accounts = [],
  showAccountField = true,
  requireAccount = false,
  invoices = null,
  allowCommissions = true,
  note = null,
  onChange,
}) {
  const allowedMethods = useMemo(
    () => (paymentMethods || []).filter((m) => (doc === 'in' ? m.payinAllow : m.payoutAllow)),
    [paymentMethods, doc],
  );
  const methodOptions = useMemo(() => allowedMethods.map((m) => ({ id: m.id, name: m.name })), [allowedMethods]);
  const accountOptions = useMemo(() => (accounts || []).map((a) => ({ id: a.id, name: a.label ?? a.name })), [accounts]);

  // Payment fields. `tercero` pre-fills from the movement's contact when present
  // (e.g. the bpartner dimension chosen in the New Movement wizard).
  const [tercero, setTercero] = useState(initialTercero);
  const [metodo, setMetodo] = useState('');
  const [fechaPago, setFechaPago] = useState(todayISO);
  const [referencia, setReferencia] = useState('');
  const [accountId, setAccountId] = useState(account?.id ?? '');
  const [pago, setPago] = useState(initialAmount);

  // Invoice + commission state
  const [sel, setSel] = useState({});
  const [exp, setExp] = useState({});
  const [wo, setWo] = useState({});
  const [gl, setGl] = useState([]);
  const [q, setQ] = useState('');
  const [advFilter, setAdvFilter] = useState(null);
  // What to do with an overpayment (when the payment exceeds the assigned total).
  const [overpayAction, setOverpayAction] = useState('');

  // Outstanding invoices: real data filtered by the selected tercero + direction
  // (cobro → sales invoices, pago → purchase invoices). A non-null `invoices`
  // prop overrides the fetch (used by tests / other embeddings).
  const { invoices: fetched, loading: invoicesLoading } = useOutstandingInvoices(tercero?.id, doc);
  const invoiceRows = invoices ?? fetched;

  // Rows fed to the advanced-filter pickers: the loaded invoices plus a synthetic
  // entry per account payment method, so the "Método de pago" multi-picker always
  // lists the available methods even before any invoice is loaded. Synthetic rows
  // only carry `metodo`, so other columns' option lists are unaffected.
  const filterRows = useMemo(
    () => [...invoiceRows, ...methodOptions.map((m) => ({ metodo: m.name }))],
    [invoiceRows, methodOptions],
  );

  // When the tercero or direction changes, the invoice set changes too: clear
  // any selection / expansion / write-off keyed by the previous invoice ids.
  useEffect(() => { setSel({}); setExp({}); setWo({}); }, [tercero?.id, doc]);

  // Pre-select the default payment method once methods are available.
  useEffect(() => {
    if (metodo) return;
    const def = allowedMethods.find((m) => m.isDefault) ?? allowedMethods[0];
    if (def) setMetodo(def.id);
  }, [allowedMethods, metodo]);

  // Mirror Classic: default the invoice list to the selected payment method by
  // seeding it directly as a condition in the advanced filter ("Método de pago
  // Es <método>"). Re-applies when the method changes, preserving any other
  // conditions the user added; the user can edit/remove it from the filter panel
  // to pay an invoice whose own method differs (the recorded method is this one).
  useEffect(() => {
    const name = methodOptions.find((m) => m.id === metodo)?.name;
    setAdvFilter((prev) => {
      const others = (prev?.conditions || []).filter((c) => c.field !== 'metodo');
      const rowOperator = prev?.rowOperator ?? 'and';
      if (!name) return others.length ? { rowOperator, conditions: others } : null;
      return { rowOperator, conditions: [{ field: 'metodo', operator: 'equals', value: [name] }, ...others] };
    });
  }, [metodo, methodOptions]);

  // Keep "Importe del pago" synced with the inherited amount until the user edits it.
  const pagoTouched = useRef(false);
  useEffect(() => { if (!pagoTouched.current) setPago(initialAmount); }, [initialAmount]);
  const onPagoChange = (e) => { pagoTouched.current = true; setPago(parseAmount(e.target.value)); };

  const totF = useMemo(() => Object.values(sel).reduce((a, b) => a + (Number(b) || 0), 0), [sel]);
  const totGL = useMemo(() => gl.reduce((a, g) => a + (Number(g.receivedIn) || 0) - (Number(g.paidOut) || 0), 0), [gl]);
  const total = totF + totGL;
  const diff = pago - total;
  const cuadra = Math.abs(diff) < 0.005;
  // Overpayment: the payment exceeds what's been assigned to invoices/commissions.
  const overpaid = diff > 0.005;
  const overpayOptions = useMemo(() => [
    { id: 'leave-credit', name: 'Dejar el crédito para usar más adelante' },
    { id: 'refund', name: doc === 'in' ? 'Devolver el importe al cliente' : 'Devolver el importe al proveedor' },
  ], [doc]);

  // Empty-state hint for the invoice table (kept out of the JSX to avoid a
  // nested ternary): scoped to a contact vs. all contacts.
  const partyNoun = doc === 'in' ? 'Este cliente' : 'Este proveedor';
  const invoiceEmptyHint = tercero
    ? `${partyNoun} no tiene facturas pendientes.`
    : 'No hay facturas pendientes.';

  const toggle = (r) => setSel((s) => {
    const n = { ...s };
    if (n[r.id] != null) { delete n[r.id]; return n; }
    // Assign the lesser of the invoice's outstanding amount and the payment
    // still left to allocate: a large invoice grabs only what's left of the
    // payment (e.g. pay 25 over a 1.250 invoice → 25), while a smaller invoice
    // keeps its full outstanding (e.g. 14 → 14). When no payment amount is set
    // yet, or for credit notes (negative outstanding), use the full amount.
    const assigned = Object.values(n).reduce((a, b) => a + (Number(b) || 0), 0);
    const remaining = pago - assigned;
    n[r.id] = (pago > 0 && r.pend > 0) ? Math.max(0, Math.min(r.pend, remaining)) : r.pend;
    return n;
  });
  const setAmt = (id, v) => setSel((s) => ({ ...s, [id]: parseAmount(v) }));
  const addGl = () => setGl((g) => [...g, { id: `g${g.length}_${Date.now() % 100000}`, item: null, receivedIn: 0, paidOut: 0 }]);
  const delGl = (id) => setGl((g) => g.filter((x) => x.id !== id));
  const setGlField = (id, patch) => setGl((g) => g.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // Emit a snapshot whenever the payment changes (for the wrapper's submit/footer).
  useEffect(() => {
    onChange?.({
      tercero,
      paymentMethodId: metodo,
      fechaPago,
      referencia,
      accountId: account?.id ?? accountId,
      selectedInvoices: sel,
      writeoffs: wo,
      commissions: gl,
      overpaymentAction: overpaid ? overpayAction : null,
      totals: { totF, totGL, total, pago, diff, cuadra },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tercero, metodo, fechaPago, referencia, accountId, sel, wo, gl, pago, totF, totGL, total, diff, cuadra, overpaid, overpayAction]);

  return (
    <div className="flex flex-col gap-4">
      {note}
      <PaymentFields
        doc={doc}
        pago={pago}
        onPagoChange={onPagoChange}
        methodOptions={methodOptions}
        metodo={metodo}
        setMetodo={setMetodo}
        tercero={tercero}
        setTercero={setTercero}
        fechaPago={fechaPago}
        setFechaPago={setFechaPago}
        referencia={referencia}
        setReferencia={setReferencia}
        showAccountField={showAccountField}
        account={account}
        accountOptions={accountOptions}
        accountId={accountId}
        setAccountId={setAccountId}
        requireAccount={requireAccount}
        data-testid="PaymentFields__bca0e2" />
      <InvoiceTable
        invoices={invoiceRows}
        loading={invoicesLoading}
        emptyHint={invoiceEmptyHint}
        sel={sel}
        toggle={toggle}
        setAmt={setAmt}
        exp={exp}
        setExp={setExp}
        wo={wo}
        setWo={setWo}
        q={q}
        setQ={setQ}
        advFilter={advFilter}
        setAdvFilter={setAdvFilter}
        filterRows={filterRows}
        data-testid="InvoiceTable__bca0e2" />
      {allowCommissions ? (
        <Commissions
          gl={gl}
          addGl={addGl}
          delGl={delGl}
          setGlField={setGlField}
          data-testid="Commissions__bca0e2" />
      ) : null}
      <TotalsBar
        totF={totF}
        totGL={totGL}
        total={total}
        pago={pago}
        diff={diff}
        cuadra={cuadra}
        data-testid="TotalsBar__bca0e2" />
      {overpaid ? (
        <Select
          label="Acción por sobrepago"
          required
          value={overpayAction}
          onChange={setOverpayAction}
          options={overpayOptions}
          placeholder="¿Qué hacer con el excedente?"
          className="max-w-md"
          data-testid="Select__bca0e2" />
      ) : null}
    </div>
  );
}
