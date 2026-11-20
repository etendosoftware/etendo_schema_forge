/**
 * ETP-6050 — pure helpers of the Invoice Inbox review panel (no React, no `@/` imports, so plain
 * `node --test` can cover them). They read the answer of `GET /header/{id}/action/review`
 * (`fetchReview`): the document is the `CURRENT_DATA` v1 contract of `com.etendoerp.go`
 * (`docs/neo-headless.md`, "CURRENT_DATA contract") plus the enrichment the review action adds
 * (`vendor.details`, `product.details`, `candidates[].city|searchKey|category|uom`).
 */
import { CONFIRMABLE_ERROR_CODES, STATUS } from './invoiceInboxFilters.js';

/**
 * Exact-decimal money math (ETP-6050 S2, plan 9.4c). The formula the backend
 * repeats in `InvoiceInboxTotals` (and the Etendo engine a third time). Each repo owns its own cases: this
 * one pins the SPA copy with `tools/app-shell/__tests__/fixtures/invoice-inbox-totals.json`, the Java side
 * with `invoice-inbox-totals-cases.json`. The two case files are independent copies nothing keeps in sync
 * automatically: a change to the rounding rule must update both:
 *
 *   unit6   = round6( unitPrice x (1 - discount / 100) )        (HALF_UP away from zero)
 *   lineNet = round_scale( quantity x unit6 )                   (scale = the document currency's decimals)
 *   base    = sum(lineNet)
 *   tax     = per (rate, mode): D (document-based, default) rounds ONCE on the sum of the nets,
 *             L (line-based) rounds each line (round_scale(lineNet x rate / 100)) and sums;
 *             a rate may have a D row and an L row (ascending by rate, D before L)
 *   rate    = line taxRate, else tax.rate, rounded HALF_UP to 2 decimals BEFORE grouping
 *
 * BigInt on the inputs scaled to their capped decimals (quantity and discount x 10^4, unit price
 * x 10^6, rate x 10^2) and amounts in units of 10^-scale; no float arithmetic, so the SPA and the
 * server never differ by a unit.
 */
const DEFAULT_SCALE = 2;
const MISMATCH_TOLERANCE_UNITS = 1;
const SCALE_QTY = 4;
const SCALE_PRICE = 6;
const SCALE_DISCOUNT = 4;
const SCALE_RATE = 2;
const TEN = 10n;
const POW = (n) => TEN ** BigInt(n);
const MICRO = POW(6);

/** The decimals of the document currency (`currency.scale`); 2 when the answer carries none. */
export function currencyScale(currency) {
  const scale = currency?.scale;
  return Number.isInteger(scale) && scale >= 0 && scale <= 6 ? scale : DEFAULT_SCALE;
}

/** `error.code` of a failed review read → `genericLabels` key (the backend text is never shown). */
export const REVIEW_ERROR_LABEL_KEYS = Object.freeze({
  processing: 'invoiceInboxReviewErrorProcessing',
  not_found: 'invoiceInboxReviewErrorNotFound',
  feature_disabled: 'invoiceInboxReviewErrorFeatureDisabled',
  org_not_allowed: 'invoiceInboxReviewErrorOrg',
});
const REVIEW_ERROR_FALLBACK_KEY = 'invoiceInboxReviewErrorGeneric';

export function reviewErrorKey(code) {
  return REVIEW_ERROR_LABEL_KEYS[code] ?? REVIEW_ERROR_FALLBACK_KEY;
}

/** BigInt division rounded HALF_UP away from zero. `d` must be positive. */
export function divRoundHalfAway(n, d) {
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const q = (2n * abs + d) / (2n * d);
  return negative ? -q : q;
}

/** `1.5e-7` / `1e21` as plain decimal text (no exponent); text without an exponent is returned as is. */
function expandExponent(text) {
  const match = /^(\d+)(?:\.(\d+))?e([+-]?\d+)$/.exec(text);
  if (!match) return text;
  const [, intDigits, fracDigits = '', exponentText] = match;
  const digits = intDigits + fracDigits;
  const point = intDigits.length + Number(exponentText);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * A number as an integer scaled by 10^`decimals`, rounded HALF_UP away from zero (null for a
 * missing / non-finite value). Works on the decimal TEXT of the number, never on `x * 10^n`.
 */
export function toScaled(value, decimals) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const negative = num < 0;
  const abs = Math.abs(num);
  // The shortest decimal text of the number is the JSON decimal the server parses; only an
  // exponent form (1e-7, 1e21) needs expanding.
  const text = expandExponent(String(abs));
  const [intPart, fracPart = ''] = text.split('.');
  const padded = fracPart.padEnd(decimals + 1, '0');
  const kept = BigInt(`${intPart}${padded.slice(0, decimals)}`);
  const roundUp = padded.charCodeAt(decimals) >= 53; // digit >= 5
  const scaled = roundUp ? kept + 1n : kept;
  return negative ? -scaled : scaled;
}

