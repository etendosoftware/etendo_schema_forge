import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Check, ChevronRight,
  Plus, Building2, RefreshCw,
  Settings,
  UserPlus, Mail, Lock, Eye, EyeOff, Sparkles,
  ArrowRight, User, MessageCircle,
} from 'lucide-react';
import {
  fetchAccount,
  fetchEnvironments,
  loginAccount,
  loginEnvironment,
  registerAccount,
  runOnboardingStream,
} from './onboarding/onboardingApi.js';
import { checkSalesInvoiceReadiness } from './onboarding/onboardingReadiness.js';
import { useLocaleSwitch, useUI } from '../i18n/index.js';
import { buildAppReturnToHref, getSafeReturnTo } from '../lib/oauthReturnTo.js';
import { track } from '../lib/observability.js';
import {
  applyProgressMessage,
  buildEnvironmentSessionStorage,
  initialSetupSteps,
  isCompanyStepValid,
  isProfileStepValid,
} from './onboarding/onboardingState.js';

function detectBaseUrl() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return import.meta.env.VITE_API_BASE || '';
}

const BASE_URL = detectBaseUrl();

const LOCALE_CODES = ['es_ES', 'en_US'];
const COUNTRY_CODES = ['ES'];
const SECTOR_CODES = ['technology', 'services', 'commerce', 'manufacturing'];
const BUSINESS_TYPE_VALUES = ['company', 'freelancer', 'advisory'];
const ONBOARDING_EVENT_CONTEXT = {
  component: 'OnboardingPage',
  source: 'onboarding',
  windowName: 'onboarding',
};
const DEFAULT_ONBOARDING_FORM = {
  fullName: '',
  businessType: 'company',
  clientName: '',
  currency: 'EUR',
  language: 'es_ES',
  countryCode: 'ES',
  fiscalIdType: 'NIF',
  fiscalIdValue: '',
  address: '',
  sector: 'technology',
};

function trackOnboarding(eventName, properties = {}) {
  void track(eventName, {
    ...ONBOARDING_EVENT_CONTEXT,
    ...properties,
  });
}

function AuthBrand({ label }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/favicon.png"
        alt={label}
        className="h-14 w-14 rounded-2xl border border-white/80 bg-white object-contain p-1 shadow-[0_12px_30px_rgba(250,204,21,0.45)]"
      />
      <span className="text-xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-2xl">
        {label}
      </span>
    </div>
  );
}

function AuthFeaturePill({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur sm:text-sm">
      <Check className="h-4 w-4 text-slate-500" strokeWidth={2.5} />
      {children}
    </span>
  );
}

function AuthPreviewMockup() {
  return (
    <div className="relative mt-12 flex w-full flex-1 items-end justify-end pb-2 pl-8">
      <div className="absolute inset-x-16 bottom-6 h-12 rounded-full bg-white/70 blur-3xl" />
      <img
        src={`${import.meta.env.BASE_URL}auth-dashboard-preview.png`}
        alt="Etendo dashboard preview"
        className="relative z-10 block h-auto w-full max-w-[1000px] select-none pointer-events-none object-contain drop-shadow-[0_28px_56px_rgba(15,23,42,0.16)]"
      />
    </div>
  );
}

