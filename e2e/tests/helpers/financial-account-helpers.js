/**
 * Deterministic FINANCIAL-ACCOUNT master-data fixture for live-backend integration specs.
 *
 * ## Why this exists (ETP-5079)
 * The GOClient onboarding dataset used to seed three financial accounts ("Caja",
 * "Cuenta de Banco", "Tarjeta") and, with them, six `FIN_FINACC_PAYMENTMETHOD`
 * link rows. ETP-5079 emptied both dataset files
 * (`referencedata/sampledata/GOClient/FIN_FINANCIAL_ACCOUNT.xml` and
 * `.../FIN_FINACC_PAYMENTMETHOD.xml` are now `<data></data>`), while both tables
 * stay listed in `OnboardingDatasetDefinition.INCLUDED_TABLES` — so a freshly
 * onboarded tenant gets **0 financial accounts and 0 account/payment-method
 * links**, holding only the 4 `FIN_PAYMENTMETHOD` masters (Efectivo,
 * Transferencia bancaria, Recibo, Tarjeta).
 *
 * That silently emptied every payment-method selector in the product, because
 * the AD validation rules behind them are `EXISTS` checks over the LINK table,
 * not over the payment-method master (core `AD_VAL_RULE.xml`):
 *
 *     FIN_PaymentMethodsWithAccountIsReceiptControl  (C_BPartner.PO_Paymentmethod_ID,
 *                                                     C_BPartner.FIN_Paymentmethod_ID)
 *       EXISTS (SELECT 1 FROM FIN_FinAcc_PaymentMethod fapm
 *               WHERE FIN_PaymentMethod.FIN_PaymentMethod_ID = fapm.FIN_PaymentMethod_ID
 *                 AND fapm.isActive='Y'
 *                 AND fapm.Payin_Allow  = (CASE WHEN '@FIN_ISRECEIPT@'='Y' THEN 'Y' ELSE fapm.Payin_Allow  END)
 *                 AND fapm.Payout_Allow = (CASE WHEN '@FIN_ISRECEIPT@'='N' THEN 'Y' ELSE fapm.Payout_Allow END))
 *
 *     FIN_PaymentMethodsWithAccountIsSOTrxControl   (C_Invoice.FIN_Paymentmethod_ID)  — same shape
 *
 * With zero link rows the `EXISTS` is false for every method, so the selector
 * returns nothing and `ensureVendorSetup`'s `ensureVendorPaymentFieldsSet` step
 * dies on `[data-testid^="option-pOPaymentMethod-"]` — "element(s) not found" —
 * on a tenant that is otherwise perfectly healthy.
 *
 * Until now that never happened, for a bad reason: the `integration` project runs
 * `workers: 1` in alphabetical file order, so `financial-account-cash-close`
 * ("f") ran before the purchase specs ("p") and left its own `Caja E2E
 * <timestamp>` account — and therefore an Efectivo link — behind for them to use.
 * Every purchase spec was silently depending on the cash-close spec having run
 * first. This helper removes that dependency: it provisions the precondition
 * itself, so any spec that needs a vendor works on a genuinely fresh tenant, in
 * any order, in isolation.
 *
 * ## Why a type-'C' (cash) account
 * `FinancialAccountSupport.PAYMENT_METHODS_BY_TYPE` (com.etendoerp.go) maps
 * `C -> [Efectivo]`, `B -> [Transferencia bancaria, Recibo, Tarjeta]`,
 * `CA -> [Tarjeta, Recibo]`. Cash is the smallest set that satisfies the rules
 * above, and it is enough: `FinancialAccountSupport.createLink` leaves
 * `Payin_Allow`/`Payout_Allow` to their column defaults (both `'Y'`, see the
 * comment in `createLink`), so ONE link satisfies both the receipt branch and
 * the payment branch of the val rule — i.e. it unblocks the BP's sales payment
 * method, the BP's PO payment method AND `C_Invoice.FIN_Paymentmethod_ID` at
 * once. It is also the only type whose method list is entirely covered by the
 * four masters the dataset still seeds.
 *
 * Cash additionally has no IBAN/country coupling: `FinancialAccountHandler`'s
 * `validateCountryAndIban` returns early for any non-'B' type, and
 * `FIN_FINANCIAL_ACCOUNT.C_COUNTRY_ID` is nullable, so the fixture never has to
 * pick a country — the exact class of hardcoded-master-data brittleness ETP-5079
 * just punished.
 *
 * ## Why API-only (no UI automation)
 * Same reasoning as `ensureProductSetup()` (product-helpers.js) and
 * `ensureSecondaryWarehouse()` (warehouse-helpers.js). Everything below talks to
 * `/sws/neo/**` through `page.request` (Playwright's APIRequestContext),
 * authenticated with the bearer token `login(page)` already put in
 * `localStorage['sf_auth_token']`.
 *
 * Endpoints used — every one verified routable in
 * `com.etendoerp.go/src-db/database/sourcedata/ETGO_SF_ENTITY.xml`, none guessed:
 *
 *   - `GET  /sws/neo/contacts/businessPartner/selectors/PO_Paymentmethod_ID` — the probe.
 *     Entity `businessPartner` is `ISINCLUDED=Y`; field `PO_Paymentmethod_ID`
 *     (AD_Column `828EE0AE802E5FA1E040007F010067C7`) is `ISINCLUDED=Y` on it in
 *     `ETGO_SF_FIELD.xml`. URL shape is the generic one EntityForm.jsx builds:
 *     `${apiBaseUrl}/${entity}/selectors/${field.column}` — the same call
 *     `CreateContactModal.jsx` already makes for the sibling `FIN_Paymentmethod_ID`.
 *   - `GET  /sws/neo/financial-account/account` — fixture lookup.
 *   - `GET  /sws/neo/financial-account/account/defaults` — session currency.
 *   - `POST /sws/neo/financial-account/account` — create.
 *     Entity `account` is `ISINCLUDED=Y, ISGET=Y, ISPOST=Y`, qualifier
 *     `financialAccountHeaderHandler`, whose `handle()` lets GET flow straight
 *     through to the generic service.
 *
 * **`ISPOST=Y` does not mean an entity is reachable — always check `ISINCLUDED`
 * first** (`NeoServlet#findEntity` filters on it BEFORE the method flags are
 * consulted; see warehouse-helpers.js for the incident that established this).
 * That is exactly why the link row is not written directly here: the
 * `financial-account` spec DOES carry a `paymentMethod` entity pointing at the
 * account's Payment Method tab (`01F5E95D71544D428E1B9004B05D0298`, i.e.
 * `FIN_FINACC_PAYMENTMETHOD`) and it reads `ISGET=Y, ISPOST=Y` — but it is
 * `ISINCLUDED=N`, so a POST there would answer `404 Entity not found in spec`.
 * The link is instead produced as a documented SIDE EFFECT of creating the
 * account: `FinancialAccountHandler#afterHandle` calls
 * `FinancialAccountSupport.assignDefaultPaymentMethods(account)` on every
 * successful POST. Which is the same contract the cash-close spec already
 * asserts on ("a type-C account must be collectable in cash").
 *
 * ## Verification, because that side effect is best-effort
 * `assignDefaultPaymentMethods` is wrapped in a `catch (Exception)` that only
 * logs — and it `log.warn`s and skips when the named payment method is not found
 * at all. So "the POST returned 201" does NOT prove the link exists. This helper
 * therefore RE-PROBES after creating and throws a specific, named error if the
 * selector is still empty, turning a silently swallowed server-side warning into
 * a diagnosable test failure instead of a mystery timeout ~200 lines later in
 * whichever spec happened to need a payment method next.
 *
 * ## Idempotency
 * The probe IS the idempotency check, and it checks the actual precondition
 * rather than a proxy for it: a tenant that already has ANY active
 * account/payment-method link — from a previous run's fixture, from a
 * cash-close `Caja E2E <timestamp>` account, or from a future dataset that seeds
 * accounts again — performs **zero writes and zero lookups**. Only a tenant that
 * genuinely has none reaches the find-or-create path, which is itself keyed on a
 * fixed (never timestamped) name, so re-runs can never accumulate accounts. The
 * backend adds a second guard: `validateAndEnrichCreate` answers `409` when an
 * ACTIVE account with that name already exists in the CURRENT organisation
 * (`nameExists`), which is handled here rather than thrown. Note that check is
 * both active- and org-scoped, so an archived fixture does not block a create —
 * a re-run simply provisions a fresh active one rather than getting stuck.
 *
 * ## Known side effect on the rest of the suite
 * A financial account is durable tenant master data: once created it is visible
 * to every spec that later runs against that tenant. Two consequences worth
 * knowing, both checked against the current suite:
 *   - the Accounts list is no longer empty. No spec asserts that it is.
 *   - the payment modal's account picker gains one more Efectivo-collectable
 *     option. `financial-account-cash-close` picks its account BY NAME
 *     (`pickSelectorOption(page, 'account', accountName, …)`, where accountName
 *     is its own timestamped `Caja E2E <ts>`) and scopes its pending-movement
 *     assertions to that account's id, so its arithmetic is unaffected — this
 *     fixture is a different drawer and its balance is never read. The fixture
 *     name deliberately shares no substring with `Caja E2E ` so a loose text
 *     locator can never match both.
 */

