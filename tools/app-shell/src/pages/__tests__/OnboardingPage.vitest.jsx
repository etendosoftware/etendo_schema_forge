import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const localStorageMock = (() => {
  let store = {};
  return {
    clear: vi.fn(() => {
      store = {};
    }),
    getItem: vi.fn((key) => store[key] ?? null),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

Object.defineProperty(globalThis, 'alert', {
  configurable: true,
  value: vi.fn(),
});

const localeSwitchMock = vi.hoisted(() => ({
  locale: 'en_US',
  setLocale: vi.fn(),
}));

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key} ${JSON.stringify(params)}`;
    return key;
  },
  useLocaleSwitch: () => localeSwitchMock,
  useMenuLabel: () => (key) => key,
}));

vi.mock('../../i18n/index.js', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key} ${JSON.stringify(params)}`;
    return key;
  },
  useLocaleSwitch: () => localeSwitchMock,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@etendosoftware/app-shell-core/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key} ${JSON.stringify(params)}`;
    return key;
  },
  useLocaleSwitch: () => localeSwitchMock,
  useMenuLabel: () => (key) => key,
}));

// Mock onboarding API
vi.mock('../../../../../packages/etendo-go-core/src/onboarding/api.js', () => ({
  ONBOARDING_ERROR_CODES: {},
  changePassword: vi.fn(),
  confirmPasswordReset: vi.fn(),
  fetchAccount: vi.fn(),
  fetchEnvironments: vi.fn().mockResolvedValue([]),
  fetchOnboardingDraft: vi.fn().mockResolvedValue(null),
  saveOnboardingDraft: vi.fn().mockResolvedValue({}),
  loginAccount: vi.fn(),
  loginEnvironment: vi.fn(),
  loginWithSsoProvider: vi.fn(),
  registerAccount: vi.fn(),
  requestPasswordReset: vi.fn(),
  runOnboardingStream: vi.fn(),
}));

// One provider is returned so the module-level SSO_PROVIDERS list (evaluated at
// import time) is non-empty and the SSO credential callback can be exercised.
vi.mock('../../../../../packages/etendo-go-core/src/onboarding/sso.js', () => ({
  getConfiguredSsoProviders: vi.fn(() => [{ id: 'google', clientId: 'test-client-id' }]),
  renderSsoProviderButton: vi.fn(() => Promise.resolve()),
}));

// Mock onboarding readiness
vi.mock('../onboarding/onboardingReadiness.js', () => ({
  checkSalesInvoiceReadiness: vi.fn().mockResolvedValue({ ready: true }),
}));

// Mock onboarding state
vi.mock('../../../../../packages/etendo-go-core/src/onboarding/state.js', () => ({
  applyProgressMessage: (prev, message) =>
    prev.map((step) => (step.name === message.step ? { ...step, status: message.status } : step)),
  buildEnvironmentSessionStorage: () => ({}),
  initialSetupSteps: () => [
    { name: 'setup', status: 'pending' },
    { name: 'client', status: 'pending' },
    { name: 'organization', status: 'pending' },
    { name: 'dataset', status: 'pending' },
    { name: 'finalize', status: 'pending' },
  ],
  isCompanyStepValid: () => true,
  isProfileStepValid: () => true,
}));

vi.mock('../../lib/observability.js', () => ({
  track: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

vi.mock('@etendosoftware/app-shell-core/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@etendosoftware/app-shell-core/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock('@etendosoftware/app-shell-core/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

import OnboardingPage from '../OnboardingPage.jsx';
import {
  confirmPasswordReset,
  fetchAccount,
  fetchEnvironments,
  fetchOnboardingDraft,
  loginAccount,
  loginEnvironment,
  loginWithSsoProvider,
  registerAccount,
  requestPasswordReset,
  runOnboardingStream,
  saveOnboardingDraft,
} from '../../../../../packages/etendo-go-core/src/onboarding/api.js';
import { renderSsoProviderButton } from '../../../../../packages/etendo-go-core/src/onboarding/sso.js';
import { checkSalesInvoiceReadiness } from '../onboarding/onboardingReadiness.js';
import { track } from '../../lib/observability.js';

describe('OnboardingPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    localeSwitchMock.locale = 'en_US';
    localeSwitchMock.setLocale.mockReset();
    fetchAccount.mockReset();
    fetchEnvironments.mockReset();
    fetchEnvironments.mockResolvedValue([]);
    fetchOnboardingDraft.mockReset();
    fetchOnboardingDraft.mockResolvedValue(null);
    saveOnboardingDraft.mockReset();
    saveOnboardingDraft.mockResolvedValue({});
    requestPasswordReset.mockReset();
    confirmPasswordReset.mockReset();
    loginAccount.mockReset();
    loginEnvironment.mockReset();
    loginWithSsoProvider.mockReset();
    registerAccount.mockReset();
    runOnboardingStream.mockReset();
    checkSalesInvoiceReadiness.mockReset();
    checkSalesInvoiceReadiness.mockResolvedValue({ ready: true });
    window.history.replaceState(null, '', '/onboarding');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<OnboardingPage />);
    expect(container).toBeTruthy();
  });

  it('shows loading spinner when view is null (initial check)', () => {
    // No platform token, so it will go to register view immediately,
    // but briefly passes through null. Since no token, it jumps to register.
    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);
    // Should immediately show the register view since no token
    expect(screen.getByText('onboardingRegisterTitle')).toBeInTheDocument();
  });

  it('shows register view when no platform token exists', () => {
    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);
    expect(screen.getByText('onboardingRegisterTitle')).toBeInTheDocument();
    expect(screen.getByText('onboardingRegisterSubtitle')).toBeInTheDocument();
  });

  it('lands on the login view (consuming the one-shot flag) instead of register', () => {
    localStorage.removeItem('sf_platform_token');
    localStorage.setItem('sf_onboarding_initial_view', 'login');
    render(<OnboardingPage />);
    expect(screen.getByText('onboardingLoginTitle')).toBeInTheDocument();
    // Flag is consumed so a later visit returns to the default register view.
    expect(localStorage.getItem('sf_onboarding_initial_view')).toBeNull();
  });

  it('shows the password-changed notice on the login view and consumes the one-shot flag', () => {
    localStorage.removeItem('sf_platform_token');
    localStorage.setItem('sf_onboarding_initial_view', 'login');
    localStorage.setItem('sf_onboarding_notice', 'password-changed');
    render(<OnboardingPage />);
    expect(screen.getByText('onboardingLoginTitle')).toBeInTheDocument();
    expect(screen.getByTestId('login-notice')).toHaveTextContent('onboardingPasswordChangedNotice');
    // Flag is consumed so a later visit does not show the notice again.
    expect(localStorage.getItem('sf_onboarding_notice')).toBeNull();
  });

  it('does not render the login notice when the notice flag is absent', () => {
    localStorage.removeItem('sf_platform_token');
    localStorage.setItem('sf_onboarding_initial_view', 'login');
    render(<OnboardingPage />);
    expect(screen.getByText('onboardingLoginTitle')).toBeInTheDocument();
    expect(screen.queryByTestId('login-notice')).not.toBeInTheDocument();
  });

  it('renders register form fields', () => {
    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);
    // Form has name, email, password fields
    expect(screen.getByText('onboardingNameLabel')).toBeInTheDocument();
    expect(screen.getByText('onboardingEmailLabel')).toBeInTheDocument();
    expect(screen.getByText('onboardingPasswordLabel')).toBeInTheDocument();
  });

  it('shows the create account button', () => {
    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);
    expect(screen.getByText('onboardingCreateAccountAction')).toBeInTheDocument();
  });

  it('renders the brand name', () => {
    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);
    expect(screen.getByText('onboardingBrandName')).toBeInTheDocument();
  });

  it('shows switch to login prompt', () => {
    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);
    expect(screen.getByText('onboardingSwitchToLoginPrompt')).toBeInTheDocument();
    expect(screen.getByText('onboardingSwitchToLoginAction')).toBeInTheDocument();
  });

  it('switches between auth modes and toggles password visibility', () => {
    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    const registerPassword = screen.getByLabelText(/onboardingPasswordLabel/);
    expect(registerPassword).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByLabelText('onboardingShowPassword'));
    expect(registerPassword).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByTestId('action-switch-to-login'));
    expect(screen.getByText('onboardingLoginTitle')).toBeInTheDocument();
    const loginPassword = screen.getByLabelText(/onboardingPasswordLabel/);
    expect(loginPassword).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByLabelText('onboardingShowPassword'));
    expect(loginPassword).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByTestId('action-switch-to-register'));
    expect(screen.getByText('onboardingRegisterTitle')).toBeInTheDocument();
  });

  it('returns to register view when the stored platform token is invalid', async () => {
    localStorage.setItem('sf_platform_token', 'stale-platform-token');
    fetchAccount.mockRejectedValue(new Error('expired'));

    render(<OnboardingPage />);

    expect(await screen.findByText('onboardingRegisterTitle')).toBeInTheDocument();
    expect(localStorage.removeItem).toHaveBeenCalledWith('sf_platform_token');
  });

  it('falls back to create view when environment loading fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockRejectedValue(new Error('network down'));

    render(<OnboardingPage />);

    expect(await screen.findByText(/onboardingGreeting/)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Failed to load environments', expect.any(Error));
  });

  it('updates the setup language selector', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);

    render(<OnboardingPage />);

    const languageSelect = await screen.findByLabelText('language');
    fireEvent.change(languageSelect, { target: { value: 'es_ES' } });

    expect(languageSelect).toBeInTheDocument();
  });

  it('tracks registration submission and success without user-entered values', async () => {
    registerAccount.mockResolvedValue({
      token: 'platform-token',
      account: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.submit(screen.getByTestId('action-register-submit').closest('form'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_auth_submitted', {
        action: 'register',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'started',
        windowName: 'onboarding',
      });
      expect(track).toHaveBeenCalledWith('onboarding_auth_succeeded', {
        action: 'register',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'success',
        windowName: 'onboarding',
      });
    });

    const serializedCalls = JSON.stringify(track.mock.calls);
    expect(serializedCalls).not.toContain('Ada Lovelace');
    expect(serializedCalls).not.toContain('ada@example.com');
    expect(serializedCalls).not.toContain('platform-token');
  });

  it('sends the selected onboarding language when registering an account', async () => {
    registerAccount.mockResolvedValue({
      token: 'platform-token',
      account: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.submit(screen.getByTestId('action-register-submit').closest('form'));

    await waitFor(() => {
      expect(registerAccount).toHaveBeenCalledWith(expect.any(Function), '', expect.objectContaining({
        language: 'en_US',
      }));
    });
  });

  it('sends Spanish when Spanish is the active onboarding language', async () => {
    localeSwitchMock.locale = 'es_ES';
    registerAccount.mockResolvedValue({
      token: 'platform-token',
      account: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.submit(screen.getByTestId('action-register-submit').closest('form'));

    await waitFor(() => {
      expect(registerAccount).toHaveBeenCalledWith(expect.any(Function), '', expect.objectContaining({
        language: 'es_ES',
      }));
    });
  });

  it('tracks registration failures without user-entered values', async () => {
    registerAccount.mockResolvedValue({});

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.change(screen.getByLabelText(/onboardingNameLabel/), {
      target: { value: 'Secret Register Name' },
    });
    fireEvent.change(screen.getByLabelText(/onboardingEmailLabel/), {
      target: { value: 'secret-register@example.com' },
    });
    fireEvent.submit(screen.getByTestId('action-register-submit').closest('form'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_auth_failed', {
        action: 'register',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });

    expect(screen.getByText('onboardingRegisterFailed')).toBeInTheDocument();
    const serializedCalls = JSON.stringify(track.mock.calls);
    expect(serializedCalls).not.toContain('Secret Register Name');
    expect(serializedCalls).not.toContain('secret-register@example.com');
  });

  it('tracks registration exceptions', async () => {
    registerAccount.mockRejectedValue({ code: 'onboardingConnectionError' });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.submit(screen.getByTestId('action-register-submit').closest('form'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_auth_failed', {
        action: 'register',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });
    expect(screen.getByText('onboardingConnectionError')).toBeInTheDocument();
  });

  it('tracks onboarding setup step navigation', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);

    render(<OnboardingPage />);

    const continueButton = await screen.findByText('onboardingContinueAction');
    fireEvent.click(continueButton);

    expect(track).toHaveBeenCalledWith('onboarding_setup_step_completed', {
      action: 'continue',
      component: 'OnboardingPage',
      source: 'onboarding',
      status: 'success',
      type: 'profile',
      windowName: 'onboarding',
    });
  });

  it('tracks setup step back and keeps company-form edits out of tracking payloads', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);

    render(<OnboardingPage />);

    fireEvent.change(await screen.findByLabelText(/onboardingFullNameLabel/), {
      target: { value: 'Private Setup Name' },
    });
    fireEvent.change(screen.getByLabelText(/onboardingCountryLabel/), {
      target: { value: 'ES' },
    });
    fireEvent.click(await screen.findByText('onboardingBusinessTypeFreelancer'));
    fireEvent.click(screen.getByText('onboardingContinueAction'));
    fireEvent.change(screen.getByLabelText(/onboardingAddressLabel/), {
      target: { value: 'Secret Street 123' },
    });
    fireEvent.change(screen.getByLabelText(/onboardingSectorLabel/), {
      target: { value: 'services' },
    });
    fireEvent.click(screen.getByText('back'));

    expect(track).toHaveBeenCalledWith('onboarding_setup_step_back', {
      action: 'back',
      component: 'OnboardingPage',
      source: 'onboarding',
      status: 'success',
      type: 'company',
      windowName: 'onboarding',
    });
    expect(JSON.stringify(track.mock.calls)).not.toContain('Secret Street 123');
    expect(JSON.stringify(track.mock.calls)).not.toContain('Private Setup Name');
  });

  it('tracks login failures without credentials', async () => {
    loginAccount.mockResolvedValue({});

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByTestId('action-switch-to-login'));
    fireEvent.submit(screen.getByTestId('action-login-submit').closest('form'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_auth_submitted', {
        action: 'login',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'started',
        windowName: 'onboarding',
      });
      expect(track).toHaveBeenCalledWith('onboarding_auth_failed', {
        action: 'login',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });

    expect(JSON.stringify(track.mock.calls)).not.toContain('password');
  });

  it('tracks login success without credentials or platform token', async () => {
    loginAccount.mockResolvedValue({
      token: 'login-platform-token',
      account: { name: 'Secret Login Name', email: 'secret-login@example.com' },
    });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByTestId('action-switch-to-login'));
    fireEvent.change(screen.getByLabelText(/onboardingEmailLabel/), {
      target: { value: 'secret-login@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/onboardingPasswordLabel/), {
      target: { value: 'top-secret-password' },
    });
    fireEvent.submit(screen.getByTestId('action-login-submit').closest('form'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_auth_succeeded', {
        action: 'login',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'success',
        windowName: 'onboarding',
      });
    });

    const serializedCalls = JSON.stringify(track.mock.calls);
    expect(serializedCalls).not.toContain('secret-login@example.com');
    expect(serializedCalls).not.toContain('top-secret-password');
    expect(serializedCalls).not.toContain('login-platform-token');
  });

  it('stores the password auth method after a successful password login', async () => {
    loginAccount.mockResolvedValue({
      token: 'login-platform-token',
      account: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByTestId('action-switch-to-login'));
    fireEvent.submit(screen.getByTestId('action-login-submit').closest('form'));

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('sf_platform_auth_method', 'password');
    });
    expect(localStorage.getItem('sf_platform_auth_method')).toBe('password');
  });

  it('stores the password auth method after a successful registration', async () => {
    registerAccount.mockResolvedValue({
      token: 'platform-token',
      account: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.submit(screen.getByTestId('action-register-submit').closest('form'));

    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith('sf_platform_auth_method', 'password');
    });
    expect(localStorage.getItem('sf_platform_auth_method')).toBe('password');
  });

  it('stores the sso auth method after a successful SSO credential login', async () => {
    loginWithSsoProvider.mockResolvedValue({
      token: 'sso-platform-token',
      account: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    await waitFor(() => {
      expect(renderSsoProviderButton).toHaveBeenCalled();
    });
    const [, , callbacks] = renderSsoProviderButton.mock.calls[0];

    await act(async () => {
      callbacks.onCredential('google', { credential: 'sso-jwt' });
    });

    await waitFor(() => {
      expect(loginWithSsoProvider).toHaveBeenCalledWith(
        expect.any(Function), '', 'google', { credential: 'sso-jwt' },
      );
      expect(localStorage.setItem).toHaveBeenCalledWith('sf_platform_auth_method', 'sso');
    });
    expect(localStorage.getItem('sf_platform_auth_method')).toBe('sso');
  });

  it('tracks login exceptions', async () => {
    loginAccount.mockRejectedValue({ userMessage: 'Readable login failure' });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByTestId('action-switch-to-login'));
    fireEvent.submit(screen.getByTestId('action-login-submit').closest('form'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_auth_failed', {
        action: 'login',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });
    expect(screen.getByText('Readable login failure')).toBeInTheDocument();
  });

  it('submits forgot password requests with neutral success messaging', async () => {
    requestPasswordReset.mockResolvedValue({ success: true });

    localStorage.removeItem('sf_platform_token');
    render(<OnboardingPage />);

    fireEvent.click(screen.getByTestId('action-switch-to-login'));
    fireEvent.change(screen.getByLabelText(/onboardingEmailLabel/), {
      target: { value: 'reset@example.com' },
    });
    fireEvent.click(screen.getByText('onboardingForgotPasswordAction'));
    fireEvent.submit(screen.getByTestId('action-forgot-password-submit').closest('form'));

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith(expect.any(Function), '', 'reset@example.com');
    });
    expect(screen.getAllByText('onboardingResetEmailSent').length).toBeGreaterThan(0);
  });

  it('renders reset password from the reset token URL and handles success', async () => {
    confirmPasswordReset.mockResolvedValue({ success: true });
    window.history.replaceState(null, '', '/onboarding?resetToken=reset-token');

    render(<OnboardingPage />);

    fireEvent.change(screen.getByLabelText(/onboardingNewPasswordLabel/), {
      target: { value: 'new-secret' },
    });
    fireEvent.change(screen.getByLabelText(/onboardingConfirmPasswordLabel/), {
      target: { value: 'new-secret' },
    });
    fireEvent.submit(screen.getByTestId('action-reset-password-submit').closest('form'));

    await waitFor(() => {
      expect(confirmPasswordReset).toHaveBeenCalledWith(expect.any(Function), '', {
        token: 'reset-token',
        password: 'new-secret',
        confirmPassword: 'new-secret',
      });
    });
    expect(localStorage.removeItem).toHaveBeenCalledWith('sf_platform_token');
    expect(screen.getByText('onboardingResetPasswordSuccess')).toBeInTheDocument();
  });

  it('renders invalid or expired reset link errors', async () => {
    confirmPasswordReset.mockRejectedValue({ userMessage: 'Invalid or expired reset link' });
    window.history.replaceState(null, '', '/onboarding?resetToken=used-token');

    render(<OnboardingPage />);

    fireEvent.change(screen.getByLabelText(/onboardingNewPasswordLabel/), {
      target: { value: 'new-secret' },
    });
    fireEvent.change(screen.getByLabelText(/onboardingConfirmPasswordLabel/), {
      target: { value: 'new-secret' },
    });
    fireEvent.submit(screen.getByTestId('action-reset-password-submit').closest('form'));

    expect(await screen.findByText('Invalid or expired reset link')).toBeInTheDocument();
  });

  it('tracks setup back navigation from company step', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(await screen.findByText('back'));

    expect(track).toHaveBeenCalledWith('onboarding_setup_step_back', {
      action: 'back',
      component: 'OnboardingPage',
      source: 'onboarding',
      status: 'success',
      type: 'company',
      windowName: 'onboarding',
    });
  });

  it('tracks onboarding run success without company or fiscal values', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);
    runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
      onMessage({ type: 'result', success: true });
    });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.change(screen.getByLabelText(/onboardingCompanyNameLabel/), {
      target: { value: 'Secret Company' },
    });
    fireEvent.change(screen.getByLabelText(/onboardingFiscalIdLabel/), {
      target: { value: 'B12345678' },
    });
    fireEvent.click(screen.getByText('onboardingStartAction'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_run_started', {
        action: 'create_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'started',
        windowName: 'onboarding',
      });
      expect(track).toHaveBeenCalledWith('onboarding_run_succeeded', {
        action: 'create_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'success',
        windowName: 'onboarding',
      });
    });

    const serializedCalls = JSON.stringify(track.mock.calls);
    expect(serializedCalls).not.toContain('Secret Company');
    expect(serializedCalls).not.toContain('B12345678');
  });

  it('renders onboarding progress messages while tracking run start', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);
    runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
      onMessage({ type: 'progress', step: 'client', status: 'running' });
      return new Promise(() => {});
    });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(screen.getByText('onboardingStartAction'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_run_started', {
        action: 'create_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'started',
        windowName: 'onboarding',
      });
    });
    expect(screen.getByText('onboardingPreparingTitle')).toBeInTheDocument();
  });

  it('shows the company-data description while the dataset step runs', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);
    runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
      onMessage({ type: 'progress', step: 'dataset', status: 'running' });
      return new Promise(() => {});
    });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(screen.getByText('onboardingStartAction'));

    await waitFor(() => {
      expect(screen.getByText('onboardingPreparingDataDescription')).toBeInTheDocument();
    });
  });

  it('keeps the progress bar monotonic when an untracked step runs after a tracked one', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);
    let emit;
    runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
      emit = onMessage;
      onMessage({ type: 'progress', step: 'client', status: 'running' });
      return new Promise(() => {});
    });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(screen.getByText('onboardingStartAction'));

    // Tracked step: client → 35%.
    await waitFor(() => {
      expect(screen.getByText('onboardingPreparingActivatingDescription')).toBeInTheDocument();
      expect(screen.getByText('35%')).toBeInTheDocument();
    });

    // Client finishes; an untracked backend step (accounting) starts running.
    act(() => {
      emit({ type: 'progress', step: 'client', status: 'done' });
      emit({ type: 'progress', step: 'accounting', status: 'running' });
    });

    // Generic "configuring" description shows, but the bar holds at 35% (monotonic, never drops).
    await waitFor(() => {
      expect(screen.getByText('onboardingPreparingConfiguringDescription')).toBeInTheDocument();
      expect(screen.getByText('35%')).toBeInTheDocument();
    });
  });

  it('tracks onboarding run failures', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);
    runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
      onMessage({ type: 'result', success: false, message: 'failed' });
    });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(screen.getByText('onboardingStartAction'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_run_failed', {
        action: 'create_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });
  });

  it('tracks onboarding run exceptions', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);
    runOnboardingStream.mockRejectedValue({ code: 'onboardingGenericError' });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(screen.getByText('onboardingStartAction'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_run_failed', {
        action: 'create_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });
    expect(screen.getByText('onboardingGenericError')).toBeInTheDocument();
  });

  it('tracks environment entry success without environment identifiers', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['old-cache']),
        delete: vi.fn().mockResolvedValue(true),
      },
    });
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([
      { clientId: 'client-secret', clientName: 'Secret Client', orgName: 'Org', adminUser: 'admin' },
    ]);
    loginEnvironment.mockResolvedValue({ token: 'environment-token' });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_environment_enter_submitted', {
        action: 'enter_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'started',
        windowName: 'onboarding',
      });
      expect(track).toHaveBeenCalledWith('onboarding_environment_enter_succeeded', {
        action: 'enter_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'success',
        windowName: 'onboarding',
      });
    });

    const serializedCalls = JSON.stringify(track.mock.calls);
    expect(serializedCalls).not.toContain('client-secret');
    expect(serializedCalls).not.toContain('Secret Client');
    expect(serializedCalls).not.toContain('environment-token');
    expect(window.caches.delete).toHaveBeenCalledWith('old-cache');
  });

  it('tracks environment entry failures when login returns no token', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([
      { clientId: 'client-secret', clientName: 'Secret Client', orgName: 'Org', adminUser: 'admin' },
    ]);
    loginEnvironment.mockResolvedValue({});

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_environment_enter_failed', {
        action: 'enter_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });
    expect(globalThis.alert).toHaveBeenCalledWith('onboardingEnvironmentLoginFailed');
  });

  it('tracks environment entry exceptions', async () => {
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([
      { clientId: 'client-secret', clientName: 'Secret Client', orgName: 'Org', adminUser: 'admin' },
    ]);
    loginEnvironment.mockRejectedValue({ userMessage: 'Environment login exploded' });

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_environment_enter_failed', {
        action: 'enter_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });
    expect(globalThis.alert).toHaveBeenCalledWith('Environment login exploded');
  });

  it('keeps retrying environment discovery after a successful run before falling back', async () => {
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      if (delay === 2000) {
        queueMicrotask(callback);
        return 1;
      }
      return realSetTimeout(callback, delay, ...args);
    });
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments.mockResolvedValue([]);
    runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
      onMessage({ type: 'result', success: true });
    });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(screen.getByText('onboardingStartAction'));

    await waitFor(() => {
      expect(fetchEnvironments).toHaveBeenCalledTimes(5);
    });
    expect(await screen.findByText('onboardingSuccessTitle')).toBeInTheDocument();
  });

  it('tracks readiness failures after a successful onboarding run', async () => {
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
      if (delay === 2000) {
        queueMicrotask(callback);
        return 1;
      }
      return realSetTimeout(callback, delay, ...args);
    });
    localStorage.setItem('sf_platform_token', 'platform-token');
    fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
    fetchEnvironments
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { clientId: 'client-secret', clientName: 'Secret Client', orgName: 'Org', adminUser: 'admin' },
      ]);
    runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
      onMessage({ type: 'result', success: true });
    });
    loginEnvironment.mockResolvedValue({ token: 'environment-token' });
    checkSalesInvoiceReadiness.mockResolvedValue({
      ready: false,
      failures: [{ key: 'readinessReason' }],
    });

    render(<OnboardingPage />);

    fireEvent.click(await screen.findByText('onboardingContinueAction'));
    fireEvent.click(screen.getByText('onboardingStartAction'));

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_run_succeeded', {
        action: 'create_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'success',
        windowName: 'onboarding',
      });
    });

    await waitFor(() => {
      expect(track).toHaveBeenCalledWith('onboarding_environment_enter_failed', {
        action: 'enter_environment',
        component: 'OnboardingPage',
        source: 'onboarding',
        status: 'failed',
        windowName: 'onboarding',
      });
    });
    expect(screen.getByText(/onboardingReadinessFailed/)).toBeInTheDocument();
  });

  describe('draft recovery', () => {
    it('restores a saved draft on step 2 and shows the restored notice', async () => {
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      fetchOnboardingDraft.mockResolvedValue({
        step: 2,
        form: { clientName: 'Acme SL', fiscalIdValue: 'B123', fullName: 'Ana' },
      });

      render(<OnboardingPage />);

      // Step 2 (company step) is rendered directly with the draft values merged in.
      const companyInput = await screen.findByLabelText(/onboardingCompanyNameLabel/);
      expect(companyInput).toHaveValue('Acme SL');
      expect(screen.getByLabelText(/onboardingFiscalIdLabel/)).toHaveValue('B123');
      expect(screen.getByTestId('draft-restored-notice')).toHaveTextContent(
        'onboardingDraftRestoredNotice',
      );
      expect(fetchOnboardingDraft).toHaveBeenCalledWith(
        expect.any(Function), '', 'platform-token',
      );
    });

    it('starts a fresh wizard on step 1 without notice when no draft exists', async () => {
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      fetchOnboardingDraft.mockResolvedValue(null);

      render(<OnboardingPage />);

      // Step 1 (profile step) is the entry point.
      expect(await screen.findByLabelText(/onboardingFullNameLabel/)).toBeInTheDocument();
      expect(screen.getByText('onboardingContinueAction')).toBeInTheDocument();
      expect(screen.queryByTestId('draft-restored-notice')).not.toBeInTheDocument();
    });

    it('falls back to a fresh wizard when the draft fetch fails', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      fetchOnboardingDraft.mockRejectedValue(new Error('draft endpoint down'));

      render(<OnboardingPage />);

      expect(await screen.findByLabelText(/onboardingFullNameLabel/)).toBeInTheDocument();
      expect(screen.queryByTestId('draft-restored-notice')).not.toBeInTheDocument();
      expect(consoleWarn).toHaveBeenCalledWith(
        'Failed to load onboarding draft', expect.any(Error),
      );
    });

    it('autosaves the draft after the debounce once the wizard has user content', async () => {
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay === 1500) {
          queueMicrotask(callback);
          return 1;
        }
        return realSetTimeout(callback, delay, ...args);
      });
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      fetchOnboardingDraft.mockResolvedValue(null);

      render(<OnboardingPage />);

      // Step 1 alone is pristine — moving to step 2 makes the draft saveable.
      fireEvent.click(await screen.findByText('onboardingContinueAction'));

      await waitFor(() => {
        expect(saveOnboardingDraft).toHaveBeenCalledWith(
          expect.any(Function), '', 'platform-token',
          expect.objectContaining({ step: 2 }),
        );
      });

      fireEvent.change(screen.getByLabelText(/onboardingCompanyNameLabel/), {
        target: { value: 'Acme SL' },
      });

      await waitFor(() => {
        expect(saveOnboardingDraft).toHaveBeenCalledWith(
          expect.any(Function), '', 'platform-token',
          expect.objectContaining({
            step: 2,
            form: expect.objectContaining({ clientName: 'Acme SL' }),
          }),
        );
      });
    });

    it('warns and resets the saved-draft ref when an autosave fails, then retries', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay === 1500) {
          queueMicrotask(callback);
          return 1;
        }
        return realSetTimeout(callback, delay, ...args);
      });
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      fetchOnboardingDraft.mockResolvedValue(null);
      saveOnboardingDraft.mockRejectedValueOnce(new Error('draft save down'));

      render(<OnboardingPage />);

      // Moving to step 2 triggers the first (failing) autosave.
      fireEvent.click(await screen.findByText('onboardingContinueAction'));

      await waitFor(() => {
        expect(consoleWarn).toHaveBeenCalledWith(
          'Failed to save onboarding draft', expect.any(Error),
        );
      });
      expect(saveOnboardingDraft).toHaveBeenCalledTimes(1);

      // The failure reset lastSavedDraftRef, so the next form change retries
      // instead of being suppressed as already saved.
      fireEvent.change(screen.getByLabelText(/onboardingCompanyNameLabel/), {
        target: { value: 'Acme SL' },
      });

      await waitFor(() => {
        expect(saveOnboardingDraft).toHaveBeenCalledTimes(2);
      });
      expect(saveOnboardingDraft).toHaveBeenLastCalledWith(
        expect.any(Function), '', 'platform-token',
        expect.objectContaining({
          step: 2,
          form: expect.objectContaining({ clientName: 'Acme SL' }),
        }),
      );
    });

    it('does not autosave a pristine step-1 form', async () => {
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay === 1500) {
          queueMicrotask(callback);
          return 1;
        }
        return realSetTimeout(callback, delay, ...args);
      });
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      fetchOnboardingDraft.mockResolvedValue(null);

      render(<OnboardingPage />);

      // fullName/country/businessType are not draft-relevant content on step 1.
      fireEvent.change(await screen.findByLabelText(/onboardingFullNameLabel/), {
        target: { value: 'Ana' },
      });

      await act(async () => {
        await Promise.resolve();
      });
      expect(saveOnboardingDraft).not.toHaveBeenCalled();
    });

    it('does not fetch the draft nor show the notice after registering a new account', async () => {
      registerAccount.mockResolvedValue({
        token: 'platform-token',
        account: { name: 'Ada Lovelace', email: 'ada@example.com' },
      });

      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      fireEvent.submit(screen.getByTestId('action-register-submit').closest('form'));

      // Lands on the create wizard (step 1) without any restore round-trip.
      expect(await screen.findByText('onboardingContinueAction')).toBeInTheDocument();
      expect(fetchOnboardingDraft).not.toHaveBeenCalled();
      expect(screen.queryByTestId('draft-restored-notice')).not.toBeInTheDocument();
    });

    it('does not autosave when the platform token has been cleared', async () => {
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay === 1500) {
          queueMicrotask(callback);
          return 1;
        }
        return realSetTimeout(callback, delay, ...args);
      });
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      fetchOnboardingDraft.mockResolvedValue(null);

      render(<OnboardingPage />);

      // Drop the token before triggering the autosave effect again.
      await screen.findByLabelText(/onboardingFullNameLabel/);
      localStorage.removeItem('sf_platform_token');

      // A form change re-runs the effect, which now bails on the missing token.
      fireEvent.change(screen.getByLabelText(/onboardingFullNameLabel/), {
        target: { value: 'Ana' },
      });

      await act(async () => {
        await Promise.resolve();
      });
      expect(saveOnboardingDraft).not.toHaveBeenCalled();
    });

    it('does not re-save a restored draft that has not changed', async () => {
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
        if (delay === 1500) {
          queueMicrotask(callback);
          return 1;
        }
        return realSetTimeout(callback, delay, ...args);
      });
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      // A complete restored form (fullName matches the account so the backfill
      // effect is a no-op) leaves the live draft identical to the persisted one.
      fetchOnboardingDraft.mockResolvedValue({
        step: 2,
        form: {
          fullName: 'Ada Lovelace',
          businessType: 'company',
          clientName: 'Acme SL',
          currency: 'EUR',
          language: 'es_ES',
          countryCode: 'ES',
          fiscalIdType: 'NIF',
          fiscalIdValue: '',
          address: '',
          sector: 'technology',
        },
      });

      render(<OnboardingPage />);

      // Restored on step 2 with the company name already filled.
      await waitFor(() => {
        expect(screen.getByLabelText(/onboardingCompanyNameLabel/)).toHaveValue('Acme SL');
      });

      // The autosave effect runs but the serialized draft equals the persisted
      // one, so the dedupe guard short-circuits and nothing is saved.
      await act(async () => {
        await Promise.resolve();
      });
      expect(saveOnboardingDraft).not.toHaveBeenCalled();
    });
  });

  describe('uncovered branches', () => {
    it('shows the SSO failure message when the credential login returns no token', async () => {
      loginWithSsoProvider.mockResolvedValue({});
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      await waitFor(() => expect(renderSsoProviderButton).toHaveBeenCalled());
      const [, , callbacks] = renderSsoProviderButton.mock.calls[0];

      await act(async () => {
        callbacks.onCredential('google', { credential: 'sso-jwt' });
      });

      expect(await screen.findByText('onboardingSsoFailed')).toBeInTheDocument();
    });

    it('shows the SSO failure message from the rejection user message', async () => {
      loginWithSsoProvider.mockRejectedValue({ userMessage: 'SSO exploded' });
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      await waitFor(() => expect(renderSsoProviderButton).toHaveBeenCalled());
      const [, , callbacks] = renderSsoProviderButton.mock.calls[0];

      await act(async () => {
        callbacks.onCredential('google', { credential: 'sso-jwt' });
      });

      expect(await screen.findByText('SSO exploded')).toBeInTheDocument();
    });

    it('surfaces SSO provider button errors via the onError callback', async () => {
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      await waitFor(() => expect(renderSsoProviderButton).toHaveBeenCalled());
      const [, , callbacks] = renderSsoProviderButton.mock.calls[0];

      await act(async () => {
        callbacks.onError({ userMessage: 'SSO button broke' });
      });

      expect(await screen.findByText('SSO button broke')).toBeInTheDocument();
    });

    it('renders a forgot-password failure message', async () => {
      requestPasswordReset.mockRejectedValue({ userMessage: 'Reset request failed' });
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      fireEvent.click(screen.getByTestId('action-switch-to-login'));
      fireEvent.click(screen.getByText('onboardingForgotPasswordAction'));
      fireEvent.submit(screen.getByTestId('action-forgot-password-submit').closest('form'));

      expect(await screen.findByText('Reset request failed')).toBeInTheDocument();
    });

    it('returns to the login view from the forgot-password view', () => {
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      fireEvent.click(screen.getByTestId('action-switch-to-login'));
      fireEvent.click(screen.getByText('onboardingForgotPasswordAction'));
      fireEvent.change(screen.getByLabelText(/onboardingEmailLabel/), {
        target: { value: 'reset@example.com' },
      });
      fireEvent.click(screen.getByTestId('action-forgot-back-to-login'));

      expect(screen.getByText('onboardingLoginTitle')).toBeInTheDocument();
    });

    it('blocks a reset submit when the two passwords do not match', async () => {
      window.history.replaceState(null, '', '/onboarding?resetToken=reset-token');
      render(<OnboardingPage />);

      fireEvent.change(screen.getByLabelText(/onboardingNewPasswordLabel/), {
        target: { value: 'first-secret' },
      });
      fireEvent.change(screen.getByLabelText(/onboardingConfirmPasswordLabel/), {
        target: { value: 'second-secret' },
      });
      fireEvent.submit(screen.getByTestId('action-reset-password-submit').closest('form'));

      expect(await screen.findByText('onboardingCredentialsMustMatch')).toBeInTheDocument();
      expect(confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('toggles reset password visibility and returns to login from the reset view', () => {
      window.history.replaceState(null, '', '/onboarding?resetToken=reset-token');
      render(<OnboardingPage />);

      const newPassword = screen.getByLabelText(/onboardingNewPasswordLabel/);
      expect(newPassword).toHaveAttribute('type', 'password');
      fireEvent.click(screen.getByLabelText('onboardingShowPassword'));
      expect(newPassword).toHaveAttribute('type', 'text');

      fireEvent.click(screen.getByTestId('action-reset-back-to-login'));
      expect(screen.getByText('onboardingLoginTitle')).toBeInTheDocument();
    });

    it('returns to login from the reset success screen', async () => {
      confirmPasswordReset.mockResolvedValue({ success: true });
      window.history.replaceState(null, '', '/onboarding?resetToken=reset-token');
      render(<OnboardingPage />);

      fireEvent.change(screen.getByLabelText(/onboardingNewPasswordLabel/), {
        target: { value: 'new-secret' },
      });
      fireEvent.change(screen.getByLabelText(/onboardingConfirmPasswordLabel/), {
        target: { value: 'new-secret' },
      });
      fireEvent.submit(screen.getByTestId('action-reset-password-submit').closest('form'));

      // After success the form is replaced by the standalone success button.
      await screen.findByText('onboardingResetPasswordSuccess');
      const buttons = screen.getAllByText('onboardingBackToLoginAction');
      fireEvent.click(buttons[buttons.length - 1]);
      expect(screen.getByText('onboardingLoginTitle')).toBeInTheDocument();
    });

    it('updates the register password field on input', () => {
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      const password = screen.getByLabelText(/onboardingPasswordLabel/);
      fireEvent.change(password, { target: { value: 'typed-secret' } });
      expect(password).toHaveValue('typed-secret');
    });

    it('surfaces SSO provider rendering failures via the Promise.all catch', async () => {
      renderSsoProviderButton.mockRejectedValueOnce({ userMessage: 'SSO render failed' });
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);

      expect(await screen.findByText('SSO render failed')).toBeInTheDocument();
    });

    it('renders the finalize setup progress state', async () => {
      localStorage.setItem('sf_platform_token', 'platform-token');
      fetchAccount.mockResolvedValue({ name: 'Ada Lovelace' });
      fetchEnvironments.mockResolvedValue([]);
      let emit;
      runOnboardingStream.mockImplementation(async (_fetch, _baseUrl, _token, _form, onMessage) => {
        emit = onMessage;
        return new Promise(() => {});
      });

      render(<OnboardingPage />);

      fireEvent.click(await screen.findByText('onboardingContinueAction'));
      fireEvent.click(screen.getByText('onboardingStartAction'));

      // 'finalize' exists in the mocked initialSetupSteps, so applyProgressMessage
      // can flip it to running and drive the organization/finalize progress branch.
      await act(async () => {
        emit({ type: 'progress', step: 'finalize', status: 'running' });
      });
      expect(screen.getByText('onboardingPreparingFinishingDescription')).toBeInTheDocument();
    });
  });

  describe('password strength feedback', () => {
    const typePassword = (container, value) => {
      const input = container.querySelector('#reg-password');
      fireEvent.change(input, { target: { value } });
      return input;
    };

    it('disables the create account button while the password is empty', () => {
      localStorage.removeItem('sf_platform_token');
      render(<OnboardingPage />);
      expect(screen.getByTestId('action-register-submit')).toBeDisabled();
      // No requirements list until the user starts typing.
      expect(screen.queryByTestId('register-password-requirements')).not.toBeInTheDocument();
    });

    it('shows the checklist and keeps submit disabled for a weak password', () => {
      localStorage.removeItem('sf_platform_token');
      const { container } = render(<OnboardingPage />);
      typePassword(container, '123');
      expect(screen.getByTestId('register-password-requirements')).toBeInTheDocument();
      expect(screen.getByTestId('register-password-rule-minLength')).toHaveAttribute('data-met', 'false');
      expect(screen.getByTestId('register-password-rule-special')).toHaveAttribute('data-met', 'false');
      expect(screen.getByTestId('action-register-submit')).toBeDisabled();
    });

    it('marks every rule met and enables submit for a strong password', () => {
      localStorage.removeItem('sf_platform_token');
      const { container } = render(<OnboardingPage />);
      typePassword(container, 'Str0ng!Pass');
      ['minLength', 'uppercase', 'lowercase', 'number', 'special'].forEach(rule => {
        expect(screen.getByTestId(`register-password-rule-${rule}`)).toHaveAttribute('data-met', 'true');
      });
      expect(screen.getByTestId('action-register-submit')).not.toBeDisabled();
    });
  });
});
