const BACKEND_ERROR_MAP = {
  'The start date field is mandatory': 'backendError.amortizationStartDateRequired',
  'Depreciation Amount field cannot be empty, zero or negative.': 'backendError.amortizationDepreciationAmountRequired',
  'Usable Life - Months field cannot be empty, zero or negative.': 'backendError.amortizationUsableLifeMonthsRequired',
  'Usable Life - Years field cannot be empty, zero or negative.': 'backendError.amortizationUsableLifeYearsRequired',
  'Currency field cannot be empty': 'backendError.amortizationCurrencyRequired',
  'Annual Depreciation field cannot be empty, zero or negative.': 'backendError.amortizationAnnualDepreciationRequired',
  'Country needed in an IBAN account.': 'backendError.countryIban',
  'Using IBAN for generating the Displayed Account requires to introduce the IBAN': 'backendError.ibanRequired',
  'Using the Generic Account No. for generating the Displayed Account requires to introduce a Generic Account Number': 'backendError.genericAccountRequired',
  'IBAN code entered is not correct. Please review the IBAN code and the country defined for the bank': 'backendError.ibanInvalid',
  'Using the SWIFT Code for generating the Displayed Account requires to introduce a SWIFT Code and the Generic Account No.': 'backendError.swiftRequired',
  // Match-rule (MatchRuleHandler) validation messages
  'Name is required': 'backendError.matchRuleNameRequired',
  'Name is too long': 'backendError.matchRuleNameTooLong',
  'Text condition must be Contains (C), Starts with (S) or Regex (R)': 'backendError.matchRuleTextConditionInvalid',
  'Pattern is required': 'backendError.matchRulePatternRequired',
  'Pattern is too long': 'backendError.matchRulePatternTooLong',
  'Invalid transaction type': 'backendError.matchRuleTransactionTypeInvalid',
  'The regular expression is too complex (possible catastrophic backtracking)': 'backendError.matchRuleRegexComplex',
  'Invalid regular expression': 'backendError.matchRuleRegexInvalid',
  'A rule with this priority already exists for the selected scope': 'backendError.matchRulePriorityConflict',
  // Price list (PriceListHeaderHandler) validation messages
  'A tariff marked as default cannot be deactivated.': 'backendError.priceListCannotDeactivateDefault',
  'There is already an asset category with this name.': 'backendError.assetGroupNameDuplicate',
  // Goods Movements line (GoodsMovementLineHandler) validation messages
  'This product is of type Service and cannot be used in inventory movements.': 'backendError.productNotStockable',
  // Product category (ProductCategoryDefaultHandler) validation messages
  'Only one product category can be marked as default.': 'backendError.productCategoryCannotSetMultipleDefault',
  // Costing engine (core `NotCalculatedCostWithTransaction` AD_MESSAGE) — the backend
  // always returns this with the literal, unresolved `@product@` token still in it
  // (OBMessageUtils.parseTranslation() resolves the outer message but doesn't
  // recursively re-parse the nested placeholder), so it's a stable exact match.
  'The cost of the product @product@ has not been calculated.': 'backendError.costNotCalculated',
  // CreateDraftInvoiceHandler (com.etendoerp.go) — hardcoded Spanish literal with no
  // AD_Message/i18n involvement, so it always renders in Spanish regardless of session
  // locale (ETP-4831 case 2, inverse symptom of the invoice-line skeleton below).
  'No hay líneas a facturar en este pedido': 'backendError.noLinesToInvoice',
  // CreateDraftInvoiceHandler (com.etendoerp.go) — same hardcoded-Spanish-literal bug
  // as above, but from the shipment-invoicing flow. Two throw sites emit this exact
  // string: capShipmentLineOverrides (~L952) and the line-selection loop inside
  // createFromShipments (~L1123). One entry covers both (ETP-4831 case 3).
  'No hay líneas pendientes de facturar en este albarán': 'backendError.noPendingLinesToInvoiceShipment',
  // CreateShipmentHandler.java:136 (com.etendoerp.go) — hardcoded Spanish literal, no
  // AD_Message involvement, thrown when an order has zero pending-delivery lines
  // (ETP-4831 case 4, family A).
  'No hay líneas pendientes de entrega en este pedido': 'backendError.noPendingLinesToDeliverOrder',
  // CreateInvoiceShipmentHandler.java:200 (com.etendoerp.go) — hardcoded Spanish
  // literal, thrown when an invoice has zero lines with a product (ETP-4831 case 4,
  // family A).
  'No hay líneas con producto en esta factura': 'backendError.noProductLinesInInvoice',
  // CreateDraftInvoiceHandler.java:812 AND :1042 (com.etendoerp.go) — same hardcoded
  // English literal thrown from two sites (getOrCreateArInvoiceDocType has no linked
  // doc type). One entry covers both throw sites (ETP-4831 case 4, family A).
  'No AR Invoice document type found': 'backendError.noArInvoiceDocTypeFound',
  // CreateDraftInvoiceHandler.java:999 (com.etendoerp.go) — hardcoded English literal,
  // thrown when createFromShipments receives an empty shipment list (ETP-4831 case 4,
  // family A).
  'No shipments provided': 'backendError.noShipmentsProvided',
  // CreateDraftInvoiceHandler.java:1005 (com.etendoerp.go) — hardcoded English
  // literal, thrown when the selected shipments don't all share the same Business
  // Partner (ETP-4831 case 4, family A).
  'All shipments must belong to the same Business Partner': 'backendError.shipmentsMustShareBusinessPartner',
  // CreateDraftInvoiceHandler.java:1068 (com.etendoerp.go) — hardcoded English
  // literal, thrown when the Business Partner lacks mandatory Payment Terms/Method
  // (ETP-4831 case 4, family A).
  'Business Partner is missing mandatory Payment Terms or Payment Method': 'backendError.bpMissingPaymentTermsOrMethod',
  // Exchange Rates tab (ConversionRateDocLockObserver, com.smf.currency.conversionrate
  // AD_MESSAGE `SMFCR_CannotModifyRateNonDraft`) — that module ships no es_ES
  // AD_MESSAGE_TRL, so OBException falls back to the raw English MSGTEXT (ETP-4837).
  'Cannot modify document conversion rate when the invoice is not in draft status.':
    'backendError.conversionRateNotDraft',
  // Cash close (CashCloseSupport, com.etendoerp.go — ETP-4795) — hardcoded English literals with
  // no AD_Message involvement, so they reach the toast untranslated whatever the session locale.
  'The close date cannot be in the future.': 'backendError.cashCloseDateInFuture',
  'This reconciliation already has bank-statement lines linked to it; cash close and bank reconciliation cannot share the same document.':
    'backendError.cashCloseHasBankStatementLines',
  'Cash close is only available for cash-type financial accounts':
    'backendError.cashCloseOnlyForCashAccount',
  // UserRoleAssignmentHandler (com.etendoerp.go, ETP-4830 BUG-1 guard) — hardcoded English
  // literals, no AD_Message involvement, thrown when a PATCH explicitly sets active=false
  // on the acting user's own record or the client's last remaining active admin.
  'You cannot deactivate your own user account': 'backendError.cannotDeactivateOwnAccount',
  'Cannot deactivate the last active administrator for this client':
    'backendError.cannotDeactivateLastAdmin',
};

