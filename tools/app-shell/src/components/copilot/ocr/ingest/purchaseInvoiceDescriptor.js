import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { isBack } from '../ocrFlowSignals.js';
import { buildSearchUrl, deriveSelectorUrl, deriveSpecBase, readSearchRows } from '../ocrQuery.js';

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
/**
 * Translate the vision-LLM extracted JSON for a purchase invoice into a list
 * of batch operations.
 *
 * The descriptor is the only per-window code: it decides what to look up
 * client-side, when to ask the user (typically via {@code askUserForBp}), and
 * how to thread refs between operations. The server's role is just to run
 * what we hand it inside one transaction.
 *
 * Returns either:
 *   - {@code { ops: [...] }} ready to POST to {@code /sws/neo/batch}, or
 *   - {@code { cancelled: true }} when the user dismissed a required popup.
 */
export function nonBlank(value) {
  return value != null && String(value).trim() !== '';
}

export function toIsoDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return trimmed;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Fetch the BP's first active location id. The invoice header requires
 * partnerAddress (C_BPartner_Location_ID) NOT NULL, and the SE_Invoice_BPartner
 * callout only sets it when the BP has a primary location flagged in a way the
 * callout recognizes — which isn't reliable through /batch. So we resolve it
 * client-side and embed it in the header body.
 */
export async function findBpLocation({ token, apiBaseUrl, bpId }) {
  const { locationId } = await lookupBpLocation({ token, apiBaseUrl, bpId });
  return locationId;
}

/**
 * Whether the BP has an active address, told apart from "could not ask". A BP with none
 * cannot carry a purchase invoice (partnerAddress is NOT NULL), so the review modal stops
 * there instead of posting a batch that is certain to fail (ETP-5289).
 *
 * @returns {Promise<'present'|'missing'|'unknown'>}
 */
export async function checkBpHasLocation({ token, apiBaseUrl, bpId }) {
  const { locationId, known } = await lookupBpLocation({ token, apiBaseUrl, bpId });
  if (locationId) return 'present';
  return known ? 'missing' : 'unknown';
}

const DUPLICATE_LOOKUP_LIMIT = 10;

function docStatusCode(value) {
  if (value && typeof value === 'object') return value.id ?? value.value ?? null;
  return value ?? null;
}

/**
 * Existing purchase invoices of `bpId` carrying the same supplier document number
 * ("Nº documento", sent as `orderReference` by the descriptor), so the review modal can warn
 * before a second invoice is created from the same PDF (ETP-5654). Warn-only: the caller never
 * blocks on the answer.
 *
 * Narrowed server-side with the same SmartClient `criteria` the list windows send (no HQL, so
 * the production WAF lets it through): partner `equals`, document number `iEquals`
 * (case-insensitive exact), status `notEqual` 'VO' (voided invoices do not count; drafts and
 * completed ones do). The rows are re-checked here — trimmed, case-insensitive, non-voided —
 * so a backend that ignores an operator still cannot produce a false warning (a row that does
 * not carry `orderReference` at all is trusted to the server-side filter).
 *
 * @returns {Promise<{status: 'none'|'duplicate'|'unknown', invoices: Array<{id: string, documentNo: string|null}>}>}
 */
