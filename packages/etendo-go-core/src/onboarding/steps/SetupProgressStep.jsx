import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Check, Sparkles, Building2, Settings } from 'lucide-react';
import { useUI } from '@etendosoftware/app-shell-core/i18n';
import { runOnboardingStream, fetchEnvironments, loginEnvironment } from '../api.js';
import { initialSetupSteps, applyProgressMessage, buildEnvironmentSessionStorage } from '../state.js';
import { buildAppReturnToHref, getSafeReturnTo } from '../oauthReturnTo.js';
import { trackOnboarding } from '../tracking.js';
import { SetupProgressShell } from '../components/SetupProgressShell.jsx';
import { SetupProgressCard } from '../components/SetupProgressCard.jsx';
import { Button } from '@etendosoftware/app-shell-core/components/ui/button';

export function SetupProgressStep({ config, stepData, onNext, onBack, goToStep, token, routeByEnvironments }) {
  const ui = useUI();
  const [steps, setSteps] = useState(() => initialSetupSteps());
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const maxSetupProgressRef = useRef(0);
  const hasStartedRef = useRef(false);

  const apiBase = config.apiBase || '';

  const loginToEnvironment = useCallback(async (env, { requireReadiness = false } = {}) => {
    trackOnboarding(config, 'onboarding_environment_enter_submitted', {
      action: 'enter_environment',
      status: 'started',
    });
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

        if (requireReadiness && config.checkReadiness) {
          const readiness = await config.checkReadiness(fetch, apiBase, data.token);
          if (!readiness.ready) {
            trackOnboarding(config, 'onboarding_environment_enter_failed', {
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
      setResult({ status: 'failed', error: ui('onboardingEnvironmentLoginFailed') });
    } catch (err) {
      trackOnboarding(config, 'onboarding_environment_enter_failed', {
        action: 'enter_environment',
        status: 'failed',
      });
      setResult({ status: 'failed', error: err.userMessage || ui(err.code || 'onboardingEnvironmentLoginFailed') });
    }
  }, [apiBase, config, token, ui]);

  const runOnboarding = useCallback(async () => {
    trackOnboarding(config, 'onboarding_run_started', {
      action: 'create_environment',
      status: 'started',
    });
    setRunning(true);
    setResult(null);
    setSteps(initialSetupSteps());
    maxSetupProgressRef.current = 0;

    const formPayload = {
      clientName: stepData.clientName,
      address: stepData.address,
      countryCode: stepData.countryCode || config.defaultForm?.countryCode || '',
      language: stepData.language || config.defaultForm?.language || '',
      currency: config.defaultForm?.currency || '',
    };

    let succeeded = false;
    try {
      await runOnboardingStream(fetch, apiBase, token, formPayload, (msg) => {
        if (msg.type === 'result') {
          const resultObj = {
            status: msg.success ? 'success' : 'failed',
            error: msg.success ? null : msg.message,
          };
          setResult(resultObj);
          if (msg.success) {
            trackOnboarding(config, 'onboarding_run_succeeded', {
              action: 'create_environment',
              status: 'success',
            });
            succeeded = true;
          } else {
            trackOnboarding(config, 'onboarding_run_failed', {
              action: 'create_environment',
              status: 'failed',
            });
          }
        } else if (msg.type === 'progress' && msg.step) {
          setSteps(prev => applyProgressMessage(prev, msg));
        }
      });
    } catch (err) {
      trackOnboarding(config, 'onboarding_run_failed', {
        action: 'create_environment',
        status: 'failed',
      });
      setResult({ status: 'failed', error: err.userMessage || ui(err.code || 'onboardingGenericError') });
    } finally {
      setRunning(false);
      if (succeeded) {
        // Fetch environments and auto-login to the newly created one
        const retryLogin = async (attempts = 3, delay = 2000) => {
          for (let i = 0; i < attempts; i++) {
            await new Promise(r => setTimeout(r, delay));
            try {
              const envs = await fetchEnvironments(fetch, apiBase, token);
              if (envs.length > 0) {
                loginToEnvironment(envs[0], { requireReadiness: true });
                return;
              }
            } catch (err) {
              // retry
            }
          }
          if (routeByEnvironments) {
            await routeByEnvironments(token);
          } else if (goToStep) {
            goToStep('env-select');
          }
        };
        retryLogin();
      }
    }
  }, [apiBase, config, stepData, token, ui, loginToEnvironment, goToStep, routeByEnvironments]);

  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      runOnboarding();
    }
  }, [runOnboarding]);

  const activeSetupStep = steps.find((step) => step.status === 'running')?.name;
  const readinessFailures = result?.readinessFailures || [];
  const readinessFailureText = readinessFailures.map((failure) => ui(failure.key)).join(' ');

  let setupProgressState;
  if (result?.status === 'success') {
    setupProgressState = {
      progress: 100,
      title: ui('onboardingSuccessTitle'),
      description: ui('onboardingSuccessDescription'),
      leading: <Check
        className="h-8 w-8 text-[#54b56a]"
        strokeWidth={3}
        data-testid="Check__79cf84" />,
      statusLabel: ui('onboardingCompleted'),
      success: true,
    };
  } else if (result?.status === 'failed') {
    const errorMsg = result.error || (readinessFailures.length > 0 ? ui('onboardingReadinessFailed', { reasons: readinessFailureText }) : ui('onboardingGenericError'));
    setupProgressState = {
      progress: maxSetupProgressRef.current,
      title: ui('onboardingGenericError'),
      description: errorMsg === ui('onboardingGenericError') ? '' : errorMsg,
      leading: <span className="text-2xl">⚠️</span>,
      statusLabel: ui('failed'),
      success: false,
    };
  } else if (activeSetupStep === 'client') {
    setupProgressState = {
      progress: 35,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingActivatingDescription'),
      leading: <Sparkles className="h-8 w-8 text-slate-400" data-testid="Sparkles__79cf84" />,
      statusLabel: ui('loading'),
      success: false,
    };
  } else if (activeSetupStep === 'organization') {
    setupProgressState = {
      progress: 50,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingConfiguringDescription'),
      leading: <Building2 className="h-8 w-8 text-slate-400" data-testid="Building2__79cf84" />,
      statusLabel: ui('loading'),
      success: false,
    };
  } else if (activeSetupStep === 'dataset') {
    setupProgressState = {
      progress: 65,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingDataDescription'),
      leading: <Building2 className="h-8 w-8 text-slate-400" data-testid="Building2__79cf84" />,
      statusLabel: ui('loading'),
      success: false,
    };
  } else if (activeSetupStep === 'sequences') {
    setupProgressState = {
      progress: 85,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingSequencesDescription'),
      leading: <Settings className="h-8 w-8 text-slate-400" data-testid="Settings__79cf84" />,
      statusLabel: ui('loading'),
      success: false,
    };
  } else if (activeSetupStep === 'finalize') {
    setupProgressState = {
      progress: 92,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingFinishingDescription'),
      leading: <Check
        className="h-8 w-8 text-slate-400"
        strokeWidth={3}
        data-testid="Check__79cf84" />,
      statusLabel: ui('loading'),
      success: false,
    };
  } else if (running) {
    setupProgressState = {
      progress: 15,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingConfiguringDescription'),
      leading: <Settings className="h-8 w-8 text-slate-400" data-testid="Settings__79cf84" />,
      statusLabel: ui('loading'),
      success: false,
    };
  } else {
    setupProgressState = {
      progress: 20,
      title: ui('onboardingPreparingTitle'),
      description: ui('onboardingPreparingTaxesDescription'),
      leading: config.countryFlag || '🌍',
      statusLabel: ui('loading'),
      success: false,
    };
  }

  // Keep progress bar monotonic
  if (!setupProgressState.success && result?.status !== 'failed') {
    setupProgressState.progress = Math.max(setupProgressState.progress, maxSetupProgressRef.current);
    maxSetupProgressRef.current = setupProgressState.progress;
  }

  return (
    <SetupProgressShell data-testid="SetupProgressShell__79cf84">
      <div className="w-full flex flex-col items-center gap-6">
        <SetupProgressCard {...setupProgressState} data-testid="SetupProgressCard__79cf84" />
        {result?.status === 'failed' && (
          <Button
            onClick={onBack}
            className="bg-gray-900 text-white rounded-2xl h-12 px-6 hover:bg-gray-800"
          >
            {ui('back')}
          </Button>
        )}
      </div>
    </SetupProgressShell>
  );
}

export default SetupProgressStep;
