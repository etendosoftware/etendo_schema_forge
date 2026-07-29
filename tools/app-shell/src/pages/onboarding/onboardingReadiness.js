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

export async function checkSalesInvoiceReadiness(fetchImpl, baseUrl) {
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
