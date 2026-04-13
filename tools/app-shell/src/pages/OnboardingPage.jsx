import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Check, ChevronRight, ChevronDown,
  Plus, Building2, RefreshCw,
  Briefcase, Rocket, Settings,
  UserPlus, Mail, Lock, Eye, EyeOff, Sparkles,
  ArrowRight, User, MessageCircle,
} from 'lucide-react';

function detectBaseUrl() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return import.meta.env.VITE_API_BASE || '';
}

const BASE_URL = detectBaseUrl();

const SETUP_STEPS = [
  { name: 'setup', label: 'Preparando contexto', icon: Settings, estimate: '1s' },
  { name: 'client', label: 'Crear empresa', icon: Briefcase, estimate: '2 min' },
  { name: 'organization', label: 'Crear organizacion', icon: Building2, estimate: '1 min' },
  { name: 'finalize', label: 'Finalizar configuracion', icon: Rocket, estimate: '1s' },
];

const CURRENCIES = ['EUR'];
const LANGUAGES = [
  { value: 'es_ES', label: 'Español' },
  { value: 'en_US', label: 'English' },
];
const COUNTRIES = [
  { value: 'ES', label: 'España' },
];
const SECTORS = [
  { value: 'technology', label: 'Tecnología' },
  { value: 'services', label: 'Servicios' },
  { value: 'commerce', label: 'Comercio' },
  { value: 'manufacturing', label: 'Industria' },
];
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

function formatMs(ms) {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepIcon({ status, Icon }) {
  if (status === 'done') {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 flex-shrink-0">
        <Check className="h-5 w-5 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (status === 'active') {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-gray-900 bg-white flex-shrink-0">
        <Icon className="h-4 w-4 text-gray-900" />
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-400 flex-shrink-0">
        <Loader2 className="h-4 w-4 text-white animate-spin" />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 flex-shrink-0">
        <span className="text-white text-sm font-bold">!</span>
      </div>
    );
  }
  // pending
  return (
    <div className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex-shrink-0">
      <Icon className="h-4 w-4 text-gray-400" />
    </div>
  );
}

function SelectField({ id, value, onChange, disabled, children, label }) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm text-gray-600">{label}</Label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 flex h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-shadow"
      >
        {children}
      </select>
    </div>
  );
}

const AUTH_FEATURES = ['Sin tarjeta de crédito', 'Prueba gratuita', 'Acceso inmediato'];

function AuthBrand() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/favicon.png"
        alt="Etendo"
        className="h-14 w-14 rounded-2xl border border-white/80 bg-white object-contain p-1 shadow-[0_12px_30px_rgba(250,204,21,0.45)]"
      />
      <span className="text-xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-2xl">
        Etendo
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

