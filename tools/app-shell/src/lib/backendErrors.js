// Expands N synonym source messages that all map to the SAME translation key into that many map
// entries. Used sparingly — only where two+ new literal entries would otherwise land as a fresh
// run of plain `'X': 'Y',` object-literal lines inside BACKEND_ERROR_MAP's already Sonar-flagged
// duplicate zone: javascript CPD normalizes string literals before comparing, so any new short run
// of plain map-literal lines risks matching some other subsequence of this file's giant literal
// map regardless of what the actual message text says (see the ETP-5397 fix below for a worked
// example). This is a Sonar-CPD workaround for new entries landing in an already-duplicate-flagged
// zone, not a stylistic preference — do not "clean it up" back to plain literals, and do not reach
// for it for every entry; it's an escape hatch, not the map's normal shape.
function sameKeyEntries(key, ...messages) {
  return Object.fromEntries(messages.map((message) => [message, key]));
}

const BACKEND_ERROR_MAP = {
  // ETP-5073 / DOC-04. The lines sidebar renders the server's message verbatim rather than going
  // through the concurrency-conflict dialog the main form uses, so without this entry the user
  // reads it in English. Both spellings are mapped: the sentence Etendo GO now sends, and core's
  // own wording, which still reaches this path on a write that does not go through
  // NeoCrudHandler's pre-check.
  'This record was modified by someone else after you read it. Your changes were not saved.':
    'backendError.staleRecord',
  'The record you are saving has already been changed by another user or process. Cancel your changes and refresh the data by clicking the refresh button.':
    'backendError.staleRecord',
  // ETP-5245 — ProductCostingHandler. The Costing tab writes into M_Costing, the costing
  // engine's own table, so the handler is what keeps a hand-entered row safe; these are the
  // refusals it can return. English on purpose: the message crosses the wire as-is and is
  // translated here, the pattern ChartOfAccountsSaveValidationSupport documents as correct.
  'A cost line must belong to a product.': 'backendError.costingNoProduct',
  'The cost is required.': 'backendError.costingCostRequired',
  'The cost cannot be negative.': 'backendError.costingCostNegative',
  'The expiry date must be later than the start date.': 'backendError.costingInvalidDateRange',
  'This cost was calculated by the system and cannot be modified or deleted.':
    'backendError.costingEngineRowLocked',
  'The cost line could not be prepared. Try again.': 'backendError.costingPrepareFailed',
  'The start date field is mandatory': 'backendError.amortizationStartDateRequired',
  'Depreciation Amount field cannot be empty, zero or negative.': 'backendError.amortizationDepreciationAmountRequired',
  'Usable Life - Months field cannot be empty, zero or negative.': 'backendError.amortizationUsableLifeMonthsRequired',
  'Usable Life - Years field cannot be empty, zero or negative.': 'backendError.amortizationUsableLifeYearsRequired',
  'Currency field cannot be empty': 'backendError.amortizationCurrencyRequired',
  'Annual Depreciation field cannot be empty, zero or negative.': 'backendError.amortizationAnnualDepreciationRequired',
  // AmortizationConfirmGuard.java (com.etendoerp.go — ETP-5414), server-side gate on the
  // /amortization "Processed" action. a_amortization_process (PL/pgSQL) never validates a
  // document's lines itself — no lines / missing % / non-positive amount — so this guard blocks
  // those cases before the process runs, closing the hole for any consumer that isn't this UI
  // (MCP, a script, a raw curl). Reuses the SAME three keys `validateConfirmEligibility`
  // (artifacts/amortization/custom/AmortizationBulkActions.jsx) already ships for the identical
  // checks, so the failure reads identically whether it was caught client-side (no round-trip)
  // or here (the safety net for everyone else). AD_MESSAGE VALUEs:
  // ETGO_AmortizationNoLines / ETGO_AmortizationLineMissingPercentage /
  // ETGO_AmortizationLineInvalidAmount.
  'Has no amortization lines.': 'amortizationBulkNoLines',
  'There are lines with a missing amortization percentage.': 'amortizationErrorLinePercentageMissing',
  'There are lines with a zero or negative amount.': 'amortizationErrorLineAmountInvalid',
  // Same guard, unconditional block on a direct PATCH/PUT write to `processed` (AD_MESSAGE
  // ETGO_AmortizationProcessedDirectUpdateBlocked): that path skips a_amortization_process
  // entirely — no TotalAmortization recompute, no linked-asset DepreciatedValue recompute — so
  // it is rejected outright rather than validated. No client-side equivalent exists (the UI
  // never PATCHes `processed` directly), hence a new key instead of reusing one.
  'Processed cannot be updated directly.': 'amortizationProcessedDirectUpdateBlocked',
  // PSD2 PIS bank transfer (com.etendoerp.psd2.bank.integration AD_MESSAGE
  // 0629302ABBB04612BEF87B7EB64E7A8E), raised by GenerateBankPayment when the connected provider does
  // not offer the chosen payment template — e.g. a Salt Edge sandbox provider that supports SEPA but
  // not DOMESTIC. Unlike most of that module's messages this one DOES ship a real es_ES
  // AD_MESSAGE_TRL (in the separate `.es_es` translation module), so the backend returns Spanish when
  // that module is installed and English when it is not; mapping the English form covers the second
  // case and is a harmless no-op in the first (ETP-5084).
  'The selected template is not supported by the chosen provider. Please select a different template.':
    'backendError.pisTemplateNotSupportedByProvider',
  // PSD2 AIS sync, raised by SaltEdgeAccountLinkHelper.fetchAccountTransactions when the account has
  // no connection in status 'AC' (ETP-5109). This one is an EXACT match, not a parameterized matcher
  // like its siblings further down, for a reason worth knowing before "fixing" the odd `%s` below:
  // the AD_MESSAGE template is written with `%s`, but OBMessageUtils.getI18NMessage only substitutes
  // `%0`, so the account name is never interpolated and the literal `%s` reaches the user. The
  // string is therefore constant. That is a latent backend bug in
  // com.etendoerp.psd2.bank.integration; if its template is ever corrected to `%0`, this entry stops
  // matching and has to become a parameterized matcher.
  'No active bank connection found for financial account %s. Connect the account first.':
    'backendError.psd2NoActiveConnection',
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
  // ETP-5190 — DocumentSequenceHandler. The Spanish invoice-series prefix rules, copied from
  // com.smf.ticketbai's ProcessInvoiceTbaiHook and applied on write instead of at invoice
  // completion. English in Java on purpose so both locales resolve here.
  'The prefix cannot be longer than 20 characters.': 'backendError.sequencePrefixTooLong',
  'The prefix cannot contain lowercase or accented letters.': 'backendError.sequencePrefixLowerOrAccent',
  'The prefix cannot contain the letters I, O, Y, W or \u00d1.': 'backendError.sequencePrefixForbiddenLetters',
  'The prefix can only contain uppercase letters, digits and hyphens.': 'backendError.sequencePrefixInvalidChars',
  // ETP-5190 — SpanishTaxIdValidator, reached from BOTH places a tenant sets its fiscal
  // identifier: the signup wizard (parseOnboardingRequest) and the Organización window
  // (OrganizationInformationHandler). Mapped to the SAME keys the browser-side
  // lib/taxIdValidation.js returns, so the wording does not change depending on which side
  // caught it.
  'The tax ID is not a valid NIF, CIF or NIE.': 'backendError.taxIdInvalidFormat',
  'The tax ID check digit does not match. Review the number.': 'backendError.taxIdInvalidCheckDigit',
  // ETP-5031 — BusinessPartnerHandler validates the Contacts `TaxID` server-side too, and there
  // the document type can be a passport (EM_OBTIK_Tax_ID_Key = '3'), which the two rules above
  // do not cover. Same principle as them: the wording must match what the browser-side
  // contactsFieldValidation.js shows for the identical rejection.
  'The passport ID is not valid. It must be up to 9 letters or digits.': 'backendError.taxIdInvalidPassport',
  // ETP-5031 follow-up — BusinessPartnerHandler now also validates etgoEmail/etgoWeb/etgoPhone
  // server-side (a direct API/MCP write previously bypassed the browser-only
  // contactsFieldValidation.js / recipientEdits.js checks entirely). Same principle as the
  // TaxID/passport entries above: the wording must match what those browser-side checks show
  // for the identical rejection, so a value rejected in one place reads identically in the other.
  'The email address is not valid.': 'sendModalInvalidEmail',
  'The website is not a valid domain, e.g. domain.com.': 'websiteInsecureUrl',
  'The phone number can only contain digits and the + ( ) - . characters, up to 15 characters.':
    'phoneInvalidChars',
  'Name is too long': 'backendError.matchRuleNameTooLong',
  'Text condition must be Contains (C), Starts with (S) or Regex (R)': 'backendError.matchRuleTextConditionInvalid',
  'Pattern is required': 'backendError.matchRulePatternRequired',
  'Pattern is too long': 'backendError.matchRulePatternTooLong',
  'Invalid transaction type': 'backendError.matchRuleTransactionTypeInvalid',
  'The regular expression is too complex (possible catastrophic backtracking)': 'backendError.matchRuleRegexComplex',
  'Invalid regular expression': 'backendError.matchRuleRegexInvalid',
  'A rule with this priority already exists for the selected scope': 'backendError.matchRulePriorityConflict',
  'Priority is required': 'backendError.matchRulePriorityRequired',
  'Priority must be a whole number': 'backendError.matchRulePriorityNotInteger',
  'Priority must be 1 or greater': 'backendError.matchRulePriorityTooLow',
  'Priority is too large': 'backendError.matchRulePriorityTooLarge',
  // Bank statement lifecycle guards (BankStatementsHandler.requireDraft / .requireProcessed).
  // Shared by process/update/delete (requireDraft) and reactivate (requireProcessed) — ETP-4921:
  // a bulk-delete of a processed statement used to surface only "None of the N selected could be
  // deleted", with no hint that the reason was the statement being processed already.
  'Only draft (unprocessed) statements can be modified': 'backendError.statementNotDraft',
  'Only processed statements can be reactivated': 'backendError.statementNotProcessed',
  // Reconciliation write guards (ETP-5121, QA round): reconcileGroup, prepareGroup and
  // reconcileDifference all refuse a line whose statement is back in Borrador. The Automatch no
  // longer proposes such a line, so the way a user reaches this is a STALE preview - the statement
  // was reactivated in another tab between opening the suggestions and applying them.
  'The bank statement is in draft; process it before reconciling its lines':
    'backendError.statementDraftNotReconcilable',
  // Funds-transfer leg delete guard (FinancialAccountTransactionsHandler.handleDelete, ETP-5085).
  // The two legs of a transfer reference each other through RESTRICT self-FKs, so removing either
  // one is rejected with a 409 instead of the JDBC constraint violation that used to surface as an
  // opaque HTTP 500.
  'Movements generated by a funds transfer cannot be deleted.':
    'backendError.transferMovementNotDeletable',
  // ETP-5111 — refusals the user can now REACH, since the actions no longer hide themselves.
  // `movementActionEligibility.js` pre-checks the movement ones against these same keys, so both
  // paths read one sentence. Split by direction (pago is payment-out, cobro payment-in: sending a
  // receipt's owner to "the payment" is the wrong window) and by action (reactivating is not
  // deleting).
  'This movement belongs to a payment. Delete it from the payment instead.': 'backendError.paymentMovementNotDeletable',
  'This movement belongs to a receipt. Delete it from the receipt instead.': 'backendError.receiptMovementNotDeletable',
  'This movement belongs to a payment. Reactivate it from the payment instead.': 'backendError.paymentMovementNotReactivatable',
  'This movement belongs to a receipt. Reactivate it from the receipt instead.': 'backendError.receiptMovementNotReactivatable',
  // Pre-checked so APRM_FIN_FINACC_TRAN_CHECK_TRG does not fire: a JDBC error escapes the
  // handler's OBException branch as an opaque 500.
  'The movement is already processed or posted. Select it on its own to delete it.': 'backendError.movementProcessedNotDeletable',
  // The two statement refusals, in the order a user meets them.
  'Statements from a bank-connected account cannot be deleted.': 'backendError.statementBankConnectedNotDeletable',
  'The statement has matched lines; unreconcile them before deleting': 'backendError.statementHasMatchedLines',
  // Price list (PriceListHeaderHandler) validation messages
  'A tariff marked as default cannot be deactivated.': 'backendError.priceListCannotDeactivateDefault',
  'There is already an asset category with this name.': 'backendError.assetGroupNameDuplicate',
  'There is already an asset with this identifier in this organization.': 'backendError.assetSearchKeyDuplicate',
  // Goods Movements line (GoodsMovementLineHandler) validation messages
  'This product is of type Service and cannot be used in inventory movements.': 'backendError.productNotStockable',
  // Product category (ProductCategoryDefaultHandler) validation messages
  'Only one product category can be marked as default.': 'backendError.productCategoryCannotSetMultipleDefault',
  // Costing engine (core `NotCalculatedCostWithTransaction` AD_MESSAGE) — the backend
  // always returns this with the literal, unresolved `@product@` token still in it
  // (OBMessageUtils.parseTranslation() resolves the outer message but doesn't
  // recursively re-parse the nested placeholder), so it's a stable exact match.
  'The cost of the product @product@ has not been calculated.': 'backendError.costNotCalculated',
  // Core `InvalidCostWhichProduct` AD_MESSAGE. The posting engine can return this with the
  // literal `@Product@` / `@Date@` placeholders still unresolved; Etendo Go users should see the
  // same actionable retry-later copy as the other transient costing message, not costing internals.
  'There is no cost defined for the product: @Product@ on @Date@': 'backendError.costNotCalculated',
  // CreateDraftInvoiceHandler (com.etendoerp.go) — hardcoded Spanish literal with no
  // AD_Message/i18n involvement, so it always renders in Spanish regardless of session
  // locale (ETP-4831 case 2, inverse symptom of the invoice-line skeleton below).
  'No hay líneas a facturar en este pedido': 'backendError.noLinesToInvoice',
  // ETP-5381: the only remaining server-side duplicate guard. The order, shipment, receipt and
  // quotation paths need none — now that the invoice is confirmed on creation, the core's own
  // pending-quantity logic sees the invoiced amounts and rejects the second attempt by itself.
  // A return document has no such native cap: its rectificative takes the lines whole.
  'A rectificative invoice already exists for this return document.':
    'backendError.returnInvoiceAlreadyExists',
  // ETP-5381 — a rectificative invoice cannot be confirmed without declaring which invoice it
  // rectifies (ETSG_CHECK_RECTIF_INV_DOC), so the request is rejected before anything is written.
  'Select at least one invoice to rectify: a rectificative invoice cannot be confirmed without it.':
    'backendError.rectifiedInvoiceRequired',
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
  // CreateGoodsReceiptHandler.createReceiptLines (com.etendoerp.go, ETP-5276) — the
  // purchase-side sibling of 'No hay líneas pendientes de entrega en este pedido' above
  // (backendError.noPendingLinesToDeliverOrder), hardcoded in ENGLISH instead of Spanish
  // (an inconsistency that predates ETP-5276, not introduced by it). Previously unmapped:
  // the goods-receipt path showed this raw, untranslated backend string. Kept at the end
  // of the map rather than next to its sibling to stay clear of the pre-existing
  // duplicate block Sonar flags across lines ~41-189 of this file.
  'No pending lines to receive in this purchase order': 'backendError.noPendingLinesToReceiveOrder',
  // AD_MESSAGE 20552 (module org.openbravo, core-owned — not fixed there). Core's literal says
  // "business partner" ("tercero" in Spanish), which is wrong Etendo Go terminology: the
  // equivalent concept in this UI is "Contact" ("Contacto"). Both EN and ES source literals are
  // mapped so the header save path (DetailView.jsx) renders the correct term (ETP-5397).
  ...sameKeyEntries('backendError.cannotChangeBpWithLines',
    'Cannot change business partner if there are lines.',
    'No se puede modificar el tercero cuando hay líneas.'),
  // AD_MESSAGE 20502 — sibling of 20552 with the identical "tercero" terminology bug, also
  // core-owned (org.openbravo). Same fix: translation-only mapping, no core change (ETP-5397).
  ...sameKeyEntries('backendError.cannotChangeBpOrPriceListWithLines',
    'Cannot change business partner or price list if there are lines.',
    'No se puede cambiar de tercero ni la tarifa de la factura por existir líneas.'),
  // UserRoleAssignmentHandler (com.etendoerp.go, ETP-5264) — the admin-facing "create user" form
  // never shows a username field, so a raw DB username-unique-constraint message would confusingly
  // name a field the user never typed. rejectDuplicateEmail() proactively rejects a duplicate
  // email with this fixed English literal instead.
  'A user with this email address already exists': 'backendError.duplicateUserEmail',
  // UserRoleAssignmentHandler (com.etendoerp.go, ETP-5195 Bug 3) — hardcoded English literals,
  // no AD_Message involvement, thrown when a DELETE targets the acting user's own record, the
  // client's tenant owner (EM_ETGO_Is_Owner), or the client's last remaining active admin.
  'You cannot delete your own user account': 'backendError.cannotDeleteOwnAccount',
  'This user is the tenant owner and cannot be deleted': 'backendError.cannotDeleteOwner',
  'Cannot delete the last active administrator for this client':
    'backendError.cannotDeleteLastAdmin',
  // UserRoleAssignmentHandler#rejectNonOwnerEditingOwner (com.etendoerp.go, ETP-4830 owner
  // protection, previously unmapped — ETP-5411) — hardcoded English literal, no AD_Message
  // involvement, thrown on a PUT/PATCH against the tenant owner's own record by anyone other
  // than the owner. Unlike its siblings above (cannotDeactivateOwnAccount/cannotDeleteOwner),
  // this one reaches the toast untranslated regardless of session locale.
  'This user is the tenant owner — only the owner can modify this account':
    'backendError.cannotModifyOwnerAccount',
};

