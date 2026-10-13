import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
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
async function findBpLocation({ token, apiBaseUrl, bpId }) {
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
    minSimPercent: 30,
    // More than one so an ambiguous exact-name match (two products with the same name)
    // is detectable; the best candidate is still the first one.
    qtyResults: PRODUCT_SIM_QTY_RESULTS,
  });
}

/**
 * Decide what to do with the simSearch result of one line description.
 *  - exactly one candidate whose name equals the description (trim + case-insensitive)
 *    → `{ id }`: safe to auto-assign;
 *  - otherwise, when there is any candidate (>= minSimPercent) → `{ suggestion }` with the
 *    best one: the user must confirm it in the popup, it is never assigned silently
 *    (a partial name such as "Mantenimiento Web" vs "Servicio de desarrollo y mantenimiento
 *    web" is a different product);
 *  - no candidates → `{}`.
 * Exported for testing.
 */
export function classifyProductMatch(description, match) {
  const candidates = (Array.isArray(match?.candidates) && match.candidates.length > 0
    ? match.candidates
    : [match]).filter((c) => c?.id);
  if (candidates.length === 0) return {};
  const wanted = normalizeName(description);
  const exact = wanted ? candidates.filter((c) => normalizeName(c.name) === wanted) : [];
  if (exact.length === 1) return { id: exact[0].id };
  const best = candidates[0];
  return { suggestion: { id: best.id, name: String(best.name ?? best.id) } };
}

/**
 * Build a single search term for a tax line. The PDF can show:
 *   - a textual label only ("Exento", "IVA 21%", "IVA Compras 21%")
 *   - a numeric rate only ("21%", "12")
 *   - both at once
 *
 * We prefer the label because it carries more signal for trigram similarity.
 * Falling back to "<rate>%" still produces a usable search term for plain
 * percentages because pg_trgm matches the "<digits>%" tail against tax
 * identifiers like "IVA Compras 21%".
 *
 * Exported for testing.
 */
export function buildTaxSearchTerm(line) {
  const label = String(line?.tax_label ?? '').trim();
  if (label) return label;
  const rateRaw = line?.tax_rate;
  // Number(null) is 0, so guard against null/undefined before coercing.
  if (rateRaw == null) return null;
  const rate = Number(rateRaw);
  if (!Number.isFinite(rate)) return null;
  return `${rate}%`;
}

export async function findTax({ token, value, extracted }) {
  const term = String(value ?? extracted?.tax_label ?? '').trim();
  if (!term) return null;
  const matches = await simSearch({
    token,
    entityName: 'FinancialMgmtTaxRate',
    items: [term],
    minSimPercent: 50,
    qtyResults: 1,
  });
  const match = matches?.[0];
  return match?.id ? { id: match.id, label: match.name || term } : null;
}

/**
 * Resolve the C_Tax_ID for each invoice line via simSearch on
 * FinancialMgmtTaxRate. The webhook runs through OBDal/OBContext, so client
 * and organization filters are inherited from the user session — no need to
 * pass them explicitly.
 *
 * Returns an array of length lines.length with one entry per line: the
 * matched tax id or null. Lines without any tax info also return null.
 *
 * minSimPercent intentionally raised to 50 to reduce false positives from
 * unrelated rate-only queries ("21%" must look like a real tax identifier
 * in the catalog before we accept the match).
 */
export async function resolveTaxesForLines({ token, lines }) {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  const terms = lines.map(buildTaxSearchTerm);
  if (terms.every(t => !t)) return Array(lines.length).fill(null);
  // simSearch returns one slot per requested item; empty terms produce no match.
  const items = terms.map(t => t || '');
  const matches = await simSearch({
    token,
    entityName: 'FinancialMgmtTaxRate',
    items,
    minSimPercent: 50,
    qtyResults: 1,
  });
  // Normalise to id-or-null array indexed by line idx.
  return matches.map(m => m?.id || null);
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

/**
 * Map line idx → productId. Falls back to the product-resolver popup when
 * simSearch leaves a line unmatched. Returns `{ cancelled: true }` when the
 * user dismisses the popup.
 */
async function resolveProductsForLines({ lines, productMatches, askUserForProducts, apiBaseUrl }) {
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
    });
  });
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

  // Run product + tax simSearch in parallel — both hit the same webhook and
  // are independent of the BP resolution path.
  const [productMatches, taxIds] = await Promise.all([
    runProductSimSearch({ token, lines }),
    resolveTaxesForLines({ token, lines }),
  ]);

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
  if (productResolution.cancelled) return { cancelled: true };
  const { productByIdx } = productResolution;

  // Map idx → tax id: user's explicit pick from the lines modal wins,
  // simSearch result is the fallback.
  const taxByIdx = {};
  lines.forEach((line, idx) => {
    const explicit = line?._tax_id;
    if (explicit) taxByIdx[idx] = explicit;
    else if (taxIds[idx]) taxByIdx[idx] = taxIds[idx];
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