// Parameterized matchers — for backend messages that embed a dynamic value (e.g. a
// Business Partner name) instead of being a single fixed exact string, so they can't
// live in BACKEND_ERROR_MAP's exact-match lookup.
//
// These two skeletons come from core Etendo's `@InvalidAccount@` AD_MESSAGE
// ("Account could not be found.") enriched server-side (ETP-4706,
// `DocumentPostingService#enrichWithFailingEntity`) with the transaction's Business
// Partner / BP Group via the `ETGO_InvalidAccountBpAndGroup` / `ETGO_InvalidAccountBpOnly`
// AD_MESSAGE catalog entries — en_US only (no es_ES AD_MESSAGE_TRL exists for a
// non-translation-pack module like com.etendoerp.go). Matched here and re-rendered with
// the frontend's own i18n so the enrichment suffix is translated too.
//
// Deliberately plain string parsing (startsWith/endsWith/lastIndexOf/slice) instead of
// regex: a Business Partner name is user-editable data, so two back-to-back lazy
// capture groups here would be attacker-influenced input feeding a backtracking-prone
// pattern (flagged by SonarQube javascript:S5852 — ReDoS/DoS hotspot). Plain string ops
// are linear-time with no backtracking, so there's no ReDoS surface at all.
//
// This also fixes a real mis-split bug the old regex had: `lastIndexOf` finds the LAST
// ", BP Group: " occurrence, so a BP name that itself contains that literal substring
// (e.g. `"Odd, BP Group: Fake, Corp"`) still splits at the correct (final) delimiter
// instead of the first one found by a non-greedy regex scan.
const ACCOUNT_NOT_FOUND_PREFIX = 'Account could not be found. (Business Partner: ';
const BP_GROUP_DELIM = ', BP Group: ';