function scaledOrZero(value, decimals) {
  return toScaled(value, decimals) ?? 0n;
}

/** The discount percent of a line, scale 4; an invalid one (negative, over 100, not a number) counts as 0. */
function discountScaled(line) {
  const scaled = scaledOrZero(line?.discount, SCALE_DISCOUNT);
  return scaled < 0n || scaled > 100n * POW(SCALE_DISCOUNT) ? 0n : scaled;
}

/** The unit price after the discount, in micro-units (10^-6): round6(price x (1 - discount/100)). */
export function lineUnit6(line) {
  const priceS = scaledOrZero(line?.unitPrice, SCALE_PRICE);
  const dS = discountScaled(line);
  return divRoundHalfAway(priceS * (MICRO - dS), MICRO);
}

/** The net of a line in units of 10^-scale: round_scale(quantity x unit6). */
export function lineNetUnits(line, scale = DEFAULT_SCALE) {
  const qS = scaledOrZero(line?.quantity, SCALE_QTY);
  return divRoundHalfAway(qS * lineUnit6(line), POW(SCALE_QTY + SCALE_PRICE - scale));
}

const unitsToNumber = (units, scale) => Number(units) / 10 ** scale;

/** Quantity x unit price after the discount, at the currency scale, as a number (0 for a missing side). */
export function lineAmount(line, scale = DEFAULT_SCALE) {
  return unitsToNumber(lineNetUnits(line, scale), scale);
}

/** A finite number from a raw value; null for null, "" and anything not numeric. */
function finiteRate(raw) {
  if (raw == null || raw === '') return null;
  const rate = Number(raw);
  return Number.isFinite(rate) ? rate : null;
}

/**
 * The VAT rate of a line: the reader's `taxRate` when it is a finite number, else the resolved
 * tax's rate, else null. A non-numeric `taxRate` ("" or text) falls back to `tax.rate`, as the
 * backend does (SPA/backend parity on a non-numeric taxRate).
 */
export function lineRate(line) {
  return finiteRate(line?.taxRate) ?? finiteRate(line?.tax?.rate);
}

/** True when the line's tax is LINE-based ('L'); the default is document-based ('D'). */
function isLineBased(line) {
  return line?.tax?.docTaxAmount === 'L';
}

/**
 * Totals recomputed from the lines, at the document currency's `scale` (default 2): the base, one VAT row
 * per (rate, mode) (ascending by rate, document-based before line-based; lines without a rate add to the
 * base only; a line missing its quantity or unit price counts for nothing) and the lines total.
 *
 * @returns {{base: number, taxes: {rate: number, base: number, amount: number, docTaxAmount?: 'L'}[],
 *   linesTotal: number}}
 */
export function computeTotals(lines, scale = DEFAULT_SCALE) {
  const rows = new Map();
  let baseUnits = 0n;
  for (const line of lines ?? []) {
    if (line?.quantity == null || line?.unitPrice == null) continue;
    const net = lineNetUnits(line, scale);
    baseUnits += net;
    const rateScaled = toScaled(lineRate(line), SCALE_RATE);
    if (rateScaled == null) continue;
    const lineBased = isLineBased(line);
    const key = `${rateScaled}|${lineBased ? 'L' : 'D'}`;
    const row = rows.get(key) ?? { rateScaled, lineBased, base: 0n, lineTax: 0n };
    row.base += net;
    if (lineBased) row.lineTax += taxOf(net, rateScaled);
    rows.set(key, row);
  }
  const ordered = [...rows.values()].sort((a, b) => {
    if (a.rateScaled !== b.rateScaled) return a.rateScaled < b.rateScaled ? -1 : 1;
    return Number(a.lineBased) - Number(b.lineBased);
  }).map((row) => ({ ...row, amount: row.lineBased ? row.lineTax : taxOf(row.base, row.rateScaled) }));
  const totalUnits = baseUnits + ordered.reduce((sum, row) => sum + row.amount, 0n);
  return {
    base: unitsToNumber(baseUnits, scale),
    taxes: ordered.map((row) => ({
      rate: Number(row.rateScaled) / 10 ** SCALE_RATE,
      base: unitsToNumber(row.base, scale),
      amount: unitsToNumber(row.amount, scale),
      ...(row.lineBased ? { docTaxAmount: 'L' } : {}),
    })),
    linesTotal: unitsToNumber(totalUnits, scale),
  };
}

