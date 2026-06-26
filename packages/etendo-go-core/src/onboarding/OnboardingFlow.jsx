import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useUI } from '@etendosoftware/app-shell-core/i18n';
import { fetchAccount, fetchEnvironments, loginEnvironment, fetchOnboardingDraft, saveOnboardingDraft } from './api.js';
import { buildEnvironmentSessionStorage } from './state.js';
import { buildAppReturnToHref, getSafeReturnTo } from './oauthReturnTo.js';
import { trackOnboarding } from './tracking.js';

export function OnboardingFlow({ steps = [], config = {} }) {
  const ui = useUI();
  const [stepIndex, setStepIndex] = useState(-1); // -1 means verifying/loading initial state
  const [stepData, setStepData] = useState(() => config.defaultForm || {});
  const [token, setToken] = useState(() => localStorage.getItem('sf_platform_token'));
  const [accountName, setAccountName] = useState(null);
  const [draftNotice, setDraftNotice] = useState(false);
  const [environments, setEnvironments] = useState([]);
  const [loadingEnvs, setLoadingEnvs] = useState(false);

  const draftReadyRef = useRef(false);
  const lastSavedDraftRef = useRef(null);
  const apiBase = config.apiBase || '';

  const currentStep = steps[stepIndex];

  // Helper to jump to a specific step by id
  const goToStep = useCallback((stepId) => {
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx !== -1) {
      setStepIndex(idx);
    }
  }, [steps]);

  // Restore draft and set appropriate step index
  const restoreOnboardingDraft = useCallback(async (authToken) => {
    try {
      const draft = await fetchOnboardingDraft(fetch, apiBase, authToken);
      if (draft?.form && typeof draft.form === 'object') {
        const mergedForm = { ...config.defaultForm, ...draft.form };
        setStepData(mergedForm);
        setDraftNotice(true);
        const targetStep = draft.step === 2 ? 'company' : 'profile';
        goToStep(targetStep);
        lastSavedDraftRef.current = JSON.stringify({ step: draft.step, form: mergedForm });
      } else {
        goToStep('profile');
      }
    } catch (err) {
      console.warn('Failed to load onboarding draft', err);
      goToStep('profile');
    } finally {
      draftReadyRef.current = true;
    }
  }, [apiBase, goToStep]);

  // Route by environments list: 0 -> profile (restore draft), 1+ -> loginEnvironment and redirect
  const routeByEnvironments = useCallback(async (authToken) => {
    setLoadingEnvs(true);
    try {
      const envs = await fetchEnvironments(fetch, apiBase, authToken);
      setEnvironments(envs);
      if (stepIndex === -1) {
        if (envs.length === 0) {
          await restoreOnboardingDraft(authToken);
        } else {
          // Auto-login to first environment
          try {
            const env = envs[0];
            trackOnboarding(config, 'onboarding_environment_enter_submitted', {
              action: 'enter_environment',
              status: 'started',
            });
            const data = await loginEnvironment(fetch, apiBase, authToken, env);
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
            } else {
              trackOnboarding(config, 'onboarding_environment_enter_failed', {
                action: 'enter_environment',
                status: 'failed',
              });
              alert(ui('onboardingEnvironmentLoginFailed'));
            }
          } catch (loginErr) {
            console.warn('Auto-login to environment failed', loginErr);
            trackOnboarding(config, 'onboarding_environment_enter_failed', {
              action: 'enter_environment',
              status: 'failed',
            });
            alert(loginErr.userMessage || ui(loginErr.code || 'onboardingEnvironmentLoginFailed'));
          }
          goToStep('env-select');
        }
      }
    } catch (err) {
      console.error('Failed to load environments', err);
      if (stepIndex === -1) {
        goToStep('profile');
      }
    } finally {
      setLoadingEnvs(false);
    }
  }, [apiBase, restoreOnboardingDraft, goToStep, stepIndex]);

  // Initial token verification on mount
  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get('resetToken');
    if (resetToken) {
      goToStep('login');
      return;
    }

    const initialView = localStorage.getItem('sf_onboarding_initial_view');
    if (initialView) {
      localStorage.removeItem('sf_onboarding_initial_view');
    }

    const currentToken = localStorage.getItem('sf_platform_token');
    if (!currentToken) {
      goToStep(initialView === 'login' ? 'login' : 'register');
      return;
    }

    const promise = fetchAccount(fetch, apiBase, currentToken);
    if (promise && typeof promise.then === 'function') {
      promise
        .then(data => {
          setAccountName(data.name || data.email || null);
          routeByEnvironments(currentToken);
        })
        .catch(() => {
          localStorage.removeItem('sf_platform_token');
          localStorage.removeItem('sf_platform_auth_method');
          setToken(null);
          goToStep('register');
        });
    } else {
      // If mocked fetchAccount doesn't return a promise, default to registering
      goToStep('register');
    }
  }, []);

  // Debounced wizard draft autosave
  useEffect(() => {
    if (!currentStep || (currentStep.id !== 'profile' && currentStep.id !== 'company')) return undefined;
    if (!token || !draftReadyRef.current) return undefined;

    const currentStepNum = currentStep.id === 'company' ? 2 : 1;
    const draft = { step: currentStepNum, form: stepData };
    const serialized = JSON.stringify(draft);
    if (serialized === lastSavedDraftRef.current) return undefined;

    const hasUserContent = currentStepNum > 1 || Boolean(
      stepData.clientName?.trim() ||
      stepData.fiscalIdValue?.trim() ||
      stepData.address?.trim()
    );
    if (!hasUserContent && lastSavedDraftRef.current === null) return undefined;

    const timer = setTimeout(() => {
      lastSavedDraftRef.current = serialized;
      saveOnboardingDraft(fetch, apiBase, token, draft).catch(err => {
        console.warn('Failed to save onboarding draft', err);
        lastSavedDraftRef.current = null;
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [stepData, currentStep, token, apiBase]);

  // Handle register success: setup new state, redirect to profile
  const handleRegisterSuccess = (authToken, account) => {
    setToken(authToken);
    setAccountName(account?.name || account?.email || null);
    setStepData({
      ...config.defaultForm,
      fullName: account?.name || account?.email || '',
    });
    setDraftNotice(false);
    lastSavedDraftRef.current = null;
    draftReadyRef.current = true;
    goToStep('profile');
  };

  const handleStepDataChange = useCallback((newData) => {
    setStepData(prev => ({ ...prev, ...newData }));
  }, []);

  const handleNext = (data) => {
    if (data) {
      setStepData(prev => ({ ...prev, ...data }));
    }
    setStepIndex(i => Math.min(i + 1, steps.length - 1));
  };

  const handleBack = () => {
    setStepIndex(i => Math.max(i - 1, 0));
  };

  if (stepIndex === -1 || !currentStep) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2
          className="h-6 w-6 animate-spin text-gray-400"
          data-testid="Loader2__79cf84" />
      </div>
    );
  }

  const StepComponent = currentStep.component;

  return (
    <StepComponent
      config={config}
      stepData={stepData}
      onNext={handleNext}
      onBack={handleBack}
      onChange={handleStepDataChange}
      goToStep={goToStep}
      token={token}
      setToken={setToken}
      accountName={accountName}
      setAccountName={setAccountName}
      draftNotice={draftNotice}
      setDraftNotice={setDraftNotice}
      environments={environments}
      loadingEnvs={loadingEnvs}
      routeByEnvironments={routeByEnvironments}
      handleRegisterSuccess={handleRegisterSuccess}
    />
  );
}

export default OnboardingFlow;