// ETP-5316 — MATCHING BY AD_MESSAGE KEY, the third mechanism (the other two are the exact-match
// map above and the parameterized matchers below). Use it when the backend message is a core
// PL/SQL document-action failure: those are assembled from AD_MESSAGE tokens plus run-time data
// (`@Inline@ 10, 20, 30, @ProductNotNullAndMovementQtyZero@`), so by the time the sentence reaches
// us it is both untranslatable-by-text — the embedded values differ per document — and unhelpful:
// the numbers are AD line numbers (10, 20, 30…), NOT the row positions the user sees, so nobody
// can act on them. Product decided the line reference is dropped entirely and the message is
// reduced to what the user can actually do something about: "there are lines without a quantity".
//
// Etendo GO now returns the keys it extracted BEFORE translating (NeoProcessService
// `messageKeys`), so the mapping is by stable identity rather than by prose — the same principle
// as the "prefer a structured code" rule in docs/i18n-guide.md, applied to a core message we do
// not own. A key not listed here is inert: translateBackendError falls through to the text
// mechanisms and finally to the backend's own sentence, exactly as before.
//
// Keys are AD_MESSAGE search keys, verbatim from core (note `lockedProduct` /
// `productWithoutAttributeSet` are lowercase-initial in the catalog — do not "normalize" them).
// Sources: M_INOUT_POST for all eight; `productWithoutAttributeSet` is raised with the same key by
// M_MOVEMENT_POST, M_INVENTORY_POST and M_INTERNAL_CONSUMPTION_POST1, so stock movements,
// physical inventory and internal consumption get it for free.
const BACKEND_ERROR_KEY_MAP = {
  ProductNotNullAndMovementQtyZero: 'backendError.docLinesWithoutQuantity',
  InoutLineWithoutLocator: 'backendError.docLinesWithoutLocator',
  LocatorWithNotAvailableStatus: 'backendError.docLinesLocatorNotAvailable',
  InActiveProducts: 'backendError.docLinesInactiveProduct',
  lockedProduct: 'backendError.docLinesLockedProduct',
  productWithoutAttributeSet: 'backendError.docLinesAttributeRequired',
  InoutLineNotExploded: 'backendError.docLinesNotExploded',
  MovementQtyCheck: 'backendError.docLinesQtyExceedsOrdered',
};

