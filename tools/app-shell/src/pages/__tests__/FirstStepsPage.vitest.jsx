/**
 * ETP-5190 — `FirstStepsPage`: what the user actually sees for a given completion state.
 *
 * `FirstStepsContext` is mocked here on purpose: the transport behaviour underneath it has its
 * own suite (`pages/first-steps/__tests__/useFirstSteps.vitest.jsx`), and driving the page
 * through a fake state makes the progress/expansion/all-set matrix deterministic.
 *
 * The page reads the shared context rather than calling `useFirstSteps` itself so that the
 * sidebar's progress badge and this page cannot disagree — the write allowlist now lives in
 * `FirstStepsProvider`, which is where that contract is asserted.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/pages/first-steps/FirstStepsImportButton.jsx', () => ({
  // The stub surfaces `disabled` as a real button attribute so the lock is asserted the same
  // way for every action, rather than by reading a prop.
  default: ({ step, disabled }) => (
    <button type="button" disabled={disabled} data-testid={`import-button-${step.id}`} />
  ),
}));
vi.mock('@/pages/first-steps/CompanyDataSummary.jsx', () => ({
  default: () => <div data-testid="company-data-summary" />,
}));

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useGuardedNavigate.js', () => ({
  useGuardedNavigate: () => navigateMock,
  default: () => navigateMock,
}));

const hookState = vi.hoisted(() => ({ value: null }));
vi.mock('@/pages/first-steps/FirstStepsContext.jsx', () => ({
  useFirstStepsState: () => hookState.value,
}));

import FirstStepsPage from '../FirstStepsPage.jsx';
import { TOGGLEABLE_STEP_IDS, findExpandedStepId } from '@/pages/first-steps/firstStepsConfig.js';

const ALL_DONE = [...TOGGLEABLE_STEP_IDS];

/** Installs the mocked hook return value. `toggleStep` resolves `true` unless told otherwise. */
function setHook({ completed = [], loading = false, error = null, toggleResult = true } = {}) {
  const toggleStep = vi.fn(async () => toggleResult);
  const markSeen = vi.fn(async () => true);
  hookState.value = { completed, seen: false, loading, error, toggleStep, markSeen };
  return { toggleStep, markSeen };
}

beforeEach(() => {
  vi.clearAllMocks();
  setHook();
});

describe('FirstStepsPage — smoke and wiring', () => {
  it('renders the page shell', () => {
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-page')).toBeInTheDocument();
    expect(screen.getByTestId('first-steps-heading')).toBeInTheDocument();
    expect(screen.getByTestId('first-steps-subtitle')).toBeInTheDocument();
    expect(screen.getByTestId('first-steps-progress')).toBeInTheDocument();
  });

  it('renders one row per catalogued step', () => {
    render(<FirstStepsPage />);
    for (const id of ['create-account', 'company-data', 'fiscal-config', 'products', 'contacts', 'team']) {
      expect(screen.getByTestId(`first-steps-step-${id}`)).toBeInTheDocument();
    }
  });

  it('renders no Copilot banner', () => {
    // Removed on purpose: the button was permanently disabled, so the strip only ever
    // advertised something the page could not do.
    render(<FirstStepsPage />);
    expect(screen.queryByTestId('first-steps-copilot-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-copilot-start')).not.toBeInTheDocument();
  });
});

describe('FirstStepsPage — progress counter', () => {
  it('reads 1/7 on a fresh account (the always-done step already counts)', () => {
    setHook({ completed: [] });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('1/7');
  });

  it('advances one per completed step', () => {
    for (const [completed, expected] of [
      [['company-data'], '2/7'],
      [['company-data', 'products'], '3/7'],
      [['company-data', 'products', 'contacts'], '4/7'],
    ]) {
      setHook({ completed });
      const { unmount } = render(<FirstStepsPage />);
      expect(screen.getByTestId('first-steps-progress')).toHaveTextContent(expected);
      unmount();
    }
  });

  it('reads 7/7 once every toggleable step is complete', () => {
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('7/7');
  });

  it('sizes the progress bar from the same figures', () => {
    setHook({ completed: [] });
    const { unmount } = render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-progress-bar')).toHaveStyle({ width: `${(1 / 7) * 100}%` });
    unmount();

    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-progress-bar')).toHaveStyle({ width: '100%' });
  });
});

