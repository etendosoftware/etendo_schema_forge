/**
 * Shared selector context builder for ETP-3955.
 *
 * Centralizes the logic that was previously scattered across DetailView.jsx
 * into a single testable helper. Builds query params for selector endpoints
 * from contract field metadata, current record, parent record, and window category.
 *
 * @module selectorContext
 */

/**
 * Format an ISO date (YYYY-MM-DD) to DD-MM-YYYY for Etendo Classic validation rules.
 * Returns null if the input is not a valid date string.
 *
 * @param {string|null} isoDate - ISO date string or null
 * @returns {string|null} DD-MM-YYYY formatted date or null
 */
export function formatIsoToClassicDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Derive isSOTrx from window category.
 *
 * @param {string|null} category - Window category (e.g. 'sales', 'purchases')
 * @returns {string|null} 'Y' for sales, 'N' for purchases, null otherwise
 */
export function deriveIsSOTrx(category) {
  if (category === 'sales') return 'Y';
  if (category === 'purchases') return 'N';
  return null;
}

/**
 * Derive isCustomer/isVendor from window category.
 *
 * @param {string|null} category - Window category
 * @returns {{ isCustomer?: string, isVendor?: string }}
 */
export function deriveRoleFlags(category) {
  const flags = {};
  if (category === 'sales') flags.isCustomer = 'Y';
  if (category === 'purchases') flags.isVendor = 'Y';
  return flags;
}

/**
 * Resolve a date value from a record, trying multiple field names in order.
 *
 * @param {object} record - The record to read from
 * @param {string[]} fields - Field names to try in order
 * @returns {string|null} The first found date value or null
 */
export function resolveDateFromRecord(record, fields) {
  if (!record) return null;
  for (const field of fields) {
    if (record[field]) return record[field];
  }
  return null;
}

function applyDefaultContext(field, record, parentRecord, windowCategory, ctx) {
  // Default: for partnerAddress, try to get businessPartner from record
  if (field?.column === 'C_BPartner_Location_ID' && !ctx.C_BPartner_ID) {
    const bpValue = record?.businessPartner ?? parentRecord?.businessPartner ?? null;
    if (bpValue) ctx.C_BPartner_ID = bpValue;
  }

  // Default: for priceList, derive isSOTrx
  if (field?.column === 'M_PriceList_ID') {
    const isSOTrx = deriveIsSOTrx(windowCategory);
    if (isSOTrx) ctx.isSOTrx = isSOTrx;
  }
}

function applyWindowCategoryParam(entry, windowCategory, ctx) {
  if (entry.param === 'IsSOTrx' || entry.param === 'isSOTrx') {
    const isSOTrx = deriveIsSOTrx(windowCategory);
    if (isSOTrx) {
      ctx[entry.param] = isSOTrx;
      if (entry.param === 'IsSOTrx') ctx.isSOTrx = isSOTrx;
      else ctx.IsSOTrx = isSOTrx;
    }
  }
}

/**
 * Resolve a parentField entry's value from an already-selected source record
 * and write it into ctx. The caller decides which record to read from
 * (required entries narrow priceList/partnerAddress to the parent record).
 */
function applyParentField(entry, sourceRecord, ctx) {
  let value = sourceRecord?.[entry.field] ?? null;
  if (!value && entry.fallbackField) {
    value = sourceRecord?.[entry.fallbackField] ?? null;
  }
  if (value) {
    if (entry.format === 'DD-MM-YYYY') {
      value = formatIsoToClassicDate(value) ?? value;
    }
    ctx[entry.param] = value;
  }
}

function applyRequiredParentField(entry, record, parentRecord, ctx) {
  const sourceRecord = entry.field === 'priceList' || entry.field === 'partnerAddress'
      ? parentRecord
      : parentRecord ?? record;
  applyParentField(entry, sourceRecord, ctx);
}

function applyNonRequiredEntries(entries, record, parentRecord, windowCategory, ctx) {
  for (const entry of entries) {
    switch (entry.source) {
      case 'parentField': {
        applyParentField(entry, parentRecord ?? record, ctx);
        break;
      }
      case 'windowCategory': {
        if (entry.param === 'isCustomer' && windowCategory === 'sales') {
          ctx.isCustomer = 'Y';
        }
        if (entry.param === 'isVendor' && windowCategory === 'purchases') {
          ctx.isVendor = 'Y';
        }
        break;
      }
    }
  }
}

