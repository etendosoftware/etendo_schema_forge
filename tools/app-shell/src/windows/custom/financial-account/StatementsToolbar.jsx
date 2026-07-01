import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Plus, RefreshCw, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import { AdvancedFilterButton } from '@/components/contract-ui/AdvancedFilterButton.jsx';
import { DateRangePopover } from '@/components/ui/date-range-popover';
import { StatementStatusFilter } from './StatementStatusFilter';
import { buildStatementFilterColumns } from './statementAdvancedFilter';

/**
 * Split-button: a primary "Importar extracto" action plus a ▾ trigger that
 * opens a small menu with "Crear manualmente". Mirrors the design's
 * SplitImport. Closes on outside click / Escape.
 */
function ImportSplitButton({ ui, onImportClick, onManualClick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        type="button"
        data-testid="statements-import-button"
        onClick={onImportClick}
        className="inline-flex h-10 items-center gap-2 rounded-l-lg bg-[#121217] px-3 text-sm font-medium text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217]"
      >
        <Upload className="h-4 w-4" data-testid="Upload__8a428c" />
        {ui('financeAccountStatementsImport')}
      </button>
      <button
        type="button"
        aria-label={ui('financeAccountStatementsManualMore')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="statements-import-split"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 w-9 items-center justify-center rounded-r-lg border-l border-white/20 bg-[#121217] text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217]"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          data-testid="ChevronDown__8a428c" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-[229px] overflow-hidden rounded-lg border border-[#E8EAEF] bg-white py-2 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="statements-manual-create"
            onClick={() => { setOpen(false); onManualClick(); }}
            className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-[#F5F7F9]"
          >
            <Plus className="h-6 w-6 shrink-0 text-[#828FA3]" data-testid="Plus__8a428c" />
            <span className="text-sm text-[#121217]">
              {ui('financeAccountStatementsManualMenuItem')}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Replaces the import split-button for PSD2-synced accounts: statements come only from Salt Edge,
 * so manual import / manual creation are not offered — instead this single action runs the PSD2
 * statement fetch (the Etendo Go equivalent of Classic's "Get Bank Statement" button).
 */
function SyncStatementsButton({ ui, onClick, syncing }) {
  return (
    <button
      type="button"
      data-testid="statements-psd2-sync-button"
      onClick={onClick}
      disabled={syncing}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#121217] px-3 text-sm font-medium text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RefreshCw
        className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
        data-testid="RefreshCw__8a428c" />
      {ui('financeAccountStatementsPsd2Sync')}
    </button>
  );
}

/**
 * Toolbar for the imported statements tab.
 *
 * @param {{
 *   search: string;
 *   onSearchChange: (v: string) => void;
 *   dateRange: null | { presetId: string } | { from: Date, to: Date };
 *   onDateRangeChange: (v: null | { presetId: string } | { from: Date, to: Date }) => void;
 *   status: string|null;
 *   onStatusChange: (v: string|null) => void;
 *   advancedFilter?: object|null;
 *   onAdvancedFilterChange?: (next: object|null) => void;
 *   rows?: Array<object>;
 *   onImportClick: () => void;
 *   onManualClick: () => void;
 *   psd2Synced?: boolean;
 *   onSyncClick?: () => void;
 *   syncing?: boolean;
 * }} props
 */
export function StatementsToolbar({
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  status,
  onStatusChange,
  advancedFilter,
  onAdvancedFilterChange,
  rows = [],
  onImportClick,
  onManualClick,
  psd2Synced = false,
  onSyncClick,
  syncing = false,
}) {
  const ui = useUI();
  const navigate = useNavigate();
  const columns = useMemo(() => buildStatementFilterColumns(ui), [ui]);

  return (
    <div className="flex h-auto min-h-[52px] flex-wrap items-center gap-2 px-4 py-2">
      {/* Back */}
      <button
        type="button"
        aria-label={ui('financeAccountDetailBack')}
        data-testid="statements-toolbar-back"
        onClick={() => navigate(-1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:bg-[#F5F7F9] hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__8a428c" />
      </button>
      {/* Status filter — first, mirroring the standard list toolbar (e.g. Sales Order). */}
      <StatementStatusFilter
        value={status}
        onChange={onStatusChange}
        data-testid="StatementStatusFilter__8a428c" />
      {/* Date range filter */}
      <DateRangePopover
        value={dateRange}
        onChange={onDateRangeChange}
        placeholder={ui('dateRangeAnyTime')}
        data-testid="DateRangePopover__8a428c" />
      {/* Advanced "by conditions" filter */}
      <AdvancedFilterButton
        columns={columns}
        rows={rows}
        value={advancedFilter}
        onChange={onAdvancedFilterChange}
        testId="statements-advanced-filter"
        data-testid="AdvancedFilterButton__8a428c" />
      {/* Spacer */}
      <div className="flex-1" />
      {/* Search */}
      <div className="relative flex items-center">
        <input
          type="search"
          placeholder={ui('financeAccountStatementsSearch')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="statements-search-input"
          className="h-10 w-48 rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm text-[#121217] placeholder:text-[#8a8aa3] shadow-[0_1px_2px_rgba(18,18,23,0.05)] focus:outline-none focus:ring-2 focus:ring-[#121217] focus:ring-offset-1"
        />
      </div>
      {/* PSD2-synced accounts: a single "sync statements" action (Salt Edge fetch) replaces the
          manual import / manual create split-button. */}
      {psd2Synced ? (
        <SyncStatementsButton
          ui={ui}
          onClick={onSyncClick}
          syncing={syncing}
          data-testid="SyncStatementsButton__8a428c" />
      ) : (
        <ImportSplitButton
          ui={ui}
          onImportClick={onImportClick}
          onManualClick={onManualClick}
          data-testid="ImportSplitButton__8a428c" />
      )}
    </div>
  );
}
