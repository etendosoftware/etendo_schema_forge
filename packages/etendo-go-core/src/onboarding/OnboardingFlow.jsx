import { useState } from 'react';

/**
 * @param {{ steps: OnboardingStep[], config: OnboardingConfig }} props
 *
 * OnboardingStep: { id: string, component: React.ComponentType<StepProps> }
 * OnboardingConfig: {
 *   apiBase: string,
 *   localeCodes: string[],
 *   countryCodes: string[],
 *   defaultForm: object,
 *   brandLabel: string,
 * }
 *
 * StepProps: { config: OnboardingConfig, onNext: (data?) => void, onBack: () => void }
 *
 * Refactor target: move components from tools/app-shell/src/pages/OnboardingPage.jsx here.
 * Keep locale-specific constants (LOCALE_CODES, COUNTRY_CODES, defaultForm) in each
 * workspace's config object — do not hardcode them here.
 */
export function OnboardingFlow({ steps = [], config = {} }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [stepData, setStepData] = useState({});

  const currentStep = steps[stepIndex];
  if (!currentStep) return null;

  const StepComponent = currentStep.component;

  function handleNext(data) {
    if (data) setStepData(prev => ({ ...prev, [currentStep.id]: data }));
    setStepIndex(i => Math.min(i + 1, steps.length - 1));
  }

  function handleBack() {
    setStepIndex(i => Math.max(i - 1, 0));
  }

  return (
    <StepComponent
      config={config}
      stepData={stepData}
      onNext={handleNext}
      onBack={handleBack}
    />
  );
}