/** round_scale(base x rate / 100) in the same units as `base`; `rateScaled` is the rate x 100. */
function taxOf(base, rateScaled) {
  return divRoundHalfAway(base * rateScaled, POW(SCALE_RATE + 2));
}

const roundUnits = (value, scale) => Math.round((Number(value) || 0) * 10 ** scale);

/**
 * The big Total of the review panel (owner decision 2026-11-18, supersedes S2-D3): ALWAYS the total
 * computed from the lines, the closest to the grand total of the invoice that will be created, even
 * when the document printed another one (that case is the non-blocking mismatch banner, see
 * `totalMismatch`). The one exception is a CONFIRMED row: its Total is the grand total of the
 * invoice that was created (`review.invoice.grandTotal`, read by the server at read time), whenever
 * the answer carries it. Zero lines give 0.
 *
 * @param {object} totals `computeTotals(...)`
 * @param {number|string|null} [invoiceTotal] the created invoice's grand total (confirmed rows only)
 */
export function documentTotal(totals, invoiceTotal = null, scale = DEFAULT_SCALE) {
  if (invoiceTotal != null && invoiceTotal !== '' && Number.isFinite(Number(invoiceTotal))) {
    return Math.round(Number(invoiceTotal) * 10 ** scale) / 10 ** scale;
  }
  return totals.linesTotal;
}

/**
 * Decision 4 — the non-blocking "total does not match" warning: only when the document's total is
 * the PRINTED one and the lines add up to something else (more than one minimal currency unit apart:
 * a cent for 2 decimals, a whole unit for a 0-decimal currency).
 *
 * @returns {{lines: number, document: number}|null}
 */
export function totalMismatch(header, totals, scale = DEFAULT_SCALE) {
  if (header?.totalSource !== 'printed') return null;
  // A printed total that is null, empty, text or not finite NEVER warns (`Number(null)` is 0).
  const printed = toScaled(header?.totalAmount, scale);
  if (printed === null) return null;
  const lines = toScaled(totals.linesTotal, scale) ?? 0n;
  // Strictly MORE than one minimal unit of the currency's own scale, in exact integer units
  // (half-up away from zero, symmetric for negatives; no float `Math.round`).
  const diff = printed > lines ? printed - lines : lines - printed;
  if (diff <= BigInt(MISMATCH_TOLERANCE_UNITS)) return null;
  return { lines: totals.linesTotal, document: Number(printed) / 10 ** scale };
}

/** True when line `lineIndex` lacks its `field` (`quantity`, `unitPrice`, `tax`, `product`): a `line[i].field` code. */
export function lineFieldMissing(missing, lineIndex, field) {
  return missing.has(`line[${lineIndex}].${field}`);
}

/** True when some line lacks its quantity / unit price (any sign, zero included, is a valid number). */
export function hasMissingLineField(document, field) {
  return [...missingSet(document)].some((code) => new RegExp(`^line\\[\\d+\\]\\.${field}$`).test(code));
}

/** The `validation.missing` codes as a Set (empty without a verdict). */
export function missingSet(document) {
  return new Set(Array.isArray(document?.validation?.missing) ? document.validation.missing : []);
}

/** Position of a line in the `line[i].x` codes of `validation.missing`: its `index`, else its place. */
export function lineKey(line, position) {
  return Number.isInteger(line?.index) ? line.index : position;
}

/** Number of lines whose `product` is unresolved (a `line[i].product` code). */
export function unresolvedProductCount(document) {
  return [...missingSet(document)].filter((code) => /^line\[\d+\]\.product$/.test(code)).length;
}

/** True when some line lacks its tax (`line[i].tax`). */
export function hasMissingTax(document) {
  return [...missingSet(document)].some((code) => /^line\[\d+\]\.tax$/.test(code));
}

/** The number the footer counter shows. */
export function pendingCount(document) {
  return missingSet(document).size;
}