function matchAccountNotFound(msg) {
  if (!msg.startsWith(ACCOUNT_NOT_FOUND_PREFIX) || !msg.endsWith(')')) return null;
  const inner = msg.slice(ACCOUNT_NOT_FOUND_PREFIX.length, -1);
  if (!inner) return null;
  const delimIdx = inner.lastIndexOf(BP_GROUP_DELIM);
  if (delimIdx === -1) {
    return { bp: inner, group: null };
  }
  const bp = inner.slice(0, delimIdx);
  const group = inner.slice(delimIdx + BP_GROUP_DELIM.length);
  if (!bp || !group) return null;
  return { bp, group };
}

// This skeleton comes from com.etendoerp.go's own `ETGO_InvoiceLineAlreadyInvoiced`
// AD_MESSAGE ("The shipment @docNo@ cannot be invoiced: quantity to invoice
// (@invoiced@) exceeds pending quantity (@pending@). The shipment may already be
// invoiced in another document.") — en_US only, same no-translation-pack root cause
// as the ACCOUNT_NOT_FOUND_PREFIX skeleton above (ETP-4831, sibling of ETP-4706).
//
// Same plain-string-slicing rationale as matchAccountNotFound: docNo/invoiced/pending
// are free-form/user-influenced data, so no regex — linear-time slicing around fixed
// delimiters instead of a backtracking-prone pattern (SonarQube javascript:S5852).
const INVOICE_LINE_PREFIX = 'The shipment ';
const INVOICE_LINE_MID1 = ' cannot be invoiced: quantity to invoice (';
const INVOICE_LINE_MID2 = ') exceeds pending quantity (';
const INVOICE_LINE_SUFFIX = '). The shipment may already be invoiced in another document.';

function matchInvoiceLineAlreadyInvoiced(msg) {
  if (!msg.startsWith(INVOICE_LINE_PREFIX) || !msg.endsWith(INVOICE_LINE_SUFFIX)) return null;
  const middle = msg.slice(INVOICE_LINE_PREFIX.length, -INVOICE_LINE_SUFFIX.length);
  const mid1Idx = middle.indexOf(INVOICE_LINE_MID1);
  if (mid1Idx === -1) return null;
  const docNo = middle.slice(0, mid1Idx);
  const afterMid1 = middle.slice(mid1Idx + INVOICE_LINE_MID1.length);
  const mid2Idx = afterMid1.indexOf(INVOICE_LINE_MID2);
  if (mid2Idx === -1) return null;
  const invoiced = afterMid1.slice(0, mid2Idx);
  const pending = afterMid1.slice(mid2Idx + INVOICE_LINE_MID2.length);
  if (!docNo || !invoiced || !pending) return null;
  return { docNo, invoiced, pending };
}

