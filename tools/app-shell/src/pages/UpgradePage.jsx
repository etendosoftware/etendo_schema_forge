import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CircleAlert, CreditCard, Loader2, Rocket } from 'lucide-react';
import {
  initialSetupSteps,
  applyProgressMessage,
  fetchEnvironments,
} from '@etendosoftware/etendo-go-core/onboarding';
import { useUI, getStoredLocale } from '@/i18n';
import { detectBaseUrl } from '@/auth/api.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  createMockPaymentToken,
  formatCardNumber,
  isDeclinedCard,
  validateCheckout,
} from '@/lib/upgrade/mockPayment.js';
import { createProductiveTenant, getPlatformToken, UPGRADE_ERROR_CODES } from '@/lib/upgrade/api.js';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';

/**
 * Placeholder price for the mock checkout. Real pricing is a product decision
 * that has not been made yet; nothing is charged either way.
 */
const MOCK_MONTHLY_PRICE = '€49';

/** Defaults for the tenant being provisioned, mirroring the onboarding flow. */
const TENANT_DEFAULTS = { currency: 'EUR', countryCode: 'ES' };

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

const EMPTY_FORM = { tenantName: '', cardholder: '', cardNumber: '', expiry: '', cvc: '' };

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
  const { enterByClientName } = useEnvironmentSwitch({ enabled: false });
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getPlatformToken();
    if (!token) {
      setAccountState('unavailable');
      return undefined;
    }

    fetchEnvironments(fetch, detectBaseUrl(), token)
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
  }, []);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const runUpgrade = async paymentToken => {
    const token = getPlatformToken();
    if (!token) {
      setFormError('upgradeSessionExpired');
      return;
    }

    setPhase('running');
    setSteps(initialSetupSteps());

    try {
      const result = await createProductiveTenant(
        fetch,
        detectBaseUrl(),
        token,
        {
          clientName: form.tenantName.trim(),
          currency: TENANT_DEFAULTS.currency,
          countryCode: TENANT_DEFAULTS.countryCode,
          language: getStoredLocale(),
          paymentToken,
        },
        message => {
          if (message.type === 'progress' && message.step) {
            setSteps(prev => applyProgressMessage(prev, message));
          }
        }
      );

      if (result.success) {
        setPhase('success');
        return;
      }
      setPhase('form');
      setFormError('upgradeGenericError');
    } catch (error) {
      setPhase('form');
      setFormError(
        Object.values(UPGRADE_ERROR_CODES).includes(error.code) ? error.code : 'upgradeGenericError'
      );
    }
  };

  // An account with no tenants yet gets its first one free, so it is offered the
  // onboarding flow instead of a checkout. A failed lookup falls through to the
  // checkout rather than blocking, since the backend decides either way.
  const hasNoTenants = accountState === 'ready' && environments.length === 0;
  const showAccountLoading = phase === 'form' && accountState === 'loading';
  const showFirstTenantFree = phase === 'form' && hasNoTenants;
  const showCheckout = phase === 'form' && accountState !== 'loading' && !hasNoTenants;

  const handleSubmit = event => {
    event.preventDefault();
    setFormError(null);

    const validation = validateCheckout(form);

    // Submitting a name the account already owns is treated by the backend as
    // resuming that tenant, not creating a new one — no charge, but also no new
    // tenant. Catch it here so the user renames instead of seeing a "success"
    // that hands back their existing tenant.
    const requested = form.tenantName.trim().toLowerCase();
    const alreadyOwned = environments.some(
      env => String(env?.clientName ?? '').trim().toLowerCase() === requested
    );
    if (requested && alreadyOwned) {
      validation.tenantName = 'upgradeTenantNameTaken';
    }

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});

    // The declined test card never reaches the network — the point is to
    // exercise the error path, not the backend.
    if (isDeclinedCard(form.cardNumber)) {
      setFormError('upgradePaymentDeclined');
      return;
    }

    // Not awaited: runUpgrade drives its own phase/error state and never rejects.
    runUpgrade(createMockPaymentToken());
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
          price={ui('upgradePlanProductivePrice', { amount: MOCK_MONTHLY_PRICE })}
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
          onContinue={() => navigate('/onboarding')}
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
            <p className="mt-1 text-xs text-muted-foreground">{ui('upgradeMockPaymentNotice')}</p>
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

              <Field
                id="upgrade-cardholder"
                data-testid="upgrade-cardholder"
                label={ui('upgradeCardholderLabel')}
                placeholder={ui('upgradeCardholderPlaceholder')}
                autoComplete="cc-name"
                value={form.cardholder}
                onChange={event => update('cardholder', event.target.value)}
                error={errors.cardholder}
                ui={ui}
              />

              <Field
                id="upgrade-card-number"
                data-testid="upgrade-card-number"
                label={ui('upgradeCardNumberLabel')}
                placeholder="4242 4242 4242 4242"
                inputMode="numeric"
                autoComplete="cc-number"
                value={form.cardNumber}
                onChange={event => update('cardNumber', formatCardNumber(event.target.value))}
                error={errors.cardNumber}
                ui={ui}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="upgrade-expiry"
                  data-testid="upgrade-expiry"
                  label={ui('upgradeExpiryLabel')}
                  placeholder={ui('upgradeExpiryPlaceholder')}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  value={form.expiry}
                  onChange={event => update('expiry', event.target.value)}
                  error={errors.expiry}
                  ui={ui}
                />
                <Field
                  id="upgrade-cvc"
                  data-testid="upgrade-cvc"
                  label={ui('upgradeCvcLabel')}
                  placeholder={ui('upgradeCvcPlaceholder')}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  value={form.cvc}
                  onChange={event => update('cvc', event.target.value)}
                  error={errors.cvc}
                  ui={ui}
                />
              </div>

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

              <Button type="submit" data-testid="upgrade-submit">
                {ui('upgradeSubmit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