const FINANCIAL_ACCOUNT_SPEC = '/sws/neo/financial-account';
const ACCOUNT_ENTITY = `${FINANCIAL_ACCOUNT_SPEC}/account`;

/**
 * The generic selector endpoint behind the business partner's "PO Payment
 * Method" field — the exact thing `ensureVendorPaymentFieldsSet` needs to be
 * non-empty, queried through the same URL the UI itself builds.
 */
const PO_PAYMENT_METHOD_SELECTOR = '/sws/neo/contacts/businessPartner/selectors/PO_Paymentmethod_ID';

/**
 * The deterministic cash-account fixture.
 *
 * Fixed (never timestamped) name so the SAME record is found on every run
 * instead of piling up a new account per run — same rule as
 * `PRODUCT_FIXTURE_ALPHA` (product-helpers.js), `VENDOR_FIXTURE_NAME`
 * (purchase-helpers.js) and `SECONDARY_WAREHOUSE_FIXTURE`
 * (warehouse-helpers.js).
 *
 * `E2E`-prefixed so the row is obviously suite-owned (and therefore safe to
 * delete) when a human browses the Accounts list, and so it cannot collide with
 * a future onboarding dataset that seeds "Caja" again. `FIN_FINANCIAL_ACCOUNT`
 * has no DB unique constraint on the name, but `FinancialAccountHandler`
 * enforces one at create time (409), so the name has to be collision-proof
 * anyway.
 *
 * `type: 'C'` is the AD "Financial account type" value for Cash — see
 * `FinancialAccountHandler.TYPE_CASH`.
 */
