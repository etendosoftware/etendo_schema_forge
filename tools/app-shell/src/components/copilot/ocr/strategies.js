import CreateContactModalAdapter from './CreateContactModalAdapter.jsx';
import { findBp as findBpExact, findTax, searchVendors } from './ingest/purchaseInvoiceDescriptor.js';

// Fuzzy fallback: the exact findBp only accepts a name that matches the extracted one
// (and only when exactly one row matches). OCR routinely returns variants
// ("ACME, S.L." vs "ACME SL"), so we also accept the vendor selector's contains-search
// when the result is unambiguous.
async function findBpFuzzy({ token, apiBaseUrl, name }) {
  const rows = await searchVendors({ token, apiBaseUrl, name: name ? String(name).trim() : name, limit: 2 });
  // Auto-resolve only when the search yields exactly one candidate. With
  // multiple matches we let the user disambiguate in EntityField (which is
  // primed with the same hint).
  if (!rows || rows.length !== 1) return null;
  const row = rows[0];
  return row?.id ? { id: row.id, label: row.name || name } : null;
}

// Adapter: bridge the {name} signature of findBp to the generic PRE_RESOLVERS
// contract ({token, apiBaseUrl, value, extracted}) and return the same
// {id, label, bpId, bpCreate, locationCreate} shape EntityField emits when the
// user picks an item — so OcrReviewModal and purchaseInvoiceDescriptor can treat
// pre-resolved and user-picked vendors identically.
async function findBp({ token, apiBaseUrl, value, extracted }) {
  const name = extracted?.vendor_name ?? value;
  const exactId = await findBpExact({ token, apiBaseUrl, name });
  if (exactId) {
    return {
      id: exactId,
      label: name || exactId,
      bpId: exactId,
      bpCreate: null,
      locationCreate: null,
    };
  }
  const fuzzy = await findBpFuzzy({ token, apiBaseUrl, name });
  if (!fuzzy) return null;
  return {
    id: fuzzy.id,
    label: fuzzy.label,
    bpId: fuzzy.id,
    bpCreate: null,
    locationCreate: null,
  };
}

export const PRE_RESOLVERS = {
  findBp,
  findTax,
};

export const CREATE_COMPONENTS = {
  CreateContactModal: CreateContactModalAdapter,
};
