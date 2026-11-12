/**
 * ETP-6050 — pure helpers of the Invoice Inbox review panel (no React, no `@/` imports, so plain
 * `node --test` can cover them). They read the answer of `GET /header/{id}/action/review`
 * (`fetchReview`): the document is the `CURRENT_DATA` v1 contract of `com.etendoerp.go`
 * (`docs/neo-headless.md`, "CURRENT_DATA contract") plus the enrichment the review action adds
 * (`vendor.details`, `product.details`, `candidates[].city|searchKey|category|uom`).
 */
import { STATUS } from './invoiceInboxFilters.js';

/** Totals are shown to the cent; a printed total within ONE cent of the lines total matches. */
const CENT = 100;
const MISMATCH_TOLERANCE_CENTS = 1;

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

function round2(value) {
  return Math.round((Number(value) || 0) * CENT) / CENT;
}

/** Quantity x unit price of a line (0 for a missing or non-numeric side). */
export function lineAmount(line) {
  return round2((Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0));
}

/** The VAT rate of a line: the reader's `taxRate`, else the resolved tax's rate, else null. */
export function lineRate(line) {
  const raw = line?.taxRate ?? line?.tax?.rate;
  if (raw == null || raw === '') return null;
  const rate = Number(raw);
  return Number.isFinite(rate) ? rate : null;
}

/**
 * Totals recomputed from the lines: the base, one VAT row per rate (ascending; lines without a
 * rate add to the base only) and the lines total (base + VAT).
 *
 * @returns {{base: number, taxes: {rate: number, base: number, amount: number}[], linesTotal: number}}
 */
export function computeTotals(lines) {
  const byRate = new Map();
  let base = 0;
  for (const line of lines ?? []) {
    const amount = lineAmount(line);
    base += amount;
    const rate = lineRate(line);
    if (rate != null) byRate.set(rate, (byRate.get(rate) ?? 0) + amount);
  }
  const taxes = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, rateBase]) => ({ rate, base: round2(rateBase), amount: round2((rateBase * rate) / 100) }));
  const linesTotal = round2(round2(base) + taxes.reduce((sum, tax) => sum + tax.amount, 0));
  return { base: round2(base), taxes, linesTotal };
}

/**
 * The total the invoice carries: the printed one (`totalSource` `printed`) or the lines' (`lines`).
 * Falls back to the recomputed lines total when the document has none.
 */
export function documentTotal(header, totals) {
  const value = header?.totalAmount;
  if (value == null || value === '' || !Number.isFinite(Number(value))) return totals.linesTotal;
  return round2(value);
}

/**
 * Decision 4 — the non-blocking "total does not match" warning: only when the document's total is
 * the PRINTED one and the lines add up to something else.
 *
 * @returns {{lines: number, document: number}|null}
 */
export function totalMismatch(header, totals) {
  if (header?.totalSource !== 'printed') return null;
  const printed = Number(header?.totalAmount);
  if (!Number.isFinite(printed)) return null;
  // Compared in integer cents (per-line rounding makes a one-cent difference common).
  const diffCents = Math.abs(Math.round(printed * CENT) - Math.round(totals.linesTotal * CENT));
  if (diffCents <= MISMATCH_TOLERANCE_CENTS) return null;
  return { lines: totals.linesTotal, document: round2(printed) };
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

/** The review banners to show, in order, derived from the answer. Pure so the rules are testable. */
export function reviewBanners(review) {
  const banners = [];
  if (!review) return banners;
  if (review.status === STATUS.CONFIRMED) banners.push({ kind: 'confirmed' });
  // The unreadable banner only while the document is untouched: once the user edited it (ADJUSTED)
  // the data on screen is theirs.
  if (review.status === STATUS.ERROR && review.errorCode === 'UNREADABLE' && !review.adjusted) {
    banners.push({ kind: 'unreadable' });
  } else if (review.status === STATUS.ERROR && review.errorCode && review.errorCode !== 'UNREADABLE'
    && review.errorCode !== 'MISSING_FIELDS') {
    banners.push({ kind: 'error', code: review.errorCode });
  }
  if (!SETTLED.has(review.status)) {
    const duplicate = review.document?.header?.duplicate;
    if (duplicate?.state === 'found' && duplicate.invoices?.length) {
      banners.push({ kind: 'duplicate', invoice: duplicate.invoices[0] });
    }
    if (duplicate?.inbox?.length) banners.push({ kind: 'duplicateInbox', files: duplicate.inbox });
  }
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
