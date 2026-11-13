import { useState } from 'react';
import {
  CircleAlert, ChevronDown, ChevronUp, Package, PackagePlus, Plus, Search, Trash2,
} from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency.js';
import {
  hasMissingTax, joinMeta, lineAmount, lineKey, lineRate, missingSet, productView,
  unresolvedProductCount,
} from './invoiceInboxReviewModel.js';
import { AiChip, FieldError, OptionRow, ReviewTag, SectionTitle } from './InvoiceInboxReviewParts.jsx';

const NONE_VALUE = '__none__';
/** Description | Cant. | Precio | IVA | Importe | action — the design's column widths. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_62px_84px_78px_86px_34px] items-center gap-1';
const CELL = 'h-[34px] px-2 text-[13px]';
const MAX_QUANTITY_DECIMALS = 4;
const MAX_PRICE_DECIMALS = 4;
const MAX_RATE_DECIMALS = 2;
/** `product.matchedBy` of a linked product → `genericLabels` key (decision 2: no "saved equivalence"). */
const PRODUCT_MATCHED_BY_KEYS = Object.freeze({
  exact: 'invoiceInboxReviewProductMatchExact',
  similarity: 'invoiceInboxReviewProductMatchSimilarity',
});

function rateText(line) {
  const rate = lineRate(line);
  return rate == null ? '' : `${formatGroupedNumber(rate, { maximumFractionDigits: MAX_RATE_DECIMALS })}%`;
}