// CreateDraftInvoiceHandler.java:606 (com.etendoerp.go) — "Order not found: " +
// orderId. Fixed English prefix + dynamic order id appended, no closing delimiter
// (ETP-4831 case 4, family B). Same plain-string-slicing rationale as
// matchAccountNotFound above: orderId is not attacker-controlled free text here
// either, but consistency with the rest of the file's matchers (no regex) keeps the
// ReDoS-safety argument uniform across all parameterized skeletons.
const ORDER_NOT_FOUND_PREFIX = 'Order not found: ';

function matchOrderNotFound(msg) {
  if (!msg.startsWith(ORDER_NOT_FOUND_PREFIX)) return null;
  const orderId = msg.slice(ORDER_NOT_FOUND_PREFIX.length);
  if (!orderId) return null;
  return { orderId };
}

// CreateDraftInvoiceHandler.java:996 (com.etendoerp.go) — "Shipment not found: " +
// id. Same shape as ORDER_NOT_FOUND_PREFIX above but for the shipment-lookup loop
// inside createFromShipments (ETP-4831 case 4, family B).
const SHIPMENT_NOT_FOUND_PREFIX = 'Shipment not found: ';

function matchShipmentNotFound(msg) {
  if (!msg.startsWith(SHIPMENT_NOT_FOUND_PREFIX)) return null;
  const id = msg.slice(SHIPMENT_NOT_FOUND_PREFIX.length);
  if (!id) return null;
  return { id };
}

// CashCloseSupport.java (com.etendoerp.go — ETP-4795), three cash-close rejections that embed a
// dynamic value. Same plain-string-slicing rationale as the matchers above: no regex, so there is
// no backtracking surface over the movement identifier (SonarQube javascript:S5852).
//
// The difference amount is deliberately DROPPED rather than interpolated: the backend sends it as a
// raw `BigDecimal.toPlainString()` ("-162.05"), and pasting that into Spanish copy would render a
// money value with the wrong decimal separator and no currency symbol — exactly what the repo's
// currency-formatting policy exists to prevent. The figure is already on screen, formatted, in the
// close summary right next to the button; the toast only has to name the fix.
const CASH_CLOSE_NO_CONCEPT_PREFIX = 'There is a difference of ';
const CASH_CLOSE_NO_CONCEPT_SUFFIX = ' and this account has no accounting concept configured for it.'
  + ' Configure a GL Item Difference in Edit account before confirming the close.';

function matchCashCloseNoConcept(msg) {
  if (!msg.startsWith(CASH_CLOSE_NO_CONCEPT_PREFIX)
    || !msg.endsWith(CASH_CLOSE_NO_CONCEPT_SUFFIX)) return null;
  const amount = msg.slice(
    CASH_CLOSE_NO_CONCEPT_PREFIX.length,
    -CASH_CLOSE_NO_CONCEPT_SUFFIX.length,
  );
  return amount ? {} : null;
}

const CASH_CLOSE_BACKDATED_PREFIX = 'The close date cannot be earlier than the last confirmed close (';
const CASH_CLOSE_BACKDATED_SUFFIX = ').';

function matchCashCloseBackdated(msg) {
  if (!msg.startsWith(CASH_CLOSE_BACKDATED_PREFIX)
    || !msg.endsWith(CASH_CLOSE_BACKDATED_SUFFIX)) return null;
  const date = msg.slice(CASH_CLOSE_BACKDATED_PREFIX.length, -CASH_CLOSE_BACKDATED_SUFFIX.length);
  return date ? { date } : null;
}

const CASH_CLOSE_CLOSED_PERIOD_PREFIX = 'The movement "';
const CASH_CLOSE_CLOSED_PERIOD_SUFFIX = '" has an accounting date in a closed period.'
  + ' Reopen that period or unmark the movement before confirming the close.';