/** Statuses of a document nobody can edit any more. */
const SETTLED = new Set([STATUS.CONFIRMED, STATUS.DISCARDED]);

/** CONFIRMED and DISCARDED documents: read only, no footer, no duplicate / mismatch warnings. */
export function isSettledStatus(status) {
  return SETTLED.has(status);
}

/**
 * Whether the form is read only. S1 passes `forceReadOnly` (editing arrives in S2/S3); from then
 * on the document's own `editable` flag decides: `false` for CONFIRMED, DISCARDED and
 * FOREIGN_RECEIVER documents.
 */
export function isReviewReadOnly(review, forceReadOnly = false) {
  if (forceReadOnly || !review) return true;
  return review.editable === false || SETTLED.has(review.status);
}

/** A row can be opened in the panel unless it is still being read. */
export function isOpenableRow(row) {
  return Boolean(row) && row.status !== STATUS.PROCESSING;
}

/**
 * Previous / next walk of the panel: over the rows the list has loaded for the current filter,
 * skipping the PROCESSING ones.
 *
 * @param {object[]} rows loaded rows of the current filter
 * @param {string|null} id the document open now
 * @returns {{openable: object[], index: number, total: number, prevId: string|null,
 *   nextId: string|null}} `index` is -1 when `id` is not among the openable rows (it left the
 *   filter after a refresh)
 */
export function reviewNeighbors(rows, id) {
  const openable = (rows ?? []).filter(isOpenableRow);
  const index = openable.findIndex((row) => row.id === id);
  return {
    openable,
    index,
    total: openable.length,
    prevId: index > 0 ? openable[index - 1].id : null,
    nextId: index >= 0 && index < openable.length - 1 ? openable[index + 1].id : null,
  };
}

/** A line's product as the chip shows it: `ok` (linked), `pick` (ambiguous), `new` or `none`. */
export function productView(line) {
  const state = line?.product?.state;
  if (state === 'linked') return 'ok';
  if (state === 'ambiguous') return 'pick';
  if (state === 'new') return 'new';
  return 'none';
}

/**
 * The similarity (0-100) the search gave the linked product of a line, read from its candidate (the
 * backend sends it as text: "72", "96.7" or "96.7%"), or `null` when it is missing or not a number.
 * ETP-6051: shown next to "Chosen by OCR" so the user can judge how safe the pick is.
 */
export function linkedProductSimilarity(product) {
  const candidates = Array.isArray(product?.candidates) ? product.candidates : [];
  const own = candidates.find((candidate) => candidate?.id != null && candidate.id === product?.id);
  const raw = String(own?.similarity ?? '').replace('%', '').replace(',', '.').trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** The extracted country as text: the `countryName` of decision 8, else the reader's `country`. */
export function extractedCountry(extracted) {
  return String(extracted?.countryName ?? extracted?.country ?? '').trim();
}

/** "taxId · city" of a vendor/candidate line, skipping what is empty. */
export function joinMeta(parts) {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' · ');
}

/** What the vendor section shows: `state` is one of linked, ambiguous, new, none. */
export function vendorView(document) {
  const vendor = document?.header?.vendor ?? {};
  const state = ['linked', 'ambiguous', 'new'].includes(vendor.state) ? vendor.state : 'none';
  return {
    state,
    vendor,
    extracted: vendor.extracted ?? {},
    candidates: Array.isArray(vendor.candidates) ? vendor.candidates : [],
    name: vendor.details?.name ?? vendor.name ?? '',
    taxId: vendor.details?.taxId ?? '',
    city: vendor.details?.city ?? '',
  };
}

/**
 * The banner of a document's stored error: unreadable (only while untouched: once the user edited
 * it, ADJUSTED, the data on screen is theirs), a failed confirm (with the reason the server stored: `info` is its
 * identifier `{code, params}` when it is one, `detail` the raw stored string, legacy free text included)
 * or another error code. None for MISSING_FIELDS (the fields show it) or without an error.
 */
function errorBanners(review) {
  if (review.status !== STATUS.ERROR || !review.errorCode) return [];
  if (review.errorCode === 'UNREADABLE') return review.adjusted ? [] : [{ kind: 'unreadable' }];
  if (review.errorCode === 'CONFIRM_FAILED') return [{ kind: 'confirmFailed', detail: review.errorDetail ?? null, info: review.errorInfo ?? null }];
  if (review.errorCode === 'MISSING_FIELDS') return [];
  return [{ kind: 'error', code: review.errorCode }];
}

