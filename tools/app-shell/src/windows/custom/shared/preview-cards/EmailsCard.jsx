import { useEffect, useMemo, useState } from 'react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { StatusTag } from '@/components/ui/status-tag';
import { resolveNeoBaseUrl } from '@/components/contract-ui/documentEmailSend.js';

import { useApiFetch } from '@/auth/useApiFetch.js';

/**
 * ETP-5069 — the document's real email history.
 *
 * This card used to be a static empty state: it always claimed "no emails sent yet",
 * even right after a send had succeeded. It now reads the server-side history through
 * `GET {neoBase}/documentemailhistory?recordId=<documentId>`, whose payload is
 * `{ result: "<JSON string>" }` on success and `{ error: "<message>" }` on failure —
 * note that `result` is a STRING that has to be parsed, not a nested array.
 *
 * The empty state (`previewCardNoEmailHistory`) is kept for the genuinely-empty case
 * only; a transport or backend error gets its own copy, so "nothing was ever sent" and
 * "we could not find out" never look the same again.
 *
 * The send link is unchanged on purpose: `onSend` is fail-closed (ETP-4717/ETP-4372) —
 * when the caller withholds it, because the document is not in a sendable status, the
 * card must expose NO clickable send trigger at all.
 */

// A send is only "successful" for these two. Everything else is a failure and must never
// be presented as sent. Mirrors the module's status enum — there is no DELIVERY_FAILED.
const SUCCESS_STATUSES = new Set(['SENT', 'DUPLICATE']);

const STATUS_LABEL_KEYS = {
  SENT: 'emailHistoryStatusSent',
  DUPLICATE: 'emailHistoryStatusDuplicate',
  PROVIDER_FAILED: 'emailHistoryStatusProviderFailed',
  THROTTLED: 'emailHistoryStatusThrottled',
  SUPPRESSED: 'emailHistoryStatusSuppressed',
  NO_RECIPIENT: 'emailHistoryStatusNoRecipient',
  UNAUTHORIZED: 'emailHistoryStatusUnauthorized',
  VALIDATION_FAILED: 'emailHistoryStatusValidationFailed',
};

function SectionCard({ title, titleRight, children }) {
  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        {titleRight}
      </div>
      <div className="bg-card rounded-xl border border-border-subtle overflow-hidden px-4 py-2">
        {children}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex justify-between items-center py-2">
      <div className="h-3.5 w-32 bg-muted rounded animate-pulse" />
      <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
    </div>
  );
}

/**
 * Reads the history array out of the endpoint payload.
 *
 * Tolerant by design: the card degrades to its empty state on anything unexpected
 * (an `error` payload, an unparseable `result`, a non-array value) rather than
 * breaking the whole preview panel.
 *
 * @param {unknown} payload the parsed JSON body
 * @returns {Array<Record<string, unknown>>} history rows, newest first
 */
