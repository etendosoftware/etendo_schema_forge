/**
 * coreSteps — the built-in steps shared across all locale workspaces.
 *
 * Refactor guide (move from tools/app-shell/src/pages/OnboardingPage.jsx):
 *
 *   loginStep     ← auth tab (login form + SSO) from OnboardingPage
 *   registerStep  ← register tab (signup form + password policy) from OnboardingPage
 *   envSelectStep ← environment / org selection step from OnboardingPage
 *
 * Each step file exports: { id, component }
 * The component receives: { config, stepData, onNext, onBack }
 */

// Placeholders — replace with real imports as you move components over.
const loginStep = {
  id: 'login',
  component: null, // TODO: import LoginStep from './LoginStep.jsx'
};

const registerStep = {
  id: 'register',
  component: null, // TODO: import RegisterStep from './RegisterStep.jsx'
};

const envSelectStep = {
  id: 'env-select',
  component: null, // TODO: import EnvSelectStep from './EnvSelectStep.jsx'
};

export const coreSteps = [loginStep, registerStep, envSelectStep];
