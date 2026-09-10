import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Download, FileText, Loader2, Receipt } from 'lucide-react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusTag } from '@/components/ui/status-tag';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import {
  PORTAL_ERROR,
  fetchInvoicePdfBlob,
  fetchPortalIdentity,
  fetchPortalInvoices,
  resolvePortalBaseUrl,
} from '@/lib/portal/portalApi.js';
import { portalPdfFileName, resolveInvoiceStatus } from '@/lib/portal/portalInvoices.js';
import { saveBlobAsFile } from '@/lib/portal/portalDownload.js';

/**
 * Business Partner self-service portal — read-only MVP (ETP-5267).
 *
 * A customer of the tenant opens the magic link that rode along with their invoice email and
 * reads their own invoice history and outstanding balance. No account, no password, no
 * session: the token in the URL is the entire credential.
 *
 * Three properties of this page follow from that and are not free to change:
 *
 * - **It is public and unconditional.** The route is registered with no feature-flag check,
 *   because the flag (`bp-portal-link`, backend-only) gates whether the *email carries a
 *   link* — it is a rollout control, never an authorization boundary. What protects the data
 *   is the token, enforced server-side. Nothing in the browser evaluates the flag, and no key
 *   for it exists in `flag-keys.js` (plan §2.5).
 * - **It renders no tenant chrome.** Public routes mount outside `ShellLayout`, so the page
 *   owns its own full-page frame the way `InviteAcceptancePage` does.
 * - **Invalid and revoked look identical.** The backend answers the same to both, and the UI
 *   keeps that property: one generic message, no retry offered, nothing to enumerate against
 *   (plan §5.2 / §6). A *transient* failure is a different screen — it says so and offers a
 *   retry — because telling a customer their link is dead when the network blinked would send
 *   them chasing a new link that they do not need.
 *
 * The token is deliberately left in the address bar. The link is meant to be bookmarkable
 * (plan §1/§4.6), and scrubbing it would break the bookmark; what §5.4 forbids is the token
 * appearing in a *query string* on the wire, which is why every request sends it as an
 * `Authorization` header instead — see `lib/portal/portalApi.js`.
 */

/** The four screens this page can be on. */
const VIEW = {
  loading: 'loading',
  ready: 'ready',
  invalid: 'invalid',
  error: 'error',
};

/** Full-page frame shared by every state, so the portal looks like one surface throughout. */
function PortalFrame({ children }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">{children}</div>
    </div>
  );
}

