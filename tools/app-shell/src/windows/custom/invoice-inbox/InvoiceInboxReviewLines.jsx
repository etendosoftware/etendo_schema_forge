import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  WarningCircleIcon,
  CaretDownIcon,
  CaretUpIcon,
  PackageIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatGroupedNumber } from '@/lib/formatCurrency.js';
import { formatMoney } from './invoiceInboxMoney.js';
import {
  buildOp, hasMissingLineField, hasMissingTax, joinMeta, lineAmount, lineFieldMissing, lineKey, lineRate, linkedProductSimilarity, MAX_LINES, MAX_TEXT, missingSet,
  newProductName, productView, unresolvedProductCount,
} from './invoiceInboxReviewModel.js';
import { AiChip, FieldError, OptionRow, ReviewTag, SectionTitle } from './InvoiceInboxReviewParts.jsx';
import { CommitInput, NumberCommitInput } from './InvoiceInboxReviewInputs.jsx';
import { EntityPicker } from './InvoiceInboxReviewPickers.jsx';
import { buildLineSelectorContext } from '@/lib/selectorContext.js';
import { useReviewEditor } from './useInvoiceInboxReviewEditor.js';

const NONE_VALUE = '__none__';
/** The column header labels (also the cells' aria-labels and the stacked layout's labels). */
const COL_LABEL = Object.freeze({
  // `item`, not `description`: the i18n gate reads an object property named description as visible text.
  item: 'invoiceInboxReviewColDescription',
  quantity: 'invoiceInboxReviewColQuantity',
  price: 'invoiceInboxReviewColPrice',
  discount: 'invoiceInboxReviewColDiscount',
  tax: 'invoiceInboxReviewColTax',
  amount: 'invoiceInboxReviewColAmount',
});
/**
 * Description | Cant. | Precio | Dto. % | IVA | Importe | action — the column widths of plan 9.4(d):
 * 346px of columns plus 24px of gaps leaves the description 150px at the 560px pane.
 */
const GRID = 'grid grid-cols-[minmax(0,1fr)_54px_74px_52px_56px_80px_30px] items-center gap-1';
/** Below this inner width the row stacks: the description on its own row, the five numbers under it. */
export const STACKED_BELOW_PX = 460;
const STACKED_NUMBERS = 'grid grid-cols-[1fr_1.5fr_1fr_1fr] items-end gap-1.5';
const CELL = 'h-[34px] px-2 text-[13px]';
const MAX_QUANTITY_DECIMALS = 4;
const MAX_PRICE_DECIMALS = 6;
const MAX_RATE_DECIMALS = 2;
// The discount is stored with 4 decimals: shown with up to 4, trailing zeros trimmed (never padded).
const MAX_DISCOUNT_DECIMALS = 4;
/** `product.matchedBy` of a linked product → `genericLabels` key (decision 2: no "saved equivalence"). */
const PRODUCT_MATCHED_BY_KEYS = Object.freeze({
  exact: 'invoiceInboxReviewProductMatchExact',
  similarity: 'invoiceInboxReviewProductMatchSimilarity',
  manual: 'invoiceInboxReviewProductMatchManual',
  suggested: 'invoiceInboxReviewProductMatchSuggested',
});

let opSequence = 0;
/** A key no other operation shares, so structural and resolution operations never coalesce in the queue. */
function uniqueKey(prefix) {
  opSequence += 1;
  return `${prefix}:${opSequence}`;
}

/** The tooltip of the rate cell: the chosen tax's name; the printed OCR rate is only a hint, never sent back. */
function taxTitle(line) {
  const name = line.tax?.name ?? '';
  const printed = line.taxRatePrinted ?? null;
  return [name, printed != null ? `OCR: ${printed}%` : ''].filter(Boolean).join(' · ');
}

/** The VAT cell text: "…" while a chosen tax has no known rate, "—" when the tax is missing, else the rate. */
function taxCellText(line, missingTax) {
  if (line.tax?.state === 'pending') return '…';
  return missingTax ? '—' : rateText(line);
}

function rateText(line) {
  const rate = lineRate(line);
  return rate == null ? '' : `${formatGroupedNumber(rate, { maximumFractionDigits: MAX_RATE_DECIMALS })}%`;
}

