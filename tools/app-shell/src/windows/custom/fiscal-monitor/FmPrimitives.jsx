// Shared UI primitives for the Fiscal Monitor.
import { useState, useRef, useEffect } from 'react';
import { useUI } from '@/i18n';
import { TriangleAlert, ArrowUpRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ERROR_STATUSES = new Set([
  'IN', 'EE', 'AE',                            // SII
  'Rechazado', 'Error',                         // TBAI
  'rejected', 'invalid', 'partiallyAccepted',   // Verifactu
]);
export const isErrorStatus = (estado) => ERROR_STATUSES.has(estado);

export const PENDING_STATUSES = new Set([
  'PE',        // SII
  'Pendiente', // TBAI
]);
export const isPendingStatus = (estado) => PENDING_STATUSES.has(estado);

const STATUS_CONFIG = {
  // SII — API returns 2-letter codes from AD_Ref_List
  CO: { cls: 'success', labelKey: 'fiscalMonitor.status.sii.CO' },
  AE: { cls: 'warn',    labelKey: 'fiscalMonitor.status.sii.AE' },
  IN: { cls: 'danger',  labelKey: 'fiscalMonitor.status.sii.IN' },
  PE: { cls: 'pending', labelKey: 'fiscalMonitor.status.sii.PE' },
  EE: { cls: 'danger',  labelKey: 'fiscalMonitor.status.sii.EE' },
  AN: { cls: 'neutral', labelKey: 'fiscalMonitor.status.sii.AN' },
  BA: { cls: 'neutral', labelKey: 'fiscalMonitor.status.sii.BA' },
  NR: { cls: 'neutral', labelKey: 'fiscalMonitor.status.sii.NR' },
  // TBAI — reuse existing tbai.status.* keys
  Recibido:           { cls: 'success', labelKey: 'fiscalMonitor.tbai.status.Recibido' },
  Rechazado:          { cls: 'danger',  labelKey: 'fiscalMonitor.tbai.status.Rechazado' },
  Error:              { cls: 'danger',  labelKey: 'fiscalMonitor.tbai.status.Error' },
  Pendiente:          { cls: 'pending', labelKey: 'fiscalMonitor.tbai.status.Pendiente' },
  // Verifactu
  accepted:           { cls: 'success', labelKey: 'fiscalMonitor.status.vf.accepted' },
  partiallyAccepted:  { cls: 'warn',    labelKey: 'fiscalMonitor.status.vf.partiallyAccepted' },
  rejected:           { cls: 'danger',  labelKey: 'fiscalMonitor.status.vf.rejected' },
  invalid:            { cls: 'danger',  labelKey: 'fiscalMonitor.status.vf.invalid' },
};

export const StatusPill = ({ estado, onClick, title: titleProp }) => {
  const ui = useUI();
  const cfg = STATUS_CONFIG[estado];
  const cls  = cfg?.cls  ?? 'pending';
  const text = cfg ? ui(cfg.labelKey) : (estado ?? '—');
  if (onClick) {
    return (
      <button
        type="button"
        className={`fm-pill ${cls}`}
        data-testid="status-pill"
        data-status={cls}
        onClick={onClick}
        title={titleProp ?? ui('fiscalMonitor.viewContact')}
      >
        {text}
      </button>
    );
  }
  return <span className={`fm-pill ${cls}`} data-testid="status-pill" data-status={cls}>{text}</span>;
};

export const NumFactura = ({ n, onOpen }) => {
  const ui = useUI();
  return (
    <a
      href="#"
      className="fm-num-factura-link"
      onClick={(e) => { e.preventDefault(); onOpen && onOpen(n); }}
      title={ui('fiscalMonitor.openInvoice')}
    >
      {n}
      <ArrowUpRight
        size={14}
        strokeWidth={2}
        className="fm-num-factura-arrow"
        data-testid="ArrowUpRight__29f91c" />
    </a>
  );
};

/**
 * Invisible sentinel element — when it enters the viewport the parent should
 * load the next page. Matches the infinite-scroll pattern used by ListView.jsx.
 */
export const ScrollSentinel = ({ onVisible, hasMore, loading }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onVisible?.(); },
      { rootMargin: '200px' }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [hasMore, loading, onVisible]);
  return <div ref={ref} style={{ height: 1 }} />;
};

/** @deprecated use ScrollSentinel instead */
export const Pager = () => null;

export const RowActionBtn = ({ onClick, title }) => (
  <button className="fm-icon-btn row-action" onClick={onClick} title={title}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  </button>
);

export const PAGE_SIZE = 20;

export { fmtDate } from './fmtDateUtils.js';

export const ExportIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

/**
 * Shared selection state for fiscal monitor tables.
 * Returns selectedIds, stable setter, computed allSelected/someSelected, and toggle handlers.
 */
export function useFmSelection(rows) {
  const [selectedIds, setSelectedIds] = useState(new Set());

  const allSelected  = rows.length > 0 && rows.every(r => selectedIds.has(r.id));
  const someSelected = rows.some(r => selectedIds.has(r.id)) && !allSelected;

  function handleToggleAll() {
    setSelectedIds(prev =>
      rows.every(r => prev.has(r.id)) ? new Set() : new Set(rows.map(r => r.id))
    );
  }
  function handleToggleRow(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return { selectedIds, setSelectedIds, allSelected, someSelected, handleToggleAll, handleToggleRow };
}

/**
 * Fetches ALL rows from a NEO list endpoint (no pagination) via the section's
 * own apiFetch, then builds and downloads a CSV client-side using columnDefs.
 * columnDefs: Array<{ label: string, get: (row) => string }>
 */
export async function fetchCsvAndDownload(apiFetch, path, params, filename, columnDefs) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.append(k, v);
  });
  const res = await apiFetch(`${path}?${search}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const rows = json?.response?.data ?? [];
  buildCsvAndDownload(filename, columnDefs, rows);
}

/**
 * Builds a CSV from columnDefs + rows and triggers a browser file download.
 * Adds a UTF-8 BOM so Excel opens it correctly without encoding issues.
 */
export function buildCsvAndDownload(filename, columnDefs, rows) {
  const header = columnDefs.map(c => `"${c.label}"`).join(',');
  const body = rows.map(row =>
    columnDefs.map(c => {
      const val = c.get(row) ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = '﻿' + [header, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const WipBadge = ({ inline = false }) => {
  const ui = useUI();
  return (
    <div className={inline ? '' : 'absolute top-3 right-4 z-10'}>
      <TooltipProvider delayDuration={600} data-testid="TooltipProvider__29f91c">
        <Tooltip data-testid="Tooltip__29f91c">
          <TooltipTrigger asChild data-testid="TooltipTrigger__29f91c">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 cursor-default select-none">
              <TriangleAlert size={12} strokeWidth={2} data-testid="TriangleAlert__29f91c" /> {ui('fiscal.wip.badge')}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-[260px] text-center"
            data-testid="TooltipContent__29f91c">
            {ui('fiscal.wip.tooltip')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
