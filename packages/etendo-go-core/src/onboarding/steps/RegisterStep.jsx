import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserPlus, Mail, Lock, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { Button } from '@etendosoftware/app-shell-core/components/ui/button';
import { useUI, useLocaleSwitch } from '@etendosoftware/app-shell-core/i18n';
import { registerAccount, loginWithSsoProvider } from '../api.js';
import { getConfiguredSsoProviders, renderSsoProviderButton } from '../sso.js';
import { getPasswordChecks, isStrongPassword, PASSWORD_RULES } from '../passwordPolicy.js';
import { trackOnboarding } from '../tracking.js';
import { AuthShell } from '../components/AuthShell.jsx';
import { AuthField } from '../components/AuthField.jsx';
import { AuthSsoOptions } from '../components/AuthSsoOptions.jsx';
import { OnboardingLanguageSelect } from '../components/OnboardingLanguageSelect.jsx';

const AUTH_FEATURE_KEYS = ['onboardingAuthFeatureNoCard', 'onboardingAuthFeatureTrial', 'onboardingAuthFeatureInstantAccess'];

export function RegisterStep({ config, stepData, onNext, onBack, goToStep, setToken, setAccountName, handleRegisterSuccess }) {
  const ui = useUI();
  const { locale, setLocale } = useLocaleSwitch();

  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [registerError, setRegisterError] = useState(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const [ssoError, setSsoError] = useState(null);
  const [ssoLoadingProvider, setSsoLoadingProvider] = useState(null);
  const registerSsoButtonRef = useRef(null);

  const SSO_PROVIDERS = getConfiguredSsoProviders();
  const apiBase = config.apiBase || '';

  const registerPasswordChecks = getPasswordChecks(registerForm.password);
  const registerPasswordStrong = isStrongPassword(registerForm.password);
  const passwordRuleLabels = {
    minLength: 'onboardingPasswordReqMinLength',
    uppercase: 'onboardingPasswordReqUppercase',
    lowercase: 'onboardingPasswordReqLowercase',
    number: 'onboardingPasswordReqNumber',
    special: 'onboardingPasswordReqSpecial',
  };

  const handleAuthSuccess = useCallback((token, account, { route = true, authMethod = 'password' } = {}) => {
    localStorage.setItem('sf_platform_token', token);
    localStorage.setItem('sf_platform_auth_method', authMethod);
    if (setToken) setToken(token);
    if (setAccountName) setAccountName(account?.name || account?.email || null);
    setShowRegisterPassword(false);
    setSsoError(null);
    setSsoLoadingProvider(null);
    if (route && handleRegisterSuccess) {
      handleRegisterSuccess(token, account);
    }
  }, [setToken, setAccountName, handleRegisterSuccess]);

  const handleSsoProviderLogin = useCallback(async (provider, payload) => {
    trackOnboarding(config, 'onboarding_auth_submitted', {
      action: 'sso',
      provider,
      status: 'started',
    });
    setSsoError(null);
    setRegisterError(null);
    setSsoLoadingProvider(provider);
    try {
      const data = await loginWithSsoProvider(fetch, apiBase, provider, payload);
      if (data.token) {
        trackOnboarding(config, 'onboarding_auth_succeeded', {
          action: 'sso',
          provider,
          status: 'success',
        });
        handleAuthSuccess(data.token, data.account, { authMethod: 'sso' });
      } else {
        trackOnboarding(config, 'onboarding_auth_failed', {
          action: 'sso',
          provider,
          status: 'failed',
        });
        setSsoError(ui('onboardingSsoFailed'));
      }
    } catch (err) {
      trackOnboarding(config, 'onboarding_auth_failed', {
        action: 'sso',
        provider,
        status: 'failed',
      });
      setSsoError(err.userMessage || ui(err.code || 'onboardingSsoFailed'));
    } finally {
      setSsoLoadingProvider(null);
    }
  }, [handleAuthSuccess, ui, apiBase, config]);

  useEffect(() => {
    if (!registerSsoButtonRef.current || !SSO_PROVIDERS.length) {
      return undefined;
    }
    let cancelled = false;
    const container = registerSsoButtonRef.current;
    container.replaceChildren();
    Promise.all(SSO_PROVIDERS.map((provider) => {
      const providerContainer = document.createElement('div');
      container.appendChild(providerContainer);
      return renderSsoProviderButton(provider, providerContainer, {
        onCredential: (providerId, payload) => {
          if (!cancelled) {
            handleSsoProviderLogin(providerId, payload);
          }
        },
        onError: (error) => {
          if (!cancelled) {
            setSsoError(error.userMessage || ui(error.code || 'onboardingSsoFailed'));
          }
        },
      });
    })).catch((error) => {
      if (!cancelled) {
        setSsoError(error.userMessage || ui(error.code || 'onboardingSsoFailed'));
      }
    });
    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [handleSsoProviderLogin, ui, SSO_PROVIDERS.length]);

  const handleRegister = async (e) => {
    e.preventDefault();
    trackOnboarding(config, 'onboarding_auth_submitted', {
      action: 'register',
      status: 'started',
    });
    setRegisterError(null);
    setRegisterLoading(true);
    try {
      const data = await registerAccount(fetch, apiBase, {
        ...registerForm,
        language: locale || config.defaultForm?.language || 'es_ES',
      });
      if (data.token) {
        trackOnboarding(config, 'onboarding_auth_succeeded', {
          action: 'register',
          status: 'success',
        });
        handleAuthSuccess(data.token, data.account);
      } else {
        trackOnboarding(config, 'onboarding_auth_failed', {
          action: 'register',
          status: 'failed',
        });
        setRegisterError(ui('onboardingRegisterFailed'));
      }
    } catch (err) {
      trackOnboarding(config, 'onboarding_auth_failed', {
        action: 'register',
        status: 'failed',
      });
      setRegisterError(err.code === 'WEAK_PASSWORD'
        ? ui('onboardingWeakPassword')
        : (err.userMessage || ui(err.code || 'onboardingConnectionError')));
    } finally {
      setRegisterLoading(false);
    }
  };

  const setOnboardingLocale = (nextLocale) => {
    if (setLocale) setLocale(nextLocale);
  };

  const languageOptions = (config.localeCodes || ['es_ES', 'en_US']).map((code) => ({
    value: code,
    label: code.startsWith('es') ? ui('onboardingLanguageSpanish') : ui('onboardingLanguageEnglish'),
  }));

  const localeControl = setLocale ? (
    <OnboardingLanguageSelect
      label={ui('language')}
      locale={locale}
      onChange={setOnboardingLocale}
      options={languageOptions}
      data-testid="OnboardingLanguageSelect__79cf84" />
  ) : null;

  const authFeatureLabels = AUTH_FEATURE_KEYS.map((key) => ui(key));

  return (
    <AuthShell
      switchPrompt={ui('onboardingSwitchToLoginPrompt')}
      switchAction={ui('onboardingSwitchToLoginAction')}
      switchTestId="action-switch-to-login"
      onSwitch={() => {
        setRegisterError(null);
        setSsoError(null);
        setShowRegisterPassword(false);
        if (goToStep) goToStep('login');
      }}
      brandLabel={config.brandLabel || 'Etendo GO'}
      headerContent={localeControl}
      marketingTitle={ui('onboardingMarketingTitle')}
      marketingDescription={ui('onboardingMarketingDescription')}
      featureLabels={authFeatureLabels}
      data-testid="AuthShell__79cf84">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-[-0.06em] text-slate-900 sm:text-[2.7rem] sm:leading-[1.04]">
          {ui('onboardingRegisterTitle')}
        </h1>
        <p className="mt-3 text-base text-slate-600 sm:text-xl">
          {ui('onboardingRegisterSubtitle')}
        </p>
      </div>
      <AuthSsoOptions
        providers={SSO_PROVIDERS}
        buttonRef={registerSsoButtonRef}
        error={ssoError}
        loading={Boolean(ssoLoadingProvider)}
        label={ui('onboardingSsoDivider')}
        loadingLabel={ui('onboardingSsoSigningIn')}
        data-testid="AuthSsoOptions__79cf84" />
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
          data-testid="AuthField__79cf84" />

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
          data-testid="AuthField__79cf84" />

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
              {showRegisterPassword ? <EyeOff className="h-5 w-5" data-testid="EyeOff__79cf84" /> : <Eye className="h-5 w-5" data-testid="Eye__79cf84" />}
            </button>
          )}
          data-testid="AuthField__79cf84" />

        {registerForm.password && (
          <ul
            data-testid="register-password-requirements"
            className="space-y-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
          >
            <li className="mb-1 font-medium text-slate-600">
              {ui('onboardingPasswordRequirementsTitle')}
            </li>
            {PASSWORD_RULES.map(rule => {
              const met = registerPasswordChecks[rule];
              return (
                <li
                  key={rule}
                  data-testid={`register-password-rule-${rule}`}
                  data-met={met ? 'true' : 'false'}
                  className={`flex items-center gap-2 ${met ? 'text-emerald-600' : 'text-slate-400'}`}
                >
                  {met
                    ? <Check className="h-4 w-4 shrink-0" data-testid="Check__79cf84" />
                    : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />}
                  <span>{ui(passwordRuleLabels[rule])}</span>
                </li>
              );
            })}
          </ul>
        )}

        {registerError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {registerError}
          </div>
        )}

        <Button
          type="submit"
          data-testid="action-register-submit"
          disabled={registerLoading || !registerPasswordStrong}
          className="h-12 w-full rounded-2xl bg-gray-900 text-base font-medium text-white hover:bg-gray-800"
        >
          {registerLoading
            ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" data-testid="Loader2__79cf84" />{ui('onboardingCreatingAccount')}</>
            : ui('onboardingCreateAccountAction')}
        </Button>
      </form>
    </AuthShell>
  );
}

export default RegisterStep;