/** Centered notice used by the loading, invalid-link and transient-failure states. */
function PortalNotice({ testId, icon, title, description, children }) {
  return (
    <div
      className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm"
      data-testid={testId}
    >
      {icon}
      <h1 className="mt-5 text-xl font-semibold text-foreground">{title}</h1>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground" data-testid={`${testId}-description`}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

/** Tenant name + greeting. Both names are optional, so the header degrades instead of breaking. */
function PortalHeader({ identity, ui }) {
  const greeting = identity?.businessPartnerName
    ? ui('portalGreeting', { name: identity.businessPartnerName })
    : ui('portalPageTitle');
  const intro = identity?.tenantName
    ? ui('portalIntro', { tenantName: identity.tenantName })
    : ui('portalIntroGeneric');

  return (
    <header className="space-y-1" data-testid="portal-header">
      {identity?.tenantName && (
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground" data-testid="portal-tenant-name">
          {identity.tenantName}
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="portal-greeting">
        {greeting}
      </h1>
      <p className="text-sm text-muted-foreground" data-testid="portal-intro">{intro}</p>
    </header>
  );
}

/** One summary figure. */
function PortalSummaryCard({ testId, title, value, hint }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2" data-testid="CardHeader__3db5f6">
        <CardTitle
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          data-testid="CardTitle__3db5f6">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent data-testid="CardContent__3db5f6">
        <p className="text-2xl font-semibold tabular-nums text-foreground" data-testid={`${testId}-value`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Empty is not an error: a customer with nothing billed yet is a normal, correct state. */
function PortalEmptyState({ ui }) {
  return (
    <div
      className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center"
      data-testid="portal-empty-state"
    >
      <Receipt className="h-8 w-8 text-muted-foreground" data-testid="Receipt__3db5f6" />
      <p className="mt-4 text-base font-medium text-foreground">{ui('portalEmptyTitle')}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{ui('portalEmptyDescription')}</p>
    </div>
  );
}

function PortalInvoiceRow({ invoice, locale, ui, downloading, onDownload }) {
  const status = resolveInvoiceStatus(invoice);
  const documentNo = invoice.documentNo || '—';

  return (
    <TableRow data-testid={`portal-invoice-row-${invoice.id}`}>
      <TableCell className="font-medium" data-testid="portal-invoice-document-no">{documentNo}</TableCell>
      <TableCell className="tabular-nums" data-testid="portal-invoice-date">
        {formatCalendarDate(invoice.invoiceDate, locale)}
      </TableCell>
      <TableCell className="hidden tabular-nums sm:table-cell" data-testid="portal-invoice-due-date">
        {formatCalendarDate(invoice.dueDate, locale)}
      </TableCell>
      <TableCell className="text-right tabular-nums" data-testid="portal-invoice-total">
        {formatCurrency(invoice.currency, invoice.grandTotalAmount)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell" data-testid="portal-invoice-outstanding">
        {formatCurrency(invoice.currency, invoice.outstandingAmount)}
      </TableCell>
      <TableCell data-testid="portal-invoice-status">
        {status && <StatusTag
          tone={status.tone}
          label={ui(status.labelKey)}
          data-testid="StatusTag__3db5f6" />}
      </TableCell>
      <TableCell className="text-right" data-testid="TableCell__3db5f6">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={downloading || !invoice.id}
          onClick={() => onDownload(invoice)}
          aria-label={ui('portalDownloadInvoice', { documentNo })}
          data-testid={`portal-download-${invoice.id}`}
        >
          {downloading
            ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__3db5f6" />
            : <Download className="h-4 w-4" data-testid="Download__3db5f6" />}
          <span className="hidden sm:inline">
            {downloading ? ui('downloading') : ui('download')}
          </span>
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * The invoice list.
 *
 * Wrapped in its own horizontal scroller: due date and outstanding amount already drop out
 * below `sm`, and the remaining columns must never make the page itself scroll sideways.
 */
function PortalInvoiceTable({ invoices, locale, ui, downloadingId, onDownload }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <Table data-testid="portal-invoice-table">
        <TableHeader data-testid="TableHeader__3db5f6">
          <TableRow data-testid="TableRow__3db5f6">
            <TableHead data-testid="TableHead__3db5f6">{ui('documentNo')}</TableHead>
            <TableHead data-testid="TableHead__3db5f6">{ui('invoiceDate')}</TableHead>
            <TableHead className="hidden sm:table-cell" data-testid="TableHead__3db5f6">{ui('dueDate')}</TableHead>
            <TableHead className="text-right" data-testid="TableHead__3db5f6">{ui('total')}</TableHead>
            <TableHead
              className="hidden text-right sm:table-cell"
              data-testid="TableHead__3db5f6">{ui('pendingPaymentColumn')}</TableHead>
            <TableHead data-testid="TableHead__3db5f6">{ui('statusColumn')}</TableHead>
            <TableHead className="text-right" data-testid="TableHead__3db5f6">{ui('download')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody data-testid="TableBody__3db5f6">
          {invoices.map((invoice) => (
            <PortalInvoiceRow
              key={invoice.id || invoice.documentNo}
              invoice={invoice}
              locale={locale}
              ui={ui}
              downloading={downloadingId === invoice.id}
              onDownload={onDownload}
              data-testid="PortalInvoiceRow__3db5f6" />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PortalPage() {
  // The token arrives as a path segment because an email link cannot carry a header.
  const { token = '' } = useParams();
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  // `/sws/portal/*` is its own bounded context, so this is NOT the router's `apiBaseUrl`
  // (which already points at `/sws/neo`). Memoized because `apiFetch` is memoized on it.
  const baseUrl = useMemo(() => resolvePortalBaseUrl(), []);
  const apiFetch = useApiFetch(baseUrl);

  const [view, setView] = useState(VIEW.loading);
  const [identity, setIdentity] = useState(null);
  const [summary, setSummary] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadFailed, setDownloadFailed] = useState(false);

  useEffect(() => {
    const trimmed = token.trim();
    // A truncated or hand-typed link has nothing to validate, and it must look exactly like a
    // revoked one — anything else would tell a probe whether a token shape is worth trying.
    if (!trimmed) {
      setView(VIEW.invalid);
      return undefined;
    }

    let active = true;
    setView(VIEW.loading);
    setDownloadFailed(false);

    // Both calls validate the same token, so they go out together rather than in sequence.
    Promise.all([
      fetchPortalIdentity(apiFetch, trimmed),
      fetchPortalInvoices(apiFetch, trimmed),
    ]).then(([loadedIdentity, loadedSummary]) => {
      if (!active) return;
      setIdentity(loadedIdentity);
      setSummary(loadedSummary);
      setView(VIEW.ready);
    }).catch((error) => {
      if (!active) return;
      setView(error?.code === PORTAL_ERROR.invalidLink ? VIEW.invalid : VIEW.error);
    });

    return () => { active = false; };
  }, [token, apiFetch, attempt]);

  const handleDownload = useCallback(async (invoice) => {
    setDownloadingId(invoice.id);
    setDownloadFailed(false);
    try {
      const blob = await fetchInvoicePdfBlob(apiFetch, token.trim(), invoice.id);
      saveBlobAsFile(blob, portalPdfFileName(invoice));
    } catch (error) {
      // A token that stopped being valid mid-session takes the whole page to the generic
      // screen — the same thing a reload would show. Anything else is one document failing,
      // and the rest of the list stays usable.
      if (error?.code === PORTAL_ERROR.invalidLink) setView(VIEW.invalid);
      else setDownloadFailed(true);
    } finally {
      setDownloadingId(null);
    }
  }, [apiFetch, token]);

  if (view === VIEW.loading) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-loading"
          icon={<Loader2
            className="h-8 w-8 animate-spin text-primary"
            data-testid="Loader2__3db5f6" />}
          title={ui('portalLoading')}
          data-testid="PortalNotice__3db5f6" />
      </PortalFrame>
    );
  }

  // No retry button here, deliberately: there is nothing for the reader to retry, and a
  // retry loop against a token-validating endpoint is exactly what the rate limit is for.
  if (view === VIEW.invalid) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-invalid-link"
          icon={(
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileText className="h-6 w-6" data-testid="FileText__3db5f6" />
            </span>
          )}
          title={ui('portalInvalidLinkTitle')}
          description={ui('portalInvalidLinkDescription')}
          data-testid="PortalNotice__3db5f6" />
      </PortalFrame>
    );
  }

  if (view === VIEW.error) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-load-error"
          icon={(
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" data-testid="AlertCircle__3db5f6" />
            </span>
          )}
          title={ui('portalLoadErrorTitle')}
          description={ui('portalLoadErrorDescription')}
          data-testid="PortalNotice__3db5f6">
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => setAttempt((value) => value + 1)}
            data-testid="portal-retry"
          >
            {ui('retry')}
          </Button>
        </PortalNotice>
      </PortalFrame>
    );
  }

  const invoices = summary?.invoices ?? [];
  const summaryCurrency = summary?.currency || invoices[0]?.currency || null;

  return (
    <PortalFrame data-testid="PortalFrame__3db5f6">
      <PortalHeader identity={identity} ui={ui} data-testid="PortalHeader__3db5f6" />
      <div className="grid gap-4 sm:grid-cols-2">
        <PortalSummaryCard
          testId="portal-outstanding"
          title={ui('portalOutstandingTitle')}
          value={formatCurrency(summaryCurrency, summary?.outstandingAmount)}
          hint={ui('portalOutstandingHint')}
          data-testid="PortalSummaryCard__3db5f6" />
        <PortalSummaryCard
          testId="portal-invoice-count"
          title={ui('portalInvoiceCountTitle')}
          value={String(invoices.length)}
          data-testid="PortalSummaryCard__3db5f6" />
      </div>
      <section className="space-y-3" data-testid="portal-invoices-section">
        <h2 className="text-base font-semibold text-foreground">{ui('portalInvoicesTitle')}</h2>

        {downloadFailed && (
          <div
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="portal-download-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0" data-testid="AlertCircle__3db5f6" />
            <span>{ui('portalDownloadFailed')}</span>
          </div>
        )}

        {invoices.length === 0
          ? <PortalEmptyState ui={ui} data-testid="PortalEmptyState__3db5f6" />
          : (
            <PortalInvoiceTable
              invoices={invoices}
              locale={locale}
              ui={ui}
              downloadingId={downloadingId}
              onDownload={handleDownload}
              data-testid="PortalInvoiceTable__3db5f6" />
          )}
      </section>
    </PortalFrame>
  );
}
