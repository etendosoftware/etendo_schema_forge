export const READINESS_ENDPOINTS = {
  session: '/sws/neo/session',
  defaults: '/sws/neo/sales-invoice/header/defaults',
  paymentTerms: '/sws/neo/sales-invoice/header/selectors/C_PaymentTerm_ID?isSOTrx=Y&isCustomer=Y&limit=50&offset=0',
  customers: '/sws/neo/sales-invoice/header/selectors/C_BPartner_ID?isSOTrx=Y&isCustomer=Y&limit=50&offset=0',
};

export const READINESS_FAILURE_KEYS = {
  session: 'onboardingReadinessSession',
  defaults: 'onboardingReadinessDefaults',
  paymentTerms: 'onboardingReadinessPaymentTerms',
  customers: 'onboardingReadinessCustomers',
  documentType: 'onboardingReadinessDocumentType',
};

// ETP-4576 — the probes authenticate with the server-side `__Host-` session
// cookie (NeoAuthenticator accepts it on /sws/neo/*), so they opt into
// credentials and never carry a bearer token: the new session contract does not
// hand one out at all.
async function fetchJson(fetchImpl, baseUrl, endpoint, label) {
  const response = await fetchImpl(`${baseUrl}${endpoint}`, {
    credentials: 'include',
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { label, status: response.status, ok: response.ok, body };
}

function hasUsableSelectorItem(body) {
  return Array.isArray(body?.items)
    && body.items.some(item => typeof item.id === 'string' && item.id && typeof item.label === 'string' && item.label.trim());
}

function readDocumentType(defaultsBody) {
  return defaultsBody?.documentType
    || defaultsBody?.values?.documentType
    || defaultsBody?.data?.documentType
    || defaultsBody?.defaults?.documentType
    || null;
}

/**
 * One pass of the four probes. Split out so the caller can retry it.
 */
async function probeOnce(fetchImpl, baseUrl) {
  const [session, defaults, paymentTerms, customers] = await Promise.all([
    fetchJson(fetchImpl, baseUrl, READINESS_ENDPOINTS.session, 'session'),
    fetchJson(fetchImpl, baseUrl, READINESS_ENDPOINTS.defaults, 'sales invoice defaults'),
    fetchJson(fetchImpl, baseUrl, READINESS_ENDPOINTS.paymentTerms, 'payment terms'),
    fetchJson(fetchImpl, baseUrl, READINESS_ENDPOINTS.customers, 'customers'),
  ]);

  const failures = [];

  if (!session.ok) failures.push({ key: READINESS_FAILURE_KEYS.session, status: session.status });
  if (!defaults.ok) failures.push({ key: READINESS_FAILURE_KEYS.defaults, status: defaults.status });
  if (!paymentTerms.ok || !hasUsableSelectorItem(paymentTerms.body)) {
    failures.push({ key: READINESS_FAILURE_KEYS.paymentTerms, status: paymentTerms.status });
  }
  if (!customers.ok || !hasUsableSelectorItem(customers.body)) {
    failures.push({ key: READINESS_FAILURE_KEYS.customers, status: customers.status });
  }

  const documentType = readDocumentType(defaults.body);
  if (!documentType || documentType === '0') {
    failures.push({ key: READINESS_FAILURE_KEYS.documentType, status: defaults.status, documentType });
  }

  return {
    ready: failures.length === 0,
    failures,
    checks: { session, defaults, paymentTerms, customers },
  };
}

/** How long to wait before the single retry below. */
const SESSION_SETTLE_DELAY_MS = 1500;

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * True when the whole pass looks like "the session was not accepted", rather than
 * "this tenant is genuinely missing data".
 *
 * The distinction is the point: a tenant with no payment terms fails ONE probe and
 * must keep failing, because that is a real provisioning gap the user has to see. A
 * session the backend does not accept yet fails EVERY probe at once, since all four
 * are plain GETs that differ only in path.
 */
function looksLikeAnUnsettledSession(failures) {
  const unauthorized = failures.filter((failure) => failure.status === 401 || failure.status === 403);
  return unauthorized.length >= 3;
}

/**
 * Reports whether a freshly provisioned tenant can actually issue a sales invoice.
 *
 * Retries once when the first pass fails as a whole on 401/403. This is called
 * immediately after `POST /sws/go/session/environment`, which ROTATES the session
 * cookie and hands back a new CSRF token — and the four probes go out in parallel
 * right behind it. Under load that read can land before the rotated cookie is in
 * play, and the backend rejects the superseded one on all four at once. The screen
 * then tells the user their brand-new environment "is not ready to invoice", naming
 * five things that are all present: verified by hand against a tenant this check had
 * just rejected, where every probe answered 200 with real payment terms and
 * customers moments later.
 *
 * Deliberately NOT a blanket retry: a genuine gap fails one or two probes and is
 * reported on the first pass, at no extra cost. Only the all-or-nothing shape —
 * which no data problem produces — buys a second look.
 */
export async function checkSalesInvoiceReadiness(fetchImpl, baseUrl) {
  const first = await probeOnce(fetchImpl, baseUrl);
  if (first.ready || !looksLikeAnUnsettledSession(first.failures)) {
    return first;
  }
  await delay(SESSION_SETTLE_DELAY_MS);
  return probeOnce(fetchImpl, baseUrl);
}