function applyFieldParam(entry, record, parentRecord, ctx) {
  const value = record?.[entry.field] ?? parentRecord?.[entry.field] ?? null;
  if (value) ctx[entry.param] = value;
}

/**
 * Build selector context params for a given field.
 *
 * Reads the field's context metadata (from contract) and resolves values
 * from the current record, parent record, and window category.
 *
 * @param {object} params
 * @param {string|null} params.windowCategory - Window category ('sales', 'purchases', etc.)
 * @param {string} params.entityName - Entity name (e.g. 'header', 'lines')
 * @param {object} params.field - Contract field object (may contain context metadata)
 * @param {object|null} params.record - Current record values
 * @param {object|null} params.parentRecord - Parent/header record values
 * @param {string|null} params.parentId - Parent record ID (for child entities)
 * @returns {object} Query params object for the selector endpoint (null values omitted)
 */
export function buildSelectorContext({
  windowCategory,
  entityName,
  field,
  record,
  parentRecord,
  parentId,
} = {}) {
  const ctx = {};
  const context = field?.context ?? null;
  const dependsOn = field?.dependsOn ?? null;

  // dependsOn: map parent field value to filter param
  if (dependsOn?.field && dependsOn?.filterKey) {
    // Check current record first, then parent record
    const value = record?.[dependsOn.field] ?? parentRecord?.[dependsOn.field] ?? null;
    if (value) {
      ctx[dependsOn.filterKey] = value;
    }
  }

  // If no context metadata, apply default heuristics for known patterns
  if (!context) {
    applyDefaultContext(field, record, parentRecord, windowCategory, ctx);
  } else {
    // Process context.required entries
    for (const entry of context.required ?? []) {
      switch (entry.source) {
        case 'field': {
          applyFieldParam(entry, record, parentRecord, ctx);
          break;
        }
        case 'windowCategory': {
          applyWindowCategoryParam(entry, windowCategory, ctx);
          break;
        }
        case 'parentField': {
          applyRequiredParentField(entry, record, parentRecord, ctx);
          break;
        }
      }
    }

    // Process non-required context entries. Older contracts use optional; the
    // ETP-3955 design also names these recommended for agent-facing metadata.
    const nonRequiredEntries = [
      ...(context.optional ?? []),
      ...(context.recommended ?? []),
    ];
    applyNonRequiredEntries(nonRequiredEntries, record, parentRecord, windowCategory, ctx);
  }

  // Parent ID for child entities (always added if provided)
  if (parentId && !ctx.parentId) {
    ctx.parentId = parentId;
  }

  return ctx;
}

/**
 * Build header-level selector context (isSOTrx, isCustomer, isVendor).
 *
 * @param {string|null} windowCategory - Window category
 * @returns {object} Context params for header selectors
 */
export function buildHeaderSelectorContext(windowCategory) {
  const isSOTrx = deriveIsSOTrx(windowCategory);
  const roleFlags = deriveRoleFlags(windowCategory);
  return {
    ...(isSOTrx ? { isSOTrx } : {}),
    ...roleFlags,
  };
}

/**
 * Build line-level selector context from header record.
 *
 * @param {object} params
 * @param {string|null} params.windowCategory - Window category
 * @param {string|null} params.parentId - Header record ID
 * @param {object|null} params.headerRecord - Header record values
 * @returns {object} Context params for line selectors
 */
export function buildLineSelectorContext({ windowCategory, parentId, headerRecord } = {}) {
  const ctx = {};
  const isSOTrx = deriveIsSOTrx(windowCategory);

  if (parentId) ctx.parentId = parentId;
  if (isSOTrx) {
    ctx.isSOTrx = isSOTrx;
    ctx.IsSOTrx = isSOTrx;
  }

  if (headerRecord) {
    // Price list from header
    if (headerRecord.priceList) ctx.priceList = headerRecord.priceList;

    // DateInvoiced from header (invoiceDate or orderDate), formatted for Classic
    const dateVal = resolveDateFromRecord(headerRecord, ['invoiceDate', 'orderDate']);
    if (dateVal) {
      ctx.DateInvoiced = formatIsoToClassicDate(dateVal) ?? dateVal;
    }

    // Partner address for tax zone context
    if (headerRecord.partnerAddress) {
      ctx.C_BPartner_Location_ID = headerRecord.partnerAddress;
    }
  }

  return ctx;
}