/** Confirm blockers and duplicate warnings: only on a document that is still open. */
function openDocumentBanners(review) {
  const banners = confirmBlockers(review.document).map((blocker) => ({ kind: 'blocker', blocker }));
  const duplicate = review.document?.header?.duplicate;
  if (duplicate?.state === 'found' && duplicate.invoices?.length) {
    banners.push({ kind: 'duplicate', invoice: duplicate.invoices[0] });
  }
  if (duplicate?.inbox?.length) banners.push({ kind: 'duplicateInbox', files: duplicate.inbox });
  return banners;
}

/** The review banners to show, in order, derived from the answer. Pure so the rules are testable. */
export function reviewBanners(review) {
  if (!review) return [];
  const banners = review.status === STATUS.CONFIRMED ? [{ kind: 'confirmed' }] : [];
  banners.push(...errorBanners(review));
  if (!SETTLED.has(review.status)) banners.push(...openDocumentBanners(review));
  return banners;
}

/** Viewer zoom, in percent: the design's range and step. */
export const ZOOM_MIN = 40;
export const ZOOM_MAX = 160;
export const ZOOM_STEP = 15;
/** Width of an A4 sheet in CSS px: what 100 % means in the viewer. */
export const PAPER_WIDTH = 595;
const MIN_FIT_ZOOM = 45;
const FIT_ROUNDING = 5;

/**
 * Initial zoom of the viewer: 100, except when the pane's inner width `width` (pane width minus
 * its horizontal padding) is below an A4 sheet (595 px): then `max(45, floor(width / 595 * 20) * 5)`,
 * the multiple of 5 that fits it.
 */
export function initialZoom(width) {
  if (!Number.isFinite(width) || width <= 0 || width >= PAPER_WIDTH) return 100;
  return Math.max(MIN_FIT_ZOOM, Math.floor((width / PAPER_WIDTH) * (100 / FIT_ROUNDING)) * FIT_ROUNDING);
}

/** One zoom step (`direction` 1 or -1), kept inside the range. */
export function stepZoom(zoom, direction) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + direction * ZOOM_STEP));
}

// ── ETP-6050 S2 — editing: operations, optimistic copy, inputs ─────────────────────────────────

/** Caps mirrored from the backend (a drift only means a translated 422 the SPA did not prevent). */
export const MAX_LINES = 100;
export const MAX_TEXT = 200;
export const MAX_DOCUMENT_NO = 20;
/** Numeric cells: bounds, decimals kept (HALF_UP) and whether empty means "no value" (null). */
export const NUMBER_FIELDS = Object.freeze({
  quantity: { min: -1e9, max: 1e9, scale: 4, nullable: false },
  unitPrice: { min: -1e9, max: 1e9, scale: 6, nullable: false },
  taxRate: { min: 0, max: 100, scale: 2, nullable: true },
  discount: { min: 0, max: 100, scale: 4, nullable: true },
});

/**
 * Validates and normalizes a typed number for a line field: `{ok: true, value}` (rounded HALF_UP to
 * the field's scale; null for an empty nullable field) or `{ok: false}` (empty for a non-nullable
 * field, out of range, not a number).
 *
 * @param {string} field a key of `NUMBER_FIELDS`
 * @param {{value: number|null, isValid: boolean}} parsed the answer of `parseLocaleNumber`
 */
export function normalizeNumber(field, parsed) {
  const spec = NUMBER_FIELDS[field];
  if (!spec || !parsed?.isValid) return { ok: false };
  if (parsed.value == null) return spec.nullable ? { ok: true, value: null } : { ok: false };
  if (parsed.value < spec.min || parsed.value > spec.max) return { ok: false };
  const scaled = toScaled(parsed.value, spec.scale);
  if (scaled == null) return { ok: false };
  const value = Number(scaled) / 10 ** spec.scale;
  return value < spec.min || value > spec.max ? { ok: false } : { ok: true, value };
}

/** A line number as a comparable value: null for empty (0 when `absentIsZero`), else its numeric value. */
function comparableNumber(value, absentIsZero) {
  if (value == null || value === '') return absentIsZero ? 0 : null;
  return Number(value);
}

/** Numeric equality of two optional line numbers (null equals null; an absent discount equals 0). */
export function sameNumber(a, b, { absentIsZero = false } = {}) {
  return comparableNumber(a, absentIsZero) === comparableNumber(b, absentIsZero);
}