export const CASH_ACCOUNT_FIXTURE = {
  name: 'E2E Fixture Cash Account',
  type: 'C',
};

async function getAuthHeaders(page) {
  const token = await page.evaluate(() => localStorage.getItem('sf_auth_token'));
  if (!token) {
    throw new Error(
      'ensureFinancialAccountSetup could not find an auth token in localStorage["sf_auth_token"] — '
      + 'call login(page) before ensureFinancialAccountSetup(page).',
    );
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** NEO wraps CRUD read/create responses in `{ response: { data: [...] } }`. */
function extractRows(json) {
  const rows = json?.response?.data;
  if (Array.isArray(rows)) return rows;
  return rows && typeof rows === 'object' ? [rows] : [];
}

/**
 * NEO selector responses come back as `{ items: [...] }` or as the plain CRUD
 * envelope depending on the endpoint — accept both, exactly like
 * `parseSelectorItems()` in `hooks/useQuickPurchaseData.js`.
 */
function extractSelectorItems(json) {
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.response?.data)) return json.response.data;
  return Array.isArray(json) ? json : [];
}

/**
 * How many payment methods the BP's "PO Payment Method" selector currently
 * offers — i.e. whether ANY active `FIN_FinAcc_PaymentMethod` row exists.
 *
 * Returns `null` (not 0) when the probe itself could not be evaluated, so a
 * renamed spec/entity or an offline backend is never mistaken for "the tenant
 * has no links". The caller treats `null` as "unknown" and falls through to the
 * name-keyed find-or-create rather than either skipping or failing.
 */