describe('FirstStepsPage — one row open at a time, but any row openable', () => {
  /** The expanded row is the one that renders its action controls / checkbox. */
  const expandedIds = () => TOGGLEABLE_STEP_IDS
    .filter((id) => screen.queryByTestId(`first-steps-toggle-${id}`) !== null);

  it('expands only the first incomplete toggleable step on a fresh account', () => {
    setHook({ completed: [] });
    render(<FirstStepsPage />);
    expect(expandedIds()).toEqual(['company-data']);
  });

  it('moves the default expansion forward as steps complete', () => {
    for (const [completed, expected] of [
      [['company-data'], 'fiscal-config'],
      [['company-data', 'fiscal-config'], 'products'],
      [['company-data', 'fiscal-config', 'products'], 'contacts'],
    ]) {
      setHook({ completed });
      const { unmount } = render(<FirstStepsPage />);
      expect(expandedIds()).toEqual([expected]);
      unmount();
    }
  });

  it('expands the earliest gap when steps are completed out of order', () => {
    setHook({ completed: ['products', 'contacts', 'team'] });
    render(<FirstStepsPage />);
    expect(expandedIds()).toEqual(['company-data']);
  });

  it('collapses every row at 7/7', () => {
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);
    expect(expandedIds()).toEqual([]);
  });

  it('opens any row on click — a step is never gated on the one above it', async () => {
    // REGRESSION GUARD. The list used to expose its controls ONLY on the first incomplete
    // step, which made the checklist behave like a wizard: `team` could not be completed
    // until `company-data` was.
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);
    expect(expandedIds()).toEqual(['company-data']);

    await user.click(screen.getByTestId('first-steps-title-team'));
    expect(expandedIds()).toEqual(['team']);
  });

  it('closes the open row when its own title is clicked again', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-company-data'));
    expect(expandedIds()).toEqual([]);
  });

  it('leaves an always-done row inert', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    expect(screen.getByTestId('first-steps-title-create-account')).toBeDisabled();
    await user.click(screen.getByTestId('first-steps-title-create-account'));
    expect(expandedIds()).toEqual(['company-data']);
  });
});

describe('FirstStepsPage — always-done steps are read-only', () => {
  it('renders create-account struck through, done, and with no way to change it', () => {
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    expect(screen.getByText('firstStepsCreateAccount').className).toContain('line-through');
    expect(screen.getByTestId('first-steps-done-create-account')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-pending-create-account')).not.toBeInTheDocument();
    // Reaching this page means the account exists, so there is genuinely nothing to do and
    // nothing to un-tick. Neither control may exist.
    expect(screen.queryByTestId('first-steps-configure-create-account')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-toggle-create-account')).not.toBeInTheDocument();
  });

  it('makes fiscal-config a real, toggleable step', async () => {
    // It used to be alwaysDone, on the assumption that a demo tenant had nothing to report.
    // It is now part of the flow: strike-through and the green check must be EARNED, and the
    // row carries the checkbox every other toggleable row has (which only the expanded row
    // renders, hence the click).
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    expect(screen.getByText('firstStepsFiscalConfig').className).not.toContain('line-through');
    expect(screen.queryByTestId('first-steps-done-fiscal-config')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('first-steps-title-fiscal-config'));
    expect(screen.getByTestId('first-steps-toggle-fiscal-config')).toBeInTheDocument();
  });

  it('leaves the incomplete toggleable steps pending and not struck through', () => {
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    for (const id of TOGGLEABLE_STEP_IDS) {
      expect(screen.queryByTestId(`first-steps-done-${id}`)).not.toBeInTheDocument();
    }
    // Per the design, the empty status circle belongs to the expanded row alone — a collapsed
    // pending row carries only its time estimate, so "not done" reads as "no green check".
    const expandedId = findExpandedStepId([]);
    expect(screen.getByTestId(`first-steps-pending-${expandedId}`)).toBeInTheDocument();
    for (const id of TOGGLEABLE_STEP_IDS.filter((entry) => entry !== expandedId)) {
      expect(screen.queryByTestId(`first-steps-pending-${id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`first-steps-collapsed-time-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByText('firstStepsCompanyData').className).not.toContain('line-through');
  });
});

describe('FirstStepsPage — the all-set state', () => {
  it('keeps the "Create invoice" button hidden below 7/7', () => {
    setHook({ completed: ['company-data', 'products', 'contacts'] });
    render(<FirstStepsPage />);
    expect(screen.queryByTestId('first-steps-create-invoice')).not.toBeInTheDocument();
  });

  it('swaps heading and subtitle copy and reveals the button at 7/7', () => {
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);

    expect(screen.getByTestId('first-steps-heading')).toHaveTextContent('firstStepsAllSetTitle');
    expect(screen.getByTestId('first-steps-subtitle')).toHaveTextContent('firstStepsAllSetSubtitle');
    expect(screen.getByTestId('first-steps-create-invoice')).toBeInTheDocument();
  });

  it('uses the pre-completion copy below 7/7', () => {
    setHook({ completed: [] });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-heading')).toHaveTextContent('firstStepsPrepareAccount');
    expect(screen.getByTestId('first-steps-subtitle')).toHaveTextContent('firstStepsSubtitle');
  });

  it('navigates to the new sales invoice form when the button is clicked', async () => {
    const user = userEvent.setup();
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-create-invoice'));
    expect(navigateMock).toHaveBeenCalledWith('/sales-invoice/new');
  });
});

describe('FirstStepsPage — Configure navigation', () => {
  it('navigates to the expanded step target route', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-configure-company-data'));
    expect(navigateMock).toHaveBeenCalledWith('/organization');
  });

  it('navigates from any row the user opens, not just the first incomplete one', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-team'));
    await user.click(screen.getByTestId('first-steps-configure-team'));
    expect(navigateMock).toHaveBeenCalledWith('/roles');
  });

  it('offers an importer instead of a route on the two bulk-load steps', async () => {
    // `products`/`contacts` used to navigate to their list view, where the user then had to
    // find the import button themselves. The step IS the import, so it runs in place.
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-products'));
    expect(screen.getByTestId('import-button-products')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-configure-products')).not.toBeInTheDocument();
  });

  it('sends the invoice-sequence step to the Document Sequence window', async () => {
    // The numbering used to be edited inline here; it now lives in a real window, so this
    // step is an ordinary Configure button like the others.
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-invoice-sequence'));
    await user.click(screen.getByTestId('first-steps-configure-invoice-sequence'));
    expect(navigateMock).toHaveBeenCalledWith('/document-sequence');
  });

  it('sends the fiscal-config step to the Fiscal Configuration window', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-fiscal-config'));
    await user.click(screen.getByTestId('first-steps-configure-fiscal-config'));
    expect(navigateMock).toHaveBeenCalledWith('/fiscal-config');
  });
});

describe('FirstStepsPage — a completed step locks its controls', () => {
  /** Opens a row by hand — a completed step is never the default-expanded one. */
  const open = async (user, id) => user.click(screen.getByTestId(`first-steps-title-${id}`));

  it('disables the importer once the step is ticked', async () => {
    const user = userEvent.setup();
    setHook({ completed: ['products'] });
    render(<FirstStepsPage />);

    await open(user, 'products');
    expect(screen.getByTestId('import-button-products')).toBeDisabled();
  });

  it('disables a Configure button once its step is ticked', async () => {
    const user = userEvent.setup();
    setHook({ completed: ['team'] });
    render(<FirstStepsPage />);

    await open(user, 'team');
    expect(screen.getByTestId('first-steps-configure-team')).toBeDisabled();
  });

  it('disables the numbering step once it is ticked', async () => {
    const user = userEvent.setup();
    setHook({ completed: ['invoice-sequence'] });
    render(<FirstStepsPage />);

    await open(user, 'invoice-sequence');
    expect(screen.getByTestId('first-steps-configure-invoice-sequence')).toBeDisabled();
  });

  it('unlocks everything again while the step is not ticked', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    await open(user, 'products');
    expect(screen.getByTestId('import-button-products')).not.toBeDisabled();
    await open(user, 'invoice-sequence');
    expect(screen.getByTestId('first-steps-configure-invoice-sequence')).not.toBeDisabled();
  });

  it('keeps company data editable even when ticked — the one documented exception', async () => {
    // A company's details are the one thing on this list people genuinely come back to change,
    // so ticking the step must not take the way in away.
    const user = userEvent.setup();
    setHook({ completed: ['company-data'] });
    render(<FirstStepsPage />);

    await open(user, 'company-data');
    expect(screen.getByTestId('first-steps-configure-company-data')).not.toBeDisabled();
  });

  it('shows the read-only company summary on the company-data row', () => {
    // No click needed: on a fresh account company-data is the row that opens by default, and
    // clicking its title would close it again.
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    expect(screen.getByTestId('company-data-summary')).toBeInTheDocument();
    // It is a summary, not a second edit surface: the row still routes to the real window.
    expect(screen.getByTestId('first-steps-configure-company-data')).toBeInTheDocument();
  });
});