/** A shallow copy of `obj` without the given keys (nested values are shared, key order is kept). */
export function omitKeys(obj, keys) {
  const copy = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
}

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Operation builders: exactly the bodies of contract 9.2.2 (unknown keys are a 400 server side). */
export const buildOp = Object.freeze({
  setHeader: (patch) => ({ op: 'setHeader', ...defined(patch) }),
  setLine: (index, patch) => ({ op: 'setLine', index, ...defined(patch) }),
  addLine: () => ({ op: 'addLine' }),
  removeLine: (index) => ({ op: 'removeLine', index }),
  selectVendor: (id) => ({ op: 'selectVendor', id }),
  newVendor: (fields) => (fields && Object.keys(fields).length ? { op: 'newVendor', fields } : { op: 'newVendor' }),
  selectProduct: (index, id) => ({ op: 'selectProduct', index, id }),
  newProduct: (index, patch = {}) => ({ op: 'newProduct', index, ...defined(patch) }),
});

/** The `index` a line is addressed by: its stable `index`, else its position. */
function indexOf(line, position) {
  return lineKey(line, position);
}

function mapLine(lines, index, fn) {
  return lines.map((line, position) => (indexOf(line, position) === index ? fn(line) : line));
}

function setLinePatch(line, op, hint = {}) {
  const next = { ...line };
  for (const key of ['description', 'quantity', 'unitPrice']) {
    if (key in op) next[key] = op[key];
  }
  if ('taxRate' in op) {
    next.taxRate = op.taxRate;
    // The resolved tax belongs to the OLD rate; the server answer brings the new one.
    if (op.taxRate == null) next.tax = null;
  }
  if ('taxId' in op) applyTaxChoice(next, op.taxId, hint);
  if ('discount' in op) {
    if (op.discount == null || Number(op.discount) === 0) delete next.discount;
    else next.discount = op.discount;
  }
  return next;
}

/**
 * A tax chosen BY ID (`setLine {taxId}`): the line shows it at once, but its rate is only known when the
 * selector option exposed it (`hint.taxRate`); otherwise the rate is left unknown (`pending`) until the
 * server answers: the SPA never guesses it. A null id clears the choice (the server resolves a default).
 */
function applyTaxChoice(line, taxId, hint) {
  if (taxId == null) {
    line.tax = null;
    delete line.taxRate;
    return;
  }
  const rate = hint.taxRate != null && Number.isFinite(Number(hint.taxRate)) ? Number(hint.taxRate) : null;
  const known = rate != null;
  line.tax = { state: known ? 'resolved' : 'pending', matchedBy: 'manual', id: taxId, name: hint.taxName ?? '' };
  if (known) {
    line.tax.rate = rate;
    line.taxRate = rate;
  } else {
    delete line.taxRate;
  }
}

function newLine(lines) {
  const index = lines.reduce((max, line, position) => Math.max(max, indexOf(line, position)), -1) + 1;
  const previous = lines.length ? lines[lines.length - 1] : null;
  const rate = previous ? lineRate(previous) : null;
  return {
    index, description: '', quantity: 1, unitPrice: 0, ...(rate == null ? {} : { taxRate: rate }),
    ...(previous?.tax?.id ? { tax: previous.tax } : {}),
    product: { state: 'none', candidates: [] },
  };
}

function withVendor(document, vendor) {
  return { ...document, header: { ...document.header, vendor } };
}

/**
 * ONE operation applied to a copy of the document, as the user sees it before the server answers.
 * Optimistic and PARTIAL by design (plan 9.6 F2): it derives nothing the server derives (taxes of
 * a new address, duplicates, validation, status, `adjusted`); the server answer replaces it.
 *
 * @param {object} document the `CURRENT_DATA` v1 document
 * @param {object} op one of `buildOp`
 * @param {{name?: string, searchKey?: string, category?: string, uom?: string}} [hint] display
 *   copies of what the operation picked (the wire operation carries ids only)
 */
export function applyOperationLocally(document, op, hint = {}) {
  const apply = LOCAL_OPERATIONS[op?.op];
  return apply ? apply(document ?? {}, op, hint) : (document ?? {});
}

const linesOf = (doc) => (Array.isArray(doc.lines) ? doc.lines : []);

function localSetHeader(doc, op) {
  const next = { ...doc.header };
  if ('documentNo' in op) next.documentNo = op.documentNo;
  if ('invoiceDate' in op) {
    if (op.invoiceDate) next.invoiceDate = op.invoiceDate;
    else delete next.invoiceDate;
  }
  return { ...doc, header: next };
}

