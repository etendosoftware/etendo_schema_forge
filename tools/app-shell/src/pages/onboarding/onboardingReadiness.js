import { authHeaders } from '@etendosoftware/app-shell-core/auth/api';
export const READINESS_ENDPOINTS = {
  session: '/sws/neo/session',
  defaults: '/sws/neo/sales-invoice/header/defaults',
  paymentTerms: '/sws/neo/sales-invoice/header/selectors/C_PaymentTerm_ID?isSOTrx=Y&isCustomer=Y&limit=50&offset=0',
};

export const READINESS_FAILURE_KEYS = {
  session: 'onboardingReadinessSession',
  defaults: 'onboardingReadinessDefaults',
  paymentTerms: 'onboardingReadinessPaymentTerms',
  documentType: 'onboardingReadinessDocumentType',
};

async function fetchJson(fetchImpl, baseUrl, token, endpoint, label) {
  const response = await fetchImpl(`${baseUrl}${endpoint}`, {
    headers: token ? authHeaders(token) : {},
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
 * ETP-5079: there is deliberately NO "has at least one customer" leg here any more. Onboarding used
 * to seed a synthetic "Default Customer" business partner; it no longer does, so a freshly
 * provisioned tenant legitimately has zero business partners. Keeping the check would make
 * `ready` false forever for every new tenant, and SetupProgressStep refuses to redirect into the
 * app on `!ready` — onboarding would finish provisioning and then lock the user out. The remaining
 * legs all assert real configuration (a live session, a resolvable document type, payment terms),
 * none of which is sample data.
 */
export async function checkSalesInvoiceReadiness(fetchImpl, baseUrl, token) {
  const [session, defaults, paymentTerms] = await Promise.all([
    fetchJson(fetchImpl, baseUrl, token, READINESS_ENDPOINTS.session, 'session'),
    fetchJson(fetchImpl, baseUrl, token, READINESS_ENDPOINTS.defaults, 'sales invoice defaults'),
    fetchJson(fetchImpl, baseUrl, token, READINESS_ENDPOINTS.paymentTerms, 'payment terms'),
  ]);

  const failures = [];

  if (!session.ok) failures.push({ key: READINESS_FAILURE_KEYS.session, status: session.status });
  if (!defaults.ok) failures.push({ key: READINESS_FAILURE_KEYS.defaults, status: defaults.status });
  if (!paymentTerms.ok || !hasUsableSelectorItem(paymentTerms.body)) {
    failures.push({ key: READINESS_FAILURE_KEYS.paymentTerms, status: paymentTerms.status });
  }

  const documentType = readDocumentType(defaults.body);
  if (!documentType || documentType === '0') {
    failures.push({ key: READINESS_FAILURE_KEYS.documentType, status: defaults.status, documentType });
  }

  return {
    ready: failures.length === 0,
    failures,
    checks: { session, defaults, paymentTerms },
  };
}