function OnboardingLanguageSelect({ label, locale, onChange, options }) {
  return (
    <div className="min-w-[132px]">
      <Label htmlFor="onboarding-language" className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
        {label}
      </Label>
      <select
        id="onboarding-language"
        aria-label={label}
        value={locale}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-slate-900/5"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

const AUTH_FEATURE_KEYS = ['onboardingAuthFeatureNoCard', 'onboardingAuthFeatureTrial', 'onboardingAuthFeatureInstantAccess'];

function EnterEnvironmentButtonContent({ isLoggingIn, label }) {
  if (isLoggingIn) {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }

  return (
    <>
      {label} <ChevronRight className="h-4 w-4 ml-1" />
    </>
  );
}

function AuthShell({ brandLabel, switchPrompt, switchAction, switchTestId, onSwitch, headerContent, marketingTitle, marketingDescription, featureLabels, children }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen w-full bg-white lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="flex min-h-[720px] flex-col bg-white px-6 py-6 sm:px-8 lg:px-10 xl:px-12">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between lg:border-b-0 lg:pb-0">
            <AuthBrand label={brandLabel} />
            <div className="flex flex-col items-end gap-4">
              {headerContent}
              <p className="text-xs text-slate-700 sm:text-sm">
                {switchPrompt}{' '}
                <button
                  type="button"
                  data-testid={switchTestId}
                  onClick={onSwitch}
                  className="font-medium text-slate-900 underline underline-offset-4 transition hover:text-slate-700"
                >
                  {switchAction}
                </button>
              </p>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-10 lg:py-16">
            <div className="w-full max-w-[34.75rem]">{children}</div>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-[#f4f6fa] px-10 py-12 lg:flex lg:flex-col xl:px-12">
          <div className="relative flex h-full flex-col">
            <div className="max-w-xl">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                <Sparkles className="h-6 w-6 text-slate-500" />
              </div>
              <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.05em] text-slate-900 xl:text-[2.5rem] xl:leading-[1.08]">
                {marketingTitle}
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-7 text-slate-600">
                {marketingDescription}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {featureLabels.map((feature) => (
                  <AuthFeaturePill key={feature}>{feature}</AuthFeaturePill>
                ))}
              </div>
            </div>

            <AuthPreviewMockup />
          </div>
        </aside>
      </div>
    </div>
  );
}

function AuthField({ id, label, required = false, icon: Icon, trailing, className = '', inputClassName = '', ...props }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </Label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        )}
        <Input
          id={id}
          className={`h-12 rounded-2xl border border-slate-300 bg-white text-base text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-4 focus-visible:ring-slate-900/5 ${Icon ? 'pl-12' : 'pl-4'} ${trailing ? 'pr-14' : 'pr-4'} ${inputClassName}`}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-3 flex items-center">{trailing}</div>}
      </div>
    </div>
  );
}

function SetupShell({ brandLabel, progressLabel, progressValue, headerContent, children }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen w-full bg-white lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="flex min-h-screen flex-col bg-white px-6 py-6 sm:px-8 lg:px-10 xl:px-12">
          <div className="flex items-start justify-between gap-6">
            <AuthBrand label={brandLabel} />
            <div className="flex w-full max-w-[22rem] flex-col items-end gap-3 pt-1">
              {headerContent}
              <div className="w-full">
                <p className="text-right text-xs font-medium text-slate-500 sm:text-sm">
                  {progressLabel}
                </p>
                <div className="mt-3 h-2.5 rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all duration-300"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-10 lg:py-16">
            <div className="w-full max-w-[34.75rem]">{children}</div>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-[#f4f6fa] lg:flex lg:flex-col">
          <div className="flex h-full items-center justify-end overflow-hidden pl-12 pt-24">
            <img
              src={`${import.meta.env.BASE_URL}auth-dashboard-preview.png`}
              alt="Etendo app preview"
              className="h-auto w-[1300px] max-w-none translate-x-[14%] object-contain opacity-30 blur-[1.5px]"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function SetupField({ id, label, required = false, trailingLabel, className = '', ...props }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
        {trailingLabel && <span className="ml-2 font-normal text-slate-500">{trailingLabel}</span>}
      </Label>
      <Input
        id={id}
        className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:border-slate-400 focus-visible:ring-4 focus-visible:ring-slate-900/5"
        {...props}
      />
    </div>
  );
}

function SetupSelect({ id, label, required = false, value, onChange, children, className = '' }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </Label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-4 focus:ring-slate-900/5"
      >
        {children}
      </select>
    </div>
  );
}