function localSelectVendor(doc, op, hint) {
  const vendor = doc.header?.vendor ?? {};
  return withVendor(doc, {
    ...vendor, state: 'linked', matchedBy: 'manual', id: op.id, name: hint.name ?? vendor.name,
    details: { name: hint.name ?? '', taxId: hint.taxId ?? '', city: hint.city ?? '' },
  });
}

function localNewVendor(doc, op) {
  const vendor = omitKeys(doc.header?.vendor ?? {}, ['id', 'name', 'matchedBy', 'details']);
  return withVendor(doc, {
    ...vendor, state: 'new', candidates: vendor.candidates ?? [], extracted: { ...(vendor.extracted ?? {}), ...(op.fields ?? {}) },
  });
}

function localSelectProduct(doc, op, hint) {
  return {
    ...doc,
    lines: mapLine(linesOf(doc), op.index, (line) => ({
      ...line,
      product: {
        ...omitKeys(line.product ?? {}, ['new']),
        state: 'linked', matchedBy: 'manual', id: op.id, name: hint.name,
        details: { name: hint.name ?? '', searchKey: hint.searchKey ?? '' },
      },
    })),
  };
}

/** The display copy of a picked category / unit name: null when cleared, else the hint, else what was there. */
function pickedName(id, hintName, current) {
  if (id == null) return null;
  return hintName ?? current;
}

function localNewProduct(doc, op, hint) {
  return {
    ...doc,
    lines: mapLine(linesOf(doc), op.index, (line) => {
      const product = line.product ?? {};
      const fresh = { name: line.description ?? '', ...(product.new ?? {}) };
      // Re-sending the committed id is a no-op (the server keeps the source); a different id is the
      // user's choice, so its source becomes `manual` (the server does the same).
      if ('categoryId' in op && op.categoryId !== fresh.categoryId) fresh.categorySource = 'manual';
      if ('uomId' in op && op.uomId !== fresh.uomId) fresh.uomSource = 'manual';
      for (const key of ['name', 'categoryId', 'uomId']) if (key in op) fresh[key] = op[key];
      if ('categoryId' in op) fresh.category = pickedName(op.categoryId, hint.category, fresh.category);
      if ('uomId' in op) fresh.uom = pickedName(op.uomId, hint.uom, fresh.uom);
      return { ...line, product: { ...product, state: 'new', id: null, new: fresh } };
    }),
  };
}

const LOCAL_OPERATIONS = Object.freeze({
  setHeader: localSetHeader,
  setLine: (doc, op, hint) => ({ ...doc, lines: mapLine(linesOf(doc), op.index, (line) => setLinePatch(line, op, hint)) }),
  addLine: (doc) => ({ ...doc, lines: [...linesOf(doc), newLine(linesOf(doc))] }),
  removeLine: (doc, op) => ({ ...doc, lines: linesOf(doc).filter((line, position) => indexOf(line, position) !== op.index) }),
  selectVendor: localSelectVendor,
  newVendor: localNewVendor,
  selectProduct: localSelectProduct,
  newProduct: localNewProduct,
});

/** The review answer with each pending `{op, hint}` applied in order (the pending edits on screen). */
export function applyPendingToReview(review, pending) {
  if (!review || !pending?.length) return review;
  const document = pending.reduce((doc, entry) => applyOperationLocally(doc, entry.op, entry.hint), review.document ?? {});
  return { ...review, document };
}

/** The description a `new` product is created with: its own name, else the line's description. */
export function newProductName(line) {
  return String(line?.product?.new?.name ?? line?.description ?? '');
}

/** Whether the `new` product of a line has everything a creation needs (name, category and unit). */
export function newProductComplete(line) {
  const fresh = line?.product?.new ?? {};
  return Boolean(newProductName(line).trim() && String(fresh.categoryId ?? '').trim() && String(fresh.uomId ?? '').trim());
}