export async function findDuplicatePurchaseInvoices({ token, apiBaseUrl, bpId, documentNo }) {
  const wanted = String(documentNo ?? '').trim();
  if (!apiBaseUrl || !bpId || !wanted) return { status: 'unknown', invoices: [] };
  const criteria = [
    { fieldName: 'businessPartner', operator: 'equals', value: bpId },
    { fieldName: 'orderReference', operator: 'iEquals', value: wanted },
    { fieldName: 'documentStatus', operator: 'notEqual', value: 'VO' },
  ];
  const qs = new URLSearchParams({
    _startRow: '0',
    _endRow: String(DUPLICATE_LOOKUP_LIMIT - 1),
    criteria: JSON.stringify(criteria),
  });
  const url = `${deriveSpecBase(apiBaseUrl, 'purchase-invoice')}/header?${qs.toString()}`;
  try {
    const res = await apiFetch(url, { baseUrl: '', token });
    if (!res.ok) {
      console.warn('[OCR][findDuplicatePurchaseInvoices] non-OK', res.status, url);
      return { status: 'unknown', invoices: [] };
    }
    const json = await res.json().catch(() => null);
    if (!json) return { status: 'unknown', invoices: [] };
    const needle = wanted.toLowerCase();
    const invoices = readSearchRows(json)
      .filter((row) => row?.id
        && (row.orderReference === undefined || String(row.orderReference ?? '').trim().toLowerCase() === needle)
        && docStatusCode(row.documentStatus) !== 'VO')
      .map((row) => ({ id: row.id, documentNo: row.documentNo ?? null }));
    return { status: invoices.length ? 'duplicate' : 'none', invoices };
  } catch (e) {
    console.warn('[OCR][findDuplicatePurchaseInvoices] fetch failed', e);
    return { status: 'unknown', invoices: [] };
  }
}

async function lookupBpLocation({ token, apiBaseUrl, bpId }) {
  if (!apiBaseUrl || !bpId) return { locationId: null, known: false };
  // The header's own partnerAddress selector, fed the vendor the way the invoice form feeds
  // it: no HQL in the query string (see ocrQuery.js), and it applies the same validation the
  // form applies, so the address picked here is one the form would accept.
  const url = buildSearchUrl(
    deriveSelectorUrl(apiBaseUrl, 'purchase-invoice', 'header', 'C_BPartner_Location_ID'),
    { limit: 1, params: { ...VENDOR_SELECTOR_PARAMS, C_BPartner_ID: bpId } },
  );
  try {
    const res = await apiFetch(url, { baseUrl: '', token });
    if (!res.ok) {
      console.warn('[OCR][findBpLocation] non-OK', res.status, url);
      return { locationId: null, known: false };
    }
    const json = await res.json().catch(() => null);
    if (!json) return { locationId: null, known: false };
    return { locationId: readSearchRows(json)[0]?.id || null, known: true };
  } catch (e) {
    console.warn('[OCR][findBpLocation] fetch failed', e);
    return { locationId: null, known: false };
  }
}

/**
 * Context the invoice form hands the vendor selectors of a purchase invoice.
 */
export const VENDOR_SELECTOR_PARAMS = Object.freeze({ isSOTrx: 'N', isVendor: 'Y' });

/**
 * Search the purchase-invoice vendor selector by name. Returns the matching rows
 * (`{ id, name }`), or null when the request could not be made or answered non-OK.
 */
export async function searchVendors({ token, apiBaseUrl, name, limit }) {
  if (!apiBaseUrl || !nonBlank(name)) return null;
  const url = buildSearchUrl(
    deriveSelectorUrl(apiBaseUrl, 'purchase-invoice', 'header', 'C_BPartner_ID'),
    { query: name, limit, params: VENDOR_SELECTOR_PARAMS },
  );
  try {
    const res = await apiFetch(url, { baseUrl: '', token });
    if (!res.ok) {
      console.warn('[OCR][searchVendors] non-OK', res.status, url);
      return null;
    }
    const json = await res.json().catch(() => null);
    return readSearchRows(json);
  } catch (e) {
    console.warn('[OCR][searchVendors] fetch failed', e);
    return null;
  }
}

