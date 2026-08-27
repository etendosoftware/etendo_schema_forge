import CreateContactModalAdapter from './CreateContactModalAdapter.jsx';
import { findBp as findBpLegacy, findTax } from './ingest/purchaseInvoiceDescriptor.js';
import { deriveContactsApiBase } from './contactApi.js';

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
function escHql(value) {
  return String(value).replace(/'/g, "''");
}

// Fuzzy fallback: the legacy findBp only accepts an exact taxID or name match
// (and only when exactly one row matches). OCR routinely returns variants
// ("ACME, S.L." vs "ACME SL"), so we also try a case-insensitive LIKE that
// resolves when the result is unambiguous.
async function findBpFuzzy({ token, apiBaseUrl, name }) {
  if (!apiBaseUrl || !token || !name || !String(name).trim()) return null;
  const contactsBase = deriveContactsApiBase(apiBaseUrl);
  const where = encodeURIComponent(
    `lower(name) like lower('%${escHql(String(name).trim())}%') and active = true`,
  );
  const url = `${contactsBase}/businessPartner?_neoWhere=${where}&limit=2`;
  try {
    const res = await apiFetch(url, { baseUrl: '', token });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const data = json?.response?.data ?? json?.data ?? [];
    // Auto-resolve only when the LIKE yields exactly one candidate. With
    // multiple matches we let the user disambiguate in EntityField (which is
    // primed with the same hint).
    if (data.length !== 1) return null;
    const row = data[0];
    return row?.id ? { id: row.id, label: row.name || name } : null;
  } catch {
    return null;
  }
}

// Adapter: bridge the legacy {taxId, name} signature of findBp to the generic
// PRE_RESOLVERS contract ({token, apiBaseUrl, value, extracted}) and return
// the same {id, label, bpId, bpCreate, locationCreate} shape EntityField emits
// when the user picks an item — so OcrReviewModal and purchaseInvoiceDescriptor
// can treat pre-resolved and user-picked vendors identically.
async function findBp({ token, apiBaseUrl, value, extracted }) {
  const taxId = extracted?.tax_id;
  const name = extracted?.vendor_name ?? value;
  const exactId = await findBpLegacy({ token, apiBaseUrl, taxId, name });
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