function AuthShell({ switchPrompt, switchAction, onSwitch, children }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen w-full bg-white lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="flex min-h-[720px] flex-col bg-white px-6 py-6 sm:px-8 lg:px-10 xl:px-12">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between lg:border-b-0 lg:pb-0">
            <AuthBrand />
            <p className="text-xs text-slate-700 sm:text-sm">
              {switchPrompt}{' '}
              <button
                type="button"
                onClick={onSwitch}
                className="font-medium text-slate-900 underline underline-offset-4 transition hover:text-slate-700"
              >
                {switchAction}
              </button>
            </p>
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
                Gestiona tu negocio con ayuda de Copilot
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-7 text-slate-600">
                Factura, registra gastos y obtén reportes en segundos, con una interfaz simple y guiada
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {AUTH_FEATURES.map((feature) => (
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

function SetupShell({ progressLabel, progressValue, children }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen w-full bg-white lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
        <section className="flex min-h-screen flex-col bg-white px-6 py-6 sm:px-8 lg:px-10 xl:px-12">
          <div className="flex items-start justify-between gap-6">
            <AuthBrand />
            <div className="w-full max-w-[22rem] pt-1">
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

function SetupProgressCard({ progress, title, description, leading, success = false }) {
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
            {typeof leading === 'string' ? leading : leading}
          </div>
        </div>

        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-[2.2rem]">
          {title}
        </h2>
        <p className="mt-2 text-base text-slate-700 sm:text-lg">{description}</p>
      </div>

      <div className="mx-auto max-w-[460px]">
        <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
          <span>{success ? 'Completado' : 'Cargando...'}</span>
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
function PageHeader({ accountName, onLogout, isAuthenticated }) {
  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          <span className="font-semibold text-gray-900">Etendo</span>
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
              Cerrar sesion
            </Button>
          </div>
        )}
      </div>
    </header>
  );
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
  const [steps, setSteps] = useState(
    SETUP_STEPS.map(s => ({ ...s, status: 'pending', ms: null, error: null }))
  );
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Fetch environments and route: 0 → create, 1+ → auto-enter first
  const routeByEnvironments = useCallback(async () => {
    const token = getPlatformToken();
    setLoadingEnvs(true);
    try {
      const res = await fetch(`${BASE_URL}/sws/go/environments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const envs = data.environments || [];
        setEnvironments(envs);
        if (envs.length === 0) {
          setCreateStep(1);
          setView('create');
        } else {
          loginToEnvironment(envs[0]);
        }
        return;
      }
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
    fetch(`${BASE_URL}/sws/go/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('invalid');
      })
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
    setFormSubmitted(false);
    setRunning(false);
    setCreateStep(1);
    setSteps(SETUP_STEPS.map(s => ({ ...s, status: 'pending', ms: null, error: null })));
    setForm({
      ...DEFAULT_ONBOARDING_FORM,
      fullName: account?.name || account?.email || '',
    });
    setView('create');
  };

  const handleLogout = () => {
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
    setView('register');
  };

  // Register
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/sws/go/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        handleRegisterSuccess(data.token, data.account);
      } else {
        setRegisterError(data?.error?.message || 'No se pudo crear la cuenta.');
      }
    } catch (err) {
      setRegisterError('Error de conexion. Intenta de nuevo.');
    } finally {
      setRegisterLoading(false);
    }
  };

  // Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/sws/go/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        handleAuthSuccess(data.token, data.account);
      } else {
        setLoginError(data?.error?.message || 'Credenciales invalidas.');
      }
    } catch (err) {
      setLoginError('Error de conexion. Intenta de nuevo.');
    } finally {
      setLoginLoading(false);
    }
  };

  const loginToEnvironment = async (env) => {
    const token = getPlatformToken();
    setLoggingIn(env.clientId);
    try {
      const res = await fetch(`${BASE_URL}/sws/go/login?userId=${env.adminUserId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('sf_auth_token', data.token);
          localStorage.setItem('sf_auth_user', env.adminUser || '');
          if (data.roleList) {
            localStorage.setItem('sf_auth_rolelist', JSON.stringify(data.roleList));
            const role = data.roleList[0];
            if (role) {
              localStorage.setItem('sf_auth_selected_role', JSON.stringify(role));
              const org = role.orgList?.find(o => o.name !== '*') || role.orgList?.[0];
              if (org) {
                localStorage.setItem('sf_auth_selected_org', JSON.stringify(org));
              }
            }
          }
          // Clear all SW caches on login to guarantee fresh resources
          if ('caches' in window) {
            try {
              const names = await caches.keys();
              await Promise.all(names.map((n) => caches.delete(n)));
            } catch (err) {
              console.warn('Failed to clear SW caches during login', err);
            }
          }
          window.location.href = '/dashboard';
          return;
        }
      }
      alert('Login failed.');
    } catch (err) {
      alert('Login error: ' + err.message);
    } finally {
      setLoggingIn(null);
    }
  };

  const runOnboarding = useCallback(async () => {
    const token = getPlatformToken();
    setRunning(true);
    setResult(null);
    setFormSubmitted(true);
    setSteps(SETUP_STEPS.map(s => ({ ...s, status: 'pending', ms: null, error: null })));

    let succeeded = false;
    try {
      const res = await fetch(`${BASE_URL}/sws/go/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          clientName: form.clientName,
          currency: form.currency,
          language: form.language,
          countryCode: form.countryCode,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: !done });
        if (done) buffer += decoder.decode();

        const lines = buffer.split('\n');
        buffer = done ? '' : lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === 'result') {
            const resultObj = {
              status: msg.success ? 'success' : 'failed',
              error: msg.success ? null : msg.message,
            };
            setResult(resultObj);
            if (msg.success) succeeded = true;
          } else if (msg.type === 'progress' && msg.step) {
            // Map backend status to frontend step status
            const stepStatus = msg.status === 'in_progress' ? 'running'
              : msg.status === 'done' ? 'done'
              : msg.status === 'error' ? 'failed'
              : msg.status;
            setSteps(prev => prev.map(s =>
              s.name === msg.step
                ? { ...s, status: stepStatus, ms: msg.ms || null, error: msg.status === 'error' ? msg.message : null }
                : s
            ));
          }
        }
        if (done) break;
      }
    } catch (err) {
      setResult({ status: 'failed', error: err.message });
    } finally {
      setRunning(false);
      if (succeeded) {
        // Fetch environments and auto-login to the newly created one
        const retryLogin = async (attempts = 3, delay = 2000) => {
          const token = getPlatformToken();
          for (let i = 0; i < attempts; i++) {
            await new Promise(r => setTimeout(r, delay));
            try {
              const res = await fetch(`${BASE_URL}/sws/go/environments`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (res.ok) {
                const data = await res.json();
                const envs = data.environments || [];
                if (envs.length > 0) {
                  loginToEnvironment(envs[0]);
                  return;
                }
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
  const businessTypeOptions = [
    { value: 'company', label: 'Empresa', icon: Building2 },
    { value: 'freelancer', label: 'Autónomo', icon: User },
    { value: 'advisory', label: 'Asesoría', icon: MessageCircle },
  ];
  const isStepOneValid = form.fullName.trim() && form.countryCode;
  const isStepTwoValid = form.clientName.trim() && form.fiscalIdValue.trim();
  const setupGreetingName = (form.fullName || accountName || 'Jhon').trim().split(/\s+/)[0];
  const activeSetupStep = steps.find((step) => step.status === 'running')?.name;
  const setupProgressState = result?.status === 'success'
    ? {
      progress: 100,
      title: 'Tu cuenta ya está en marcha',
      description: 'Ya puedes empezar a gestionar tu negocio',
      leading: <Check className="h-8 w-8 text-[#54b56a]" strokeWidth={3} />,
      success: true,
    }
    : activeSetupStep === 'client'
      ? {
        progress: 50,
        title: 'Estamos preparando tu espacio',
        description: 'Activando tus módulos...',
        leading: <Sparkles className="h-8 w-8 text-slate-400" />,
        success: false,
      }
      : activeSetupStep === 'organization' || activeSetupStep === 'finalize'
        ? {
          progress: 80,
          title: 'Estamos preparando tu espacio',
          description: 'Dejando todo listo...',
          leading: <Check className="h-8 w-8 text-slate-400" strokeWidth={3} />,
          success: false,
        }
        : {
          progress: 20,
          title: 'Estamos preparando tu espacio',
          description: 'Configurando impuestos según tu país...',
          leading: form.countryCode === 'ES' ? '🇪🇸' : '🌍',
          success: false,
        };

  // Calculate progress
  const completedCount = steps.filter(s => s.status === 'done').length;
  const totalSteps = steps.length + 1; // +1 for the form step
  const progressPercent = formSubmitted
    ? Math.round(((completedCount + 1) / totalSteps) * 100)
    : 0;

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
        switchPrompt="¿Ya tienes una cuenta?"
        switchAction="Iniciar sesión"
        onSwitch={() => {
          setRegisterError(null);
          setLoginError(null);
          setShowRegisterPassword(false);
          setShowLoginPassword(false);
          setView('login');
        }}
      >
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
            Crea tu cuenta gratis
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-xl">
            Empieza en menos de 1 minuto
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <AuthField
            id="reg-name"
            type="text"
            label="Nombre"
            icon={UserPlus}
            value={registerForm.name}
            onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))}
            disabled={registerLoading}
            placeholder="Tu nombre"
            autoComplete="name"
            required
          />

          <AuthField
            id="reg-email"
            type="email"
            label="Correo electrónico"
            icon={Mail}
            value={registerForm.email}
            onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))}
            disabled={registerLoading}
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />

          <AuthField
            id="reg-password"
            type={showRegisterPassword ? 'text' : 'password'}
            label="Contraseña"
            icon={Lock}
            value={registerForm.password}
            onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))}
            disabled={registerLoading}
            placeholder="********"
            autoComplete="new-password"
            required
            trailing={(
              <button
                type="button"
                aria-label={showRegisterPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
            disabled={registerLoading}
            className="h-12 w-full rounded-2xl bg-gray-900 text-base font-medium text-white hover:bg-gray-800"
          >
            {registerLoading
              ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Creando cuenta...</>
              : 'Crear cuenta'}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── LOGIN VIEW ──
  if (view === 'login') {
    return (
      <AuthShell
        switchPrompt="¿Aún no tienes una cuenta?"
        switchAction="Crear cuenta"
        onSwitch={() => {
          setRegisterError(null);
          setLoginError(null);
          setShowRegisterPassword(false);
          setShowLoginPassword(false);
          setView('register');
        }}
      >
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
            Inicia sesión en tu cuenta
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-xl">
            Continúa donde lo dejaste
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <AuthField
            id="login-email"
            type="email"
            label="Correo electrónico"
            icon={Mail}
            value={loginForm.email}
            onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
            disabled={loginLoading}
            placeholder="tu@email.com"
            autoComplete="email"
            required
          />

          <AuthField
            id="login-password"
            type={showLoginPassword ? 'text' : 'password'}
            label="Contraseña"
            icon={Lock}
            value={loginForm.password}
            onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
            disabled={loginLoading}
            placeholder="********"
            autoComplete="current-password"
            required
            trailing={(
              <button
                type="button"
                aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
            disabled={loginLoading}
            className="h-12 w-full rounded-2xl bg-gray-900 text-base font-medium text-white hover:bg-gray-800"
          >
            {loginLoading
              ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Iniciando sesión...</>
              : 'Iniciar sesión'}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── LIST VIEW ──
  if (view === 'list') {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader
          isAuthenticated
          accountName={accountName}
          onLogout={handleLogout}
        />

        {/* Extra header actions row */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">Tus entornos</span>
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
                <Plus className="h-4 w-4 mr-1" /> Nuevo entorno
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Tus entornos</h1>
          <p className="text-gray-500 text-sm mb-6">
            Selecciona un entorno para comenzar a trabajar.
          </p>

          {loadingEnvs ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : environments.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-lg font-medium text-gray-900 mb-1">Sin entornos</p>
              <p className="text-gray-500 text-sm mb-6">Crea tu primer entorno para comenzar.</p>
              <Button
                onClick={() => { setCreateStep(1); setResult(null); setView('create'); }}
                className="bg-amber-400 hover:bg-amber-500 text-white"
              >
                <Plus className="h-4 w-4 mr-1" /> Crear entorno
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {environments.map(env => (
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
                        {env.orgName || '\u2014'} &middot; {env.adminUser || '\u2014'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loginToEnvironment(env)}
                    disabled={loggingIn === env.clientId}
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  >
                    {loggingIn === env.clientId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Entrar <ChevronRight className="h-4 w-4 ml-1" /></>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

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
      progressLabel={createStep === 1 ? 'Un paso más' : 'Casi listo'}
      progressValue={createStep === 1 ? 50 : 90}
    >
      {createStep === 1 ? (
        <div>
          <div className="mb-10">
            <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
              Hola {setupGreetingName} 👋
            </h1>
            <p className="mt-3 text-base text-slate-700 sm:text-xl">
              Vamos a dejar todo listo en menos de 1 minuto
            </p>
          </div>

          <div className="space-y-6">
            <SetupField
              id="fullName"
              label="Nombre completo"
              required
              value={form.fullName}
              onChange={e => updateField('fullName', e.target.value)}
              placeholder="Jhon Doe"
            />

            <SetupSelect
              id="countryCode"
              label="País"
              required
              value={form.countryCode}
              onChange={e => updateField('countryCode', e.target.value)}
            >
              {COUNTRIES.map((country) => (
                <option key={country.value} value={country.value}>{country.label}</option>
              ))}
            </SetupSelect>

            <div>
              <Label className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900">
                Tipo de negocio:
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
              onClick={() => setCreateStep(2)}
              disabled={!isStepOneValid}
              className="h-12 rounded-2xl bg-gray-900 px-6 text-base font-medium text-white hover:bg-gray-800"
            >
              Continuar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-10">
            <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
              Datos para empezar a facturar
            </h1>
            <p className="mt-3 text-base text-slate-700 sm:text-xl">
              Puedes editarlos más adelante
            </p>
          </div>

          <div className="space-y-6">
            <SetupField
              id="clientName"
              label="Nombre de la empresa"
              required
              value={form.clientName}
              onChange={e => updateField('clientName', e.target.value)}
              placeholder="Mi empresa"
            />

            <div>
              <Label htmlFor="fiscalIdValue" className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900">
                Identificación fiscal <span className="ml-1 text-rose-500">*</span>
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
                  placeholder="12345678Z"
                  className="h-12 w-full border-0 px-4 text-base text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <SetupField
              id="address"
              label="Dirección"
              trailingLabel="(opcional)"
              value={form.address}
              onChange={e => updateField('address', e.target.value)}
              placeholder="Av. Corrientes 1234"
            />

            <SetupSelect
              id="sector"
              label="Sector"
              value={form.sector}
              onChange={e => updateField('sector', e.target.value)}
            >
              {SECTORS.map((sector) => (
                <option key={sector.value} value={sector.value}>{sector.label}</option>
              ))}
            </SetupSelect>
          </div>

          {result?.status === 'failed' && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
              {result.error}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => !running && setCreateStep(1)}
              disabled={running}
              className="text-base font-medium tracking-[-0.02em] text-slate-900 transition hover:text-slate-600 disabled:opacity-50 sm:text-lg"
            >
              Atrás
            </button>

            <Button
              type="button"
              onClick={runOnboarding}
              disabled={running || !isStepTwoValid}
              className="h-12 rounded-2xl bg-gray-900 px-6 text-base font-medium text-white hover:bg-gray-800 disabled:bg-slate-200 disabled:text-slate-500"
            >
              {running ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Empezando...</>
              ) : (
                <><ArrowRight className="mr-2 h-4 w-4" />Empezar</>
              )}
            </Button>
          </div>
        </div>
      )}
    </SetupShell>
  );
}