function normalizeName(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Look up an existing vendor whose name equals the extracted one (case-insensitive).
 * The selector's `q` is a contains-search, so the exact match is picked out here.
 * Returns the BP id when exactly one vendor matches, otherwise null — several
 * candidates are left to the popup, where the user is already in the loop.
 */
export async function findBp({ token, apiBaseUrl, name }) {
  const rows = await searchVendors({ token, apiBaseUrl, name });
  if (!rows) return null;
  const wanted = normalizeName(name);
  const exact = rows.filter((row) => normalizeName(row.name) === wanted);
  return exact.length === 1 ? exact[0].id : null;
}

const PRODUCT_SIM_QTY_RESULTS = 3;

/**
 * Run simSearch on the line descriptions. Returns an empty array when there
 * is nothing to look up so the caller can index by line idx safely.
 */
async function runProductSimSearch({ token, lines }) {
  const productHints = lines.map(l => String(l?.description ?? '').trim());
  if (productHints.length === 0) return [];
  return simSearch({
    token,
    entityName: 'Product',
    items: productHints,
    minSimPercent: 50,
    // More than one so an ambiguous exact-name match (two products with the same name)
    // is detectable; the best candidate is still the first one.
    qtyResults: PRODUCT_SIM_QTY_RESULTS,
  });
}

/**
 * Normalizer for the EXACT-name step of the product classification (ETP-5654, CP-7): NFC, trim
 * (ECMAScript WhiteSpace + LineTerminator, NBSP included), lowercase, then diacritics stripped
 * (NFD + removal of combining marks), so "Arnés" equals "Arnes" exactly like "60M" equals "60m". The
 * n-tilde is deliberately kept distinct ("año" is not "ano": different words, and a silent wrong
 * product is worse than a suggestion), so it is protected with a placeholder while the marks are
 * stripped. The fold also applies to an identical candidate: if the catalog holds both "Arnés X"
 * and "Arnes X", the description "Arnés X" has two normalized-exact matches and goes to the user
 * as a suggestion (candidates[0], which may not be the identical one); the safe direction by
 * design. Mirrors OcrProductMatch.normalizeProductName in com.etendoerp.go; keep both identical:
 * `trim()` already is the ECMAScript whitespace set, which the Java twin spells out because
 * String.trim() (<= U+0020) and strip() (keeps NBSP) do not match it.
 * Not used for vendor matching (`normalizeName`). Exported for testing.
 */
export function normalizeProductName(value) {
  if (value == null) return '';
  return String(value)
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replaceAll('ñ', '\u0001')
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .replaceAll('\u0001', 'ñ');
}

/**
 * Whole-string similarity (0-100, inclusive) at which a catalog product is taken automatically
 * (ETP-5895). It is `text_similarity_percent`, not the endpoint score: the score counts a name that
 * merely CONTAINS the description as 100 ("Mantenimiento Web" inside "Servicio de desarrollo y
 * mantenimiento web"), while the whole-string similarity stays high only for near-identical names
 * ("Agua sin Gas 1" vs "Agua sin Gas 1L": 82-88 for a missing letter or unit).
 */
export const PRODUCT_AUTO_MATCH_MIN_SIMILARITY = 85;
/** Lead, in whole-string similarity points, the best candidate needs over the runner-up. */
export const PRODUCT_AUTO_MATCH_MIN_GAP = 10;
/** Score threshold kept for a backend that does not send `text_similarity_percent` yet. */
export const PRODUCT_AUTO_MATCH_LEGACY_MIN_SCORE = 90;

// Defensive parse: simSearch hands the percentage over as a string (trailing '%' stripped), and
// anything missing or non-numeric ('', undefined, '96.7%') must never count as a match.
function parsePercent(raw) {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

// How the backend says a candidate relates to the description: 2 equal ignoring case and spaces,
// 1 equal once accents are ignored too, 0 otherwise. The backend compares every identifier column
// (a product's search key too), so it can find what the name-only step 1 cannot.
function backendMatchRank(candidate) {
  if (candidate?.matchType === 'exact' || (candidate?.matchType == null && candidate?.exactMatch === true)) return 2;
  return candidate?.matchType === 'normalized' ? 1 : 0;
}

// The candidate to take by similarity, or null when it is not safe: the highest valid value must
// reach the threshold and be held by exactly ONE candidate (strict equality on the parsed numbers),
// leading the runner-up by `minGap`. A tie at the top is ambiguous, so the user decides.
function pickBy(candidates, valueOf, minValue, minGap) {
  const scored = candidates
    .map((c) => ({ c, value: parsePercent(valueOf(c)) }))
    .filter((x) => !Number.isNaN(x.value))
    .sort((a, b) => b.value - a.value);
  if (scored.length === 0 || scored[0].value < minValue) return null;
  const runnerUp = scored.length > 1 ? scored[1].value : -Infinity;
  if (runnerUp === scored[0].value || scored[0].value - runnerUp < minGap) return null;
  return scored[0].c;
}

function pickBySimilarity(candidates) {
  const hasTextSimilarity = candidates.some((c) => c.textSimilarityPercent != null);
  return hasTextSimilarity
    ? pickBy(candidates, (c) => c.textSimilarityPercent, PRODUCT_AUTO_MATCH_MIN_SIMILARITY, PRODUCT_AUTO_MATCH_MIN_GAP)
    : pickBy(candidates, (c) => c.similarityPercent, PRODUCT_AUTO_MATCH_LEGACY_MIN_SCORE, 0);
}

/**
 * Decide what to do with the simSearch result of one line description, in this order:
 *  1. exactly one candidate whose name equals the description (trim, case- and accent-
 *     insensitive via `normalizeProductName`; ñ stays distinct) → `{ id }`; two or more exact
 *     names (also "Arnés X" + "Arnes X" for "Arnés X") are ambiguous → suggestion;
 *  2. exactly one candidate the backend marks as equal (`matchType` 'exact', or 'normalized' when
 *     only accents differ; the search key counts too) → `{ id }`; two or more → suggestion;
 *  3. the candidate with the HIGHEST whole-string similarity (`textSimilarityPercent`), when it is
 *     >= PRODUCT_AUTO_MATCH_MIN_SIMILARITY and leads the runner-up by PRODUCT_AUTO_MATCH_MIN_GAP
 *     → `{ id }` (a missing letter or unit). A backend without that field falls back to the
 *     endpoint score >= PRODUCT_AUTO_MATCH_LEGACY_MIN_SCORE held by one candidate (ETP-5654).
 *     A missing or non-numeric value never qualifies;
 *  4. otherwise, when there is any candidate (>= minSimPercent) → `{ suggestion }` with the
 *     first one: the user must confirm it in the popup (a partial name such as "Mantenimiento
 *     Web" vs "Servicio de desarrollo y mantenimiento web" is a different product);
 *  5. no candidates → `{}`.
 * Mirrors OcrProductMatch in com.etendoerp.go; keep both identical. Exported for testing.
 */
export function classifyProductMatch(description, match) {
  const candidates = (Array.isArray(match?.candidates) && match.candidates.length > 0
    ? match.candidates
    : [match]).filter((c) => c?.id);
  if (candidates.length === 0) return {};
  const best = candidates[0];
  const suggestion = { suggestion: { id: best.id, name: String(best.name ?? best.id) } };
  const wanted = normalizeProductName(description);
  const exact = wanted ? candidates.filter((c) => normalizeProductName(c.name) === wanted) : [];
  if (exact.length === 1) return { id: exact[0].id };
  if (exact.length > 1) return suggestion;
  const bestRank = Math.max(...candidates.map(backendMatchRank));
  if (bestRank > 0) {
    const equal = candidates.filter((c) => backendMatchRank(c) === bestRank);
    return equal.length === 1 ? { id: equal[0].id } : suggestion;
  }
  const bySimilarity = pickBySimilarity(candidates);
  return bySimilarity ? { id: bySimilarity.id } : suggestion;
}

/**
 * Preselect the purchase tax of a line from the backend `defaultTax` action (ETP-5585),
 * which resolves it from the vendor's location, the invoice date and the printed rate.
 * Never a similarity search: that picked an arbitrary tax.
 *
 * Returns `{ id, label, rate }`, or null whenever there is nothing to preselect (no rate
 * read from the PDF, no partner address, non-OK answer, no tax, network error). Null never
 * blocks the flow: the line is sent without `tax` and the callout decides.
 *
 * One request per distinct rate and OCR run: the promise is memoized in `taxContext.cache`.
 * A successful answer with no tax records the rate in `taxContext.noMatch` so the lines
 * modal can hint "no purchase tax at that rate".
 */
export async function findDefaultTax({ token, apiBaseUrl, extracted, taxContext }) {
  const rawRate = extracted?.tax_rate;
  if (rawRate == null || String(rawRate).trim() === '') return null;
  const rate = Number(rawRate);
  if (!Number.isFinite(rate)) return null;
  const partnerAddressId = taxContext?.partnerAddressId;
  if (!partnerAddressId) return null;

  const cache = taxContext.cache;
  if (cache?.has(rate)) return cache.get(rate);
  const pending = requestDefaultTax({ token, apiBaseUrl, taxContext, partnerAddressId, rate });
  cache?.set(rate, pending);
  return pending;
}

async function requestDefaultTax({ token, apiBaseUrl, taxContext, partnerAddressId, rate }) {
  const body = { partnerAddressId, rate };
  if (nonBlank(taxContext.invoiceDate)) body.invoiceDate = toIsoDate(taxContext.invoiceDate);
  const url = `${deriveSpecBase(apiBaseUrl, 'purchase-invoice')}/lines/new/action/defaultTax`;
  try {
    const res = await apiFetch(url, {
      baseUrl: '',
      token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[OCR][findDefaultTax] non-OK', res.status, url);
      return null;
    }
    const json = await res.json().catch(() => null);
    const data = json?.response?.data;
    if (!data?.taxId) {
      if (data) taxContext.noMatch?.add(rate);
      return null;
    }
    return { id: data.taxId, label: data.identifier || data.taxId, rate: data.rate ?? rate };
  } catch (e) {
    console.warn('[OCR][findDefaultTax] fetch failed', e);
    return null;
  }
}

/**
 * Resolve the vendor BP. Returns one of:
 *   - { bpId, bpCreate: null, locationCreate: null }   — existing BP found
 *   - { bpId: null, bpCreate, locationCreate? }        — user filled the popup
 *   - { cancelled: true }                              — user dismissed popup
 */
async function resolveBpOrAskUser({ token, apiBaseUrl, safe, askUserForBp }) {
  const bpId = await findBp({
    token,
    apiBaseUrl,
    name: safe.vendor_name,
  });
  if (bpId) return { bpId, bpCreate: null, locationCreate: null };
  if (typeof askUserForBp !== 'function') {
    return { bpId: null, bpCreate: null, locationCreate: null };
  }
  const fields = await askUserForBp({
    prefilled: {
      name: safe.vendor_name || '',
      taxId: safe.tax_id || '',
      phone: safe.vendor_phone || '',
      email: safe.vendor_email || '',
      addressLine1: safe.vendor_address || '',
    },
  });
  if (!fields) return { cancelled: true };
  const { location, ...bpFields } = fields;
  const bpCreate = { id: 'bp', spec: 'contacts', entity: 'businessPartner', body: bpFields };
  const locationCreate = location
    ? {
      id: 'loc',
      spec: 'contacts',
      entity: 'locationAddress',
      parentRef: 'bp',
      body: { ...location, businessPartner: '$ref:bp' },
    }
    : null;
  return { bpId: null, bpCreate, locationCreate };
}

/**
 * Resolve the partnerAddress for the invoice header. NOT NULL on C_Invoice;
 * for a freshly-created BP it points at the location op via $ref, for an
 * existing BP we look up the first active location ourselves.
 */
async function resolvePartnerAddress({ token, apiBaseUrl, bpId, locationCreate }) {
  if (bpId) return findBpLocation({ token, apiBaseUrl, bpId });
  if (locationCreate) return '$ref:loc';
  return null;
}

function buildHeaderBody(safe, bpId, partnerAddress, extras = {}) {
  const headerBody = {};
  const documentNo = extras.documentNo ?? safe.document_no;
  if (nonBlank(documentNo)) headerBody.orderReference = String(documentNo).trim();
  const invoiceDate = extras.invoiceDate ?? safe.invoice_date;
  if (nonBlank(invoiceDate)) headerBody.invoiceDate = toIsoDate(invoiceDate);
  headerBody.businessPartner = bpId || '$ref:bp';
  if (partnerAddress) headerBody.partnerAddress = partnerAddress;
  return headerBody;
}

// Splits the lines into those already matched to a product (`productByIdx`) and those the user
// must pick one for (`needsUserPick`).
function partitionLinesByProductMatch(lines, productMatches) {
  const productByIdx = {};
  const needsUserPick = [];
  lines.forEach((line, idx) => {
    const description = String(line?.description ?? `line ${idx + 1}`).trim();
    const { id, suggestion } = classifyProductMatch(line?.description, productMatches[idx]);
    if (id) {
      productByIdx[idx] = id;
      return;
    }
    needsUserPick.push({
      idx,
      description,
      suggestion: suggestion ?? null,
      quantity: nonBlank(line?.quantity) ? Number(line.quantity) : null,
      unitPrice: nonBlank(line?.unit_price) ? Number(line.unit_price) : null,
      // The tax the line carries from the lines review (preselected or picked), so the
      // create-product form can prefill that tax's category. Null on "Autocompletar".
      taxId: line?._tax_id || null,
    });
  });
  return { productByIdx, needsUserPick };
}

/**
 * Map line idx → productId. Falls back to the product-resolver popup when
 * simSearch leaves a line unmatched. Returns `{ cancelled: true }` when the
 * user dismisses the popup.
 */
async function resolveProductsForLines({ lines, productMatches, askUserForProducts, apiBaseUrl }) {
  const { productByIdx, needsUserPick } = partitionLinesByProductMatch(lines, productMatches);
  if (needsUserPick.length === 0 || typeof askUserForProducts !== 'function') {
    return { productByIdx };
  }
  // Sibling product spec (`/sws/neo/<host>` → `/sws/neo/product`) — the popup creates
  // products there and reads its UoM / tax-category selectors.
  const productSpecUrl = apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '/product') : null;
  // Product search goes through a selector with a plain `q` (see ocrQuery.js), but NOT the
  // line's own M_Product_ID selector: that one is ProductSimple, built over
  // PricingProductPrice, so it hides every product without a price and repeats the rest
  // once per price list version. The intrastat tab's M_Product_ID is the plain product search
  // (reference 800060, no validation rule) and lives in the same spec as the invoice.
  const selectorUrl = apiBaseUrl
    ? deriveSelectorUrl(apiBaseUrl, 'purchase-invoice', 'intrastat', 'M_Product_ID')
    : null;
  const picks = await askUserForProducts({ unmatched: needsUserPick, selectorUrl, productSpecUrl });
  // ETP-5654 — BACK is a navigation signal, not a cancel: nothing was decided or sent.
  if (isBack(picks)) return { back: true };
  if (picks === null) return { cancelled: true };
  for (const [idxStr, productId] of Object.entries(picks || {})) {
    if (productId) productByIdx[Number(idxStr)] = productId;
  }
  return { productByIdx };
}

/**
 * Build the line ops + unmatched-name list. The DB trigger
 * c_invline_chk_restrictions_trg rejects rows where M_Product_ID is null with
 * @InvoiceLineAmountMustBeZero@, so any still-unresolved line is dropped from
 * the batch and surfaced for the user to add manually.
 *
 * `taxByIdx` is optional: when a tax id was resolved client-side it is set on
 * the line; otherwise the field is omitted so NEO's tax callout can still
 * derive a default from the product + business partner + invoice date.
 */
export function buildLineOps(lines, productByIdx, taxByIdx = {}) {
  const lineOps = [];
  const unmatched = [];
  lines.forEach((line, idx) => {
    const productId = productByIdx[idx];
    if (!productId) {
      unmatched.push(String(line?.description ?? `line ${idx + 1}`).trim());
      return;
    }
    const body = { product: productId };
    if (nonBlank(line?.description)) body.description = String(line.description).trim();
    if (nonBlank(line?.quantity)) body.invoicedQuantity = Number(line.quantity);
    if (nonBlank(line?.unit_price)) {
      const price = Number(line.unit_price);
      body.unitPrice = price;
      body.listPrice = price;
    }
    if (taxByIdx[idx]) body.tax = taxByIdx[idx];
    lineOps.push({
      id: `ln${idx}`,
      spec: 'purchase-invoice',
      entity: 'Lines',
      parentRef: 'inv',
      body,
    });
  });
  return { lineOps, unmatched };
}

export async function buildPurchaseInvoiceBatch(extracted, ctx) {
  const safe = extracted || {};
  const rawLines = Array.isArray(safe.line_items) ? safe.line_items : [];
  const { token, apiBaseUrl, askUserForBp, askUserForProducts, reviewedHeader, reviewedLines } = ctx || {};

  // Merge OCR lines with the user's per-line edits. When the lines modal
  // isn't in play (no `reviewedLines`), fall back to the raw OCR data.
  const lines = rawLines.map((line, idx) => {
    const override = reviewedLines?.[idx];
    if (!override) return { ...line };
    return {
      ...line,
      description: nonBlank(override.description) ? override.description : line?.description,
      quantity: nonBlank(override.quantity) ? override.quantity : line?.quantity,
      unit_price: nonBlank(override.unit_price) ? override.unit_price : line?.unit_price,
      tax_label: nonBlank(override.tax_label) ? override.tax_label : line?.tax_label,
      tax_rate: override.tax_rate ?? line?.tax_rate,
      _tax_id: override.tax_id || null,
    };
  });

  // Product simSearch is independent of the BP resolution path. Taxes are NOT searched here:
  // the lines modal preselects them via `findDefaultTax`; an unresolved one is omitted below.
  const productMatches = await runProductSimSearch({ token, lines });

  // Vendor: prefer the review modal's resolution; fall back to the legacy
  // ContactCreatePopup branch when the modal isn't in play.
  let bpId = null;
  let bpCreate = null;
  let locationCreate = null;
  if (reviewedHeader?.vendor) {
    bpId = reviewedHeader.vendor.bpId || null;
    bpCreate = reviewedHeader.vendor.bpCreate || null;
    locationCreate = reviewedHeader.vendor.locationCreate || null;
  } else {
    const bpResolution = await resolveBpOrAskUser({ token, apiBaseUrl, safe, askUserForBp });
    if (bpResolution.cancelled) return { cancelled: true };
    bpId = bpResolution.bpId;
    bpCreate = bpResolution.bpCreate;
    locationCreate = bpResolution.locationCreate;
  }

  const partnerAddress = await resolvePartnerAddress({ token, apiBaseUrl, bpId, locationCreate });

  const productResolution = await resolveProductsForLines({
    lines,
    productMatches,
    askUserForProducts,
    apiBaseUrl,
  });
  if (productResolution.back) return { back: true };
  if (productResolution.cancelled) return { cancelled: true };
  const { productByIdx } = productResolution;

  // Map idx → tax id: only what the lines modal holds (preselected by `findDefaultTax` or
  // picked by the user). Empty means `tax` is omitted and NEO's callout decides.
  const taxByIdx = {};
  lines.forEach((line, idx) => {
    if (line?._tax_id) taxByIdx[idx] = line._tax_id;
  });

  const ops = [];
  if (bpCreate) ops.push(bpCreate);
  if (locationCreate) ops.push(locationCreate);
  ops.push({
    id: 'inv',
    spec: 'purchase-invoice',
    entity: 'Header',
    body: buildHeaderBody(safe, bpId, partnerAddress, {
      documentNo: reviewedHeader?.documentNo ?? null,
      invoiceDate: reviewedHeader?.invoiceDate ?? null,
    }),
  });
  const { lineOps, unmatched } = buildLineOps(lines, productByIdx, taxByIdx);
  ops.push(...lineOps);

  return { ops, unmatched };
}

export default buildPurchaseInvoiceBatch;
