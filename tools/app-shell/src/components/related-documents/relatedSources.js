/**
 * Source factories and small helpers shared by the sales and purchase related-documents
 * definitions (salesRelatedDocs.js, purchaseRelatedDocs.js). Each factory returns a
 * plain source object ({ key, type, select | fetch }) — see salesRelatedDocs.js for the
 * contract. Network access stays in ./helpers.js.
 */
import { fetchByCriteria, fetchListInvoices } from './helpers.js';

export const asArray = (value) => (Array.isArray(value) ? value : []);

export function idsOf(list) {
  return asArray(list).map(item => (item && typeof item === 'object' ? item.id : item)).join(',');
}

/** Documents of `spec`/`entity` whose `column` equals the id of this document. */
export function criteriaSource(key, type, spec, entity, column) {
  return {
    key,
    type,
    fetch: ({ id, token, apiBaseUrl }) =>
      fetchByCriteria(spec, entity, column, id, token, apiBaseUrl),
  };
}

/** Invoices of this order-like document through the `listInvoices` header action. */
export function listInvoicesSource(key, type, spec, entity) {
  return {
    key,
    type,
    fetch: ({ id, token, apiBaseUrl }) =>
      fetchListInvoices(spec, entity, id, token, apiBaseUrl),
  };
}

/** Documents read synchronously from an array field of the detail record. */
export function selectSource(key, type, field) {
  return { key, type, select: record => asArray(record?.[field]) };
}