/** The discount as the cell shows it when not focused: empty at 0 / absent, else "10 %". */
function discountText(line) {
  const value = Number(line?.discount) || 0;
  return value === 0 ? '' : `${formatGroupedNumber(value, { maximumFractionDigits: MAX_DISCOUNT_DECIMALS })}%`;
}

/**
 * Where a pre-filled value of a new product came from (ETP-6051): `ocr` = read from the document
 * ("del documento", with the printed text of the unit as secondary text), `default` = the tenant
 * default ("por defecto"). `manual`, an empty source (legacy rows) and a read-only form show nothing.
 */
function SourceHint({ source, printed = '', readOnly, testId }) {
  const ui = useUI();
  if (readOnly || (source !== 'ocr' && source !== 'default')) return null;
  const text = ui(source === 'ocr' ? 'invoiceInboxReviewSourceOcr' : 'invoiceInboxReviewSourceDefault');
  const shown = source === 'ocr' && printed ? `${text} · “${printed}”` : text;
  return (
    <span
      className="ml-1.5 text-[11px] font-normal text-muted-foreground"
      title={source === 'ocr' && printed ? ui('invoiceInboxReviewUnitPrinted', { unit: printed }) : undefined}
      data-testid={testId}>
      {shown}
    </span>
  );
}

/** Name, category and unit of a NEW product: the alta is only stored; the product is created on confirm. */
function NewProductForm({ line, lineIndex, position, readOnly, missing, apiBaseUrl }) {
  const ui = useUI();
  const editor = useReviewEditor();
  const fresh = line.product?.new ?? {};
  const incomplete = missing.has(`line[${lineIndex}].product`);
  const noCategory = incomplete && !String(fresh.categoryId ?? '').trim();
  const noUom = incomplete && !String(fresh.uomId ?? '').trim();
  // The names are resolved from the ids at read time and only present when the id resolves: a
  // committed id with no name is shown as unknown (never as an empty choice); only ids are ever sent.
  const unknownName = ui('invoiceInboxReviewNameUnknown');
  const label = (text, hint = null) => <span className="mb-1 block text-xs font-medium text-foreground">{text}<span className="ml-0.5 text-destructive" aria-hidden="true">*</span>{hint}</span>;
  return (
    <div className="flex flex-col gap-2.5" data-testid={`invoice-inbox-review-line-${position}-new-product`}>
      <div>
        {label(ui('invoiceInboxReviewProductName'))}
        <CommitInput
          value={newProductName(line)}
          display={(value) => String(value ?? '')}
          readOnly={readOnly}
          maxLength={MAX_TEXT}
          ariaLabel={ui('invoiceInboxReviewProductName')}
          className="h-[34px] text-[13px]"
          onCommit={(value) => editor?.commit(`product:${lineIndex}:name`, buildOp.newProduct(lineIndex, { name: value }))}
          testId={`invoice-inbox-review-line-${position}-new-name`}
          data-testid="CommitInput__21702d" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div data-testid={`invoice-inbox-review-line-${position}-new-category`} data-invalid={noCategory || undefined}>
          {label(ui('invoiceInboxReviewProductCategory'), (
            <SourceHint
              source={fresh.categorySource}
              readOnly={readOnly}
              testId={`invoice-inbox-review-line-${position}-new-category-source`}
              data-testid="SourceHint__category" />
          ))}
          {readOnly || !editor ? (
            <p className="text-[13px] text-muted-foreground">{fresh.category ?? (fresh.categoryId ? unknownName : '')}</p>
          ) : (
            <EntityPicker
              kind="category"
              apiBaseUrl={apiBaseUrl}
              value={fresh.categoryId}
              label={fresh.category ?? (fresh.categoryId ? unknownName : '')}
              placeholder={ui('invoiceInboxReviewProductCategory')}
              fieldKey={`inbox-line-${lineIndex}-category`}
              onPick={({ id, name }) => editor.commit(
                `product:${lineIndex}:category`,
                buildOp.newProduct(lineIndex, { categoryId: id }),
                { category: name },
              )}
              data-testid="EntityPicker__category" />
          )}
        </div>
        <div data-testid={`invoice-inbox-review-line-${position}-new-uom`} data-invalid={noUom || undefined}>
          {label(ui('invoiceInboxReviewProductUom'), (
            <SourceHint
              source={fresh.uomSource}
              printed={String(line.unitPrinted ?? '').trim()}
              readOnly={readOnly}
              testId={`invoice-inbox-review-line-${position}-new-uom-source`}
              data-testid="SourceHint__uom" />
          ))}
          {readOnly || !editor ? (
            <p className="text-[13px] text-muted-foreground">{fresh.uom ?? (fresh.uomId ? unknownName : '')}</p>
          ) : (
            <EntityPicker
              kind="uom"
              apiBaseUrl={apiBaseUrl}
              value={fresh.uomId}
              label={fresh.uom ?? (fresh.uomId ? unknownName : '')}
              placeholder={ui('invoiceInboxReviewProductUom')}
              fieldKey={`inbox-line-${lineIndex}-uom`}
              onPick={({ id, name }) => editor.commit(
                `product:${lineIndex}:uom`,
                buildOp.newProduct(lineIndex, { uomId: id }),
                { uom: name },
              )}
              data-testid="EntityPicker__uom" />
          )}
        </div>
      </div>
      {(noCategory || noUom) && (
        <FieldError testId={`invoice-inbox-review-line-${position}-new-error`} data-testid="FieldError__21702d">
          {ui('invoiceInboxReviewProductNewRequired')}
        </FieldError>
      )}
    </div>
  );
}

