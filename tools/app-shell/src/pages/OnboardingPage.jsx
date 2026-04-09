import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2, Check, ChevronRight, ChevronDown,
  Plus, LogIn, Building2, RefreshCw,
  Briefcase, Users, Database, FileText, Rocket, Settings,
  UserPlus, Mail, Lock, KeyRound,
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

// Shared page header — shown in all views
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
  const navigate = useNavigate();
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

  // Environments state
  const [environments, setEnvironments] = useState([]);
  const [loadingEnvs, setLoadingEnvs] = useState(false);
  const [loggingIn, setLoggingIn] = useState(null);

  // Create form
  const [form, setForm] = useState({
    clientName: '',
    currency: 'EUR', language: 'es_ES', countryCode: 'ES',
  });
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

  // Save token + account name and route by environments
  const handleAuthSuccess = (token, account) => {
    localStorage.setItem('sf_platform_token', token);
    setAccountName(account?.name || account?.email || null);
    routeByEnvironments();
  };

  const handleLogout = () => {
    localStorage.removeItem('sf_platform_token');
    setAccountName(null);
    setRegisterForm({ name: '', email: '', password: '' });
    setLoginForm({ email: '', password: '' });
    setRegisterError(null);
    setLoginError(null);
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
        handleAuthSuccess(data.token, data.account);
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
        body: JSON.stringify(form),
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
      setResult({ result: 'failed', error: err.message });
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
  const isFormValid = form.clientName;

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
      <div className="min-h-screen bg-gray-50">
        <PageHeader isAuthenticated={false} />

        <div className="max-w-md mx-auto p-6 pt-12">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UserPlus className="h-6 w-6 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Crear cuenta</h1>
            <p className="text-gray-500 text-sm">Ingresa tus datos para empezar</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <Label htmlFor="reg-name" className="text-sm text-gray-600">
                  Nombre <span className="text-red-400">*</span>
                </Label>
                <div className="relative mt-1">
                  <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="reg-name"
                    type="text"
                    value={registerForm.name}
                    onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                    disabled={registerLoading}
                    placeholder="Tu nombre"
                    required
                    className="h-11 pl-9 rounded-lg border-gray-200 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="reg-email" className="text-sm text-gray-600">
                  Email <span className="text-red-400">*</span>
                </Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="reg-email"
                    type="email"
                    value={registerForm.email}
                    onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))}
                    disabled={registerLoading}
                    placeholder="tu@email.com"
                    required
                    className="h-11 pl-9 rounded-lg border-gray-200 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="reg-password" className="text-sm text-gray-600">
                  Contrasena <span className="text-red-400">*</span>
                </Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="reg-password"
                    type="password"
                    value={registerForm.password}
                    onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))}
                    disabled={registerLoading}
                    placeholder="********"
                    required
                    className="h-11 pl-9 rounded-lg border-gray-200 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
              </div>

              {registerError && (
                <p className="text-sm text-red-500">{registerError}</p>
              )}

              <Button
                type="submit"
                disabled={registerLoading}
                className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium"
              >
                {registerLoading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando cuenta...</>
                  : 'Crear cuenta'
                }
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-gray-500 mt-5">
            Ya tenes cuenta?{' '}
            <button
              type="button"
              onClick={() => { setLoginError(null); setView('login'); }}
              className="text-amber-600 hover:text-amber-700 font-medium"
            >
              Iniciar sesion
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── LOGIN VIEW ──
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader isAuthenticated={false} />

        <div className="max-w-md mx-auto p-6 pt-12">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="h-6 w-6 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Iniciar sesion</h1>
            <p className="text-gray-500 text-sm">Bienvenido de nuevo</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="login-email" className="text-sm text-gray-600">
                  Email <span className="text-red-400">*</span>
                </Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="login-email"
                    type="email"
                    value={loginForm.email}
                    onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                    disabled={loginLoading}
                    placeholder="tu@email.com"
                    required
                    className="h-11 pl-9 rounded-lg border-gray-200 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="login-password" className="text-sm text-gray-600">
                  Contrasena <span className="text-red-400">*</span>
                </Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                    disabled={loginLoading}
                    placeholder="********"
                    required
                    className="h-11 pl-9 rounded-lg border-gray-200 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
              </div>

              {loginError && (
                <p className="text-sm text-red-500">{loginError}</p>
              )}

              <Button
                type="submit"
                disabled={loginLoading}
                className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium"
              >
                {loginLoading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Iniciando sesion...</>
                  : 'Iniciar sesion'
                }
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-gray-500 mt-5">
            No tenes cuenta?{' '}
            <button
              type="button"
              onClick={() => { setRegisterError(null); setView('register'); }}
              className="text-amber-600 hover:text-amber-700 font-medium"
            >
              Crear una
            </button>
          </p>
        </div>
      </div>
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
                onClick={() => setView('create')}
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
                onClick={() => setView('create')}
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

  // ── CREATE VIEW (matches "Primeros pasos" design) ──
  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        isAuthenticated
        accountName={accountName}
        onLogout={handleLogout}
      />

      {/* Back link + progress bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-3">
          {!running && environments.length > 1 && (
            <button
              type="button"
              onClick={() => { setView('list'); setResult(null); setFormSubmitted(false); }}
              className="text-sm text-gray-500 hover:text-gray-700 mr-2"
            >
              Mis entornos
            </button>
          )}
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {result?.status === 'success'
              ? 'Listo'
              : completedCount === 0 && !formSubmitted
                ? 'Primeros pasos'
                : `Paso ${completedCount + (formSubmitted ? 1 : 0)} de ${totalSteps}`
            }
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Vamos a preparar tu cuenta
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Completa los datos y en menos de 10 minutos tendras todo listo para empezar.
        </p>

        {/* Steps list */}
        <div className="bg-white rounded-xl border border-gray-100">

          {/* Step 0: Configuration form */}
          <div className="border-b border-gray-50">
            <button
              type="button"
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
              onClick={() => !running && setFormSubmitted(false)}
              disabled={running}
            >
              <StepIcon
                status={formSubmitted ? 'done' : 'active'}
                Icon={Settings}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-lg font-semibold ${formSubmitted ? 'text-gray-500' : 'text-gray-900'}`}>
                  Datos de tu empresa
                </p>
                {formSubmitted && !running && (
                  <p className="text-xs text-gray-400 mt-0.5">{form.clientName}</p>
                )}
              </div>
              {!formSubmitted && (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>

            {/* Inline form (shown when not submitted) */}
            {!formSubmitted && (
              <div className="px-5 pb-5 pt-1 space-y-4">
                <div>
                  <Label htmlFor="clientName" className="text-sm text-gray-600">
                    Nombre de la empresa <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="clientName"
                    value={form.clientName}
                    onChange={e => updateField('clientName', e.target.value)}
                    disabled={running}
                    placeholder="Mi Empresa S.A."
                    className="mt-1 h-11 rounded-lg border-gray-200 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <SelectField
                    id="currency"
                    value={form.currency}
                    onChange={e => updateField('currency', e.target.value)}
                    disabled={running}
                    label="Moneda"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                  <SelectField
                    id="language"
                    value={form.language}
                    onChange={e => updateField('language', e.target.value)}
                    disabled={running}
                    label="Idioma"
                  >
                    {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </SelectField>
                  <SelectField
                    id="countryCode"
                    value={form.countryCode}
                    onChange={e => updateField('countryCode', e.target.value)}
                    disabled={running}
                    label="Pais"
                  >
                    {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </SelectField>
                </div>
                <div className="pt-2">
                  <Button
                    onClick={runOnboarding}
                    disabled={running || !isFormValid}
                    className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium"
                  >
                    {running
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando...</>
                      : <><ChevronRight className="mr-1 h-4 w-4" />Crear entorno</>
                    }
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Automated steps */}
          {steps.map((step, i) => {
            const isPending = step.status === 'pending';
            const isDone = step.status === 'done';

            return (
              <div
                key={step.name}
                className={`${i < steps.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <StepIcon status={step.status} Icon={step.icon} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-lg font-semibold ${
                      isDone ? 'text-gray-500' :
                      step.status === 'running' ? 'text-gray-900' :
                      step.status === 'failed' ? 'text-red-600' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </p>
                    {step.status === 'running' && (
                      <p className="text-xs text-amber-600 mt-0.5">Procesando...</p>
                    )}
                    {step.status === 'failed' && (
                      <p className="text-xs text-red-500 mt-0.5 break-all">{step.error}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {isDone && step.ms != null && (
                      <span className="text-xs text-gray-400">{formatMs(step.ms)}</span>
                    )}
                    {isPending && (
                      <span className="text-xs text-gray-300">{step.estimate}</span>
                    )}
                    {step.status === 'running' && (
                      <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Result message */}
        {result && (
          <div className={`mt-4 rounded-xl border p-5 ${
            result.status === 'success'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            {result.status === 'success' ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
                <div>
                  <p className="font-medium text-green-900">Entorno creado</p>
                  <p className="text-sm text-green-700">
                    Entrando a tu entorno...
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-medium text-red-900 mb-1">No se pudo crear el entorno</p>
                <p className="text-sm text-red-700 mb-3">{result.error}</p>
                {result.rolledBack && (
                  <p className="text-xs text-red-500 mb-3">Todos los cambios fueron revertidos.</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setFormSubmitted(false);
                    setSteps(SETUP_STEPS.map(s => ({ ...s, status: 'pending', ms: null, error: null })));
                  }}
                  className="border-red-200 text-red-700 hover:bg-red-100"
                >
                  Intentar de nuevo
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
