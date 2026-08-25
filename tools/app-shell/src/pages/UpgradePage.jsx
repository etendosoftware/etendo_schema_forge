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
  createCheckoutSession,
  getCheckoutToken,
  getCheckoutStatus,
  runPaidOnboarding,
  UPGRADE_ERROR_CODES,
} from '@/lib/upgrade/api.js';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';

/**
 * Display price until the backend plan catalog is exposed to the product UI.
 */
const PRODUCTIVE_MONTHLY_PRICE = '€49';

const FREE_FEATURES = ['upgradeFreeFeatureExplore', 'upgradeFreeFeatureSample', 'upgradeFreeFeatureSingle'];
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

const EMPTY_FORM = { tenantName: '', upgradeAction: 'create-productive', conversionClientId: '' };
const PENDING_CHECKOUT_NAME = 'sf_pending_checkout_tenant_name';
const PENDING_CHECKOUT_ACTION = 'sf_pending_checkout_action';
/** Checkout-submitted timestamp, so durationMs survives the Stripe redirect. */
const PENDING_CHECKOUT_STARTED_AT = 'sf_pending_checkout_started_at';

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

function PlanCard({ testId, name, tagline, price, features, current, highlighted, ui }) {
  return (
    <Card
      className={highlighted ? 'flex flex-col border-primary' : 'flex flex-col'}
      data-testid={testId}
    >
      <CardHeader data-testid="CardHeader__58bad7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base" data-testid="CardTitle__58bad7">{name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{tagline}</p>
          </div>
          {current && <Badge variant="secondary" data-testid="Badge__58bad7">{ui('upgradePlanCurrentBadge')}</Badge>}
        </div>
        <p className="mt-3 text-lg font-semibold">{price}</p>
      </CardHeader>
      <CardContent data-testid="CardContent__58bad7">
        <ul className="space-y-2 text-sm">
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

// `data-testid` is destructured rather than left in the spread so it lands on
// the input itself and cannot be overwritten by a later spread, keeping each
// field individually addressable.
function Field({ id, label, error, ui, 'data-testid': testId, ...inputProps }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} data-testid={`${testId}-label`}>{label}</Label>
      <Input id={id} aria-invalid={Boolean(error)} data-testid={testId} {...inputProps} />
      {error && (
        <p className="text-xs text-destructive" data-testid={`${testId}-error`}>
          {ui(error)}
        </p>
      )}
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
        <Button onClick={onContinue} disabled={entering} data-testid="upgrade-success-continue">
          {entering
            ? <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__58bad7" />
            : <>
              {ui('upgradeSuccessAction')}
              <ArrowRight className="h-4 w-4" data-testid="ArrowRight__58bad7" />
            </>}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function UpgradePage() {
  const ui = useUI();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('form'); // 'form' | 'running' | 'success'
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [steps, setSteps] = useState(() => initialSetupSteps());
  // 'loading' | 'ready' | 'unavailable'. On 'unavailable' the checkout is shown
  // anyway: the backend is authoritative, so a failed lookup must not block a
  // legitimate upgrade.
  const [accountState, setAccountState] = useState('loading');
  const [environments, setEnvironments] = useState([]);
  // Bumped by the retry button so the lookup effect re-runs. A failed lookup is recoverable —
  // the usual cause is a transient/auth error, not an account without environments.
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const { enterByClientName } = useEnvironmentSwitch({ enabled: false });
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getCheckoutToken();
    if (!token) {
      setAccountState('unavailable');
      return undefined;
    }

    fetchEnvironments(fetch, getUpgradeBaseUrl(), token)
      .then(list => {
        if (cancelled) return;
        setEnvironments(Array.isArray(list) ? list : []);
        setAccountState('ready');
      })
      .catch(() => {
        if (!cancelled) setAccountState('unavailable');
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
    const token = getCheckoutToken();
    const tenantName = sessionStorage.getItem(PENDING_CHECKOUT_NAME) || '';
    const upgradeAction = sessionStorage.getItem(PENDING_CHECKOUT_ACTION) || 'create-productive';
    // Persisted alongside the pending tenant name in runUpgrade, since a local
    // closure variable does not survive the full-page redirect to Stripe.
    const startedAtRaw = sessionStorage.getItem(PENDING_CHECKOUT_STARTED_AT);
    const startedAt = startedAtRaw ? Number(startedAtRaw) : null;
    if (!requestId || !token || !tenantName) {
      setFormError('upgradeCheckoutCreationFailed');
      return undefined;
    }
    let cancelled = false;
    setForm(previous => ({ ...previous, tenantName, upgradeAction }));
    setPhase('running');
    (async () => {
      try {
        let status = { status: 'pending' };
        for (let attempt = 0; attempt < 60 && status.status === 'pending'; attempt += 1) {
          status = await getCheckoutStatus(fetch, getUpgradeBaseUrl(), token, requestId);
          if (status.status === 'pending') await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (status.status !== 'paid') throw new Error('Checkout payment is not confirmed');
        await runPaidOnboarding(fetch, getUpgradeBaseUrl(), token, {
          clientName: status.clientName || tenantName,
          paymentToken: requestId,
          upgradeAction,
          language: getStoredLocale(),
          countryCode: 'AR',
        }, message => {
          if (!cancelled) setSteps(previous => applyProgressMessage(previous, message));
        });
        if (cancelled) return;
        sessionStorage.removeItem(PENDING_CHECKOUT_NAME);
        sessionStorage.removeItem(PENDING_CHECKOUT_ACTION);
        sessionStorage.removeItem(PENDING_CHECKOUT_STARTED_AT);
        window.history.replaceState({}, '', '/upgrade');
        setPhase('success');
        emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_TENANT_PROVISIONING_SUCCEEDED, {
          upgradeAction,
          durationMs: startedAt ? Date.now() - startedAt : undefined,
        });
      } catch (error) {
        if (!cancelled) {
          setPhase('form');
          setFormError(error?.code || 'upgradeCheckoutCreationFailed');
          emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_TENANT_PROVISIONING_FAILED, {
            errorCode: error?.code || 'generic',
            durationMs: startedAt ? Date.now() - startedAt : undefined,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const runUpgrade = async () => {
    const token = getCheckoutToken();
    if (!token) {
      setFormError('upgradeSessionExpired');
      emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_SESSION_EXPIRED);
      return;
    }

    setPhase('running');
    // Duration is measured from here to the terminal event in the resume
    // effect above, so it covers the full round trip through Stripe's hosted
    // page — not just this request. There is no `startedAt` local variable
    // because this function's closure does not survive the redirect below.
    emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_CHECKOUT_SUBMITTED, { upgradeAction: form.upgradeAction });

    try {
      const session = await createCheckoutSession(
        fetch,
        getUpgradeBaseUrl(),
        token,
        {
          action: 'productive-tenant',
          clientName: form.tenantName.trim(),
          upgradeAction: form.upgradeAction,
          language: getStoredLocale(),
        }
      );
      // Payment and provisioning are confirmed by the backend/webhook. The
      // browser only follows the provider-hosted URL and never handles cards.
      sessionStorage.setItem(PENDING_CHECKOUT_NAME, form.tenantName.trim());
      sessionStorage.setItem(PENDING_CHECKOUT_ACTION, form.upgradeAction);
      sessionStorage.setItem(PENDING_CHECKOUT_STARTED_AT, String(Date.now()));
      window.location.assign(session.checkoutUrl);
    } catch (error) {
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
  const demoEnvironments = environments.filter(env => env?.plan !== 'productive');
  const currentDemo = demoEnvironments.find(env => env.clientId === localStorage.getItem('sf_auth_client_id'))
    || demoEnvironments[0];

  useEffect(() => {
    if (currentDemo && !form.conversionClientId) {
      setForm(previous => ({
        ...previous,
        upgradeAction: 'convert-demo',
        conversionClientId: currentDemo.clientId,
        tenantName: currentDemo.clientName || previous.tenantName,
      }));
    }
  }, [currentDemo?.clientId]);

  const handleSubmit = event => {
    event.preventDefault();
    setFormError(null);

    const validation = {};
    if (!form.tenantName.trim()) validation.tenantName = 'upgradeTenantNameRequired';

    // Submitting a name the account already owns is treated by the backend as
    // resuming that tenant, not creating a new one — no charge, but also no new
    // tenant. Catch it here so the user renames instead of seeing a "success"
    // that hands back their existing tenant.
    const requested = form.tenantName.trim().toLowerCase();
    const alreadyOwned = environments.some(
      env => String(env?.clientName ?? '').trim().toLowerCase() === requested
    );
    if (form.upgradeAction === 'create-productive' && requested && alreadyOwned) {
      validation.tenantName = 'upgradeTenantNameTaken';
      emitUpgradeEvent(OBSERVABILITY_EVENTS.UPGRADE_EXISTING_TENANT_NAME_BLOCKED);
    }

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});

    // Not awaited: runUpgrade drives its own phase/error state and never rejects.
    runUpgrade();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
          <Rocket className="h-5 w-5 text-primary" data-testid="Rocket__58bad7" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{ui('upgradeTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{ui('upgradeSubtitle')}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PlanCard
          testId="upgrade-plan-free"
          name={ui('upgradePlanFreeName')}
          tagline={ui('upgradePlanFreeTagline')}
          price={ui('upgradePlanFreePrice')}
          features={FREE_FEATURES}
          current
          ui={ui}
          data-testid="PlanCard__58bad7" />
        <PlanCard
          testId="upgrade-plan-productive"
          name={ui('upgradePlanProductiveName')}
          tagline={ui('upgradePlanProductiveTagline')}
          price={ui('upgradePlanProductivePrice', { amount: PRODUCTIVE_MONTHLY_PRICE })}
          features={PRODUCTIVE_FEATURES}
          highlighted
          ui={ui}
          data-testid="PlanCard__58bad7" />
      </div>
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
      {showCheckout && (
        <Card data-testid="upgrade-checkout">
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
              <Field
                id="upgrade-tenant-name"
                data-testid="upgrade-tenant-name"
                label={ui('upgradeTenantNameLabel')}
                placeholder={ui('upgradeTenantNamePlaceholder')}
                value={form.tenantName}
                onChange={event => update('tenantName', event.target.value)}
                error={errors.tenantName}
                ui={ui}
              />

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
                    {/* Without the environment list the convert-this-environment option cannot be
                        offered, so the form silently collapses to "create a new tenant". Say so
                        rather than letting the user pay for something they did not choose. */}
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

              {demoEnvironments.length > 0 && (
                <fieldset className="space-y-3" data-testid="upgrade-target-choice">
                  <legend className="text-sm font-medium">{ui('upgradeTargetLabel')}</legend>
                  <label className="flex items-start gap-2 rounded-md border p-3">
                    <input
                      type="radio"
                      name="upgradeAction"
                      value="convert-demo"
                      checked={form.upgradeAction === 'convert-demo'}
                      onChange={() => update('upgradeAction', 'convert-demo')}
                      data-testid="upgrade-target-convert"
                    />
                    <span>
                      <span className="block text-sm font-medium">{ui('upgradeConvertDemo')}</span>
                      <span className="block text-xs text-muted-foreground">{ui('upgradeConvertDemoBody')}</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 rounded-md border p-3">
                    <input
                      type="radio"
                      name="upgradeAction"
                      value="create-productive"
                      checked={form.upgradeAction === 'create-productive'}
                      onChange={() => {
                        update('upgradeAction', 'create-productive');
                        update('tenantName', '');
                      }}
                      data-testid="upgrade-target-create"
                    />
                    <span>
                      <span className="block text-sm font-medium">{ui('upgradeCreateNew')}</span>
                      <span className="block text-xs text-muted-foreground">{ui('upgradeCreateNewBody')}</span>
                    </span>
                  </label>
                </fieldset>
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
      )}
    </div>
  );
}
