import { Building2, Search, UserPlus } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { extractedCountry, joinMeta, vendorView } from './invoiceInboxReviewModel.js';
import {
  AiChip, FieldError, OptionRow, ReviewField, ReviewTag, SectionTitle,
} from './InvoiceInboxReviewParts.jsx';

const NONE_VALUE = '__none__';
/** `matchedBy` of a linked vendor → `genericLabels` key. */
const MATCHED_BY_KEYS = Object.freeze({
  taxId: 'invoiceInboxReviewVendorLinkedByTaxId',
  name: 'invoiceInboxReviewVendorLinkedByName',
});

/**
 * An inert "coming later" ghost button: `aria-disabled` (not `disabled`) so its title still shows.
 * The actions behind it (change vendor, search an existing one) arrive with S3.
 */
function InertButton({ label, testId, icon = null }) {
  const ui = useUI();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-disabled="true"
      title={ui('invoiceInboxRowActionSoon', { action: label })}
      className="flex-none cursor-not-allowed opacity-60"
      onClick={(event) => event.preventDefault()}
      data-testid={testId}>
      {icon}
      {label}
    </Button>
  );
}

function LinkedVendor({ view }) {
  const ui = useUI();
  const matchedKey = MATCHED_BY_KEYS[view.vendor.matchedBy];
  const meta = joinMeta([view.taxId, view.city]);
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border p-3"
      data-testid="invoice-inbox-review-vendor-linked">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
        <Building2 className="h-[18px] w-[18px]" aria-hidden="true" data-testid="Building2__review-vendor" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" data-testid="invoice-inbox-review-vendor-name">{view.name}</p>
        {meta && (
          <p className="truncate font-mono text-xs text-muted-foreground" data-testid="invoice-inbox-review-vendor-meta">
            {meta}
          </p>
        )}
      </div>
      {matchedKey && (
        <ReviewTag tone="success" label={ui(matchedKey)} testId="invoice-inbox-review-vendor-matched-by" />
      )}
      <InertButton
        label={ui('invoiceInboxReviewVendorChange')}
        testId="invoice-inbox-review-vendor-change" />
    </div>
  );
}

/** A confirmed or discarded document: the vendor as plain text. */
function PlainVendor({ view }) {
  const name = view.name || view.extracted.name || '';
  const taxId = view.taxId || view.extracted.taxId || '';
  return (
    <div data-testid="invoice-inbox-review-vendor-plain">
      <p className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-name">{name}</p>
      {taxId && (
        <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-meta">{taxId}</p>
      )}
    </div>
  );
}

function AmbiguousVendor({ view, missing, readOnly }) {
  const ui = useUI();
  const { extracted, candidates } = view;
  return (
    <div className="flex flex-col gap-2" data-testid="invoice-inbox-review-vendor-ambiguous">
      <div className="flex flex-wrap items-center gap-2">
        <AiChip
          label={candidates.length === 1
            ? ui('invoiceInboxReviewVendorAmbiguousTitleOne')
            : ui('invoiceInboxReviewVendorAmbiguousTitle', { count: candidates.length })}
          testId="invoice-inbox-review-vendor-ambiguous-title" />
        <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-in-document">
          {ui('invoiceInboxReviewVendorInDocument', { name: extracted.name ?? '' })}
          {!String(extracted.taxId ?? '').trim() && ui('invoiceInboxReviewVendorNoTaxId')}
        </span>
      </div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={ui('invoiceInboxReviewSectionVendor')}>
        {candidates.map((candidate, position) => (
          <OptionRow
            key={candidate.id}
            value={candidate.id}
            readOnly={readOnly}
            testId={`invoice-inbox-review-vendor-candidate-${candidate.id}`}
            badge={position === 0
              ? <ReviewTag tone="info" label={ui('invoiceInboxReviewMostLikely')} testId={`invoice-inbox-review-vendor-likely-${candidate.id}`} />
              : null}>
            <span className="block truncate text-sm font-semibold">{candidate.name}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {joinMeta([candidate.taxId, candidate.city])}
            </span>
          </OptionRow>
        ))}
        <OptionRow
          value={NONE_VALUE}
          readOnly={readOnly}
          testId="invoice-inbox-review-vendor-none-option">
          <span className="block text-sm font-medium text-primary">{ui('invoiceInboxReviewVendorCreateNew')}</span>
        </OptionRow>
      </div>
      {missing.has('vendor') && (
        <FieldError testId="invoice-inbox-review-vendor-error">{ui('invoiceInboxReviewVendorPickError')}</FieldError>
      )}
    </div>
  );
}