async function countPaymentMethodOptions(page, headers) {
  let res;
  try {
    res = await page.request.get(PO_PAYMENT_METHOD_SELECTOR, { params: { limit: '5' }, headers });
  } catch {
    return null;
  }
  if (!res.ok()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureFinancialAccountSetup] The PO payment-method probe answered HTTP ${res.status()} `
      + `(${PO_PAYMENT_METHOD_SELECTOR}). Falling back to the name-keyed fixture lookup — if the `
      + 'entity or field was renamed, update PO_PAYMENT_METHOD_SELECTOR in this file.',
    );
    return null;
  }
  try {
    return extractSelectorItems(await res.json()).length;
  } catch {
    return null;
  }
}

/**
 * GETs financial accounts named exactly like the fixture.
 *
 * `useCriteria: true` sends the same exact-match AdvancedCriteria filter the
 * ListView's own filter bar sends (`buildBackendFilter()` in
 * tools/app-shell/src/lib/gridQuery.js). `useCriteria: false` fetches an
 * unfiltered bounded page and matches client-side — the same "never trust a
 * zero-row filtered result enough to justify a create" insurance
 * `findVendorFixture()` (purchase-helpers.js) carries, which matters more here
 * because creating a duplicate is answered with a 409 rather than silently
 * producing two rows.
 */
async function queryAccountsByName(page, { headers, useCriteria }) {
  const params = { _startRow: '0', _endRow: '500' };
  if (useCriteria) {
    params.criteria = JSON.stringify({
      _constructor: 'AdvancedCriteria',
      operator: 'and',
      criteria: [{ fieldName: 'name', operator: 'equals', value: CASH_ACCOUNT_FIXTURE.name }],
    });
  }
  const res = await page.request.get(ACCOUNT_ENTITY, { params, headers });
  if (!res.ok()) {
    throw new Error(
      `ensureFinancialAccountSetup: account lookup failed (${res.status()}): ${await res.text()}`,
    );
  }
  const rows = extractRows(await res.json());
  return rows.filter((row) => row?.name === CASH_ACCOUNT_FIXTURE.name);
}

/** Filtered lookup first, unfiltered scan as the fallback. `null` when absent. */
async function findAccountFixture(page, headers) {
  const filtered = await queryAccountsByName(page, { headers, useCriteria: true });
  if (filtered.length > 0) return filtered[0];

  const unfiltered = await queryAccountsByName(page, { headers, useCriteria: false });
  if (unfiltered.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureFinancialAccountSetup] The criteria-filtered lookup for "${CASH_ACCOUNT_FIXTURE.name}" `
      + `returned 0 rows, but an unfiltered scan found ${unfiltered.length} — the "name equals" filter `
      + 'may be misbehaving for this entity. Using the unfiltered match instead of attempting a create.',
    );
    return unfiltered[0];
  }
  return null;
}

/**
 * The session's default currency, read from the same `defaults` endpoint the New
 * Account form uses (`fetchDefaults()` in hooks/useAccountMutations.js).
 *
 * Not optional: `FinancialAccountHandler.validateAndEnrichCreate` rejects a
 * blank currency with `400 "Currency is required"` before the generic CRUD (and
 * therefore before `NeoMandatoryDefaultsService`) ever runs, so the AD default
 * cannot cover for us here. Resolved from the session rather than from the
 * currency selector's first row — picking item 0 of a locale-ordered list is the
 * brittleness this whole file exists to avoid.
 */
async function resolveDefaults(page, headers) {
  const res = await page.request.get(`${ACCOUNT_ENTITY}/defaults`, { headers });
  if (!res.ok()) {
    throw new Error(
      `ensureFinancialAccountSetup: account defaults failed (${res.status()}): ${await res.text()}`,
    );
  }
  const json = await res.json();
  const currency = json?.defaults?.currency || '';
  if (!currency) {
    throw new Error(
      'ensureFinancialAccountSetup: GET /account/defaults returned no default currency, and '
      + 'FinancialAccountHandler rejects a create without one ("Currency is required"). The '
      + "session's organisation most likely has no currency configured.",
    );
  }
  // The org's country (ETP-4896), mirroring what the real form submits. Purely
  // cosmetic for a cash account — validateCountryAndIban returns early for any
  // non-'B' type and C_COUNTRY_ID is nullable — so it is sent only when the
  // backend actually offers one, never invented.
  return { currency, country: json?.defaults?.country || '' };
}

/**
 * POSTs the fixture account. Returns the created row, or `null` when the
 * backend answered `409` (the name already exists — a concurrent/previous
 * create won the race), leaving the caller to re-resolve it by lookup.
 */
