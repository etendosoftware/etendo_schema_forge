import React, { useState, useEffect } from 'react';
import { Loader2, Building2, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@etendosoftware/app-shell-core/components/ui/button';
import { useUI, useLocaleSwitch } from '@etendosoftware/app-shell-core/i18n';
import { loginEnvironment, fetchEnvironments } from '../api.js';
import { buildEnvironmentSessionStorage } from '../state.js';
import { buildAppReturnToHref, getSafeReturnTo } from '../oauthReturnTo.js';
import { trackOnboarding } from '../tracking.js';
import { PageHeader } from '../components/PageHeader.jsx';
import { EnterEnvironmentButtonContent } from '../components/EnterEnvironmentButtonContent.jsx';
import { OnboardingLanguageSelect } from '../components/OnboardingLanguageSelect.jsx';

export function EnvSelectStep({ config, stepData, onNext, onBack, goToStep, token, setToken, accountName, setAccountName, environments = [], loadingEnvs = false, routeByEnvironments }) {
  const ui = useUI();
  const { locale, setLocale } = useLocaleSwitch();
  const [loggingIn, setLoggingIn] = useState(null);
  const apiBase = config.apiBase || '';

  const handleLogout = () => {
    trackOnboarding(config, 'onboarding_auth_logout', {
      action: 'logout',
      status: 'success',
    });
    localStorage.removeItem('sf_platform_token');
    localStorage.removeItem('sf_platform_auth_method');
    if (setToken) setToken(null);
    if (setAccountName) setAccountName(null);
    if (goToStep) goToStep('register');
  };

  const loginToEnvironment = async (env) => {
    trackOnboarding(config, 'onboarding_environment_enter_submitted', {
      action: 'enter_environment',
      status: 'started',
    });
    setLoggingIn(env.clientId);
    try {
      const data = await loginEnvironment(fetch, apiBase, token, env);
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

        trackOnboarding(config, 'onboarding_environment_enter_succeeded', {
          action: 'enter_environment',
          status: 'success',
        });
        window.location.href = buildAppReturnToHref(
          getSafeReturnTo(window.location.search),
          window.location.pathname
        );
        return;
      }
      trackOnboarding(config, 'onboarding_environment_enter_failed', {
        action: 'enter_environment',
        status: 'failed',
      });
      alert(ui('onboardingEnvironmentLoginFailed'));
    } catch (err) {
      trackOnboarding(config, 'onboarding_environment_enter_failed', {
        action: 'enter_environment',
        status: 'failed',
      });
      alert(err.userMessage || ui(err.code || 'onboardingEnvironmentLoginFailed'));
    } finally {
      setLoggingIn(null);
    }
  };

  const handleRefresh = () => {
    if (routeByEnvironments) {
      routeByEnvironments(token);
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

  const renderEnvironmentListContent = () => {
    if (loadingEnvs) {
      return (
        <div className="flex justify-center py-16">
          <Loader2
            className="h-6 w-6 animate-spin text-gray-400"
            data-testid="Loader2__79cf84" />
        </div>
      );
    }

    if (environments.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-gray-300" data-testid="Building2__79cf84" />
          </div>
          <p className="text-lg font-medium text-gray-900 mb-1">{ui('onboardingNoEnvironments')}</p>
          <p className="text-gray-500 text-sm mb-6">{ui('onboardingCreateFirstEnvironment')}</p>
          <Button
            onClick={() => { if (goToStep) goToStep('profile'); }}
            className="bg-amber-400 hover:bg-amber-500 text-white"
            data-testid="Button__79cf84">
            <Plus className="h-4 w-4 mr-1" data-testid="Plus__79cf84" /> {ui('onboardingCreateEnvironment')}
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
                  <Building2 className="h-5 w-5 text-amber-600" data-testid="Building2__79cf84" />
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
                  data-testid="EnterEnvironmentButtonContent__79cf84" />
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
        brandLabel={config.brandLabel || 'Etendo GO'}
        data-testid="PageHeader__79cf84" />
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
                onClick={handleRefresh}
                disabled={loadingEnvs}
                className="text-gray-500"
                data-testid="Button__79cf84">
                <RefreshCw
                  className={`h-4 w-4 ${loadingEnvs ? 'animate-spin' : ''}`}
                  data-testid="RefreshCw__79cf84" />
              </Button>
              <Button
                onClick={() => { if (goToStep) goToStep('profile'); }}
                className="bg-amber-400 hover:bg-amber-500 text-white"
                data-testid="Button__79cf84">
                <Plus className="h-4 w-4 mr-1" data-testid="Plus__79cf84" /> {ui('onboardingNewEnvironment')}
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

export default EnvSelectStep;