function NewVendor({ view, missing, readOnly }) {
  const ui = useUI();
  const { extracted } = view;
  const noName = missing.has('vendor') && !String(extracted.name ?? '').trim();
  const country = extractedCountry(extracted) || ui('invoiceInboxReviewCountryDefault');
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-3.5"
      data-testid="invoice-inbox-review-vendor-new">
      <div className="flex items-start gap-2.5">
        <UserPlus className="mt-px h-[18px] w-[18px] flex-none text-primary" aria-hidden="true" data-testid="UserPlus__review-vendor" />
        <p className="min-w-0 flex-1 text-[13px] leading-normal text-muted-foreground [overflow-wrap:anywhere]" data-testid="invoice-inbox-review-vendor-new-hint">
          <b className="font-bold text-foreground" data-testid="invoice-inbox-review-vendor-new-title">
            {ui('invoiceInboxReviewVendorNewTitle')}.
          </b>
          {' '}
          {ui('invoiceInboxReviewVendorNewHint')}
        </p>
        <InertButton
          label={ui('invoiceInboxReviewVendorSearchExisting')}
          testId="invoice-inbox-review-vendor-search-existing"
          icon={<Search className="h-3.5 w-3.5" aria-hidden="true" data-testid="Search__review-vendor" />} />
      </div>
      <ReviewField
        label={ui('invoiceInboxReviewFieldName')}
        value={extracted.name}
        readOnly={readOnly}
        required
        invalid={noName}
        error={noName ? ui('invoiceInboxReviewVendorRequired') : null}
        testId="invoice-inbox-review-vendor-new-name" />
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
        <ReviewField
          label={ui('invoiceInboxReviewFieldTaxId')}
          value={extracted.taxId}
          readOnly={readOnly}
          testId="invoice-inbox-review-vendor-new-taxid" />
        <ReviewField
          label={ui('invoiceInboxReviewFieldAddress')}
          value={extracted.address}
          readOnly={readOnly}
          testId="invoice-inbox-review-vendor-new-address" />
      </div>
      <div className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <ReviewField
          label={ui('invoiceInboxReviewFieldPostalCode')}
          value={extracted.postalCode}
          readOnly={readOnly}
          testId="invoice-inbox-review-vendor-new-postalcode" />
        <ReviewField
          label={ui('invoiceInboxReviewFieldCity')}
          value={extracted.city}
          readOnly={readOnly}
          testId="invoice-inbox-review-vendor-new-city" />
        <ReviewField
          label={ui('invoiceInboxReviewFieldCountry')}
          value={country}
          readOnly={readOnly}
          testId="invoice-inbox-review-vendor-new-country" />
      </div>
    </div>
  );
}

function NoVendor({ missing }) {
  const ui = useUI();
  return (
    <div data-testid="invoice-inbox-review-vendor-none">
      {/* Choosing an Etendo vendor is S3: the field is shown inert until then. */}
      <Input
        readOnly
        aria-disabled="true"
        placeholder={ui('invoiceInboxReviewVendorNoneHint')}
        aria-invalid={missing.has('vendor') || undefined}
        className={missing.has('vendor') ? 'border-destructive' : undefined}
        data-testid="invoice-inbox-review-vendor-none-hint" />
      {missing.has('vendor') && (
        <FieldError testId="invoice-inbox-review-vendor-error">{ui('invoiceInboxReviewVendorRequired')}</FieldError>
      )}
    </div>
  );
}

/**
 * ETP-6050 F5 — the "Proveedor" section, in its four states (`vendor.state`): linked (card with
 * the tag of how it was matched and an inert "Cambiar"), ambiguous (the AI chip, full-row
 * candidates, "Ninguno · crear proveedor nuevo", the error while unresolved), new (block + the
 * extracted data, the address STRUCTURED, country by name with the Spain fallback — decision 8)
 * and none. Read only in S1: candidates are disabled and "Cambiar" / "Buscar existente" are
 * inert. `locked` (confirmed / discarded) shows the vendor as plain text.
 *
 * @param {{document: object, missing: Set<string>, readOnly?: boolean, locked?: boolean}} props
 */
export default function InvoiceInboxReviewVendor({ document, missing, readOnly = true, locked = false }) {
  const ui = useUI();
  const view = vendorView(document);
  return (
    <section className="flex flex-col gap-3" data-testid="invoice-inbox-review-vendor" data-state={view.state}>
      <SectionTitle testId="invoice-inbox-review-vendor-title">{ui('invoiceInboxReviewSectionVendor')}</SectionTitle>
      {locked && <PlainVendor view={view} />}
      {!locked && view.state === 'linked' && <LinkedVendor view={view} />}
      {!locked && view.state === 'ambiguous' && <AmbiguousVendor view={view} missing={missing} readOnly={readOnly} />}
      {!locked && view.state === 'new' && <NewVendor view={view} missing={missing} readOnly={readOnly} />}
      {!locked && view.state === 'none' && <NoVendor missing={missing} />}
    </section>
  );
}
