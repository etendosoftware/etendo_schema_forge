import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { deriveContactsApiBase } from '../contactApi.js';

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
  if (!apiBaseUrl || !token || !bpId) return null;
  const contactsBase = apiBaseUrl.replace(/\/[^/]+$/, '/contacts');
  const where = encodeURIComponent(`businessPartner.id = '${bpId}' and active = true`);
  const url = `${contactsBase}/locationAddress?_neoWhere=${where}&limit=1`;
  try {
    const res = await apiFetch(url, { baseUrl: '', token });
    if (!res.ok) {
      console.warn('[OCR][findBpLocation] non-OK', res.status, url);
      return null;
    }
    const json = await res.json().catch(() => null);
    const data = json?.response?.data ?? json?.data ?? [];
    return data[0]?.id || null;
  } catch (e) {
    console.warn('[OCR][findBpLocation] fetch failed', e);
    return null;
  }
}

/**
 * Look up an existing BusinessPartner by taxID then name, using the contacts
 * spec selector. Returns the BP id when a single active match is found,
 * otherwise null. Multiple-candidate disambiguation is intentionally left to
 * the popup — by the time we trigger it the user is already in the loop.
 */
export async function findBp({ token, apiBaseUrl, taxId, name }) {
  if (!apiBaseUrl || !token) return null;
  // apiBaseUrl points at the host spec (e.g. /sws/neo/purchase-invoice).
  // The contacts spec lives at the sibling /sws/neo/contacts; derive it the
  // same way ContactCreatePopup does so we hit a real endpoint, not the
  // host spec's nested path.
  const contactsBase = deriveContactsApiBase(apiBaseUrl);

  const tryQuery = async (property, value) => {
    if (!nonBlank(value)) return null;
    // NEO's NeoCrudHandler accepts `_neoWhere` as an extra HQL fragment
    // appended to the tab filter. Plain `?name=...` query params don't
    // reliably map to DAL field filters here, so we use the explicit clause.
    // Property names are HQL (DAL) properties, not DB columns: `taxID`, `name`,
    // `active`. Single quotes are escaped per HQL convention.
    const escaped = String(value).replace(/'/g, "''");
    const where = encodeURIComponent(`${property} = '${escaped}' and active = true`);
    const url = `${contactsBase}/businessPartner?_neoWhere=${where}`;
    try {
      const res = await apiFetch(url, { baseUrl: '', token });
      if (!res.ok) {
        console.warn('[OCR][findBp] non-OK', res.status, url);
        return null;
      }
      const json = await res.json().catch(() => null);
      const data = json?.response?.data ?? json?.data ?? [];
      console.log('[OCR][findBp]', property, '=', value, '→', data.length, 'match(es)');
      // Only resolve when exactly one row matches — multiple matches surface
      // the popup so the user can disambiguate.
      return data.length === 1 ? data[0]?.id : null;
    } catch (e) {
      console.warn('[OCR][findBp] fetch failed', e);
      return null;
    }
  };

  return (await tryQuery('taxID', taxId)) || (await tryQuery('name', name)) || null;
}

/**
 * Run simSearch on the line descriptions. Returns an empty array when there
 * is nothing to look up so the caller can index by line idx safely.
 */
async function runProductSimSearch({ token, lines }) {
  const productHints = lines.map(l => String(l?.description ?? '').trim());
  if (!token || productHints.length === 0) return [];
  return simSearch({
    token,
    entityName: 'Product',
    items: productHints,
    minSimPercent: 30,
    qtyResults: 1,
  });
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
  if (!token || !term) return null;
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
  if (!token || !Array.isArray(lines) || lines.length === 0) return [];
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
    taxId: safe.tax_id,
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
    const id = productMatches[idx]?.id;
    if (id) {
      productByIdx[idx] = id;
      return;
    }
    needsUserPick.push({
      idx,
      description: String(line?.description ?? `line ${idx + 1}`).trim(),
      quantity: nonBlank(line?.quantity) ? Number(line.quantity) : null,
      unitPrice: nonBlank(line?.unit_price) ? Number(line.unit_price) : null,
    });
  });
  if (needsUserPick.length === 0 || typeof askUserForProducts !== 'function') {
    return { productByIdx };
  }
  // Sibling product spec — same shape used elsewhere (`/sws/neo/<host>` → `/sws/neo/product`).
  // We use the standalone product entity list, NOT the line-context selector,
  // because the line selector filters by parent invoice's price list, which
  // we don't have at OCR time.
  const productSpecUrl = apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '/product') : null;
  const selectorUrl = productSpecUrl ? `${productSpecUrl}/product` : null;
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
