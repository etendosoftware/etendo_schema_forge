import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CircleAlert, CreditCard, Loader2, Rocket } from 'lucide-react';
import { initialSetupSteps, applyProgressMessage, fetchEnvironments } from '@etendosoftware/etendo-go-core/onboarding';
import { useUI, getStoredLocale } from '@/i18n';
import { detectBaseUrl } from '@/auth/api.js';
import { track } from '@/lib/observability.js';
import { buildObservabilityEvent, OBSERVABILITY_EVENTS } from '@/lib/observability/events.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  createBillingPurchase,
  getBillingOverview,
  getBillingOffer,
  getBillingPurchase,
  getCheckoutStatus,
  runPaidOnboarding,
  UPGRADE_ERROR_CODES,
} from '@/lib/upgrade/api.js';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { isProductiveEnvironment } from '@/lib/environmentPresentation.js';

const PRODUCTIVE_FEATURES = [
  'upgradeProductiveFeatureSeparate',
  'upgradeProductiveFeatureContacts',
  'upgradeProductiveFeatureProducts',
  'upgradeProductiveFeatureKeepsFree',
];

/** Backend step name to i18n key. */
const STEP_LABELS = {
  setup: 'upgradeStepSetup',
  client: 'upgradeStepClient',
  organization: 'upgradeStepOrganization',
  dataset: 'upgradeStepDataset',
  sequences: 'upgradeStepSequences',
  finalize: 'upgradeStepFinalize',
};

/**
 * Prefill priority: the environment the user is currently logged into, else the account's demo
 * environment, else empty — both resolved once the environments lookup below settles
 * (ETP-5443). The field is always rendered and always editable; this only decides its starting
 * value.
 *
 * The current environment is matched by the SESSION's `clientId` (`useEnvironmentSwitch`'s
 * `currentClientId`) against that environment list, the same way `AppLayout` resolves its
 * `companyName`. Never from `sf_auth_client_name`: that is a legacy auth key
 * `purgeLegacyAuthStorage` deletes under the cookie session (ETP-4576), so reading it answered ''
 * for every user.
 */
const EMPTY_FORM = { tenantName: '', upgradeAction: 'create-productive' };

const PENDING_CHECKOUT_NAME = 'sf_pending_checkout_tenant_name';
const PENDING_CHECKOUT_ACTION = 'sf_pending_checkout_action';
/** Checkout-submitted timestamp, so durationMs survives the Stripe redirect. */
const PENDING_CHECKOUT_STARTED_AT = 'sf_pending_checkout_started_at';
const PENDING_CHECKOUT_DATA_TRANSFER = 'sf_pending_checkout_data_transfer';
const DEFAULT_DATA_TRANSFER = { products: true, contacts: true };

/** Checkout funnel telemetry — see docs/paid-tenant-infrastructure.md §3.6. */
function emitUpgradeEvent(eventDefinition, properties) {
  const event = buildObservabilityEvent(eventDefinition, properties);
  track(event.name, event.properties);
}

/** Which `/upgrade` branch the user actually landed on, for UPGRADE_PAGE_VIEWED. */
function resolveUpgradePageViewBranch(accountState, environments) {
  if (accountState === 'unavailable') return 'unavailable';
  return environments.length === 0 ? 'first_tenant_free' : 'checkout';
}

/**
 * Keep upgrade API calls same-origin while running Vite locally. A leaked
 * VITE_API_BASE points the browser straight at Tomcat and bypasses Vite's
 * /sws proxy; production deployments still derive their context path from
 * the served URL (or the configured API base).
 */
function getUpgradeBaseUrl() {
  return import.meta.env?.DEV ? '' : detectBaseUrl();
}

function readPendingDataTransfer(storage) {
  try {
    return JSON.parse(storage.getItem(PENDING_CHECKOUT_DATA_TRANSFER) || '') || DEFAULT_DATA_TRANSFER;
  } catch {
    return DEFAULT_DATA_TRANSFER;
  }
}

async function resolveCheckoutTenantName({ baseUrl, requestId, storedTenantName }) {
  if (storedTenantName) return storedTenantName;
  const purchase = await getBillingPurchase(baseUrl, requestId);
  return purchase?.clientName || '';
}