/** `error.code` of a failed write → the `genericLabels` key of its reason (never the backend text). */
export const SAVE_ERROR_LABEL_KEYS = Object.freeze({
  stale_document: 'invoiceInboxSaveErrorStale',
  processing: 'invoiceInboxReviewErrorProcessing',
  not_editable: 'invoiceInboxSaveErrorNotEditable',
  not_reviewable: 'invoiceInboxSaveErrorNotReviewable',
  not_confirmable: 'invoiceInboxSaveErrorNotConfirmable',
  duplicate_invoice: 'invoiceInboxConfirmErrorDuplicate',
  missing_exchange_rate: 'invoiceInboxConfirmErrorExchangeRate',
  vendor_address_missing: 'invoiceInboxConfirmErrorVendorAddress',
  QUOTA_EXCEEDED: 'invoiceInboxConfirmErrorQuota',
  price_list_tax_included: 'invoiceInboxConfirmErrorPriceListTax',
  confirm_failed: 'invoiceInboxConfirmErrorFailed',
  not_valid: 'invoiceInboxSaveErrorNotValid',
  unknown_tax: 'invoiceInboxSaveErrorUnknownTax',
  invalid_value: 'invoiceInboxSaveErrorInvalidValue',
  invalid_request: 'invoiceInboxSaveErrorInvalidValue',
  too_many_lines: 'invoiceInboxSaveErrorTooManyLines',
  line_not_found: 'invoiceInboxSaveErrorLineNotFound',
  unknown_vendor: 'invoiceInboxSaveErrorUnknownVendor',
  unknown_product: 'invoiceInboxSaveErrorUnknownProduct',
  unknown_category: 'invoiceInboxSaveErrorUnknownCategory',
  unknown_uom: 'invoiceInboxSaveErrorUnknownUom',
  document_too_large: 'invoiceInboxSaveErrorTooLarge',
  request_too_large: 'invoiceInboxSaveErrorTooLarge',
  missing_updated: 'invoiceInboxSaveErrorGeneric',
  feature_disabled: 'invoiceInboxReviewErrorFeatureDisabled',
  org_not_allowed: 'invoiceInboxReviewErrorOrg',
  access_denied: 'invoiceInboxSaveErrorAccess',
  not_found: 'invoiceInboxReviewErrorNotFound',
});
const SAVE_ERROR_FALLBACK_KEY = 'invoiceInboxSaveErrorGeneric';

export function saveErrorKey(code) {
  return SAVE_ERROR_LABEL_KEYS[code] ?? SAVE_ERROR_FALLBACK_KEY;
}

/**
 * Refusals that mean "the document is not what you were editing": the SPA reloads it, drops the
 * unsaved local edits and shows a notice (S2-D4), instead of rolling back and offering a retry.
 */
const RELOAD_CODES = new Set(['stale_document', 'processing', 'not_editable', 'not_reviewable', 'not_confirmable']);

export function isReloadCode(code) {
  return RELOAD_CODES.has(code);
}

/** The "Marcar como revisada" button is enabled only on a valid PENDING_REVIEW document. */
export function canMarkReviewed(review) {
  return review?.status === STATUS.PENDING_REVIEW && review?.editable !== false && pendingCount(review.document) === 0;
}

/** A failed confirm the document can be retried from (stored `ERROR` / `CONFIRM_FAILED`). */
export function isConfirmRetry(review) {
  return review?.status === STATUS.ERROR && review?.errorCode === 'CONFIRM_FAILED';
}

/**
 * "Confirmar factura" is enabled on a PENDING_REVIEW or READY document, or on an ERROR one whose code is
 * CONFIRM_FAILED ("Reintentar") or MISSING_FIELDS (completed since: the server recomputes), that the user may edit and that has no required field pending. Marking as reviewed
 * is not a precondition (ETP-6051).
 */
export function canConfirm(review) {
  if (!review || review.editable === false) return false;
  const confirmable = review.status === STATUS.PENDING_REVIEW || review.status === STATUS.READY
    || (review.status === STATUS.ERROR && CONFIRMABLE_ERROR_CODES.has(review.errorCode));
  return confirmable && pendingCount(review.document) === 0;
}

/** `validation.missing` codes the server adds for a confirm blocker that no input shows, by kind. */
const BLOCKER_CODES = Object.freeze({ exchangeRate: 'exchangeRate', vendorAddress: 'vendorAddress' });

/**
 * The blockers of a confirm the server reports in `validation.missing` that no input shows (the
 * exchange rate of the document currency, a vendor without a usable address): the kinds present, in
 * the order of `BLOCKER_CODES`.
 */
export function confirmBlockers(document) {
  const codes = missingSet(document);
  return Object.entries(BLOCKER_CODES).filter(([, code]) => codes.has(code)).map(([kind]) => kind);
}