async function createAccountFixture(page, headers) {
  const { currency, country } = await resolveDefaults(page, headers);
  const body = { name: CASH_ACCOUNT_FIXTURE.name, type: CASH_ACCOUNT_FIXTURE.type, currency };
  if (country) body.country = country;

  const res = await page.request.post(ACCOUNT_ENTITY, { headers, data: body });
  if (res.status() === 409) return null;
  if (!res.ok()) {
    throw new Error(
      `ensureFinancialAccountSetup: creating "${CASH_ACCOUNT_FIXTURE.name}" failed `
      + `(${res.status()}): ${await res.text()}`,
    );
  }
  return extractRows(await res.json())[0] ?? null;
}

/**
 * Guarantee the tenant can offer a payment method wherever the product asks for
 * one — i.e. that at least one `FIN_FINACC_PAYMENTMETHOD` row exists.
 *
 * Idempotent and order-independent; see this file's header for the full
 * rationale, the endpoint/`ISINCLUDED` evidence and the known side effects.
 * Requires `login(page)` to have run (reads the bearer token out of
 * `localStorage`). Performs NO navigation, so it is safe to call from anywhere
 * in a spec, including between an armed response waiter and its trigger.
 *
 * `verified` distinguishes "a probe confirmed the precondition" from "the probe
 * endpoint could not be reached, so the fixture was provisioned blind" — the only
 * two outcomes that can reach a caller, since a probe that positively reports an
 * empty selector after provisioning throws instead of returning.
 *
 * @returns {Promise<{satisfied: boolean, verified: boolean, created: boolean,
 *                    accountId: string|null, accountName: string,
 *                    optionsBefore: number|null, optionsAfter: number|null}>}
 */
export async function ensureFinancialAccountSetup(page) {
  const headers = await getAuthHeaders(page);

  const optionsBefore = await countPaymentMethodOptions(page, headers);
  if (optionsBefore > 0) {
    // The precondition already holds — whatever produced it. Zero writes.
    return {
      satisfied: true,
      verified: true,
      created: false,
      accountId: null,
      accountName: CASH_ACCOUNT_FIXTURE.name,
      optionsBefore,
      optionsAfter: optionsBefore,
    };
  }

  let account = await findAccountFixture(page, headers);
  let created = false;
  if (!account) {
    account = await createAccountFixture(page, headers);
    created = account != null;
    if (!account) {
      account = await findAccountFixture(page, headers);
      if (!account) {
        throw new Error(
          `ensureFinancialAccountSetup: the backend rejected creating "${CASH_ACCOUNT_FIXTURE.name}" `
          + 'with 409, but no account with that name can be read back. FinancialAccountHandler#nameExists '
          + 'only reports a conflict for an ACTIVE account in the session\'s CURRENT organisation, so '
          + 'such a row exists yet the list GET does not return it — the two disagree about visibility '
          + '(org/role readability, or a filter on the list endpoint). Inspect FIN_FINANCIAL_ACCOUNT for '
          + 'this client before touching this helper.',
        );
      }
    }
  }

  const optionsAfter = await countPaymentMethodOptions(page, headers);
  if (optionsAfter === 0) {
    throw new Error(
      `ensureFinancialAccountSetup: the fixture account "${CASH_ACCOUNT_FIXTURE.name}" `
      + `(id ${account?.id ?? 'unknown'}, ${created ? 'just created' : 'already existed'}) exists, but the `
      + 'business partner PO payment-method selector is still empty — so no active '
      + 'FIN_FINACC_PAYMENTMETHOD row was produced. FinancialAccountSupport.assignDefaultPaymentMethods '
      + 'runs best-effort in FinancialAccountHandler#afterHandle and only logs on failure, and it '
      + 'skips a payment method it cannot find by name: check that the tenant still has the active '
      + '"Efectivo" FIN_PAYMENTMETHOD row seeded by the GOClient dataset, and check the server log for '
      + '"assignDefaultPaymentMethods: payment method \'Efectivo\' not found".',
    );
  }

  // Reaching here means optionsAfter is either > 0 or unknown — the ===0 case threw above.
  return {
    satisfied: true,
    verified: optionsAfter != null,
    created,
    accountId: account?.id ?? null,
    accountName: CASH_ACCOUNT_FIXTURE.name,
    optionsBefore,
    optionsAfter,
  };
}