async function waitForCheckoutPayment({ baseUrl, requestId }) {
  let status = { status: 'pending' };
  for (let attempt = 0; attempt < 60 && status.status === 'pending'; attempt += 1) {
    status = await getCheckoutStatus(baseUrl, requestId);
    if (status.status === 'pending') await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return status;
}

async function handleExistingPurchaseError(error, {
  baseUrl,
  setFormError,
  resumePaidPurchase,
  waitForExistingProvisioning,
  setBillingPurchases,
  setCheckoutStep,
  setPhase,
}) {
  const purchase = error?.purchase;
  if (error?.code !== UPGRADE_ERROR_CODES.purchaseAlreadyExists || !purchase) return false;

  setFormError(null);
  if (purchase.status === 'PAID') {
    await resumePaidPurchase(purchase);
    return true;
  }
  if (purchase.status === 'PROVISIONING' || purchase.status === 'PROVISIONED') {
    await waitForExistingProvisioning(purchase);
    return true;
  }
  try {
    const overview = await getBillingOverview(baseUrl);
    setBillingPurchases(Array.isArray(overview?.purchases) ? overview.purchases : []);
  } catch {
    // The billing projection is recoverable; the purchase remains durable on the backend.
  }
  setCheckoutStep('payment');
  setPhase('form');
  return true;
}

async function resumeCheckoutProvisioning({
  baseUrl,
  requestId,
  storedTenantName,
  upgradeAction,
  startedAt,
  storage,
  isCancelled,
  onTenantName,
  onPendingProvisioning,
  onDataTransfer,
  onReady,
}) {
  const tenantName = await resolveCheckoutTenantName({
    baseUrl, requestId, storedTenantName,
  });
  if (!tenantName) throw new Error('Purchase has no environment name');
  onTenantName(tenantName);

  const status = await waitForCheckoutPayment({ baseUrl, requestId });
  if (status.status !== 'paid') throw new Error('Checkout payment is not confirmed');

  const selectedTransfer = readPendingDataTransfer(storage);
  onPendingProvisioning({
    clientName: status.clientName || tenantName,
    paymentToken: requestId,
    upgradeAction,
    language: getStoredLocale(),
    dataTransfer: selectedTransfer,
    startedAt,
  });
  if (isCancelled()) return;

  storage.removeItem(PENDING_CHECKOUT_NAME);
  storage.removeItem(PENDING_CHECKOUT_ACTION);
  storage.removeItem(PENDING_CHECKOUT_STARTED_AT);
  window.history.replaceState({}, '', '/upgrade');
  onDataTransfer(selectedTransfer);
  onReady();
  storage.removeItem(PENDING_CHECKOUT_DATA_TRANSFER);
}

function PlanCard({ testId, name, tagline, price, features, current, highlighted, ui, className = '', onSelect }) {
  return (
    <Card
      className={`${highlighted
        ? 'flex flex-col border-2 border-primary bg-card shadow-lg'
        : 'flex flex-col border-border bg-card'} ${className}`}
      data-testid={testId}
    >
      <CardHeader className="space-y-4 p-6" data-testid="CardHeader__58bad7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl" data-testid="CardTitle__58bad7">{name}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">{tagline}</p>
          </div>
          {current && <Badge variant="secondary" data-testid="Badge__58bad7">{ui('upgradePlanCurrentBadge')}</Badge>}
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold tracking-tight">{price}</p>
          <span className="text-sm text-muted-foreground">/ {ui('upgradeCheckoutMonth')}</span>
        </div>
        {onSelect && (
          <Button
            type="button"
            variant={highlighted ? 'default' : 'outline'}
            className="w-full"
            onClick={onSelect}
            data-testid="upgrade-plan-select"
          >
            {ui('upgradeCheckoutSelectPlan')}
            <ArrowRight className="h-4 w-4" data-testid="ArrowRight__58bad7" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="border-t p-6" data-testid="CardContent__58bad7">
        <ul className="space-y-3 text-sm">
          {features.map(key => (
            <li key={key} className="flex items-start gap-2">
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                data-testid="Check__58bad7" />
              <span>{ui(key)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SkeletonPlanCard({ testId, className = '' }) {
  return (
    <Card className={`flex min-h-[280px] flex-col border-border bg-muted/20 ${className}`} data-testid={testId}>
      <CardContent className="flex flex-1 flex-col gap-5 p-6" data-testid="CardContent__58bad7">
        <div className="h-6 w-28 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-auto space-y-3">
          {[1, 2, 3, 4].map(item => (
            <div key={item} className="h-4 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckoutSteps({ ui, phase, checkoutStep }) {
  const steps = [
    { label: ui('upgradeCheckoutStepPlan'), active: checkoutStep === 'plan' },
    { label: ui('upgradeCheckoutStepAddons'), active: checkoutStep === 'addons' },
    { label: ui('upgradeCheckoutStepPayment'), active: checkoutStep === 'payment' || phase === 'running' },
  ];
  return (
    <nav className="hidden items-center gap-3 md:flex" aria-label={ui('upgradeCheckoutSteps')}>
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-3">
          <span className={step.active
            ? 'flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground'
            : 'flex h-8 w-8 items-center justify-center rounded-full border border-border text-sm font-semibold text-muted-foreground'}>
            {index + 1}
          </span>
          <span className={step.active ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
            {step.label}
          </span>
          {index < steps.length - 1 && <span className="h-px w-8 bg-border" aria-hidden="true" />}
        </div>
      ))}
    </nav>
  );
}

function AddonsStep({ ui, dataTransfer, onDataTransferChange, onContinue }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="upgrade-addons-step">
      <section className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">{ui('upgradeCheckoutStepAddons')}</p>
          <h2 className="text-2xl font-bold tracking-tight">{ui('upgradeCheckoutAddonsTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{ui('upgradeCheckoutAddonsSubtitle')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border bg-card" data-testid="upgrade-data-transfer">
            <CardHeader data-testid="CardHeader__58bad7">
              <CardTitle className="text-base" data-testid="CardTitle__58bad7">{ui('upgradeDataTransferTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">{ui('upgradeDataTransferBody')}</p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2" data-testid="CardContent__58bad7">
              {[
                { key: 'products', labelKey: 'upgradeMigrateProducts' },
                { key: 'contacts', labelKey: 'upgradeMigrateContacts' },
              ].map(item => (
                <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={dataTransfer[item.key]}
                    onChange={event => onDataTransferChange(item.key, event.target.checked)}
                    data-testid={`upgrade-data-transfer-${item.key}`}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>{ui(item.labelKey)}</span>
                </label>
              ))}
            </CardContent>
          </Card>
          {[1, 2, 3, 4].map(item => (
            <Card key={item} className="min-h-[130px] border-border bg-muted/20" data-testid={`upgrade-addon-skeleton-${item}`}>
              <CardContent
                className="flex h-full items-center gap-4 p-5"
                data-testid="CardContent__58bad7">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-muted" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <Card className="h-fit border-border shadow-sm" data-testid="upgrade-checkout-summary">
        <CardHeader data-testid="CardHeader__58bad7">
          <CardTitle data-testid="CardTitle__58bad7">{ui('upgradeCheckoutSummary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5" data-testid="CardContent__58bad7">
          <div className="flex items-center justify-between text-sm">
            <span>{ui('upgradePlanProductiveName')}</span>
            <span className="font-semibold">{ui('upgradeCheckoutIncluded')}</span>
          </div>
          <div className="border-t pt-4 text-sm text-muted-foreground">{ui('upgradeCheckoutNoAddons')}</div>
          <Button className="w-full" onClick={onContinue} data-testid="upgrade-addons-continue">
            {ui('upgradeCheckoutContinue')}
            <ArrowRight className="h-4 w-4" data-testid="ArrowRight__58bad7" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProgressPanel({ steps, ui }) {
  return (
    <Card data-testid="upgrade-progress">
      <CardHeader data-testid="CardHeader__58bad7">
        <CardTitle className="text-base" data-testid="CardTitle__58bad7">{ui('upgradeProcessingTitle')}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{ui('upgradeProcessingSubtitle')}</p>
      </CardHeader>
      <CardContent data-testid="CardContent__58bad7">
        <ul className="space-y-2 text-sm">
          {steps.map(step => (
            <li
              key={step.name}
              className="flex items-center gap-2"
              data-testid={`upgrade-progress-step-${step.name}`}
            >
              {step.status === 'running' && <Loader2
                className="h-4 w-4 animate-spin text-primary"
                data-testid="Loader2__58bad7" />}
              {step.status === 'done' && <Check className="h-4 w-4 text-primary" data-testid="Check__58bad7" />}
              {step.status === 'failed' && <CircleAlert className="h-4 w-4 text-destructive" data-testid="CircleAlert__58bad7" />}
              {step.status === 'pending' && <span className="h-4 w-4 rounded-full border border-border" />}
              <span className={step.status === 'pending' ? 'text-muted-foreground' : ''}>
                {ui(STEP_LABELS[step.name] || 'upgradeStepSetup')}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * An account's first tenant is always free, even with the flag on, so charging
 * for it would be wrong. Shown instead of the checkout when the account owns no
 * environments — reachable only by opening /upgrade directly, since the menu
 * entry lives inside a tenant.
 */
function FirstTenantFreePanel({ ui, onContinue }) {
  return (
    <Card data-testid="upgrade-first-tenant-free">
      <CardHeader data-testid="CardHeader__58bad7">
        <CardTitle className="text-base" data-testid="CardTitle__58bad7">{ui('upgradeFirstTenantFreeTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4" data-testid="CardContent__58bad7">
        <p className="text-sm text-muted-foreground">{ui('upgradeFirstTenantFreeBody')}</p>
        <Button onClick={onContinue} data-testid="upgrade-first-tenant-free-continue">
          {ui('upgradeFirstTenantFreeAction')}
          <ArrowRight className="h-4 w-4" data-testid="ArrowRight__58bad7" />
        </Button>
      </CardContent>
    </Card>
  );
}

function SuccessPanel({ ui, onContinue, entering, enterError }) {
  return (
    <Card data-testid="upgrade-success">
      <CardHeader data-testid="CardHeader__58bad7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Rocket className="h-5 w-5 text-primary" data-testid="Rocket__58bad7" />
          </div>
          <CardTitle className="text-base" data-testid="CardTitle__58bad7">{ui('upgradeSuccessTitle')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" data-testid="CardContent__58bad7">
        <p className="text-sm text-muted-foreground">{ui('upgradeSuccessBody')}</p>
        {enterError && (
          <p className="text-sm text-destructive" data-testid="upgrade-enter-error">
            {ui('upgradeEnterFailed')}
          </p>
        )}
        <Button className="w-full sm:w-auto" onClick={() => onContinue()} disabled={entering} data-testid="upgrade-enter-productive">
          {entering ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__58bad7" /> : ui('upgradeMigrationContinue')}
          {!entering && <ArrowRight className="h-4 w-4" data-testid="ArrowRight__58bad7" />}
        </Button>
      </CardContent>
    </Card>
  );
}

function BillingOverviewPanel({ purchases, onResume, resumingPurchaseId, ui }) {
  if (!purchases.length) return null;
  return (
    <Card data-testid="upgrade-billing-overview">
      <CardHeader data-testid="CardHeader__58bad7">
        <CardTitle className="text-base" data-testid="CardTitle__58bad7">{ui('upgradeBillingOverviewTitle')}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{ui('upgradeBillingOverviewBody')}</p>
      </CardHeader>
      <CardContent data-testid="CardContent__58bad7">
        <ul className="space-y-2 text-sm">
          {purchases.map(purchase => (
            <li key={purchase.purchaseId} className="flex items-center justify-between gap-3">
              <span className="truncate">{purchase.clientName || ui('upgradeUnnamedPurchase')}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" data-testid="Badge__58bad7">{purchase.status}</Badge>
                {(purchase.status === 'PAID' || purchase.status === 'PROVISIONING') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onResume(purchase)}
                    disabled={Boolean(resumingPurchaseId)}
                    data-testid={`upgrade-resume-purchase-${purchase.purchaseId}`}
                  >
                    {resumingPurchaseId === purchase.purchaseId
                      ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__58bad7" />
                      : ui('upgradeResumePurchase')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatOfferPrice(offer, locale) {
  if (!offer || !Number.isFinite(Number(offer.amountMinor)) || !offer.currency) return null;
  try {
    return new Intl.NumberFormat(String(locale || 'en-US').replace('_', '-'), {
      style: 'currency', currency: offer.currency,
    }).format(Number(offer.amountMinor) / 100);
  } catch {
    return `${offer.currency} ${(Number(offer.amountMinor) / 100).toFixed(2)}`;
  }
}

export default function UpgradePage() {
  const ui = useUI();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('form'); // 'form' | 'running' | 'success'
  const [checkoutStep, setCheckoutStep] = useState('plan'); // 'plan' | 'addons' | 'payment'
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [steps, setSteps] = useState(() => initialSetupSteps());
  // 'loading' | 'ready' | 'unavailable'. On 'unavailable' the checkout is shown
  // anyway: the backend is authoritative, so a failed lookup must not block a
  // legitimate upgrade.
  const [accountState, setAccountState] = useState('loading');
  const [environments, setEnvironments] = useState([]);
  const [billingPurchases, setBillingPurchases] = useState([]);
  const [billingOffer, setBillingOffer] = useState(null);
  const [resumingPurchaseId, setResumingPurchaseId] = useState(null);
  // Bumped by the retry button so the lookup effect re-runs. A failed lookup is recoverable —
  // the usual cause is a transient/auth error, not an account without environments.
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const { enterByClientName, currentClientId } = useEnvironmentSwitch({ enabled: false });
  // Read inside the one-shot environments effect below, which must see the session's value at
  // the time the lookup settles rather than the one its mount-time closure captured.
  const currentClientIdRef = useRef(currentClientId);
  currentClientIdRef.current = currentClientId;
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState(false);
  const [pendingProvisioning, setPendingProvisioning] = useState(null);
  const [dataTransfer, setDataTransfer] = useState(DEFAULT_DATA_TRANSFER);

  const startProvisioning = async () => {
    if (!pendingProvisioning) return;
    // ETP-4576 — no `!token` gate: under the cookie session there is no client-held token, so the
    // gate would be permanently true and this would report an expired session to every user.
    // An actually-expired session answers 401, which `apiFetch` routes to the logout choke point.
    setEntering(true);
    try {
      const { startedAt, ...onboardingInput } = pendingProvisioning;
      await runPaidOnboarding(getUpgradeBaseUrl(), onboardingInput, message => {
        setSteps(previous => applyProgressMessage(previous, message));
      });
      setPendingProvisioning(null);
      setEntering(false);
      setPhase('success');
      emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_TENANT_PROVISIONING_SUCCEEDED, {
        upgradeAction: onboardingInput.upgradeAction,
        ...(startedAt ? { durationMs: Date.now() - startedAt } : {}),
      });
    } catch (error) {
      setEntering(false);
      setFormError(error?.code || 'upgradeCheckoutCreationFailed');
      emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_TENANT_PROVISIONING_FAILED, {
        errorCode: error?.code || 'generic',
        ...(pendingProvisioning.startedAt
          ? { durationMs: Date.now() - pendingProvisioning.startedAt }
          : {}),
      });
      setPhase('form');
    }
  };

  // A confirmed payment starts provisioning immediately. The transfer selection is part of the
  // paid request; there is no second migration screen and no browser-side export/import step.
  useEffect(() => {
    if (phase === 'running' && pendingProvisioning && !entering) {
      startProvisioning();
    }
  }, [phase, pendingProvisioning, entering]);

  const resumePaidPurchase = async purchase => {
    if (!purchase?.purchaseId || !purchase?.clientName) {
      setFormError('upgradeCheckoutCreationFailed');
      return;
    }
    setResumingPurchaseId(purchase.purchaseId);
    setForm(previous => ({ ...previous, tenantName: purchase.clientName, upgradeAction: 'create-productive' }));
    setFormError(null);
    setPhase('running');
    setPendingProvisioning({
      clientName: purchase.clientName,
      paymentToken: purchase.purchaseId,
      upgradeAction: 'create-productive',
      language: getStoredLocale(),
      dataTransfer: dataTransfer,
      startedAt: Date.now(),
    });
    setResumingPurchaseId(null);
  };

  const waitForExistingProvisioning = async purchase => {
    if (!purchase?.purchaseId || !purchase?.clientName) {
      setFormError('upgradeCheckoutCreationFailed');
      return;
    }
    setForm(previous => ({ ...previous, tenantName: purchase.clientName, upgradeAction: 'create-productive' }));
    setPhase('running');
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const current = await getBillingPurchase(getUpgradeBaseUrl(), purchase.purchaseId);
        if (current?.status === 'PROVISIONED') {
          setPhase('success');
          return;
        }
        if (current?.status === 'PAID') {
          await resumePaidPurchase(current);
          return;
        }
        if (current?.status !== 'PROVISIONING') break;
      } catch {
        // Keep polling; the purchase remains durable and another request can recover it.
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setPendingProvisioning({
      clientName: purchase.clientName,
      paymentToken: purchase.purchaseId,
      upgradeAction: 'create-productive',
      language: getStoredLocale(),
      dataTransfer: dataTransfer,
    });
    setFormError(null);
    setPhase('running');
  };

  useEffect(() => {
    let cancelled = false;
    fetchEnvironments(fetch, getUpgradeBaseUrl())
      .then(list => {
        if (cancelled) return;
        const nextEnvironments = Array.isArray(list) ? list : [];
        setEnvironments(nextEnvironments);
        const demo = nextEnvironments.find(environment => environment.plan !== 'productive');
        const current = currentClientIdRef.current
          ? nextEnvironments.find(environment => environment.clientId === currentClientIdRef.current)
          : undefined;
        // The current environment first, the demo only as a fallback (ETP-5443). Never over a
        // name the user already typed.
        const prefillName = current?.clientName || demo?.clientName;
        if (prefillName) {
          setForm(previous => previous.tenantName
            ? previous
            : { ...previous, tenantName: prefillName });
        }
        setAccountState('ready');
      })
      .catch(() => {
        if (!cancelled) setAccountState('unavailable');
      });

    getBillingOverview(getUpgradeBaseUrl())
      .then(overview => {
        if (!cancelled) setBillingPurchases(Array.isArray(overview?.purchases) ? overview.purchases : []);
      })
      .catch(() => {
        // Environment lookup remains the primary page state; billing is a recoverable projection.
      });

    getBillingOffer(getUpgradeBaseUrl())
      .then(offer => {
        if (!cancelled) setBillingOffer(offer);
      })
      .catch(() => {
        // The backend still validates the offer; the page only loses the price preview.
      });

    return () => {
      cancelled = true;
    };
  }, [lookupAttempt]);

  // Fires once accountState first settles, reporting which branch the user actually landed on.
  // Guarded by a ref because a retry moves accountState back through 'loading' — a second
  // "page viewed" would inflate the metric for what is still one page view.
  const pageViewReported = useRef(false);
  useEffect(() => {
    if (accountState === 'loading' || pageViewReported.current) return;
    pageViewReported.current = true;
    const branch = resolveUpgradePageViewBranch(accountState, environments);
    emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_PAGE_VIEWED, { branch });
  }, [accountState, environments]);

  // Resumes after the redirect back from Stripe's hosted checkout page. The
  // actual provisioning outcome (success/failure) is only known here, not in
  // runUpgrade below — that function only creates the session and redirects
  // away, so it never sees whether the payment or the onboarding succeeded.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return undefined;
    const requestId = params.get('requestId');
    const storedTenantName = sessionStorage.getItem(PENDING_CHECKOUT_NAME) || '';
    const upgradeAction = sessionStorage.getItem(PENDING_CHECKOUT_ACTION) || 'create-productive';
    // Persisted alongside the pending tenant name in runUpgrade, since a local
    // closure variable does not survive the full-page redirect to Stripe.
    const startedAtRaw = sessionStorage.getItem(PENDING_CHECKOUT_STARTED_AT);
    const startedAt = startedAtRaw ? Number(startedAtRaw) : null;
    if (!requestId) {
      setFormError('upgradeCheckoutCreationFailed');
      return undefined;
    }
    let cancelled = false;
    setPhase('running');
    resumeCheckoutProvisioning({
      baseUrl: getUpgradeBaseUrl(),
      requestId,
      storedTenantName,
      upgradeAction,
      startedAt,
      storage: sessionStorage,
      isCancelled: () => cancelled,
      onTenantName: tenantName => {
        setForm(previous => ({ ...previous, tenantName, upgradeAction }));
      },
      onPendingProvisioning: setPendingProvisioning,
      onDataTransfer: setDataTransfer,
      onReady: () => setPhase('running'),
    }).catch(error => {
      if (cancelled) return;
      setPhase('form');
      setFormError(error?.code || 'upgradeCheckoutCreationFailed');
      emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_TENANT_PROVISIONING_FAILED, {
        errorCode: error?.code || 'generic',
        durationMs: startedAt ? Date.now() - startedAt : undefined,
      });
    });
    return () => { cancelled = true; };
  }, []);

  // `tenantName` is passed in explicitly by the caller (handleSubmit) rather than
  // read from `form.tenantName` here: the caller may have just computed it (demo
  // fallback) and called `setForm` a moment earlier, and that update is not
  // guaranteed to have committed yet when this function's own closure captured
  // `form` — reading `form.tenantName` here would silently send the STALE value,
  // including an empty string when the field was never populated (ETP-5443).
  const runUpgrade = async tenantName => {
    setPhase('running');
    // Duration is measured from here to the terminal event in the resume
    // effect above, so it covers the full round trip through Stripe's hosted
    // page — not just this request. There is no `startedAt` local variable
    // because this function's closure does not survive the redirect below.
    emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_CHECKOUT_SUBMITTED, { upgradeAction: form.upgradeAction });

    try {
      const session = await createBillingPurchase(
        getUpgradeBaseUrl(),
        {
          action: 'productive-tenant',
          clientName: tenantName,
          upgradeAction: form.upgradeAction,
          language: getStoredLocale(),
        }
      );
      // Payment and provisioning are confirmed by the backend/webhook. The
      // browser only follows the provider-hosted URL and never handles cards.
      sessionStorage.setItem(PENDING_CHECKOUT_NAME, tenantName);
      sessionStorage.setItem(PENDING_CHECKOUT_ACTION, form.upgradeAction);
      sessionStorage.setItem(PENDING_CHECKOUT_STARTED_AT, String(Date.now()));
      sessionStorage.setItem(PENDING_CHECKOUT_DATA_TRANSFER, JSON.stringify(dataTransfer));
      window.location.assign(session.checkoutUrl);
    } catch (error) {
      const existingPurchaseHandled = await handleExistingPurchaseError(error, {
        baseUrl: getUpgradeBaseUrl(),
        setFormError,
        resumePaidPurchase,
        waitForExistingProvisioning,
        setBillingPurchases,
        setCheckoutStep,
        setPhase,
      });
      if (existingPurchaseHandled) return;
      setPhase('form');
      setFormError(
        Object.values(UPGRADE_ERROR_CODES).includes(error.code) ? error.code : 'upgradeGenericError'
      );
      // No durationMs here: provisioning has not started, only the checkout
      // session request failed, so there is no meaningful interval to report.
      emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_TENANT_PROVISIONING_FAILED, {
        errorCode: error.code || 'generic',
      });
    }
  };

  // An account with no tenants yet gets its first one free, so it is offered the
  // onboarding flow instead of a checkout. A failed lookup falls through to the
  // checkout rather than blocking, since the backend decides either way.
  const hasNoTenants = accountState === 'ready' && environments.length === 0;
  const showAccountLoading = phase === 'form' && accountState === 'loading';
  const showFirstTenantFree = phase === 'form' && hasNoTenants;
  const showCheckout = phase === 'form' && accountState !== 'loading' && !hasNoTenants;
  const demoEnvironment = environments.find(environment => environment.plan !== 'productive');
  const demoDays = demoEnvironment?.trialDaysRemaining;
  const handleSubmit = event => {
    event.preventDefault();
    setFormError(null);

    const tenantName = form.tenantName.trim();

    // The field is always rendered and always editable (ETP-5443) — a blank submit is always
    // "the field is visible and empty", never "no field to type into". Sending clientName: ''
    // would 400 with INVALID_REQUEST "clientName is required"; surface a translated error
    // instead.
    if (!tenantName) {
      setErrors({ tenantName: 'upgradeTenantNameRequired' });
      return;
    }

    // AD_Client.name is globally unique, and the backend treats a name matching a tenant this
    // account already owns as "resume that tenant" (EtendoGoJwtServlet.isResumingOwnedTenant),
    // not "create a new one" — the user would pay and land back in the SAME environment. A
    // match against the account's DEMO environment is allowed: that is the demo-to-pro
    // conversion path, not a collision.
    // TODO: this guard exists only because AD_Client.name is globally unique today. If that
    // constraint is ever lifted, revisit whether a name match should still block the request.
    const normalizedName = tenantName.toLowerCase();
    const takenByOwnedProductiveEnvironment = environments.some(environment => (
      isProductiveEnvironment(environment)
      && String(environment.clientName || '').trim().toLowerCase() === normalizedName
    ));
    if (takenByOwnedProductiveEnvironment) {
      setErrors({ tenantName: 'upgradeTenantNameTaken' });
      return;
    }

    if (tenantName !== form.tenantName) {
      setForm(previous => ({ ...previous, tenantName }));
    }
    setErrors({});

    // Not awaited: runUpgrade drives its own phase/error state and never rejects.
    runUpgrade(tenantName);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-foreground/40 p-4 md:p-8" data-testid="upgrade-page-shell">
      <div className="mx-auto min-h-full max-w-[1440px] overflow-hidden rounded-xl bg-page-bg shadow-2xl">
      <header className="sticky top-0 z-10 flex min-h-[76px] items-center justify-between gap-6 border-b bg-card px-6 py-4 shadow-sm md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Rocket className="h-5 w-5" data-testid="Rocket__58bad7" />
          </div>
          <span className="text-xl font-bold tracking-tight">{ui('brandEtendo')}</span>
        </div>
        <CheckoutSteps
          ui={ui}
          phase={phase}
          checkoutStep={checkoutStep}
          data-testid="CheckoutSteps__58bad7" />
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label={ui('back')} data-testid="upgrade-close">
          <span className="text-2xl leading-none" aria-hidden="true">×</span>
        </Button>
      </header>
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">{ui('upgradeCheckoutStepPlan')}</p>
            <h1 className="text-3xl font-bold tracking-tight">{ui('upgradeTitle')}</h1>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">{ui('upgradeSubtitle')}</p>
          </div>
          {Number.isInteger(demoDays) && (
            <div className="rounded-full border border-status-warning-border bg-status-warning px-4 py-2 text-sm font-semibold text-status-warning-foreground" data-testid="upgrade-trial-pill">
              {ui('environmentTrialDaysRemaining', { days: demoDays })}
            </div>
          )}
        </div>
      {showCheckout && checkoutStep === 'plan' && <>
      <div className="grid gap-5 md:grid-cols-3">
        <PlanCard
          testId="upgrade-plan-productive"
          name={ui('upgradePlanProductiveName')}
          tagline={ui('upgradePlanProductiveTagline')}
          price={formatOfferPrice(billingOffer, getStoredLocale())
            || ui('upgradePlanProductivePriceUnavailable')}
          features={PRODUCTIVE_FEATURES}
          highlighted
          ui={ui}
          className="w-full"
          onSelect={() => setCheckoutStep('addons')}
          data-testid="PlanCard__58bad7" />
        <SkeletonPlanCard
          testId="upgrade-plan-coming-soon-1"
          className="w-full"
          data-testid="SkeletonPlanCard__58bad7" />
        <SkeletonPlanCard
          testId="upgrade-plan-coming-soon-2"
          className="w-full"
          data-testid="SkeletonPlanCard__58bad7" />
      </div>
      <div className="flex justify-end md:hidden">
        <Button onClick={() => setCheckoutStep('addons')} data-testid="upgrade-plan-continue">
          {ui('upgradeCheckoutContinue')}
          <ArrowRight className="h-4 w-4" data-testid="ArrowRight__58bad7" />
        </Button>
      </div>
      </>}
      {showCheckout && checkoutStep === 'addons' && (
        <AddonsStep
          ui={ui}
          dataTransfer={dataTransfer}
          onDataTransferChange={(key, checked) => setDataTransfer(previous => ({ ...previous, [key]: checked }))}
          onContinue={() => setCheckoutStep('payment')}
          data-testid="AddonsStep__58bad7" />
      )}
      {phase === 'running' && <ProgressPanel steps={steps} ui={ui} data-testid="ProgressPanel__58bad7" />}
      {phase === 'success' && <SuccessPanel
        ui={ui}
        entering={entering}
        enterError={enterError}
        // Enter the tenant that was just provisioned. Signing out is the
        // fallback, not the route: it only happens when the new environment
        // cannot be reached, which is also the only case where re-authenticating
        // would help.
        onContinue={async () => {
          setEnterError(false);
          setEntering(true);
          const entered = await enterByClientName(form.tenantName);
          if (!entered) {
            setEntering(false);
            setEnterError(true);
            emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_ENTER_TENANT_FAILED);
          }
        }}
        data-testid="SuccessPanel__58bad7" />}
      {showAccountLoading && (
        <Card data-testid="upgrade-account-loading">
          <CardContent
            className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
            data-testid="CardContent__58bad7">
            <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__58bad7" />
            {ui('upgradeCheckingAccount')}
          </CardContent>
        </Card>
      )}
      {showFirstTenantFree && (
        <FirstTenantFreePanel
          ui={ui}
          onContinue={() => {
            emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_FIRST_TENANT_FREE_CONTINUED);
            navigate('/onboarding');
          }}
          data-testid="FirstTenantFreePanel__58bad7" />
      )}
      {showCheckout && checkoutStep === 'payment' && (
        <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="w-full border-border shadow-sm" data-testid="upgrade-checkout">
          <CardHeader data-testid="CardHeader__58bad7">
            <div className="flex items-center gap-2">
              <CreditCard
                className="h-4 w-4 text-muted-foreground"
                data-testid="CreditCard__58bad7" />
              <CardTitle className="text-base" data-testid="CardTitle__58bad7">{ui('upgradeCheckoutTitle')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent data-testid="CardContent__58bad7">
            <form className="space-y-5" onSubmit={handleSubmit} noValidate data-testid="upgrade-form">
              {/*
                Always editable, whether or not the account owns a demo (ETP-5443). Purchasing
                under an account that owns no demo creates a brand-new company rather than
                converting one (ETP-5396 design §4: "For an account with no owned demo, allow
                only its own new-company purchase intent"); the backend tells the two apart by
                whether `clientName` already resolves to a client this account owns
                (isResumingOwnedTenant), not by a distinct `upgradeAction` — 'create-productive'
                (the only supported value besides the rejected legacy 'convert-demo') covers
                both. Prefilled by the environments effect above (current, else demo); the taken-
                name guard in handleSubmit is what actually keeps a productive-name collision
                from resuming an owned tenant instead of creating a new one.
              */}
              <div className="space-y-1.5" data-testid="upgrade-tenant-name-field">
                <Label htmlFor="upgrade-tenant-name-input" data-testid="upgrade-tenant-name-input-label">
                  {ui('upgradeTenantNameLabel')}
                </Label>
                <Input
                  id="upgrade-tenant-name-input"
                  required
                  value={form.tenantName}
                  placeholder={ui('upgradeTenantNamePlaceholder')}
                  aria-invalid={Boolean(errors.tenantName)}
                  onChange={event => {
                    const { value } = event.target;
                    setForm(previous => ({ ...previous, tenantName: value }));
                    setErrors({});
                  }}
                  data-testid="upgrade-tenant-name-input"
                />
              </div>
              {errors.tenantName && (
                <p
                  className="text-xs text-destructive"
                  data-testid={errors.tenantName === 'upgradeTenantNameTaken'
                    ? 'upgrade-tenant-name-taken'
                    : 'upgrade-tenant-name-error'}
                >
                  {ui(errors.tenantName)}
                </p>
              )}

              {accountState === 'unavailable' && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-md border p-3 text-sm"
                  // Semantic status tokens, not palette literals — see
                  // src/lib/__tests__/semanticThemeUsage.test.js, which fails the build on raw
                  // Tailwind colour classes in application UI.
                  style={{
                    background: 'var(--status-warning-bg)',
                    color: 'var(--status-warning-fg)',
                    borderColor: 'var(--status-warning-border)',
                  }}
                  data-testid="upgrade-environments-unavailable"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" data-testid="CircleAlert__58bad7" />
                  <div className="space-y-2">
                    <p>{ui('upgradeEnvironmentsUnavailable')}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAccountState('loading');
                        setLookupAttempt(attempt => attempt + 1);
                      }}
                      data-testid="upgrade-environments-retry"
                    >
                      {ui('upgradeEnvironmentsRetry')}
                    </Button>
                  </div>
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                  data-testid="upgrade-error"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" data-testid="CircleAlert__58bad7" />
                  <span>{ui(formError)}</span>
                </div>
              )}

              <Button type="submit" data-testid="upgrade-submit" disabled={phase === 'running'}>
                {ui('upgradeSubmit')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <BillingOverviewPanel
          purchases={billingPurchases}
          onResume={resumePaidPurchase}
          resumingPurchaseId={resumingPurchaseId}
          ui={ui}
          data-testid="BillingOverviewPanel__58bad7" />
        </div>
      )}
      </main>
      </div>
    </div>
  );
}