export function parseEmailHistory(payload) {
  if (!payload || typeof payload !== 'object' || payload.error) return [];
  const raw = payload.result;
  let rows = raw;
  if (typeof raw === 'string') {
    try {
      rows = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(row => row && typeof row === 'object')
    .sort((a, b) => sentAtMillis(b) - sentAtMillis(a));
}

// `sentAt` is a full timestamp instant (not a calendar date), so comparing the raw
// instants is timezone-independent and the lib/dateOnly.js helpers do not apply here.
function sentAtMillis(row) {
  const millis = new Date(row?.sentAt ?? 0).getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

function isSuccess(row) {
  return SUCCESS_STATUSES.has(String(row?.status ?? ''));
}

function statusTone(row) {
  return isSuccess(row) ? 'success' : 'destructive';
}

function statusText(row, ui) {
  const status = String(row?.status ?? '');
  const key = STATUS_LABEL_KEYS[status];
  return key ? ui(key) : status;
}

/** Recipients arrive either as an array or as a single comma/semicolon-separated string. */
function recipientList(value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;]/).map(v => v.trim()).filter(Boolean);
  return [];
}

/**
 * The sender's display name. The endpoint's field name for it is not pinned down by the
 * contract, so every plausible spelling is accepted and the first non-empty one wins.
 */
function senderName(row) {
  return row?.sentBy ?? row?.sender ?? row?.senderName ?? row?.createdByName ?? row?.userName ?? null;
}

function formatSentAt(raw, localeTag, ui) {
  if (!raw) return ui('emailHistoryUnknownDate');
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString(localeTag, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function DetailLine({ label, children }) {
  return (
    <div className="flex gap-2 text-xs leading-5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground break-words min-w-0">{children}</span>
    </div>
  );
}

function EmailRowDetails({ row, ui }) {
  const cc = recipientList(row.recipientsCc);
  const sender = senderName(row);
  return (
    <div className="pb-2 pl-1 pr-1 flex flex-col gap-1">
      {cc.length > 0 && <DetailLine label={ui('emailHistoryCc')} data-testid="DetailLine__cc">{cc.join(', ')}</DetailLine>}
      {sender && <DetailLine label={ui('emailHistorySentBy')} data-testid="DetailLine__sender">{String(sender)}</DetailLine>}
      {row.messageBody && (
        <DetailLine label={ui('emailHistoryMessage')} data-testid="DetailLine__body">
          <span className="whitespace-pre-wrap">{String(row.messageBody)}</span>
        </DetailLine>
      )}
      {!isSuccess(row) && row.errorMessage && (
        <DetailLine label={ui('emailHistoryError')} data-testid="DetailLine__error">
          <span className="text-[hsl(var(--destructive))]">{String(row.errorMessage)}</span>
        </DetailLine>
      )}
      {row.downloadLink && (
        <a
          href={String(row.downloadLink)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-foreground underline decoration-gray-600 hover:decoration-gray-900 transition-colors self-start mt-1"
        >
          {ui('emailHistoryDownload')}
        </a>
      )}
    </div>
  );
}

function EmailRow({ row, ui, localeTag, expanded, onToggle }) {
  const to = recipientList(row.recipientsTo);
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={ui('emailHistoryToggleDetails')}
        className="w-full text-left py-2 hover:bg-muted rounded -mx-1 px-1 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {formatSentAt(row.sentAt, localeTag, ui)}
          </span>
          <StatusTag
            status={String(row.status ?? '')}
            tone={statusTone(row)}
            label={statusText(row, ui)}
            data-testid="StatusTag__emails" />
        </div>
        <div className="flex items-baseline gap-2 min-w-0 mt-0.5">
          <span className="text-xs text-muted-foreground shrink-0">{ui('emailHistoryTo')}</span>
          <span className="text-sm font-medium text-foreground truncate">
            {to.length > 0 ? to.join(', ') : ui('emailHistoryNoRecipients')}
          </span>
        </div>
        {row.subject && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{String(row.subject)}</div>
        )}
      </button>
      {expanded && <EmailRowDetails row={row} ui={ui} data-testid="EmailRowDetails__emails" />}
    </div>
  );
}

export default function EmailsCard({ onSend, documentId, apiBaseUrl, refreshSignal }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const localeTag = useMemo(() => (locale || 'es_ES').replace('_', '-'), [locale]);

  useEffect(() => {
    if (!documentId) {
      setRows([]);
      setFailed(false);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const url = `${resolveNeoBaseUrl(apiBaseUrl)}/documentemailhistory?recordId=${encodeURIComponent(documentId)}`;
    apiFetch(url, { baseUrl: '' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`Email history failed (${res.status})`))))
      .then(payload => {
        if (cancelled) return;
        if (payload?.error) {
          setRows([]);
          setFailed(true);
          return;
        }
        setRows(parseEmailHistory(payload));
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [documentId, apiBaseUrl, apiFetch, refreshSignal]);

  return (
    <SectionCard
      title={ui('previewCardEmails')}
      titleRight={
        onSend && (
          <button
            onClick={onSend}
            className="text-xs font-medium text-foreground underline decoration-gray-600 hover:decoration-gray-900 transition-colors"
          >
            {ui('previewCardSendEmail')}
          </button>
        )
      }
      data-testid="SectionCard__d50c04">
      {loading && (
        <>
          <SkeletonRow data-testid="SkeletonRow__d50c04" />
          <SkeletonRow data-testid="SkeletonRow__d50c04" />
        </>
      )}
      {!loading && failed && (
        <p className="text-xs text-muted-foreground py-2 text-center">{ui('previewCardEmailHistoryError')}</p>
      )}
      {!loading && !failed && rows.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">{ui('previewCardNoEmailHistory')}</p>
      )}
      {!loading && !failed && rows.map((row, index) => {
        const rowKey = row.id != null ? String(row.id) : `${row.sentAt ?? 'row'}-${index}`;
        return (
          <EmailRow
            key={rowKey}
            row={row}
            ui={ui}
            localeTag={localeTag}
            expanded={expandedId === rowKey}
            onToggle={() => setExpandedId(current => (current === rowKey ? null : rowKey))}
            data-testid="EmailRow__d50c04" />
        );
      })}
    </SectionCard>
  );
}
