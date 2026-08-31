const BACKEND_ERROR_MAP = {
  'The start date field is mandatory': 'backendError.amortizationStartDateRequired',
  'Depreciation Amount field cannot be empty, zero or negative.': 'backendError.amortizationDepreciationAmountRequired',
  'Usable Life - Months field cannot be empty, zero or negative.': 'backendError.amortizationUsableLifeMonthsRequired',
  'Usable Life - Years field cannot be empty, zero or negative.': 'backendError.amortizationUsableLifeYearsRequired',
  'Currency field cannot be empty': 'backendError.amortizationCurrencyRequired',
  'Annual Depreciation field cannot be empty, zero or negative.': 'backendError.amortizationAnnualDepreciationRequired',
  // PSD2 PIS bank transfer (com.etendoerp.psd2.bank.integration AD_MESSAGE
  // 0629302ABBB04612BEF87B7EB64E7A8E), raised by GenerateBankPayment when the connected provider does
  // not offer the chosen payment template — e.g. a Salt Edge sandbox provider that supports SEPA but
  // not DOMESTIC. Unlike most of that module's messages this one DOES ship a real es_ES
  // AD_MESSAGE_TRL (in the separate `.es_es` translation module), so the backend returns Spanish when
  // that module is installed and English when it is not; mapping the English form covers the second
  // case and is a harmless no-op in the first (ETP-5084).
  'The selected template is not supported by the chosen provider. Please select a different template.':
    'backendError.pisTemplateNotSupportedByProvider',
  // Multi-currency payment registration (com.etendoerp.go PaymentCurrencyConverter, ETP-4504) — plain
  // English literals with no AD_MESSAGE behind them. The modal mirrors the first two client-side and
  // keeps the buttons disabled, so they are mostly unreachable; the format/non-positive ones are
  // not, and all four became newly VISIBLE when ETP-5084 fixed the NEO error shape the payment modal
  // was failing to read (before that they all rendered as the generic "could not save").
  'A conversion rate is required when the invoice and account currencies differ':
    'backendError.conversionRateRequired',
  'A conversion rate other than 1 is required when the invoice and account currencies differ':
    'backendError.conversionRateMustDifferFromOne',
  'Invalid conversion rate format': 'backendError.conversionRateInvalidFormat',
  'Conversion rate must be greater than zero': 'backendError.conversionRateNotPositive',
  'Country needed in an IBAN account.': 'backendError.countryIban',
  // ETP-4896 (FinancialAccountCountrySupport / FinancialAccountHandler). Same meaning as the DB's
  // 'Country needed in an IBAN account.' above, so it reuses that key rather than adding a second
  // Spanish phrasing for one rule.
  'A bank account with an IBAN must have a country.': 'backendError.countryIban',
  'The IBAN is too short.': 'backendError.ibanTooShort',
  'The IBAN is not valid: the check digits do not match.': 'backendError.ibanChecksumInvalid',
  'Invalid country': 'backendError.invalidCountry',
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
  // CreateDraftInvoiceHandler.java (com.etendoerp.go, ensurePriceListResolved) —
  // hardcoded English literal thrown when invoicing a shipment with no linked
  // sales order and no Business Partner default Price List, and the confirm
  // popup's price-list picker was left empty (ETP-4942).
  'No Price List could be resolved for this invoice: select a tariff or configure a default Price List for the Business Partner':
    'backendError.shipmentPriceListRequired',
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

// PSD2 bank-connection link (com.etendoerp.go, ETP-4406/ETP-4891 flow) — the
// `PSD2_IBANAutoFillFailed` AD_MESSAGE ("IBAN could not be set automatically (%0). Please enter it
// manually in the Financial Account."), shown when the connected bank account's own IBAN implies a
// country that conflicts with the Financial Account's configured country (e.g. a Spain-registered
// account linked to a German IBAN). Like `SMFCR_CannotModifyRateNonDraft` above, the owning module
// (`com.etendoerp.psd2`) ships no real es_ES AD_MESSAGE_TRL for its ~108 messages — the es_ES row is
// a verbatim copy of the English text — so Core resolves the same English string regardless of
// session locale. `%0` is substituted server-side with the IBAN before this reaches the frontend, so
// the skeleton is a fixed prefix/suffix around a dynamic IBAN, same shape as the other parameterized
// matchers here (plain slicing, no regex — an IBAN is not attacker-controlled but consistency keeps
// the ReDoS-safety argument uniform across this file, per the matchers above).
const IBAN_AUTOFILL_FAILED_PREFIX = 'IBAN could not be set automatically (';
const IBAN_AUTOFILL_FAILED_SUFFIX = '). Please enter it manually in the Financial Account.';

function matchIbanAutoFillFailed(msg) {
  if (!msg.startsWith(IBAN_AUTOFILL_FAILED_PREFIX) || !msg.endsWith(IBAN_AUTOFILL_FAILED_SUFFIX)) {
    return null;
  }
  const iban = msg.slice(
    IBAN_AUTOFILL_FAILED_PREFIX.length,
    -IBAN_AUTOFILL_FAILED_SUFFIX.length,
  );
  return iban ? { iban } : null;
}

// PSD2 bank-statement sync result (com.etendoerp.go's `ImportedStatementsTab` "Sincronizar
// extractos" and `EditAccountModal`'s sync action — same bridge, two UI entry points, ETP-4891
// follow-up). Same root cause as the IBAN-autofill matcher above: `com.etendoerp.psd2` ships no
// real es_ES translation for these AD_MESSAGEs either, so the raw English reaches the frontend
// regardless of session locale. `%0` is substituted server-side with the account name.
//
// Note the odd literal " ." (space before the period) on the first two — that is genuinely what
// the AD_MESSAGE template contains (verified against ad_message.msgtext), not a typo introduced
// here; the skeleton has to match it exactly or the message falls through untranslated.
const TRANSACTIONS_OBTAINED_PREFIX = 'Transactions obtained for the account: ';
const TRANSACTIONS_OBTAINED_SUFFIX = ' .';

function matchTransactionsObtained(msg) {
  if (!msg.startsWith(TRANSACTIONS_OBTAINED_PREFIX) || !msg.endsWith(TRANSACTIONS_OBTAINED_SUFFIX)) {
    return null;
  }
  const account = msg.slice(
    TRANSACTIONS_OBTAINED_PREFIX.length,
    -TRANSACTIONS_OBTAINED_SUFFIX.length,
  );
  return account ? { account } : null;
}

const NO_NEW_TRANSACTIONS_PREFIX = 'No new transactions found for the account: ';
const NO_NEW_TRANSACTIONS_SUFFIX = ' .';

function matchNoNewTransactionsFound(msg) {
  if (!msg.startsWith(NO_NEW_TRANSACTIONS_PREFIX) || !msg.endsWith(NO_NEW_TRANSACTIONS_SUFFIX)) {
    return null;
  }
  const account = msg.slice(
    NO_NEW_TRANSACTIONS_PREFIX.length,
    -NO_NEW_TRANSACTIONS_SUFFIX.length,
  );
  return account ? { account } : null;
}

const SYNC_FETCH_FAILED_PREFIX = 'The bank reported an error while synchronizing: ';
const SYNC_FETCH_FAILED_SUFFIX = '.';

function matchSyncFetchFailed(msg) {
  if (!msg.startsWith(SYNC_FETCH_FAILED_PREFIX) || !msg.endsWith(SYNC_FETCH_FAILED_SUFFIX)) {
    return null;
  }
  const detail = msg.slice(SYNC_FETCH_FAILED_PREFIX.length, -SYNC_FETCH_FAILED_SUFFIX.length);
  return detail ? { detail } : null;
}

// Runs the parameterized matchers in order and returns the winning translation
// key + params, with no translation call involved — pure "which skeleton matched"
// decision. Kept separate from translateParameterized() below so the "call t(),
// guard against the key echoing back" logic isn't duplicated once per matcher.
/* ETP-4896: the three String.format-interpolated messages from
 * `FinancialAccountCountrySupport.validateIbanCountryPair`. They cannot be exact-match entries
 * above, which is why the QA-reported "Argentina has no IBAN configuration…" reached the user as
 * raw English. Matching on the literal Java text makes those strings a de facto wire contract —
 * see the pointer comment in that class before rewording any of them. */

const COUNTRY_NO_IBAN_SUFFIX = ' has no IBAN configuration, so it cannot be used on an account'
  + ' with an IBAN.';

function matchCountryNoIbanConfig(msg) {
  if (!msg.endsWith(COUNTRY_NO_IBAN_SUFFIX)) return null;
  const country = msg.slice(0, -COUNTRY_NO_IBAN_SUFFIX.length);
  return country ? { country } : null;
}

const IBAN_PREFIX_MISMATCH_PREFIX = "The IBAN starts with '";
const IBAN_PREFIX_MISMATCH_MID1 = "' but the selected country is ";
const IBAN_PREFIX_MISMATCH_SUFFIX = ').';

function matchIbanPrefixCountryMismatch(msg) {
  if (!msg.startsWith(IBAN_PREFIX_MISMATCH_PREFIX)
    || !msg.endsWith(IBAN_PREFIX_MISMATCH_SUFFIX)) return null;
  const middle = msg.slice(
    IBAN_PREFIX_MISMATCH_PREFIX.length,
    -IBAN_PREFIX_MISMATCH_SUFFIX.length,
  );
  const mid1Idx = middle.indexOf(IBAN_PREFIX_MISMATCH_MID1);
  if (mid1Idx === -1) return null;
  const prefix = middle.slice(0, mid1Idx);
  const rest = middle.slice(mid1Idx + IBAN_PREFIX_MISMATCH_MID1.length);
  // The country name itself may contain spaces or parentheses, so split on the LAST ' (' —
  // the ISO code is always the final parenthesised token.
  const isoIdx = rest.lastIndexOf(' (');
  if (isoIdx === -1) return null;
  const country = rest.slice(0, isoIdx);
  const iso = rest.slice(isoIdx + 2);
  if (!prefix || !country || !iso) return null;
  return { prefix, country, iso };
}

const IBAN_LENGTH_PREFIX = 'An IBAN for ';
const IBAN_LENGTH_MID1 = ' must have ';
const IBAN_LENGTH_MID2 = ' characters (received ';
const IBAN_LENGTH_SUFFIX = ').';

function matchIbanCountryLengthMismatch(msg) {
  if (!msg.startsWith(IBAN_LENGTH_PREFIX) || !msg.endsWith(IBAN_LENGTH_SUFFIX)) return null;
  const middle = msg.slice(IBAN_LENGTH_PREFIX.length, -IBAN_LENGTH_SUFFIX.length);
  const mid1Idx = middle.indexOf(IBAN_LENGTH_MID1);
  if (mid1Idx === -1) return null;
  const country = middle.slice(0, mid1Idx);
  const afterMid1 = middle.slice(mid1Idx + IBAN_LENGTH_MID1.length);
  const mid2Idx = afterMid1.indexOf(IBAN_LENGTH_MID2);
  if (mid2Idx === -1) return null;
  const expected = afterMid1.slice(0, mid2Idx);
  const actual = afterMid1.slice(mid2Idx + IBAN_LENGTH_MID2.length);
  if (!country || !expected || !actual) return null;
  return { country, expected, actual };
}

/*
 * Every parameterized matcher below shares one shape: it returns null on no-match, or an object
 * whose fields ARE the interpolation params. So they dispatch off a table instead of a chain of
 * near-identical if blocks — which is also what keeps this function under Sonar's cognitive
 * complexity ceiling (javascript:S3776). The ETP-4891 sync matchers and the ETP-4896 country/IBAN
 * ones landed on separate branches and together pushed the old chain to 16 against the 15 allowed;
 * with a table, adding the next matcher is a row here and costs no complexity at all.
 *
 * ORDER IS SIGNIFICANT — it is the resolution precedence, preserved verbatim from the chain this
 * replaced. `matchAccountNotFound` stays hand-written below because it is the one matcher that maps
 * to two different keys, and omits a param, depending on what it found.
 */
const PARAMETERIZED_MATCHERS = [
  [matchInvoiceLineAlreadyInvoiced, 'backendError.invoiceLineAlreadyInvoiced'],
  [matchOrderNotFound, 'backendError.orderNotFound'],
  [matchShipmentNotFound, 'backendError.shipmentNotFound'],
  [matchCashCloseNoConcept, 'backendError.cashCloseNoConcept'],
  [matchCashCloseBackdated, 'backendError.cashCloseDateBeforeLastClose'],
  [matchCashCloseLineInClosedPeriod, 'backendError.cashCloseLineInClosedPeriod'],
  [matchCountryNoIbanConfig, 'backendError.countryNoIbanConfig'],
  [matchIbanPrefixCountryMismatch, 'backendError.ibanPrefixCountryMismatch'],
  [matchIbanCountryLengthMismatch, 'backendError.ibanCountryLengthMismatch'],
  [matchIbanAutoFillFailed, 'backendError.ibanAutoFillFailed'],
  [matchTransactionsObtained, 'backendError.transactionsObtainedForAccount'],
  [matchNoNewTransactionsFound, 'backendError.noNewTransactionsForAccount'],
  [matchSyncFetchFailed, 'backendError.syncFetchFailed'],
];

function resolveParameterizedMatch(msg) {
  // Hand-written: two possible keys, and `group` must be absent from the params (not present and
  // undefined) when the message carried no BP group.
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

  for (const [matcher, key] of PARAMETERIZED_MATCHERS) {
    const match = matcher(msg);
    if (match) {
      return { key, params: { ...match } };
    }
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