function BusinessTypeCard({ icon: Icon, label, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-[1.5rem] border bg-white p-4 text-left shadow-sm transition ${selected ? 'border-slate-900 shadow-[0_14px_30px_rgba(15,23,42,0.10)]' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <span className={`absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-slate-900 text-slate-900' : 'border-slate-300 text-transparent'}`}>
        <span className={`h-3 w-3 rounded-full ${selected ? 'bg-slate-900' : 'bg-transparent'}`} />
      </span>
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Icon className="h-6 w-6 text-slate-500" />
      </div>
      <p className="text-lg font-medium tracking-[-0.02em] text-slate-900 sm:text-xl">{label}</p>
    </button>
  );
}

function SetupProgressCard({ progress, title, description, leading, statusLabel, success = false }) {
  const ringColor = success ? '#54b56a' : '#171923';
  const trackColor = success ? '#d9f2df' : '#e6eaf2';
  const barColor = success ? '#54b56a' : '#171923';

  return (
    <div className="mx-auto w-full max-w-[980px] rounded-[1.75rem] border border-slate-200 bg-white px-8 py-10 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:px-12 sm:py-14">
      <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ringColor} 0deg ${progress * 3.6}deg, ${trackColor} ${progress * 3.6}deg 360deg)`,
          }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl">
            {leading}
          </div>
        </div>

        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-[2.2rem]">
          {title}
        </h2>
        <p className="mt-2 text-base text-slate-700 sm:text-lg">{description}</p>
      </div>

      <div className="mx-auto max-w-[460px]">
        <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
          <span>{statusLabel}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full" style={{ backgroundColor: trackColor }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
    </div>
  );
}

function SetupProgressShell({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f7fb]">
      <div className="absolute inset-y-0 left-0 w-[150px] overflow-hidden border-r border-white/30 bg-white/10 md:w-[170px]">
        <img
          src={`${import.meta.env.BASE_URL}auth-dashboard-preview.png`}
          alt="Etendo dashboard background"
          className="absolute left-0 top-1/2 h-[120vh] max-w-none -translate-y-1/2 object-contain opacity-45 blur-[1.5px]"
        />
      </div>
      <div className="absolute inset-0 bg-[#f5f7fb]/88" />
      <div className="absolute inset-y-0 left-0 z-[1] w-[150px] bg-transparent md:w-[170px]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        {children}
      </div>
    </div>
  );
}

// Shared page header — shown in post-auth views
function PageHeader({ accountName, onLogout, isAuthenticated, logoutLabel, brandLabel }) {
  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          <span className="font-semibold text-gray-900">{brandLabel}</span>
        </div>
        {isAuthenticated && accountName && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{accountName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-gray-500 hover:text-gray-700"
            >
              {logoutLabel}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

function getBusinessTypeIcon(value) {
  if (value === 'company') return Building2;
  if (value === 'freelancer') return User;
  return MessageCircle;
}

function getSetupProgressState(result, activeSetupStep, ui, countryCode) {
  if (result?.status === 'success') {
    return {
      progress: 100,
      title: ui('onboardingSuccessTitle'),
      description: ui('onboardingSuccessDescription'),
      leading: <Check className="h-8 w-8 text-[#54b56a]" strokeWidth={3} />,
      statusLabel: ui('onboardingCompleted'),
      success: true,
    };
  }
  if (activeSetupStep === 'client') {
    return {
      progress: 50,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingActivatingDescription'),
      leading: <Sparkles className="h-8 w-8 text-slate-400" />,
      statusLabel: ui('loading'),
      success: false,
    };
  }
  if (activeSetupStep === 'sequences') {
    return {
      progress: 80,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingSequencesDescription'),
      leading: <Settings className="h-8 w-8 text-slate-400" />,
      statusLabel: ui('loading'),
      success: false,
    };
  }
  if (activeSetupStep === 'organization' || activeSetupStep === 'finalize') {
    return {
      progress: 80,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingFinishingDescription'),
      leading: <Check className="h-8 w-8 text-slate-400" strokeWidth={3} />,
      statusLabel: ui('loading'),
      success: false,
    };
  }
  return {
    progress: 20,
    title: ui('onboardingPreparingTitle'),
    description: ui('onboardingPreparingTaxesDescription'),
    leading: countryCode === 'ES' ? '🇪🇸' : '🌍',
    statusLabel: ui('loading'),
    success: false,
  };
}

export default function OnboardingPage() {
  const [view, setView] = useState(null); // null = loading initial state
  const [accountName, setAccountName] = useState(null);

  // Platform token — authenticates against /sws/go/*
  const getPlatformToken = () => localStorage.getItem('sf_platform_token');

  // Register form state
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [registerError, setRegisterError] = useState(null);
  const [registerLoading, setRegisterLoading] = useState(false);

  // Login form state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Environments state
  const [environments, setEnvironments] = useState([]);
  const [loadingEnvs, setLoadingEnvs] = useState(false);
  const [loggingIn, setLoggingIn] = useState(null);

  // Create form
  const [createStep, setCreateStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_ONBOARDING_FORM);
  const [steps, setSteps] = useState(() => initialSetupSteps());
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const ui = useUI();
  const { locale, setLocale } = useLocaleSwitch();

  // Fetch environments and route: 0 → create, 1+ → auto-enter first
  const routeByEnvironments = useCallback(async () => {
    const token = getPlatformToken();
    setLoadingEnvs(true);
    try {
      const envs = await fetchEnvironments(fetch, BASE_URL, token);
      setEnvironments(envs);
      if (envs.length === 0) {
        setCreateStep(1);
        setView('create');
      } else {
        loginToEnvironment(envs[0]);
      }
      return;
    } catch (err) {
      console.error('Failed to load environments', err);
    } finally {
      setLoadingEnvs(false);
    }
    setView('create');
  }, []);

  // Validate existing platform token on mount
  useEffect(() => {
    const token = getPlatformToken();
    if (!token) {
      setView('register');
      return;
    }
    fetchAccount(fetch, BASE_URL, token)
      .then(data => {
        setAccountName(data.name || data.email || null);
        routeByEnvironments();
      })
      .catch(() => {
        localStorage.removeItem('sf_platform_token');
        setView('register');
      });
  }, []);

  useEffect(() => {
    if (!locale) return;
    setForm(prev => (prev.language === locale ? prev : { ...prev, language: locale }));
  }, [locale]);

  useEffect(() => {
    if (!accountName) return;
    setForm(prev => (prev.fullName ? prev : { ...prev, fullName: accountName }));
  }, [accountName]);

  // Save token + account name and route by environments
  const handleAuthSuccess = (token, account) => {
    localStorage.setItem('sf_platform_token', token);
    setAccountName(account?.name || account?.email || null);
    setShowRegisterPassword(false);
    setShowLoginPassword(false);
    routeByEnvironments();
  };

  const handleRegisterSuccess = (token, account) => {
    localStorage.setItem('sf_platform_token', token);
    setAccountName(account?.name || account?.email || null);
    setShowRegisterPassword(false);
    setShowLoginPassword(false);
    setRegisterError(null);
    setLoginError(null);
    setResult(null);
    setRunning(false);
    setCreateStep(1);
    setSteps(initialSetupSteps());
    setForm({
      ...DEFAULT_ONBOARDING_FORM,
      fullName: account?.name || account?.email || '',
    });
    setView('create');
  };

  /* c8 ignore start -- Logout is only reachable from the legacy list view, which current routing bypasses. */
  const handleLogout = () => {
    trackOnboarding('onboarding_auth_logout', {
      action: 'logout',
      status: 'success',
    });
    localStorage.removeItem('sf_platform_token');
    setAccountName(null);
    setRegisterForm({ name: '', email: '', password: '' });
    setLoginForm({ email: '', password: '' });
    setForm(DEFAULT_ONBOARDING_FORM);
    setCreateStep(1);
    setRegisterError(null);
    setLoginError(null);
    setShowRegisterPassword(false);
    setShowLoginPassword(false);
    setSteps(initialSetupSteps());
    setView('register');
  };
  /* c8 ignore stop */

  // Register
  const handleRegister = async (e) => {
    e.preventDefault();
    trackOnboarding('onboarding_auth_submitted', {
      action: 'register',
      status: 'started',
    });
    setRegisterError(null);
    setRegisterLoading(true);
    try {
      const data = await registerAccount(fetch, BASE_URL, registerForm);
      if (data.token) {
        trackOnboarding('onboarding_auth_succeeded', {
          action: 'register',
          status: 'success',
        });
        handleRegisterSuccess(data.token, data.account);
      } else {
        trackOnboarding('onboarding_auth_failed', {
          action: 'register',
          status: 'failed',
        });
        setRegisterError(ui('onboardingRegisterFailed'));
      }
    } catch (err) {
      trackOnboarding('onboarding_auth_failed', {
        action: 'register',
        status: 'failed',
      });
      setRegisterError(err.userMessage || ui(err.code || 'onboardingConnectionError'));
    } finally {
      setRegisterLoading(false);
    }
  };

  // Login
  const handleLogin = async (e) => {
    e.preventDefault();
    trackOnboarding('onboarding_auth_submitted', {
      action: 'login',
      status: 'started',
    });
    setLoginError(null);
    setLoginLoading(true);
    try {
      const data = await loginAccount(fetch, BASE_URL, loginForm);
      if (data.token) {
        trackOnboarding('onboarding_auth_succeeded', {
          action: 'login',
          status: 'success',
        });
        handleAuthSuccess(data.token, data.account);
      } else {
        trackOnboarding('onboarding_auth_failed', {
          action: 'login',
          status: 'failed',
        });
        setLoginError(ui('onboardingInvalidCredentials'));
      }
    } catch (err) {
      trackOnboarding('onboarding_auth_failed', {
        action: 'login',
        status: 'failed',
      });
      setLoginError(err.userMessage || ui(err.code || 'onboardingConnectionError'));
    } finally {
      setLoginLoading(false);
    }
  };

  const loginToEnvironment = async (env, { requireReadiness = false } = {}) => {
    const token = getPlatformToken();
    trackOnboarding('onboarding_environment_enter_submitted', {
      action: 'enter_environment',
      status: 'started',
    });
    setLoggingIn(env.clientId);
    try {
      const data = await loginEnvironment(fetch, BASE_URL, token, env);
      if (data.token) {
        const storageValues = buildEnvironmentSessionStorage(env, data);
        Object.entries(storageValues).forEach(([key, value]) => localStorage.setItem(key, value));

        // Clear all SW caches on login to guarantee fresh resources
        if ('caches' in window) {
          try {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
          } catch (err) {
            console.warn('Failed to clear SW caches during login', err);
          }
        }

        if (requireReadiness) {
          const readiness = await checkSalesInvoiceReadiness(fetch, BASE_URL, data.token);
          if (!readiness.ready) {
            trackOnboarding('onboarding_environment_enter_failed', {
              action: 'enter_environment',
              status: 'failed',
            });
            setResult({
              status: 'failed',
              readinessFailures: readiness.failures,
              error: null,
            });
            return;
          }
        }
        trackOnboarding('onboarding_environment_enter_succeeded', {
          action: 'enter_environment',
          status: 'success',
        });
        window.location.href = buildAppReturnToHref(
          getSafeReturnTo(window.location.search),
          window.location.pathname
        );
        return;
      }
      trackOnboarding('onboarding_environment_enter_failed', {
        action: 'enter_environment',
        status: 'failed',
      });
      alert(ui('onboardingEnvironmentLoginFailed'));
    } catch (err) {
      trackOnboarding('onboarding_environment_enter_failed', {
        action: 'enter_environment',
        status: 'failed',
      });
      if (requireReadiness) {
        setResult({ status: 'failed', error: err.userMessage || ui(err.code || 'onboardingEnvironmentLoginFailed') });
      } else {
        alert(err.userMessage || ui(err.code || 'onboardingEnvironmentLoginFailed'));
      }
    } finally {
      setLoggingIn(null);
    }
  };

  const runOnboarding = useCallback(async () => {
    const token = getPlatformToken();
    trackOnboarding('onboarding_run_started', {
      action: 'create_environment',
      status: 'started',
    });
    setRunning(true);
    setResult(null);
    setSteps(initialSetupSteps());

    let succeeded = false;
    try {
      await runOnboardingStream(fetch, BASE_URL, token, form, (msg) => {
        if (msg.type === 'result') {
          const resultObj = {
            status: msg.success ? 'success' : 'failed',
            error: msg.success ? null : msg.message,
          };
          setResult(resultObj);
          if (msg.success) {
            trackOnboarding('onboarding_run_succeeded', {
              action: 'create_environment',
              status: 'success',
            });
            succeeded = true;
          } else {
            trackOnboarding('onboarding_run_failed', {
              action: 'create_environment',
              status: 'failed',
            });
          }
        } else if (msg.type === 'progress' && msg.step) {
          setSteps(prev => applyProgressMessage(prev, msg));
        }
      });
    } catch (err) {
      trackOnboarding('onboarding_run_failed', {
        action: 'create_environment',
        status: 'failed',
      });
      setResult({ status: 'failed', error: err.userMessage || ui(err.code || 'onboardingGenericError') });
    } finally {
      setRunning(false);
      if (succeeded) {
        // Fetch environments and auto-login to the newly created one
        const retryLogin = async (attempts = 3, delay = 2000) => {
          const token = getPlatformToken();
          for (let i = 0; i < attempts; i++) {
            await new Promise(r => setTimeout(r, delay));
            try {
              const envs = await fetchEnvironments(fetch, BASE_URL, token);
              if (envs.length > 0) {
                loginToEnvironment(envs[0], { requireReadiness: true });
                return;
              }
            } catch (err) {
              // retry
            }
          }
          routeByEnvironments();
        };
        retryLogin();
      }
    }
  }, [form]);

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const setOnboardingLocale = (nextLocale) => {
    setLocale?.(nextLocale);
    setForm(prev => ({ ...prev, language: nextLocale }));
  };
  const countryOptions = COUNTRY_CODES.map((code) => ({
    value: code,
    label: code === 'ES' ? ui('onboardingCountrySpain') : code,
  }));
  const sectorOptions = SECTOR_CODES.map((code) => ({
    value: code,
    label: ui(`onboardingSector${code.charAt(0).toUpperCase()}${code.slice(1)}`),
  }));
  const businessTypeOptions = BUSINESS_TYPE_VALUES.map((value) => ({
    value,
    label: ui(`onboardingBusinessType${value.charAt(0).toUpperCase()}${value.slice(1)}`),
    icon: getBusinessTypeIcon(value),
  }));
  const authFeatureLabels = AUTH_FEATURE_KEYS.map((key) => ui(key));
  const languageOptions = LOCALE_CODES.map((code) => ({
    value: code,
    label: code === 'es_ES' ? ui('onboardingLanguageSpanish') : ui('onboardingLanguageEnglish'),
  }));
  const localeControl = setLocale ? (
    <OnboardingLanguageSelect
      label={ui('language')}
      locale={locale}
      onChange={setOnboardingLocale}
      options={languageOptions}
    />
  ) : null;
  const isStepOneValid = isProfileStepValid(form);
  const isStepTwoValid = isCompanyStepValid(form);
  const setupGreetingName = (form.fullName || accountName || ui('onboardingGreetingFallback')).trim().split(/\s+/)[0];
  const activeSetupStep = steps.find((step) => step.status === 'running')?.name;
  const readinessFailureText = (result?.readinessFailures ?? []).map((failure) => ui(failure.key)).join(' ');
  const setupProgressState = getSetupProgressState(result, activeSetupStep, ui, form.countryCode);


  // ── LOADING (initial token check) ──
  if (view === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── REGISTER VIEW ──
  if (view === 'register') {
    return (
      <AuthShell
        switchPrompt={ui('onboardingSwitchToLoginPrompt')}
        switchAction={ui('onboardingSwitchToLoginAction')}
        switchTestId="action-switch-to-login"
        onSwitch={() => {
          setRegisterError(null);
          setLoginError(null);
          setShowRegisterPassword(false);
          setShowLoginPassword(false);
          setView('login');
        }}
        brandLabel={ui('onboardingBrandName')}
        headerContent={localeControl}
        marketingTitle={ui('onboardingMarketingTitle')}
        marketingDescription={ui('onboardingMarketingDescription')}
        featureLabels={authFeatureLabels}
      >
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
            {ui('onboardingRegisterTitle')}
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-xl">
            {ui('onboardingRegisterSubtitle')}
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <AuthField
            id="reg-name"
            type="text"
            label={ui('onboardingNameLabel')}
            icon={UserPlus}
            value={registerForm.name}
            onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))}
            disabled={registerLoading}
            placeholder={ui('onboardingNamePlaceholder')}
            autoComplete="name"
            required
          />

          <AuthField
            id="reg-email"
            type="email"
            label={ui('onboardingEmailLabel')}
            icon={Mail}
            value={registerForm.email}
            onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))}
            disabled={registerLoading}
            placeholder={ui('onboardingEmailPlaceholder')}
            autoComplete="email"
            required
          />

          <AuthField
            id="reg-password"
            type={showRegisterPassword ? 'text' : 'password'}
            label={ui('onboardingPasswordLabel')}
            icon={Lock}
            value={registerForm.password}
            onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))}
            disabled={registerLoading}
            placeholder={ui('onboardingPasswordPlaceholder')}
            autoComplete="new-password"
            required
            trailing={(
              <button
                type="button"
                aria-label={showRegisterPassword ? ui('onboardingHidePassword') : ui('onboardingShowPassword')}
                onClick={() => setShowRegisterPassword(value => !value)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                {showRegisterPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            )}
          />

          {registerError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
              {registerError}
            </div>
          )}

          <Button
            type="submit"
            data-testid="action-register-submit"
            disabled={registerLoading}
            className="h-12 w-full rounded-2xl bg-gray-900 text-base font-medium text-white hover:bg-gray-800"
          >
            {registerLoading
              ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{ui('onboardingCreatingAccount')}</>
              : ui('onboardingCreateAccountAction')}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── LOGIN VIEW ──
  if (view === 'login') {
    return (
      <AuthShell
        switchPrompt={ui('onboardingSwitchToRegisterPrompt')}
        switchAction={ui('onboardingSwitchToRegisterAction')}
        switchTestId="action-switch-to-register"
        onSwitch={() => {
          setRegisterError(null);
          setLoginError(null);
          setShowRegisterPassword(false);
          setShowLoginPassword(false);
          setView('register');
        }}
        brandLabel={ui('onboardingBrandName')}
        headerContent={localeControl}
        marketingTitle={ui('onboardingMarketingTitle')}
        marketingDescription={ui('onboardingMarketingDescription')}
        featureLabels={authFeatureLabels}
      >
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
            {ui('onboardingLoginTitle')}
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-xl">
            {ui('onboardingLoginSubtitle')}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <AuthField
            id="login-email"
            type="email"
            label={ui('onboardingEmailLabel')}
            icon={Mail}
            value={loginForm.email}
            onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
            disabled={loginLoading}
            placeholder={ui('onboardingEmailPlaceholder')}
            autoComplete="email"
            required
          />

          <AuthField
            id="login-password"
            type={showLoginPassword ? 'text' : 'password'}
            label={ui('onboardingPasswordLabel')}
            icon={Lock}
            value={loginForm.password}
            onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
            disabled={loginLoading}
            placeholder={ui('onboardingPasswordPlaceholder')}
            autoComplete="current-password"
            required
            trailing={(
              <button
                type="button"
                aria-label={showLoginPassword ? ui('onboardingHidePassword') : ui('onboardingShowPassword')}
                onClick={() => setShowLoginPassword(value => !value)}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                {showLoginPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            )}
          />

          {loginError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
              {loginError}
            </div>
          )}

          <Button
            type="submit"
            data-testid="action-login-submit"
            disabled={loginLoading}
            className="h-12 w-full rounded-2xl bg-gray-900 text-base font-medium text-white hover:bg-gray-800"
          >
            {loginLoading
              ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{ui('onboardingSigningIn')}</>
              : ui('onboardingLoginAction')}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── LIST VIEW ──
  /* c8 ignore start -- Legacy branch: routing currently auto-enters an environment or opens create view. */
  if (view === 'list') {
    const renderEnvironmentListContent = () => {
      if (loadingEnvs) {
        return (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        );
      }

      if (environments.length === 0) {
        return (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-900 mb-1">{ui('onboardingNoEnvironments')}</p>
            <p className="text-gray-500 text-sm mb-6">{ui('onboardingCreateFirstEnvironment')}</p>
            <Button
              onClick={() => { setCreateStep(1); setResult(null); setView('create'); }}
              className="bg-amber-400 hover:bg-amber-500 text-white"
            >
              <Plus className="h-4 w-4 mr-1" /> {ui('onboardingCreateEnvironment')}
            </Button>
          </div>
        );
      }

      return (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {environments.map(env => {
            const isLoggingIn = loggingIn === env.clientId;

            return (
              <div
                key={env.clientId}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{env.clientName}</p>
                    <p className="text-sm text-gray-500">
                      {env.orgName || '\u2014'} &middot; {env.adminUserName || env.adminUser || '\u2014'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`action-enter-environment-${env.clientId}`}
                  onClick={() => loginToEnvironment(env)}
                  disabled={isLoggingIn}
                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                >
                  <EnterEnvironmentButtonContent
                    isLoggingIn={isLoggingIn}
                    label={ui('onboardingEnterEnvironment')}
                  />
                </Button>
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader
          isAuthenticated
          accountName={accountName}
          onLogout={handleLogout}
          logoutLabel={ui('logout')}
          brandLabel={ui('onboardingBrandName')}
        />

        {/* Extra header actions row */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">{ui('onboardingEnvironmentsShort')}</span>
            <div className="flex items-end gap-3">
              {localeControl}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={routeByEnvironments}
                  disabled={loadingEnvs}
                  className="text-gray-500"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingEnvs ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  onClick={() => { setCreateStep(1); setResult(null); setView('create'); }}
                  className="bg-amber-400 hover:bg-amber-500 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" /> {ui('onboardingNewEnvironment')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{ui('onboardingEnvironmentsTitle')}</h1>
          <p className="text-gray-500 text-sm mb-6">
            {ui('onboardingEnvironmentsSubtitle')}
          </p>

          {renderEnvironmentListContent()}
        </div>
      </div>
    );
  }
  /* c8 ignore stop */

  // ── CREATE VIEW ──
  if (running || result?.status === 'success') {
    return (
      <SetupProgressShell>
        <SetupProgressCard {...setupProgressState} />
      </SetupProgressShell>
    );
  }

  return (
    <SetupShell
      progressLabel={createStep === 1 ? ui('onboardingProgressAlmostReady') : ui('onboardingProgressAlmostDone')}
      progressValue={createStep === 1 ? 50 : 90}
      headerContent={localeControl}
      brandLabel={ui('onboardingBrandName')}
    >
      {createStep === 1 ? (
        <div>
          <div className="mb-10">
            <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
              {ui('onboardingGreeting', { name: setupGreetingName })}
            </h1>
            <p className="mt-3 text-base text-slate-700 sm:text-xl">
              {ui('onboardingSetupSubtitle')}
            </p>
          </div>

          <div className="space-y-6">
            <SetupField
              id="fullName"
              label={ui('onboardingFullNameLabel')}
              required
              value={form.fullName}
              onChange={e => updateField('fullName', e.target.value)}
              placeholder={ui('onboardingFullNamePlaceholder')}
            />

            <SetupSelect
              id="countryCode"
              label={ui('onboardingCountryLabel')}
              required
              value={form.countryCode}
              onChange={e => updateField('countryCode', e.target.value)}
            >
              {countryOptions.map((country) => (
                <option key={country.value} value={country.value}>{country.label}</option>
              ))}
            </SetupSelect>

            <div>
              <Label className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900">
                {ui('onboardingBusinessTypeLabel')}
              </Label>
              <div className="grid gap-4 sm:grid-cols-3">
                {businessTypeOptions.map((option) => (
                  <BusinessTypeCard
                    key={option.value}
                    icon={option.icon}
                    label={option.label}
                    selected={form.businessType === option.value}
                    onClick={() => updateField('businessType', option.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button
              type="button"
              onClick={() => {
                trackOnboarding('onboarding_setup_step_completed', {
                  action: 'continue',
                  status: 'success',
                  type: 'profile',
                });
                setCreateStep(2);
              }}
              disabled={!isStepOneValid}
              className="h-12 rounded-2xl bg-gray-900 px-6 text-base font-medium text-white hover:bg-gray-800"
            >
              {ui('onboardingContinueAction')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-10">
            <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
              {ui('onboardingCompanyTitle')}
            </h1>
            <p className="mt-3 text-base text-slate-700 sm:text-xl">
              {ui('onboardingCompanySubtitle')}
            </p>
          </div>

          <div className="space-y-6">
            <SetupField
              id="clientName"
              label={ui('onboardingCompanyNameLabel')}
              required
              value={form.clientName}
              onChange={e => updateField('clientName', e.target.value)}
              placeholder={ui('onboardingCompanyNamePlaceholder')}
            />

            <div>
              <Label htmlFor="fiscalIdValue" className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900">
                {ui('onboardingFiscalIdLabel')} <span className="ml-1 text-rose-500">*</span>
              </Label>
              <div className="flex overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:ring-4 focus-within:ring-slate-900/5">
                <div className="flex min-w-[88px] items-center justify-center border-r border-slate-300 px-4 text-base text-slate-500">
                  {form.fiscalIdType}
                </div>
                <input
                  id="fiscalIdValue"
                  type="text"
                  value={form.fiscalIdValue}
                  onChange={e => updateField('fiscalIdValue', e.target.value)}
                  placeholder={ui('onboardingFiscalIdPlaceholder')}
                  className="h-12 w-full border-0 px-4 text-base text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <SetupField
              id="address"
              label={ui('onboardingAddressLabel')}
              trailingLabel={`(${ui('optional')})`}
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder={ui('onboardingAddressPlaceholder')}
            />

            <SetupSelect
              id="sector"
              label={ui('onboardingSectorLabel')}
              value={form.sector}
              onChange={e => updateField('sector', e.target.value)}
            >
              {sectorOptions.map((sector) => (
                <option key={sector.value} value={sector.value}>{sector.label}</option>
              ))}
            </SetupSelect>
          </div>

          {result?.status === 'failed' && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
              {result.error || ui('onboardingReadinessFailed', { reasons: readinessFailureText })}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                if (running) return;
                trackOnboarding('onboarding_setup_step_back', {
                  action: 'back',
                  status: 'success',
                  type: 'company',
                });
                setCreateStep(1);
              }}
              disabled={running}
              className="text-base font-medium tracking-[-0.02em] text-slate-900 transition hover:text-slate-600 disabled:opacity-50 sm:text-lg"
            >
              {ui('back')}
            </button>

            <Button
              type="button"
              onClick={runOnboarding}
              disabled={running || !isStepTwoValid}
              className="h-12 rounded-2xl bg-gray-900 px-6 text-base font-medium text-white hover:bg-gray-800 disabled:bg-slate-200 disabled:text-slate-500"
            >
              {running ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{ui('onboardingStarting')}</>
              ) : (
                <><ArrowRight className="mr-2 h-4 w-4" />{ui('onboardingStartAction')}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </SetupShell>
  );
}
