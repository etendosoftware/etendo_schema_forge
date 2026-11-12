import { ChevronRight, FileText } from 'lucide-react';
import { useUI } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { PORTAL_DOCUMENT_KINDS } from '@/lib/portal/portalApi.js';
import { PORTAL_KIND_ICONS } from './PortalShell.jsx';
import {
  PortalDate, PortalDocumentStatus, PortalMoney, PortalPaymentStatus, PortalSection,
  usePortalLocale,
} from './PortalBits.jsx';
import { PORTAL_KIND_META, documentLabelKey } from './portalPresentation.js';

const HIGHLIGHT = Object.freeze({
  awaitingAnswer: { labelKey: 'portalHighlightAwaitingAnswer', tone: 'info' },
  overdue: { labelKey: 'portalHighlightOverdue', tone: 'destructive' },
  thisMonth: { labelKey: 'portalHighlightThisMonth', tone: 'neutral' },
});

/**
 * "Inicio" (design Main / Movil-Inicio): the pending balance, one tile per document kind and the
 * newest documents — all from `GET /sws/portal/home`, aggregated server-side.
 */
export default function PortalHomeView({ identity, home, onNavigate }) {
  const ui = useUI();
  const balances = home?.balances ?? [];
  const tiles = home?.tiles ?? {};
  const recent = home?.recent ?? [];

  return (
    <div className="flex flex-col gap-3" data-testid="portal-home">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent-highlight))] text-[hsl(var(--accent-highlight-foreground))]">
          <FileText className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col">
          {identity?.businessPartnerName ? (
            <span className="text-xs leading-4" data-testid="portal-greeting">
              {ui('portalGreeting', { name: identity.businessPartnerName })}
            </span>
          ) : null}
          <h2 className="text-lg font-semibold leading-7">
            {identity?.tenantName
              ? ui('portalHomeHeadline', { tenantName: identity.tenantName })
              : ui('portalHomeHeadlineGeneric')}
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <PortalSection title={ui('portalBalanceTitle')} className="lg:order-2 lg:basis-1/3" testId="portal-balance">
          <PendingBalance balances={balances} onNavigate={onNavigate} />
        </PortalSection>

        <PortalSection title={ui('portalAttentionTitle')} className="lg:order-1 lg:basis-2/3" testId="portal-tiles">
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            {PORTAL_DOCUMENT_KINDS.map((kind) => (
              <KindTile
                key={kind}
                kind={kind}
                tile={tiles[kind]}
                onClick={() => onNavigate({ view: 'list', kind })}
              />
            ))}
          </div>
        </PortalSection>
      </div>

      <PortalSection title={ui('portalRecentDocuments')} testId="portal-recent">
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{ui('portalNoDocumentsYet')}</p>
        ) : (
          <ul className="py-1.5">
            {recent.map((document) => (
              <li key={`${document.kind}:${document.id}`}>
                <button
                  type="button"
                  onClick={() => onNavigate({ view: 'doc', kind: document.kind, id: document.id })}
                  className="flex w-full flex-wrap items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-muted"
                  data-testid="portal-recent-document"
                >
                  <span className="min-w-0 flex-1">
                    {ui(documentLabelKey(document))}{' '}
                    <span className="text-muted-foreground">{document.documentNo}</span>
                  </span>
                  <span className="text-xs text-muted-foreground"><PortalDate value={document.date} /></span>
                  {document.kind === 'INVOICE'
                    ? <PortalPaymentStatus document={document} />
                    : <PortalDocumentStatus status={document.documentStatus} />}
                  <PortalMoney
                    currency={document.currency}
                    value={document.grandTotal}
                    className="min-w-16 text-right tabular-nums"
                  />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>
    </div>
  );
}

/** The design's "Tu saldo" / "Pendiente de pago" block, per currency. */
function PendingBalance({ balances, onNavigate }) {
  const ui = useUI();
  const bcpLocale = usePortalLocale();
  if (!balances.length) {
    return (
      <p className="p-3.5 text-sm text-muted-foreground" data-testid="portal-balance-empty">
        {ui('portalNothingPending')}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3.5 p-3.5">
      {balances.map((balance) => (
        <div key={balance.currency || 'none'} className="flex flex-col gap-1.5" data-testid="portal-balance-currency">
          <span className="flex items-center gap-1.5 font-medium">
            {ui('portalPendingPayment')}
            <StatusTag tone="neutral" label={String(balance.pendingCount)} />
          </span>
          <span className="text-lg font-medium tabular-nums" data-testid="portal-balance-outstanding">
            {formatCurrency(balance.currency, balance.outstanding)}
          </span>
          {balance.overdue > 0 ? (
            <span className="text-xs text-destructive" data-testid="portal-balance-overdue">
              {ui('portalOverdueSince', {
                amount: formatCurrency(balance.currency, balance.overdue),
                date: formatCalendarDate(balance.overdueSince, bcpLocale),
              })}
            </span>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onNavigate({ view: 'list', kind: 'INVOICE' })}
        className="self-start text-sm font-medium text-primary hover:underline"
        data-testid="portal-view-pending-invoices"
      >
        {ui('portalViewPendingInvoices')}
      </button>
    </div>
  );
}

/** One kind's tile: its documents, and the one figure the kind calls out. */
function KindTile({ kind, tile, onClick }) {
  const ui = useUI();
  const Icon = PORTAL_KIND_ICONS[kind];
  const highlight = tile?.highlight ? HIGHLIGHT[tile.highlight.code] : null;
  const shown = highlight && tile.highlight.count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg border border-border p-3 text-left hover:border-primary"
      data-testid={`portal-tile-${kind.toLowerCase()}`}
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {ui(PORTAL_KIND_META[kind].pluralKey)}
      </span>
      <span className="text-4xl font-medium leading-none tabular-nums" data-testid="portal-tile-count">
        {shown ? tile.highlight.count : (tile?.count ?? 0)}
      </span>
      {shown ? (
        <StatusTag tone={highlight.tone} label={ui(highlight.labelKey)} />
      ) : (
        <span className="text-xs text-muted-foreground">{ui('portalTileTotal')}</span>
      )}
    </button>
  );
}