function matchCashCloseLineInClosedPeriod(msg) {
  if (!msg.startsWith(CASH_CLOSE_CLOSED_PERIOD_PREFIX)
    || !msg.endsWith(CASH_CLOSE_CLOSED_PERIOD_SUFFIX)) return null;
  const movement = msg.slice(
    CASH_CLOSE_CLOSED_PERIOD_PREFIX.length,
    -CASH_CLOSE_CLOSED_PERIOD_SUFFIX.length,
  );
  return movement ? { movement } : null;
}

// Runs the parameterized matchers in order and returns the winning translation
// key + params, with no translation call involved — pure "which skeleton matched"
// decision. Kept separate from translateParameterized() below so the "call t(),
// guard against the key echoing back" logic isn't duplicated once per matcher.
function resolveParameterizedMatch(msg) {
  const accountMatch = matchAccountNotFound(msg);
  if (accountMatch) {
    if (accountMatch.group !== null) {
      return {
        key: 'backendError.invalidAccountBpAndGroup',
        params: { bp: accountMatch.bp, group: accountMatch.group },
      };
    }
    return { key: 'backendError.invalidAccountBpOnly', params: { bp: accountMatch.bp } };
  }

  const invoiceLineMatch = matchInvoiceLineAlreadyInvoiced(msg);
  if (invoiceLineMatch) {
    return {
      key: 'backendError.invoiceLineAlreadyInvoiced',
      params: {
        docNo: invoiceLineMatch.docNo,
        invoiced: invoiceLineMatch.invoiced,
        pending: invoiceLineMatch.pending,
      },
    };
  }

  const orderMatch = matchOrderNotFound(msg);
  if (orderMatch) {
    return { key: 'backendError.orderNotFound', params: { orderId: orderMatch.orderId } };
  }

  const shipmentMatch = matchShipmentNotFound(msg);
  if (shipmentMatch) {
    return { key: 'backendError.shipmentNotFound', params: { id: shipmentMatch.id } };
  }

  if (matchCashCloseNoConcept(msg)) {
    return { key: 'backendError.cashCloseNoConcept', params: {} };
  }

  const backdatedMatch = matchCashCloseBackdated(msg);
  if (backdatedMatch) {
    return { key: 'backendError.cashCloseDateBeforeLastClose', params: { date: backdatedMatch.date } };
  }

  const closedPeriodMatch = matchCashCloseLineInClosedPeriod(msg);
  if (closedPeriodMatch) {
    return {
      key: 'backendError.cashCloseLineInClosedPeriod',
      params: { movement: closedPeriodMatch.movement },
    };
  }

  return null;
}

function translateParameterized(msg, t) {
  const match = resolveParameterizedMatch(msg);
  if (!match) return null;
  const translated = t(match.key, match.params);
  // Guard: if t() returns the key itself the translation is missing — keep original
  return (translated && translated !== match.key) ? translated : null;
}

export async function parseBackendErrorMessage(res) {
  let raw;
  try {
    const data = await res.json();
    // NEO Headless top-level format: { error: { message, status } }
    if (data?.error?.message) raw = data.error.message;
    else {
      // Etendo JsonDataService format: { response: { error: { message } | string } }
      const err = data?.response?.error;
      if (err?.message) raw = err.message;
      else if (typeof err === 'string') raw = err;
      else if (data?.message) raw = data.message;
    }
  } catch {
    // Ignore non-JSON error bodies.
  }
  return raw;
}

export function translateBackendError(msg, t) {
  if (!msg || typeof t !== 'function') return msg;
  const trimmed = msg.trim();
  const key = BACKEND_ERROR_MAP[trimmed];
  if (key) {
    const translated = t(key);
    // Guard: if t() returns the key itself the translation is missing — keep original
    return (translated && translated !== key) ? translated : msg;
  }
  return translateParameterized(trimmed, t) ?? msg;
}