describe('FirstStepsPage — the completion checkbox', () => {
  it('is a real unchecked checkbox for an incomplete step', () => {
    setHook({ completed: [] });
    render(<FirstStepsPage />);

    const box = screen.getByTestId('first-steps-toggle-company-data');
    expect(box).toHaveAttribute('type', 'checkbox');
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
  });

  it('toggles the step on click', async () => {
    const user = userEvent.setup();
    const { toggleStep } = setHook({ completed: [] });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-toggle-company-data'));
    expect(toggleStep).toHaveBeenCalledTimes(1);
    expect(toggleStep).toHaveBeenCalledWith('company-data');
  });

  it('is keyboard operable — Space on the focused checkbox toggles it', async () => {
    const user = userEvent.setup();
    const { toggleStep } = setHook({ completed: [] });
    render(<FirstStepsPage />);

    const box = screen.getByTestId('first-steps-toggle-company-data');
    box.focus();
    expect(box).toHaveFocus();
    await user.keyboard(' ');

    expect(toggleStep).toHaveBeenCalledWith('company-data');
  });

  it('is disabled while the state is still loading', () => {
    setHook({ completed: [], loading: true });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-toggle-company-data')).toBeDisabled();
  });

  it('does not call toggleStep while disabled', async () => {
    const user = userEvent.setup();
    const { toggleStep } = setHook({ completed: [], loading: true });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-toggle-company-data'), { pointerEventsCheck: 0 });
    expect(toggleStep).not.toHaveBeenCalled();
  });

  it('surfaces an error toast when the save failed', async () => {
    const user = userEvent.setup();
    setHook({ completed: [], toggleResult: false });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-toggle-company-data'));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error).toHaveBeenCalledWith('genericError');
  });

  it('shows no toast when the save succeeded', async () => {
    const user = userEvent.setup();
    setHook({ completed: [], toggleResult: true });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-toggle-company-data'));
    await waitFor(() => expect(hookState.value.toggleStep).toHaveBeenCalled());
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