/** The expandable panel under a product chip: candidates, "none · create new", search, the new-product form. */
function ProductPanel({ line, position, lineIndex, readOnly, state, missing, apiBaseUrl, onKeepOpen }) {
  const ui = useUI();
  const editor = useReviewEditor();
  const product = line.product ?? {};
  const candidates = Array.isArray(product.candidates) ? product.candidates : [];
  const editable = Boolean(editor) && !readOnly;
  const pick = (candidate) => editor.commit(
    uniqueKey(`product:${lineIndex}`),
    buildOp.selectProduct(lineIndex, candidate.id),
    { name: candidate.name, searchKey: candidate.searchKey },
  );
  // Creating a new product turns the line `new`: its name / category / unit form is the next step, so
  // the panel must stay open (an ambiguous line is open by default only while it is ambiguous).
  const createNew = () => {
    onKeepOpen?.();
    editor.commit(uniqueKey(`product:${lineIndex}`), buildOp.newProduct(lineIndex));
  };
  const onRadio = (value) => {
    if (!editable) return;
    if (value === NONE_VALUE) {
      if (state !== 'new') createNew();
      return;
    }
    const candidate = candidates.find((item) => item.id === value);
    if (candidate && !(state === 'ok' && product.id === candidate.id)) pick(candidate);
  };
  return (
    <div
      className="my-1 flex flex-col gap-2.5 rounded-[10px] border border-border bg-muted/50 p-3"
      data-testid={`invoice-inbox-review-line-${position}-panel`}>
      {candidates.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid={`invoice-inbox-review-line-${position}-candidates`}>
          <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testid={`invoice-inbox-review-line-${position}-in-document`}>
            {ui('invoiceInboxReviewProductInDocument', { description: line.description ?? '' })}
          </span>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={ui(COL_LABEL.item)}>
            {candidates.map((candidate, index) => (
              <OptionRow
                key={candidate.id}
                compact
                value={candidate.id}
                checked={state === 'ok' && product.id === candidate.id}
                onSelect={onRadio}
                readOnly={!editable}
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
              checked={state === 'new'}
              onSelect={onRadio}
              readOnly={!editable}
              testId={`invoice-inbox-review-line-${position}-none-option`}
              data-testid="OptionRow__21702d">
              <span className="block text-[13px] font-medium text-primary">{ui('invoiceInboxReviewProductCreateNew')}</span>
            </OptionRow>
          </div>
        </div>
      )}
      {state === 'new' && (
        <NewProductForm
          line={line}
          lineIndex={lineIndex}
          position={position}
          readOnly={readOnly}
          missing={missing}
          apiBaseUrl={apiBaseUrl}
          data-testid="NewProductForm__21702d" />
      )}
      {state === 'none' && candidates.length === 0 && editable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={createNew}
          data-testid={`invoice-inbox-review-line-${position}-create-new`}>
          {ui('invoiceInboxReviewProductCreateNewButton')}
        </Button>
      )}
      <div>
        <p className="mb-1.5 text-sm font-medium">
          {ui(state === 'ok' ? 'invoiceInboxReviewProductChange' : 'invoiceInboxReviewProductLinkExisting')}
        </p>
        {editable ? (
          <div data-testid={`invoice-inbox-review-line-${position}-search`}>
            <EntityPicker
              kind="product"
              apiBaseUrl={apiBaseUrl}
              value={state === 'ok' ? product.id : null}
              label={state === 'ok' ? (product.details?.name ?? product.name ?? '') : ''}
              placeholder={ui('invoiceInboxReviewProductSearchPlaceholder')}
              fieldKey={`inbox-line-${lineIndex}-product`}
              onPick={({ id, name, option }) => {
                if (state === 'ok' && product.id === id) return;
                editor.commit(uniqueKey(`product:${lineIndex}`), buildOp.selectProduct(lineIndex, id), { name, searchKey: option?.searchKey });
              }}
              data-testid="EntityPicker__product" />
          </div>
        ) : (
          <div className="relative">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
              data-testid={`Search__review-line-${position}`} />
            <Input
              readOnly
              aria-disabled="true"
              placeholder={ui('invoiceInboxReviewProductSearchPlaceholder')}
              className="pl-8"
              data-testid={`invoice-inbox-review-line-${position}-search`} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ETP-6051: the "Chosen by OCR · 72 %" tag of a product the OCR picked among doubtful candidates. The
 * similarity is the search's, read from the candidate that is linked; without a number it is only the label.
 */
function SuggestedChip({ product, position }) {
  const ui = useUI();
  const similarity = linkedProductSimilarity(product);
  const label = similarity == null
    ? ui('invoiceInboxReviewProductMatchSuggested')
    : ui('invoiceInboxReviewProductMatchSuggestedSimilarity', {
      similarity: formatGroupedNumber(similarity, { maximumFractionDigits: 0 }),
    });
  return <AiChip label={label} testId={`invoice-inbox-review-line-${position}-product-suggested`} data-testid="AiChip__suggested" />;
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
        <PackageIcon className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" data-testid={`Package__review-line-${position}`} />
        {/* The chip is narrow (it shares its row with the tax picker). The name and key stay on one line
            (the name truncates) and the "Chosen by OCR · 72 %" tag of ETP-6051 goes under them, so the tag
            can never squeeze the name to nothing. */}
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="flex w-full min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-xs font-medium" data-testid={`invoice-inbox-review-line-${position}-product-name`}>{details.name}</span>
            {details.searchKey && <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{details.searchKey}</span>}
            {product.matchedBy !== 'suggested' && matchedKey && <span className="whitespace-nowrap text-[11px] text-muted-foreground">· {ui(matchedKey)}</span>}
          </span>
          {product.matchedBy === 'suggested' && <SuggestedChip product={product} position={position} data-testid="SuggestedChip__review" />}
        </span>
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
          icon={PackageIcon}
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
      <WarningCircleIcon className="h-3.5 w-3.5 flex-none text-destructive" aria-hidden="true" data-testid={`CircleAlert__review-line-${position}`} />
      <span className="text-xs font-medium text-destructive">{ui('invoiceInboxReviewProductNone')}</span>
    </>
  );
}

/** The product chip as a button that toggles its panel (chevron at the right). */
function ProductChip({ line, position, state, open, onToggle }) {
  const Chevron = open ? CaretUpIcon : CaretDownIcon;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex min-h-[30px] w-full items-center gap-2 rounded-lg px-2 py-[3px] text-left hover:bg-muted ${open ? 'bg-muted' : ''}`}
      data-testid={`invoice-inbox-review-line-${position}-product`}
      data-state={state}>
      <ChipBody line={line} state={state} position={position} data-testid="ChipBody__review" />
      {state !== 'ok' && <span className="flex-1" />}
      <Chevron className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" data-testid={`Chevron__review-line-${position}`} />
    </button>
  );
}

/**
 * The delete affordance of a line (decision 5), the `DataTable` row-delete pattern: `Trash2`,
 * destructive colour, visible on row hover and on keyboard focus, `deleteRowTooltip` label. The
 * line leaves the view at once (the optimistic overlay); a refusal brings it back.
 */
function DeleteLineButton({ position, onDelete }) {
  const ui = useUI();
  return (
    <button
      type="button"
      onClick={onDelete}
      aria-label={ui('deleteRowTooltip')}
      title={ui('deleteRowTooltip')}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--destructive))] opacity-0 transition-all hover:bg-[var(--status-destructive-bg)] focus-visible:opacity-100 group-hover/line:opacity-100"
      data-testid={`invoice-inbox-review-line-delete-${position}`}>
      <TrashIcon className="h-4 w-4" aria-hidden="true" data-testid={`Trash2__review-line-${position}`} />
    </button>
  );
}

/** A cell with its small visible label (stacked layout only: the header row is hidden there). */
function Labeled({ label, children, testId }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** The editable cells of one line (the same in both layouts). */
function lineCells({ line, lineIndex, position, currency, scale, missingTax, missingQuantity, missingPrice, readOnly, descriptionRef, ui, editor }) {
  const commitLine = (field) => (value) => editor?.commit(`line:${lineIndex}:${field}`, buildOp.setLine(lineIndex, { [field]: value }));
  const amountText = formatMoney(currency, lineAmount(line, scale), scale);
  const number = (field, display, label, extra = {}) => (
    <NumberCommitInput
      field={field}
      value={line[field]}
      display={display}
      invalid={extra.invalid}
      readOnly={readOnly}
      ariaLabel={label}
      className={`${CELL} text-right tabular-nums`}
      onCommit={commitLine(field)}
      testId={`invoice-inbox-review-line-${position}-${extra.testSuffix ?? field}`}
      data-testid="NumberCommitInput__review" />
  );
  return {
    description: (
      <CommitInput
        value={line.description ?? ''}
        display={(value) => String(value ?? '')}
        readOnly={readOnly}
        maxLength={MAX_TEXT}
        inputRef={descriptionRef}
        ariaLabel={ui(COL_LABEL.item)}
        className={CELL}
        onCommit={commitLine('description')}
        testId={`invoice-inbox-review-line-${position}-description`}
        data-testid="CommitInput__review" />
    ),
    quantity: number(
      'quantity',
      (value) => formatGroupedNumber(value, { maximumFractionDigits: MAX_QUANTITY_DECIMALS }),
      ui(COL_LABEL.quantity),
      { invalid: missingQuantity },
    ),
    price: number(
      'unitPrice',
      // A missing price is shown empty (and red), not as 0: zero is a valid price.
      (value) => (value == null ? '' : formatMoney(currency, value, scale, { maxDigits: MAX_PRICE_DECIMALS })),
      ui(COL_LABEL.price),
      { testSuffix: 'price', invalid: missingPrice },
    ),
    discount: (
      <NumberCommitInput
        field="discount"
        value={line.discount}
        display={() => discountText(line)}
        readOnly={readOnly}
        placeholder="0"
        ariaLabel={ui(COL_LABEL.discount)}
        className={`${CELL} text-right tabular-nums`}
        onCommit={commitLine('discount')}
        testId={`invoice-inbox-review-line-${position}-discount`}
        data-testid="NumberCommitInput__review" />
    ),
    // The rate is a read-only display: the tax is CHOSEN by id with the selector under the product chip
    // (a typed rate is no longer offered). While a chosen tax has no known rate yet it shows "…".
    tax: (
      <Input
        readOnly
        value={taxCellText(line, missingTax)}
        title={taxTitle(line)}
        aria-label={ui(COL_LABEL.tax)}
        aria-invalid={missingTax || undefined}
        className={`${CELL} text-right tabular-nums ${missingTax ? 'border-destructive bg-[var(--status-destructive-bg)] text-destructive' : ''}`}
        data-testid={`invoice-inbox-review-line-${position}-tax`} />
    ),
    amount: (
      <span className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums" title={amountText} data-testid={`invoice-inbox-review-line-${position}-amount`}>
        {amountText}
      </span>
    ),
  };
}

/** The label of the chosen tax: its name (resolved by the server in the request language), else its rate. */
function taxLabel(line) {
  const tax = line.tax ?? {};
  if (tax.name) return tax.name;
  const rate = lineRate(line);
  return rate == null ? '' : rateText(line);
}

/**
 * The tax of a line, CHOSEN BY ID with the same selector the purchase-invoice lines use
 * (`purchase-invoice/lines/selectors/C_Tax_ID`, through the shared `InlineSearchCombo`, so it opens on the
 * committed tax). The selector context is the document date (`DateInvoiced`), the purchase side (`isSOTrx`)
 * and the supplier's address when it is known. Picking sends `setLine {taxId}` (the server validates it and
 * sets the line's rate to the tax's); re-picking the same tax writes nothing. Read only: the label as text.
 */
function TaxPicker({ line, position, lineIndex, document, readOnly, invalid, apiBaseUrl }) {
  const ui = useUI();
  const editor = useReviewEditor();
  const header = document?.header ?? {};
  const params = buildLineSelectorContext({
    windowCategory: 'purchases',
    headerRecord: { invoiceDate: header.invoiceDate, partnerAddress: header.vendor?.locationId },
  });
  const label = taxLabel(line);
  if (!editor || readOnly) {
    return <span className="min-w-0 flex-[1_1_150px] truncate text-xs text-muted-foreground" data-testid={`invoice-inbox-review-line-${position}-tax-name`}>{label}</span>;
  }
  return (
    <div
      className="min-w-[150px] max-w-[260px] flex-[1_1_150px]"
      aria-invalid={invalid || undefined}
      data-invalid={invalid || undefined}
      data-testid={`invoice-inbox-review-line-${position}-tax-picker`}>
      <EntityPicker
        kind="tax"
        apiBaseUrl={apiBaseUrl}
        value={line.tax?.id ?? null}
        label={label}
        params={params}
        placeholder={ui('invoiceInboxReviewTaxPlaceholder')}
        fieldKey={`inbox-line-${lineIndex}-tax`}
        onPick={({ id, name, option }) => {
          if (line.tax?.id === id) return;
          editor.commit(
            `line:${lineIndex}:tax`,
            buildOp.setLine(lineIndex, { taxId: id }),
            { taxName: name, taxRate: option?.rate ?? option?.taxRate },
          );
        }}
        data-testid="EntityPicker__tax" />
    </div>
  );
}

function LineRow({ line, position, currency, scale, missing, readOnly, showActions, open, onToggle, onKeepOpen, stacked, apiBaseUrl, focusRequest, onFocused, document }) {
  const ui = useUI();
  const editor = useReviewEditor();
  const lineIndex = lineKey(line, position);
  const descriptionRef = useRef(null);
  const taxPending = line.tax?.state === 'pending';
  const missingTax = !taxPending && (lineFieldMissing(missing, lineIndex, 'tax') || lineRate(line) == null);
  const missingQuantity = lineFieldMissing(missing, lineIndex, 'quantity');
  const missingPrice = lineFieldMissing(missing, lineIndex, 'unitPrice');
  const state = productView(line);
  const editable = Boolean(editor) && !readOnly;
  useEffect(() => {
    if (focusRequest === lineIndex && descriptionRef.current) {
      descriptionRef.current.focus();
      onFocused();
    }
  }, [focusRequest, lineIndex, onFocused]);
  const cells = lineCells({ line, lineIndex, position, currency, scale, missingTax, missingQuantity, missingPrice, readOnly, descriptionRef, ui, editor });
  const trash = showActions && editable
    ? <DeleteLineButton
      position={position}
      onDelete={() => editor.commit(uniqueKey(`remove:${lineIndex}`), buildOp.removeLine(lineIndex))}
      data-testid="DeleteLineButton__review" />
    : <span />;
  return (
    <li
      className="group/line border-b border-border pb-2 pt-2 first:pt-2"
      data-layout={stacked ? 'stacked' : 'row'}
      data-testid={`invoice-inbox-review-line-${position}`}>
      {stacked ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_34px] items-center gap-1">
            {cells.description}
            {trash}
          </div>
          <div className={STACKED_NUMBERS}>
            <Labeled label={ui(COL_LABEL.quantity)} data-testid="Labeled__quantity">{cells.quantity}</Labeled>
            <Labeled label={ui(COL_LABEL.price)} data-testid="Labeled__price">{cells.price}</Labeled>
            <Labeled label={ui(COL_LABEL.discount)} data-testid="Labeled__discount">{cells.discount}</Labeled>
            <Labeled label={ui(COL_LABEL.tax)} data-testid="Labeled__tax">{cells.tax}</Labeled>
          </div>
          {/* The amount is not an input: it gets its own line, so the four inputs keep room for their digits at 360px. */}
          <div className="flex items-center justify-between gap-2" data-testid="invoice-inbox-review-line-amount-row">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{ui(COL_LABEL.amount)}</span>
            {cells.amount}
          </div>
        </div>
      ) : (
        <div className={GRID}>
          {cells.description}
          {cells.quantity}
          {cells.price}
          {cells.discount}
          {cells.tax}
          {cells.amount}
          {trash}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-[180px] flex-[1_1_180px]">
          <ProductChip line={line} position={position} state={state} open={open} onToggle={onToggle} data-testid="ProductChip__review" />
        </div>
        <TaxPicker
          line={line}
          position={position}
          lineIndex={lineIndex}
          document={document}
          readOnly={readOnly}
          invalid={missingTax}
          apiBaseUrl={apiBaseUrl}
          data-testid="TaxPicker__review" />
      </div>
      <div>
        {open && (
          <ProductPanel
            line={line}
            position={position}
            lineIndex={lineIndex}
            readOnly={readOnly}
            state={state}
            missing={missing}
            apiBaseUrl={apiBaseUrl}
            onKeepOpen={onKeepOpen}
            data-testid="ProductPanel__review" />
        )}
      </div>
    </li>
  );
}

/** Confirmed / discarded: the compact list of the design — description, a muted detail line, the amount. */
function ReadOnlyLines({ lines, currency, scale }) {
  const ui = useUI();
  if (lines.length === 0) return null;
  return (
    <ul data-testid="invoice-inbox-review-lines-list">
      {lines.map((line, position) => {
        const rate = lineRate(line);
        const discount = Number(line.discount) || 0;
        const detail = joinMeta([
          line.product?.details?.searchKey,
          `${formatGroupedNumber(line.quantity, { maximumFractionDigits: MAX_QUANTITY_DECIMALS })} × ${formatMoney(currency, line.unitPrice ?? 0, scale, { maxDigits: MAX_PRICE_DECIMALS })}`,
          discount > 0 ? ui('invoiceInboxReviewLineDiscountDetail', { rate: formatGroupedNumber(discount, { maximumFractionDigits: MAX_DISCOUNT_DECIMALS }) }) : '',
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
              {formatMoney(currency, lineAmount(line, scale), scale)}
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

/** The one red line under the table: the active errors joined with " · " (lines, product, tax, amount). */
function lineErrors(document, ui) {
  const missing = missingSet(document);
  const unresolved = unresolvedProductCount(document);
  return [
    missing.has('lines') ? ui('invoiceInboxReviewLinesRequired') : null,
    unresolvedProductsError(unresolved, ui),
    hasMissingLineField(document, 'quantity') ? ui('invoiceInboxReviewQuantityMissingError') : null,
    hasMissingLineField(document, 'unitPrice') ? ui('invoiceInboxReviewPriceMissingError') : null,
    hasMissingTax(document) ? ui('invoiceInboxReviewTaxMissingError') : null,
    missing.has('amount') ? ui('invoiceInboxReviewNoAmount') : null,
  ].filter(Boolean);
}

/**
 * Whether the section is narrower than `STACKED_BELOW_PX` (a ResizeObserver on its box, the tool the
 * viewer already uses; without one, as in jsdom, it stays in the row layout).
 */
function useStacked(ref) {
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setStacked(node.clientWidth > 0 && node.clientWidth < STACKED_BELOW_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return stacked;
}

/**
 * ETP-6050 F5 — the "Líneas · {n}" section: description, quantity, price, discount %, VAT and
 * amount (quantity x price after the discount) per line, and under each line a product chip (a
 * button) that opens a panel: linked (name, key, how it matched), ambiguous (the AI chip, "Elige
 * uno", candidates, starts open), new ("Producto nuevo" + name, category and unit pickers) or
 * none. A line without its tax shows "—" in red. ONE red line below the table joins the active
 * errors with " · ". Editable through the panel's editor (autosave); "Añadir línea" appends a line
 * (the server gives it the previous line's tax rate) and each line's trash removes it. Below
 * `STACKED_BELOW_PX` each line stacks (description, then the five numbers with visible labels).
 * `locked` (confirmed / discarded) swaps the table for the compact read-only list.
 *
 * @param {{document: object, currency: string, scale?: number, readOnly?: boolean, showActions?: boolean,
 *   locked?: boolean, apiBaseUrl?: string}} props `showActions` false hides the add / delete affordances
 */
export default function InvoiceInboxReviewLines({
  document, currency, scale = 2, readOnly = true, showActions = true, locked = false, apiBaseUrl = '',
}) {
  const ui = useUI();
  const editor = useReviewEditor();
  const sectionRef = useRef(null);
  const stacked = useStacked(sectionRef);
  const lines = Array.isArray(document?.lines) ? document.lines : [];
  const missing = missingSet(document);
  // Ambiguous lines start expanded; the rest collapsed. An explicit toggle wins, keyed by the
  // line's stable index (lines come and go).
  const [toggled, setToggled] = useState({});
  const [focusRequest, setFocusRequest] = useState(null);
  const clearFocus = useCallback(() => setFocusRequest(null), []);
  const errors = lineErrors(document, ui);
  const editable = Boolean(editor) && !readOnly;
  const addLine = () => {
    const next = lines.reduce((max, line, position) => Math.max(max, lineKey(line, position)), -1) + 1;
    editor.commit(uniqueKey('add'), buildOp.addLine());
    // The new line inherits the previous line's tax BY ID when that tax has one (else the server default).
    const previous = lines.length ? lines[lines.length - 1] : null;
    if (previous?.tax?.id) {
      editor.commit(
        `line:${next}:tax`,
        buildOp.setLine(next, { taxId: previous.tax.id }),
        { taxName: previous.tax.name, taxRate: previous.tax.rate },
      );
    }
    setFocusRequest(next);
  };
  return (
    <section ref={sectionRef} className="flex flex-col gap-3" data-testid="invoice-inbox-review-lines">
      <SectionTitle
        testId="invoice-inbox-review-lines-title"
        data-testid="SectionTitle__21702d">
        {ui('invoiceInboxReviewSectionLines', { count: lines.length })}
      </SectionTitle>
      {locked ? (
        <ReadOnlyLines lines={lines} currency={currency} scale={scale} data-testid="ReadOnlyLines__review" />
      ) : (
        <div>
          {!stacked && (
            <div className={`${GRID} border-b border-border pb-2 text-xs font-semibold text-muted-foreground`} data-testid="invoice-inbox-review-lines-head">
              <span>{ui(COL_LABEL.item)}</span>
              <span className="text-right">{ui(COL_LABEL.quantity)}</span>
              <span className="text-right">{ui(COL_LABEL.price)}</span>
              <span className="text-right">{ui(COL_LABEL.discount)}</span>
              <span className="text-right">{ui(COL_LABEL.tax)}</span>
              <span className="text-right">{ui(COL_LABEL.amount)}</span>
              <span />
            </div>
          )}
          {lines.length > 0 && (
            <ul data-testid="invoice-inbox-review-lines-list">
              {lines.map((line, position) => {
                const key = lineKey(line, position);
                const open = key in toggled ? toggled[key] : productView(line) === 'pick';
                return (
                  <LineRow
                    key={key}
                    line={line}
                    position={position}
                    currency={currency}
                    scale={scale}
                    missing={missing}
                    readOnly={readOnly}
                    showActions={showActions}
                    open={open}
                    stacked={stacked}
                    apiBaseUrl={apiBaseUrl}
                    document={document}
                    focusRequest={focusRequest}
                    onFocused={clearFocus}
                    onToggle={() => setToggled((prev) => ({ ...prev, [key]: !open }))}
                    onKeepOpen={() => setToggled((prev) => ({ ...prev, [key]: true }))}
                    data-testid="LineRow__review" />
                );
              })}
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
              disabled={!editable || lines.length >= MAX_LINES}
              aria-disabled={!editable || undefined}
              title={editable ? undefined : ui('invoiceInboxRowActionSoon', { action: ui('invoiceInboxReviewAddLine') })}
              className="mt-1.5"
              onClick={addLine}
              data-testid="invoice-inbox-review-add-line">
              <PlusIcon className="h-4 w-4" aria-hidden="true" data-testid="Plus__review-add-line" />
              {ui('invoiceInboxReviewAddLine')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
