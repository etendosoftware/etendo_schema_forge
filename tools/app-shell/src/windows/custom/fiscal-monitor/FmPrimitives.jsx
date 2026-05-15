// Shared UI primitives for the Fiscal Monitor.
import { useUI } from '@/i18n';
import { TriangleAlert } from 'lucide-react';
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

const ExtLinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

export const NumFactura = ({ n, onOpen }) => {
  const ui = useUI();
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); onOpen && onOpen(n); }}
      title={ui('fiscalMonitor.openInvoice')}
    >
      {n}<ExtLinkIcon />
    </a>
  );
};

const ChevLeft  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>;
const ChevRight = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>;

export const Pager = ({ total, page = 1, pageSize = 20, onPage }) => {
  const ui = useUI();
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = [];
  for (let i = 1; i <= Math.min(totalPages, 5); i++) pages.push(i);

  return (
    <div className="fm-pager">
      <div className="l">
        {ui('fiscalMonitor.pager.showing')}{' '}
        <span className="pgstrong">{start}–{end}</span>{' '}
        {ui('fiscalMonitor.pager.of')} <span className="pgstrong">{total.toLocaleString('de-DE')}</span> {ui('fiscalMonitor.pager.records')}
      </div>
      <div className="r">
        <button className="pgbtn" disabled={page <= 1} onClick={() => onPage?.(page - 1)}>
          <ChevLeft />
        </button>
        {pages.map(p => (
          <button
            key={p}
            className={`pgnum${p === page ? ' active' : ''}`}
            onClick={() => onPage?.(p)}
          >
            {p}
          </button>
        ))}
        {totalPages > 5 && <span className="pgnum" style={{ cursor: 'default' }}>…</span>}
        {totalPages > 5 && (
          <button className="pgnum" onClick={() => onPage?.(totalPages)}>{totalPages}</button>
        )}
        <button className="pgbtn" disabled={page >= totalPages} onClick={() => onPage?.(page + 1)}>
          <ChevRight />
        </button>
      </div>
    </div>
  );
};

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

export const WipBadge = () => {
  const ui = useUI();
  return (
    <div className="absolute top-3 right-4 z-10">
      <TooltipProvider delayDuration={600}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 cursor-default select-none">
              <TriangleAlert size={12} strokeWidth={2} /> {ui('fiscal.wip.badge')}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[260px] text-center">
            {ui('fiscal.wip.tooltip')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