/**
 * Reads the `messageKeys` array out of a parsed NEO error body, whatever envelope it arrived in.
 *
 * The ONE place that knows the wire field name, so the hooks and modals that plumb it through to
 * `translateBackendError` do not each re-derive the shape. Returns `undefined` — never throws and
 * never invents an empty array — when the field is absent, which is exactly what a frontend
 * deployed ahead of the backend sees. The two repos ship separately, so that is the normal steady
 * state for a while, not an edge case: with no keys, `translateBackendError` behaves as it always
 * has and the user reads the backend's own sentence.
 *
 * @param {object|null|undefined} payload parsed JSON error body
 * @returns {string[]|undefined} the message keys, or undefined when the body carries none
 */
export function extractBackendMessageKeys(payload) {
  const keys = payload?.messageKeys ?? payload?.response?.messageKeys ?? payload?.error?.messageKeys;
  if (!Array.isArray(keys)) return undefined;
  const clean = keys.filter((k) => typeof k === 'string' && k.length > 0);
  return clean.length > 0 ? clean : undefined;
}

// Resolves the FIRST key we recognise, so a message that mixes a structural token with a real
// failure (`@Inline@` + `@lockedProduct@`) lands on the failure. Returns null when no key is
// known, or when the mapped locale entry is missing — an untranslated result is indistinguishable
// from no result for the caller, same convention as translateSingleMessage.
function translateByMessageKey(messageKeys, t) {
  if (!Array.isArray(messageKeys)) return null;
  for (const raw of messageKeys) {
    const key = BACKEND_ERROR_KEY_MAP[raw];
    if (!key) continue;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return null;
}

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

// StockAvailabilityGuard.java (com.etendoerp.go — ETP-5037), `ETGO_InsufficientStockLine`
// AD_MESSAGE — raised by GoodsMovementLineHandler when a Goods Movement line's quantity
// exceeds on-hand stock at the selected source storage bin. en_US only, same no-translation-
// pack root cause as the matchers above. Same plain-string-slicing rationale: product code
// and warehouse name are admin-defined catalog data, not attacker input, but consistency with
// the rest of the file keeps the no-regex argument uniform (SonarQube javascript:S5852).
const INSUFFICIENT_STOCK_LINE_PREFIX = 'The entered quantity (';
const INSUFFICIENT_STOCK_LINE_MID1 = ') exceeds the available stock of ';
const INSUFFICIENT_STOCK_LINE_MID2 = ' in ';
const INSUFFICIENT_STOCK_LINE_SUFFIX = ' units).';

function matchInsufficientStockLine(msg) {
  if (!msg.startsWith(INSUFFICIENT_STOCK_LINE_PREFIX) || !msg.endsWith(INSUFFICIENT_STOCK_LINE_SUFFIX)) {
    return null;
  }
  const inner = msg.slice(
    INSUFFICIENT_STOCK_LINE_PREFIX.length,
    -INSUFFICIENT_STOCK_LINE_SUFFIX.length,
  );
  const mid1Idx = inner.indexOf(INSUFFICIENT_STOCK_LINE_MID1);
  if (mid1Idx === -1) return null;
  const requested = inner.slice(0, mid1Idx);
  const afterMid1 = inner.slice(mid1Idx + INSUFFICIENT_STOCK_LINE_MID1.length);
  const mid2Idx = afterMid1.indexOf(INSUFFICIENT_STOCK_LINE_MID2);
  if (mid2Idx === -1) return null;
  const product = afterMid1.slice(0, mid2Idx);
  const afterMid2 = afterMid1.slice(mid2Idx + INSUFFICIENT_STOCK_LINE_MID2.length);
  // The warehouse name may itself contain " (" in principle, so split on the LAST occurrence —
  // the available quantity is always the final parenthesised token (mirrors
  // matchIbanPrefixCountryMismatch's lastIndexOf(' (') below).
  const parenIdx = afterMid2.lastIndexOf(' (');
  if (parenIdx === -1) return null;
  const warehouse = afterMid2.slice(0, parenIdx);
  const available = afterMid2.slice(parenIdx + 2);
  if (!requested || !product || !warehouse || !available) return null;
  return { requested, product, warehouse, available };
}

// GoodsMovementProcessGuard.java (com.etendoerp.go — ETP-5037), `ETGO_InsufficientStockProcess`
// AD_MESSAGE — raised when "Procesar" would complete a Goods Movement whose lines, summed per
// (product, source locator), exceed on-hand stock (the cumulative case: each line individually
// valid, but together over the limit). Named by product, not counted by group/line — a single
// product can span several offending lines summed together, and a bare count reads as if only
// one line were at fault. `details` is already a human-readable, semicolon-joined list of every
// offending product/warehouse pair and is passed through untranslated — it is mostly product
// codes, warehouse names and numbers, and re-parsing it further would only reintroduce the same
// ReDoS-avoidance tradeoffs for no real translation gain.
const INSUFFICIENT_STOCK_PROCESS_PREFIX = 'This movement cannot be processed: the line(s) of ';
const INSUFFICIENT_STOCK_PROCESS_MID = ' exceed the available source-warehouse stock: ';

function matchInsufficientStockProcess(msg) {
  if (!msg.startsWith(INSUFFICIENT_STOCK_PROCESS_PREFIX)) return null;
  const rest = msg.slice(INSUFFICIENT_STOCK_PROCESS_PREFIX.length);
  const midIdx = rest.indexOf(INSUFFICIENT_STOCK_PROCESS_MID);
  if (midIdx === -1) return null;
  const products = rest.slice(0, midIdx);
  const details = rest.slice(midIdx + INSUFFICIENT_STOCK_PROCESS_MID.length);
  if (!products || !details) return null;
  return { products, details };
}

// GoodsMovementProcessGuard.java (com.etendoerp.go — ETP-5037), `ETGO_ZeroOrNegativeQtyProcess`
// AD_MESSAGE — raised when "Procesar" would complete a Goods Movement with a line whose quantity
// is zero or negative (mirrors classic core's M_MOVEMENT_POST condition: only blocks when the
// source or destination locator disallows overissue). Before this guard existed, a zero/negative
// line fell through to classic core's own check, which raises `GoodsMovementsWithNegativeQty`
// naming only the raw line number (QA finding, Emilio Polliotti) — this message names the
// product(s) instead, same convention as matchInsufficientStockProcess above.
const ZERO_OR_NEGATIVE_QTY_PROCESS_PREFIX = 'This movement cannot be processed: the line(s) of ';
const ZERO_OR_NEGATIVE_QTY_PROCESS_SUFFIX = ' have a zero or negative quantity.';

function matchZeroOrNegativeQtyProcess(msg) {
  if (!msg.startsWith(ZERO_OR_NEGATIVE_QTY_PROCESS_PREFIX)
      || !msg.endsWith(ZERO_OR_NEGATIVE_QTY_PROCESS_SUFFIX)) {
    return null;
  }
  const products = msg.slice(
    ZERO_OR_NEGATIVE_QTY_PROCESS_PREFIX.length,
    -ZERO_OR_NEGATIVE_QTY_PROCESS_SUFFIX.length,
  );
  if (!products) return null;
  return { products };
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

// ChartOfAccountsHandler.java (com.etendoerp.go — ETP-5101), ERR_DUPLICATE_CODE — prefix +
// dynamic 8-digit account code + suffix, same shape as ORDER_NOT_FOUND_PREFIX above.
const ACCOUNT_ALREADY_EXISTS_PREFIX = 'Account ';
const ACCOUNT_ALREADY_EXISTS_SUFFIX = ' already exists.';

function matchAccountAlreadyExists(msg) {
  if (!msg.startsWith(ACCOUNT_ALREADY_EXISTS_PREFIX) || !msg.endsWith(ACCOUNT_ALREADY_EXISTS_SUFFIX)) return null;
  const code = msg.slice(ACCOUNT_ALREADY_EXISTS_PREFIX.length, -ACCOUNT_ALREADY_EXISTS_SUFFIX.length);
  if (!code) return null;
  return { code };
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

// StringPropertyValidator.validate() (core, org.openbravo.base.validation) — raised whenever a
// saved string value exceeds its AD column's field length. The raw message has no
// AD_Message/i18n involvement at all: `ValidationException.getMessage()` prefixes it with
// "<EntityName>.<PropertyName>: " and the validator itself appends "Value too long. Length <N>,
// maximum allowed <M> [<value, possibly truncated to 100 chars>]" (ETP-4984, Assets Name/
// Description). The entity/field prefix and the truncated value are dynamic and not needed for
// the toast, so this matcher locates the fixed "Value too long. Length " / ", maximum allowed "
// markers with indexOf rather than requiring a startsWith match on the whole message — same
// plain-string-slicing rationale as the matchers above (no regex, no ReDoS surface over
// entity/field/value names).
const FIELD_TOO_LONG_MARKER = 'Value too long. Length ';
const FIELD_TOO_LONG_MID = ', maximum allowed ';
const FIELD_TOO_LONG_VALUE_OPEN = ' [';

function matchFieldTooLong(msg) {
  const markerIdx = msg.indexOf(FIELD_TOO_LONG_MARKER);
  if (markerIdx === -1 || !msg.endsWith(']')) return null;
  const afterMarker = msg.slice(markerIdx + FIELD_TOO_LONG_MARKER.length);
  const midIdx = afterMarker.indexOf(FIELD_TOO_LONG_MID);
  if (midIdx === -1) return null;
  const length = afterMarker.slice(0, midIdx);
  const afterMid = afterMarker.slice(midIdx + FIELD_TOO_LONG_MID.length);
  const valueOpenIdx = afterMid.indexOf(FIELD_TOO_LONG_VALUE_OPEN);
  if (valueOpenIdx === -1) return null;
  const maxLength = afterMid.slice(0, valueOpenIdx);
  if (!length || !maxLength) return null;
  return { maxLength };
}

// ETP-5109: the remaining PSD2 sync messages, siblings of the three ETP-4891 ones above on the very
// same `SaltEdgeAccountLinkHelper.fetchAccountTransactions` code path. They were left unmapped, so
// an inactive/expired connection reported itself in English on a Spanish UI (reproduced live: the
// "Sincronizar extractos" toast rendered `PSD2_ConnectionWentInactive` verbatim).
//
// Worth stating precisely, because it is not the same story as the ETP-4891 comment above: these
// AD_MESSAGEs DO ship an es_ES translation in the `.es_es` module, but the AD_MESSAGE_TRL row
// resolves to the English text with `istranslated = 'N'` unless the environment actually imported
// the translation pack. Translating here is what makes the toast locale-correct regardless of how
// a given client's Core was provisioned.
const CONNECTION_WENT_INACTIVE_PREFIX = 'The connection for account ';
const CONNECTION_WENT_INACTIVE_SUFFIX = ' was found inactive during synchronization.'
  + ' Please reconnect the account.';

function matchConnectionWentInactive(msg) {
  if (!msg.startsWith(CONNECTION_WENT_INACTIVE_PREFIX)
    || !msg.endsWith(CONNECTION_WENT_INACTIVE_SUFFIX)) {
    return null;
  }
  const account = msg.slice(
    CONNECTION_WENT_INACTIVE_PREFIX.length,
    -CONNECTION_WENT_INACTIVE_SUFFIX.length,
  );
  return account ? { account } : null;
}

const CONSENT_EXPIRED_PREFIX = 'The bank consent for financial account ';
const CONSENT_EXPIRED_SUFFIX = ' has expired. Please reconnect the account.';

function matchConsentExpired(msg) {
  if (!msg.startsWith(CONSENT_EXPIRED_PREFIX) || !msg.endsWith(CONSENT_EXPIRED_SUFFIX)) {
    return null;
  }
  const account = msg.slice(CONSENT_EXPIRED_PREFIX.length, -CONSENT_EXPIRED_SUFFIX.length);
  return account ? { account } : null;
}

// The AD_MESSAGE template repeats `%0`, so the same day count appears twice in the rendered string.
// Both occurrences are captured and required to agree — a message whose two numbers differ is not
// this message and must not be translated as if it were.
//
// The `backendError.psd2ImportDateBeyondMaxInterval` locale strings deliberately mention `{days}`
// ONLY ONCE, unlike the English original: useUI's interpolation is
// `text.replace(`{${p}}`, params[p])` (app-shell-core/src/i18n/useUI.js:26), and String.replace with
// a string pattern substitutes the first occurrence only — a second `{days}` would render literally
// in the toast. Do not "restore" the repetition without first making that interpolation global.
const IMPORT_DATE_INTERVAL_PREFIX = 'The requested start date exceeds the maximum fetch interval of ';
const IMPORT_DATE_INTERVAL_MID = ' days supported by this provider.'
  + ' Only transactions within the last ';
const IMPORT_DATE_INTERVAL_SUFFIX = ' days may be available.';

function matchImportDateBeyondMaxInterval(msg) {
  if (!msg.startsWith(IMPORT_DATE_INTERVAL_PREFIX)
    || !msg.endsWith(IMPORT_DATE_INTERVAL_SUFFIX)) {
    return null;
  }
  const middle = msg.slice(IMPORT_DATE_INTERVAL_PREFIX.length, -IMPORT_DATE_INTERVAL_SUFFIX.length);
  const midIdx = middle.indexOf(IMPORT_DATE_INTERVAL_MID);
  if (midIdx === -1) return null;
  const days = middle.slice(0, midIdx);
  const daysAgain = middle.slice(midIdx + IMPORT_DATE_INTERVAL_MID.length);
  if (!days || days !== daysAgain) return null;
  return { days };
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
  [matchInsufficientStockLine, 'backendError.insufficientStockLine'],
  [matchInsufficientStockProcess, 'backendError.insufficientStockProcess'],
  [matchZeroOrNegativeQtyProcess, 'backendError.zeroOrNegativeQtyProcess'],
  [matchOrderNotFound, 'backendError.orderNotFound'],
  [matchShipmentNotFound, 'backendError.shipmentNotFound'],
  [matchAccountAlreadyExists, 'backendError.accountAlreadyExists'],
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
  [matchFieldTooLong, 'backendError.fieldTooLong'],
  [matchConnectionWentInactive, 'backendError.psd2ConnectionWentInactive'],
  [matchConsentExpired, 'backendError.psd2ConsentExpired'],
  [matchImportDateBeyondMaxInterval, 'backendError.psd2ImportDateBeyondMaxInterval'],
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

// ETP-5323: JsonDataService's RPCREQUEST_STATUS_VALIDATION_ERROR shape (a per-property setter
// failure caught during JSON-to-entity conversion, e.g. StringPropertyValidator rejecting a
// "Description" value longer than its AD column) carries the message under response.errors, a
// MAP keyed by property name — a sibling of response.error (singular), not a variant of it.
// NeoCrudHandler now translates/sanitizes this server-side (see buildValidationErrorResponse),
// so this is a defense-in-depth fallback for any deployment where that Java fix hasn't shipped
// yet: without it, the caller falls back to the bare "Error <status>". Extracted out of
// parseBackendErrorMessage to keep that function under the S3776 cognitive-complexity ceiling —
// same pattern as PARAMETERIZED_MATCHERS above.
function extractFirstResponseErrorsMessage(data) {
  const errorsMap = data?.response?.errors;
  if (!errorsMap || typeof errorsMap !== 'object') return undefined;
  const firstKey = Object.keys(errorsMap)[0];
  if (firstKey && typeof errorsMap[firstKey] === 'string') return errorsMap[firstKey];
  return undefined;
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
      else raw = extractFirstResponseErrorsMessage(data);
    }
  } catch {
    // Ignore non-JSON error bodies.
  }
  return raw;
}

const ACCOUNT_DELETE_BLOCKED_PREFIX = 'Cannot delete this account. ';

/**
 * Collapses a `FinancialAccountHandler.deleteAccount` 409 into ONE generic sentence (ETP-5111), or
 * returns `null` when the message is not this endpoint's.
 *
 * The backend space-joins every applicable REASON_* sentence behind the prefix, so one account
 * could report four near-identical reasons the user cannot act on differently. Matching only the
 * prefix also retires a nine-literal wire contract. The reasons stay in the 409 body and the log.
 */
function translateAccountDeleteBlocked(msg, t) {
  if (!msg.startsWith(ACCOUNT_DELETE_BLOCKED_PREFIX)) return null;
  const translated = t('backendError.accountHasLinkedRecords');
  return (translated && translated !== 'backendError.accountHasLinkedRecords') ? translated : null;
}

// Translates ONE already-trimmed backend message, or returns null when nothing matched — including
// the case where a skeleton did match but its i18n key is missing, since an untranslated result is
// indistinguishable from no result for the caller's purposes.
function translateSingleMessage(trimmed, t) {
  const key = BACKEND_ERROR_MAP[trimmed];
  if (key) {
    const translated = t(key);
    // Guard: if t() returns the key itself the translation is missing — keep original
    return (translated && translated !== key) ? translated : null;
  }
  const parameterized = translateParameterized(trimmed, t);
  if (parameterized !== null) return parameterized;
  return translateAccountDeleteBlocked(trimmed, t);
}

/**
 * Translates ONE backend error message into the active locale.
 *
 * @param {string} msg the backend message (already-translated prose, as it crossed the wire)
 * @param {function} t the `ui` function from `useUI()`
 * @param {{messageKeys?: string[]}} [options] ETP-5316 — the AD_MESSAGE search keys behind `msg`,
 *   when the backend sent them (see `extractBackendMessageKeys`). Tried FIRST, because a key is a
 *   stable identity while the prose it produced may embed per-document values. Omitting them is
 *   the pre-ETP-5316 behavior and stays fully supported.
 * @returns {string} the translated message, or `msg` untouched when nothing matched
 */
export function translateBackendError(msg, t, options = {}) {
  if (typeof t !== 'function') return msg;

  // Key route first: it is the only one that can resolve a message whose text is unmatchable by
  // construction. Runs even when `msg` is empty — the keys alone carry enough to say what failed.
  const byKey = translateByMessageKey(options.messageKeys, t);
  if (byKey !== null) return byKey;

  if (!msg) return msg;
  const trimmed = msg.trim();

  const single = translateSingleMessage(trimmed, t);
  if (single !== null) return single;

  // ETP-5109: the PSD2 sync path accumulates its result messages into ONE StringBuilder joined by
  // newlines — SaltEdgeAccountLinkHelper.fetchAccountTransactions appends the max-fetch-interval
  // warning immediately before the connection-inactive one — so two individually translatable
  // messages can arrive as a single multi-line string that matches no skeleton as a whole, and the
  // user reads both in English. Translating line by line covers that; a line that matches nothing
  // is kept verbatim, so a mixed result degrades to "the parts we know" instead of all-or-nothing.
  if (!trimmed.includes('\n')) return msg;

  let anyTranslated = false;
  const lines = trimmed.split('\n').map((line) => {
    const lineTrimmed = line.trim();
    if (!lineTrimmed) return line;
    const translatedLine = translateSingleMessage(lineTrimmed, t);
    if (translatedLine === null) return line;
    anyTranslated = true;
    return translatedLine;
  });

  // Nothing resolved: return the original untouched, exactly as an unmatched single message does.
  return anyTranslated ? lines.join('\n') : msg;
}