/** The expandable panel under a product chip: candidates, "none · create new", link to an existing one. */
function ProductPanel({ line, position, readOnly, state }) {
  const ui = useUI();
  const candidates = Array.isArray(line.product?.candidates) ? line.product.candidates : [];
  return (
    <div
      className="my-1 flex flex-col gap-2.5 rounded-[10px] border border-border bg-muted/50 p-3"
      data-testid={`invoice-inbox-review-line-${position}-panel`}>
      {candidates.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid={`invoice-inbox-review-line-${position}-candidates`}>
          <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid={`invoice-inbox-review-line-${position}-in-document`}>
            {ui('invoiceInboxReviewProductInDocument', { description: line.description ?? '' })}
          </span>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={ui('invoiceInboxReviewColDescription')}>
            {candidates.map((candidate, index) => (
              <OptionRow
                key={candidate.id}
                compact
                value={candidate.id}
                readOnly={readOnly}
                testId={`invoice-inbox-review-line-${position}-candidate-${candidate.id}`}
                badge={index === 0
                  ? <ReviewTag
                  tone="info"
                  label={ui('invoiceInboxReviewMostLikely')}
                  testId={`invoice-inbox-review-line-${position}-likely`}
                  data-testid="ReviewTag__21702d" />
                  : null}
                data-testid="OptionRow__21702d">
                <span className="block truncate text-[13px] font-semibold">{candidate.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {joinMeta([candidate.searchKey, candidate.category, candidate.uom])}
                </span>
              </OptionRow>
            ))}
            <OptionRow
              compact
              value={NONE_VALUE}
              readOnly={readOnly}
              testId={`invoice-inbox-review-line-${position}-none-option`}
              data-testid="OptionRow__21702d">
              <span className="block text-[13px] font-medium text-primary">{ui('invoiceInboxReviewProductCreateNew')}</span>
            </OptionRow>
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-sm font-medium">
          {ui(state === 'ok' ? 'invoiceInboxReviewProductChange' : 'invoiceInboxReviewProductLinkExisting')}
        </p>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
            data-testid={`Search__review-line-${position}`} />
          {/* Searching the catalogue is S3: inert until then. */}
          <Input
            readOnly
            aria-disabled="true"
            placeholder={ui('invoiceInboxReviewProductSearchPlaceholder')}
            className="pl-8"
            data-testid={`invoice-inbox-review-line-${position}-search`} />
        </div>
      </div>
    </div>
  );
}

/** The chip body per state: linked, ambiguous (pick), new, none. */
function ChipBody({ line, state, position }) {
  const ui = useUI();
  const product = line.product ?? {};
  if (state === 'ok') {
    const details = product.details ?? {};
    const matchedKey = PRODUCT_MATCHED_BY_KEYS[product.matchedBy];
    return (
      <>
        <Package className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" data-testid={`Package__review-line-${position}`} />
        <span className="min-w-0 truncate text-xs font-medium" data-testid={`invoice-inbox-review-line-${position}-product-name`}>{details.name}</span>
        {details.searchKey && <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{details.searchKey}</span>}
        {matchedKey && <span className="whitespace-nowrap text-[11px] text-muted-foreground">· {ui(matchedKey)}</span>}
      </>
    );
  }
  if (state === 'pick') {
    const count = Array.isArray(product.candidates) ? product.candidates.length : 0;
    return (
      <>
        <AiChip
          label={count === 1
            ? ui('invoiceInboxReviewProductAmbiguousTagOne')
            : ui('invoiceInboxReviewProductAmbiguousTag', { count })}
          testId={`invoice-inbox-review-line-${position}-product-tag`}
          data-testid="AiChip__21702d" />
        <span className="text-xs font-medium text-status-warning-foreground">{ui('invoiceInboxReviewProductPickOne')}</span>
      </>
    );
  }
  if (state === 'new') {
    const fresh = product.new ?? product.details ?? {};
    return (
      <>
        <ReviewTag
          tone="info"
          label={ui('invoiceInboxReviewProductNewTag')}
          icon={PackagePlus}
          testId={`invoice-inbox-review-line-${position}-product-tag`}
          data-testid="ReviewTag__21702d" />
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {joinMeta([fresh.category, fresh.uom, ui('invoiceInboxReviewProductWillCreate')])}
        </span>
      </>
    );
  }
  return (
    <>
      <CircleAlert className="h-3.5 w-3.5 flex-none text-destructive" aria-hidden="true" data-testid={`CircleAlert__review-line-${position}`} />
      <span className="text-xs font-medium text-destructive">{ui('invoiceInboxReviewProductNone')}</span>
    </>
  );
}

/** The product chip as a button that toggles its panel (chevron at the right). */
function ProductChip({ line, position, state, open, onToggle }) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex min-h-[30px] w-full items-center gap-2 rounded-lg px-2 py-[3px] text-left hover:bg-muted ${open ? 'bg-muted' : ''}`}
      data-testid={`invoice-inbox-review-line-${position}-product`}
      data-state={state}>
      <ChipBody line={line} state={state} position={position} data-testid="ChipBody__review" />
      <span className="flex-1" />
      <Chevron className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" data-testid={`Chevron__review-line-${position}`} />
    </button>
  );
}

/**
 * The delete affordance of a line (decision 5), the `DataTable` row-delete pattern: `Trash2`,
 * destructive colour, visible on row hover and on keyboard focus, `deleteRowTooltip` label. Inert
 * in S1 (`aria-disabled`): removing a line is S2.
 */
function DeleteLineButton({ position }) {
  const ui = useUI();
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={ui('deleteRowTooltip')}
      title={ui('deleteRowTooltip')}
      onClick={(event) => event.preventDefault()}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--destructive))] opacity-0 transition-all hover:bg-[var(--status-destructive-bg)] focus-visible:opacity-100 group-hover/line:opacity-100"
      data-testid={`invoice-inbox-review-line-delete-${position}`}>
      <Trash2 className="h-4 w-4" aria-hidden="true" data-testid={`Trash2__review-line-${position}`} />
    </button>
  );
}

function LineRow({ line, position, currency, missing, readOnly, showActions, open, onToggle }) {
  const ui = useUI();
  const key = lineKey(line, position);
  const missingTax = missing.has(`line[${key}].tax`) || lineRate(line) == null;
  const state = productView(line);
  // The full formatted values also go in `title`: the design's narrow cells can clip a long number.
  const quantityText = formatGroupedNumber(line.quantity, { maximumFractionDigits: MAX_QUANTITY_DECIMALS });
  const priceText = formatCurrency(currency, line.unitPrice ?? 0, { maximumFractionDigits: MAX_PRICE_DECIMALS });
  const taxText = missingTax ? '—' : rateText(line);
  const amountText = formatCurrency(currency, lineAmount(line));
  return (
    <li
      className="group/line border-b border-border pb-2 pt-2 first:pt-2"
      data-testid={`invoice-inbox-review-line-${position}`}>
      <div className={GRID}>
        <Input
          readOnly={readOnly}
          value={line.description ?? ''}
          title={line.description ?? ''}
          className={CELL}
          aria-label={ui('invoiceInboxReviewColDescription')}
          data-testid={`invoice-inbox-review-line-${position}-description`} />
        <Input
          readOnly={readOnly}
          value={quantityText}
          title={quantityText}
          className={`${CELL} text-right tabular-nums`}
          data-testid={`invoice-inbox-review-line-${position}-quantity`} />
        <Input
          readOnly={readOnly}
          value={priceText}
          title={priceText}
          className={`${CELL} text-right tabular-nums`}
          data-testid={`invoice-inbox-review-line-${position}-price`} />
        <Input
          readOnly={readOnly}
          value={taxText}
          title={taxText}
          aria-invalid={missingTax || undefined}
          className={`${CELL} text-right tabular-nums ${missingTax ? 'border-destructive bg-[var(--status-destructive-bg)] text-destructive' : ''}`}
          data-testid={`invoice-inbox-review-line-${position}-tax`} />
        <span className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums" title={amountText} data-testid={`invoice-inbox-review-line-${position}-amount`}>
          {amountText}
        </span>
        {showActions ? <DeleteLineButton position={position} data-testid="DeleteLineButton__review" /> : <span />}
      </div>
      <div className="mt-1">
        <ProductChip line={line} position={position} state={state} open={open} onToggle={onToggle} data-testid="ProductChip__review" />
        {open && <ProductPanel line={line} position={position} readOnly={readOnly} state={state} data-testid="ProductPanel__review" />}
      </div>
    </li>
  );
}

/** Confirmed / discarded: the compact list of the design — description, a muted detail line, the amount. */
function ReadOnlyLines({ lines, currency }) {
  const ui = useUI();
  if (lines.length === 0) return null;
  return (
    <ul data-testid="invoice-inbox-review-lines-list">
      {lines.map((line, position) => {
        const rate = lineRate(line);
        const detail = joinMeta([
          line.product?.details?.searchKey,
          `${formatGroupedNumber(line.quantity, { maximumFractionDigits: MAX_QUANTITY_DECIMALS })} × ${formatCurrency(currency, line.unitPrice ?? 0, { maximumFractionDigits: MAX_PRICE_DECIMALS })}`,
          rate == null ? '' : ui('invoiceInboxReviewLineTaxDetail', { rate: formatGroupedNumber(rate, { maximumFractionDigits: MAX_RATE_DECIMALS }) }),
        ]);
        return (
          <li
            key={lineKey(line, position)}
            className="flex gap-3 border-b border-border py-2 text-sm"
            data-testid={`invoice-inbox-review-line-${position}`}>
            <span className="min-w-0 flex-1">
              <span className="[overflow-wrap:anywhere]" data-testid={`invoice-inbox-review-line-${position}-description`}>{line.description}</span>
              <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid={`invoice-inbox-review-line-${position}-detail`}>{detail}</span>
            </span>
            <span className="font-semibold tabular-nums" data-testid={`invoice-inbox-review-line-${position}-amount`}>
              {formatCurrency(currency, lineAmount(line))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Resuelve el producto de {n} línea(s)": the singular for one line, null when none is unresolved. */
function unresolvedProductsError(unresolved, ui) {
  if (unresolved <= 0) return null;
  const key = unresolved === 1
    ? 'invoiceInboxReviewProductsUnresolvedOne'
    : 'invoiceInboxReviewProductsUnresolvedMany';
  return ui(key, { count: unresolved });
}

/** The one red line under the table: the active errors joined with " · " (product, tax, amount). */
function lineErrors(document, ui) {
  const missing = missingSet(document);
  const unresolved = unresolvedProductCount(document);
  return [
    unresolvedProductsError(unresolved, ui),
    hasMissingTax(document) ? ui('invoiceInboxReviewTaxMissingError') : null,
    missing.has('amount') ? ui('invoiceInboxReviewNoAmount') : null,
  ].filter(Boolean);
}

/**
 * ETP-6050 F5 — the "Líneas · {n}" section: description, quantity, price, VAT and amount
 * (quantity x price) per line, and under each line a product chip (a button) that opens a panel:
 * linked (name, key, how it matched), ambiguous (the AI chip, "Elige uno", candidates, starts
 * open), new ("Producto nuevo" + category and unit) or none. A line without its tax shows "—" in
 * red. ONE red line below the table joins the active errors with " · ". Read only in S1: radios
 * and the catalogue search are inert, "Añadir línea" and each line's trash too. `locked`
 * (confirmed / discarded) swaps the table for the compact read-only list.
 *
 * @param {{document: object, currency: string, readOnly?: boolean, showActions?: boolean,
 *   locked?: boolean}} props `showActions` false hides the add / delete affordances
 */
export default function InvoiceInboxReviewLines({
  document, currency, readOnly = true, showActions = true, locked = false,
}) {
  const ui = useUI();
  const lines = Array.isArray(document?.lines) ? document.lines : [];
  const missing = missingSet(document);
  // Ambiguous lines start expanded; the rest collapsed. The caller keys this component by document.
  const [open, setOpen] = useState(() => Object.fromEntries(
    lines.map((line, position) => [position, productView(line) === 'pick']),
  ));
  const errors = lineErrors(document, ui);
  return (
    <section className="flex flex-col gap-3" data-testid="invoice-inbox-review-lines">
      <SectionTitle
        testId="invoice-inbox-review-lines-title"
        data-testid="SectionTitle__21702d">
        {ui('invoiceInboxReviewSectionLines', { count: lines.length })}
      </SectionTitle>
      {locked ? (
        <ReadOnlyLines lines={lines} currency={currency} data-testid="ReadOnlyLines__review" />
      ) : (
        <div>
          <div className={`${GRID} border-b border-border pb-2 text-xs font-semibold text-muted-foreground`} data-testid="invoice-inbox-review-lines-head">
            <span>{ui('invoiceInboxReviewColDescription')}</span>
            <span className="text-right">{ui('invoiceInboxReviewColQuantity')}</span>
            <span className="text-right">{ui('invoiceInboxReviewColPrice')}</span>
            <span className="text-right">{ui('invoiceInboxReviewColTax')}</span>
            <span className="text-right">{ui('invoiceInboxReviewColAmount')}</span>
            <span />
          </div>
          {lines.length > 0 && (
            <ul data-testid="invoice-inbox-review-lines-list">
              {lines.map((line, position) => (
                <LineRow
                  key={lineKey(line, position)}
                  line={line}
                  position={position}
                  currency={currency}
                  missing={missing}
                  readOnly={readOnly}
                  showActions={showActions}
                  open={Boolean(open[position])}
                  onToggle={() => setOpen((prev) => ({ ...prev, [position]: !prev[position] }))}
                  data-testid="LineRow__review" />
              ))}
            </ul>
          )}
          {errors.length > 0 && (
            <FieldError
              testId="invoice-inbox-review-lines-error"
              data-testid="FieldError__21702d">{errors.join(' · ')}</FieldError>
          )}
          {showActions && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled="true"
              title={ui('invoiceInboxRowActionSoon', { action: ui('invoiceInboxReviewAddLine') })}
              className="mt-1.5 cursor-not-allowed opacity-60"
              onClick={(event) => event.preventDefault()}
              data-testid="invoice-inbox-review-add-line">
              <Plus className="h-4 w-4" aria-hidden="true" data-testid="Plus__review-add-line" />
              {ui('invoiceInboxReviewAddLine')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
