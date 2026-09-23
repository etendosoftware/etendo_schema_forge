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
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ETP-5395 — mutable ref so most tests can leave the page's actual body under test (Owner
// granted, same convention as DetailView.secondaryTabCapabilityGate.vitest.jsx) while the
// dedicated gate describe block below flips it to exercise the redirect.
const capabilitiesRef = vi.hoisted(() => ({ current: { isOwner: true } }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useCapabilitiesSafe: () => capabilitiesRef.current,
}));

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
import {
  PLAN_PRODUCTIVE,
  countCompletedSteps,
  findExpandedStepId,
  firstStepsTotal,
  toggleableStepIds,
  visibleFirstSteps,
} from '@/pages/first-steps/firstStepsConfig.js';
import { demoDataTransferStepState } from '@/pages/first-steps/demoDataTransferStep.js';

const ALL_DONE = [...toggleableStepIds(PLAN_PRODUCTIVE)];

/**
 * Installs the mocked context value. `toggleStep` resolves `true` unless told otherwise.
 *
 * The plan-derived fields are computed the same way `FirstStepsProvider` computes them rather
 * than being passed in loose, so a change to the gate shows up here as a behaviour difference
 * instead of a stale fixture that keeps asserting the old list. Defaults to productive, which
 * is the full 7-step checklist every test below expects unless it says otherwise.
 *
 * The transfer defaults to what the backend answers with flag `demo-data-transfer` OFF (a 404,
 * so `available: false`): no transfer row. The transfer suite passes `available: true`.
 */
function setHook({ completed = [], loading = false, error = null, toggleResult = true,
  plan = PLAN_PRODUCTIVE, dismissed = false, dismissResult = true,
  dataTransfer = {} } = {}) {
  const toggleStep = vi.fn(async () => toggleResult);
  const markSeen = vi.fn(async () => true);
  const setDismissed = vi.fn(async () => dismissResult);
  const transfer = {
    status: 'NOT_REQUESTED',
    products: {},
    contacts: {},
    loading: false,
    available: false,
    error: false,
    retry: vi.fn(async () => ({ status: 'RUNNING', products: {}, contacts: {} })),
    ...dataTransfer,
  };
  const demoDataTransfer = demoDataTransferStepState(transfer);
  hookState.value = {
    completed,
    seen: false,
    dismissed,
    loading,
    error,
    toggleStep,
    markSeen,
    setDismissed,
    plan,
    steps: visibleFirstSteps(plan, demoDataTransfer),
    completedCount: countCompletedSteps(completed, plan, demoDataTransfer),
    total: firstStepsTotal(plan, demoDataTransfer),
    dataTransfer: transfer,
    demoDataTransfer,
  };
  return { toggleStep, markSeen, setDismissed, dataTransfer: transfer };
}

beforeEach(() => {
  vi.clearAllMocks();
  setHook();
  capabilitiesRef.current = { isOwner: true };
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

describe('FirstStepsPage — a trial tenant sees the shorter checklist', () => {
  const TRIAL_DONE = ['company-data', 'products', 'contacts', 'team'];

  it('renders five rows and neither of the two gated ones', () => {
    setHook({ plan: 'free' });
    render(<FirstStepsPage />);
    for (const id of ['create-account', 'company-data', 'products', 'contacts', 'team']) {
      expect(screen.getByTestId(`first-steps-step-${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('first-steps-step-invoice-sequence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-step-fiscal-config')).not.toBeInTheDocument();
  });

  it('shows the progress out of five', () => {
    setHook({ completed: ['company-data'], plan: 'free' });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('2/5');
  });

  it('opens the first incomplete row the trial can actually reach', () => {
    // Skipping `fiscal-config` is the point: it is next in catalogue order but not rendered,
    // so naming it would leave the page with nothing open.
    setHook({ completed: ['company-data'], plan: 'free' });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-toggle-products')).toBeInTheDocument();
  });

  it('reaches the all-set state without the gated steps', () => {
    // Before the gate a trial tenant could never finish the checklist — the two rows it had
    // no way to act on kept it at 5/7 forever.
    setHook({ completed: TRIAL_DONE, plan: 'free' });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('5/5');
    expect(screen.getByTestId('first-steps-heading')).toHaveTextContent('firstStepsAllSetTitle');
    expect(screen.getByTestId('first-steps-create-invoice')).toBeInTheDocument();
  });

  it('is NOT all-set with the same completed ids on a productive tenant', () => {
    // The mirror of the test above, on the same stored state: going productive re-opens the
    // checklist rather than carrying the trial's "done" over.
    setHook({ completed: TRIAL_DONE, plan: PLAN_PRODUCTIVE });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('5/7');
    expect(screen.getByTestId('first-steps-heading')).toHaveTextContent('firstStepsPrepareAccount');
    expect(screen.queryByTestId('first-steps-create-invoice')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-steps-toggle-fiscal-config')).toBeInTheDocument();
  });
});

describe('FirstStepsPage — flag demo-data-transfer OFF (ETP-5443)', () => {
  it('renders no transfer row and the pre-ETP-5364 figures when the backend hides the transfer', () => {
    setHook({ plan: PLAN_PRODUCTIVE, dataTransfer: { available: false, status: 'RUNNING' } });
    render(<FirstStepsPage />);

    expect(screen.queryByTestId('first-steps-step-demo-data-transfer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-data-transfer-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('1/7');
  });
});

/**
 * Flag `demo-data-transfer` ON: the backend answered the status read, so `available` is true.
 * Every test here goes through `transferHook`, which is what keeps them testing the feature
 * rather than the flag-off catalogue the rest of this file runs on.
 */
describe('FirstStepsPage — demo-to-productive data transfer', () => {
  const transferHook = ({ dataTransfer = {}, ...rest } = {}) =>
    setHook({ ...rest, dataTransfer: { available: true, ...dataTransfer } });

  it('keeps the durable transfer row in the productive checklist', () => {
    transferHook({ plan: PLAN_PRODUCTIVE });
    render(<FirstStepsPage />);

    expect(screen.getByTestId('first-steps-step-demo-data-transfer')).toBeInTheDocument();
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('2/8');
  });

  it('does not expose the productive transfer row to a free tenant', () => {
    transferHook({ plan: 'free' });
    render(<FirstStepsPage />);

    expect(screen.queryByTestId('first-steps-step-demo-data-transfer')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-steps-progress')).toHaveTextContent('1/5');
  });

  it('shows the persisted server progress while the transfer is running', async () => {
    const user = userEvent.setup();
    transferHook({ dataTransfer: {
      status: 'RUNNING',
      products: { completed: 12, total: 20 },
      contacts: { completed: 3, total: 8 },
    } });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-demo-data-transfer'));
    expect(screen.getByTestId('first-steps-data-transfer-progress'))
      .toHaveTextContent('firstStepsDemoDataTransferProducts');
    expect(screen.getByTestId('first-steps-data-transfer-progress'))
      .toHaveTextContent('firstStepsDemoDataTransferContacts');
    expect(screen.queryByTestId('first-steps-data-transfer-retry')).not.toBeInTheDocument();
  });

  it('offers retry only for a failed transfer and starts the server-owned retry', async () => {
    const user = userEvent.setup();
    const { dataTransfer } = transferHook({ dataTransfer: { status: 'FAILED' } });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-demo-data-transfer'));
    await user.click(screen.getByTestId('first-steps-data-transfer-retry'));
    expect(dataTransfer.retry).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId('first-steps-data-transfer-retry')).toBeInTheDocument();
  });

  it('reports a failed retry through the page error feedback', async () => {
    const user = userEvent.setup();
    const retry = vi.fn(async () => { throw new Error('temporary server failure'); });
    transferHook({ dataTransfer: { status: 'FAILED', retry } });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-title-demo-data-transfer'));
    await user.click(screen.getByTestId('first-steps-data-transfer-retry'));
    expect(toastMock.error).toHaveBeenCalledWith('genericError');
  });
});

describe('FirstStepsPage — one row open at a time, but any row openable', () => {
  /** The expanded row is the one that renders its action controls / checkbox. */
  const expandedIds = () => ALL_DONE
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

  it('collapses every row at 8/8', () => {
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

    for (const id of ALL_DONE) {
      expect(screen.queryByTestId(`first-steps-done-${id}`)).not.toBeInTheDocument();
    }
    // Per the design, the empty status circle belongs to the expanded row alone — a collapsed
    // pending row carries only its time estimate, so "not done" reads as "no green check".
    const expandedId = findExpandedStepId([]);
    expect(screen.getByTestId(`first-steps-pending-${expandedId}`)).toBeInTheDocument();
    for (const id of ALL_DONE.filter((entry) => entry !== expandedId)) {
      expect(screen.queryByTestId(`first-steps-pending-${id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`first-steps-collapsed-time-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByText('firstStepsCompanyData').className).not.toContain('line-through');
  });
});

describe('FirstStepsPage — the all-set state', () => {
  it('keeps the "Create invoice" button hidden below 8/8', () => {
    setHook({ completed: ['company-data', 'products', 'contacts'] });
    render(<FirstStepsPage />);
    expect(screen.queryByTestId('first-steps-create-invoice')).not.toBeInTheDocument();
  });

  it('swaps heading and subtitle copy and reveals the button at 8/8', () => {
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);

    expect(screen.getByTestId('first-steps-heading')).toHaveTextContent('firstStepsAllSetTitle');
    expect(screen.getByTestId('first-steps-subtitle')).toHaveTextContent('firstStepsAllSetSubtitle');
    expect(screen.getByTestId('first-steps-create-invoice')).toBeInTheDocument();
  });

  it('uses the pre-completion copy below 8/8', () => {
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
    // ETP-5364: Usuarios, not Roles — inviting someone creates a USER; the role window shapes
    // permissions afterwards and made the step read as a different, later job.
    expect(navigateMock).toHaveBeenCalledWith('/user');
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
    // ETP-5364: the row asks whether the tenant reports to a SIF at all before it offers the
    // window. "Yes" is what puts the Configure button on screen.
    await user.click(screen.getByTestId('first-steps-gate-yes-fiscal-config'));
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

describe('FirstStepsPage — Owner-only gate (ETP-5395)', () => {
  /**
   * A real destination route rather than a mocked `useNavigate`/stubbed `<Navigate>`, so the
   * redirect is asserted by where the user actually ends up — same convention as
   * InviteAcceptancePage.tenantEntry.vitest.jsx's `renderPage()`.
   */
  function renderAtFirstSteps() {
    return render(
      <MemoryRouter initialEntries={['/first-steps']}>
        <Routes>
          <Route path="/first-steps" element={<FirstStepsPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard-landed" />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('redirects to /dashboard instead of rendering when the user is not the account Owner', () => {
    capabilitiesRef.current = { isOwner: false };
    renderAtFirstSteps();

    expect(screen.getByTestId('dashboard-landed')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-page')).not.toBeInTheDocument();
  });

  it('redirects to /dashboard when isOwner is missing from the capabilities map (fail-closed)', () => {
    capabilitiesRef.current = {};
    renderAtFirstSteps();

    expect(screen.getByTestId('dashboard-landed')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-page')).not.toBeInTheDocument();
  });

  it('renders the page normally, not the redirect, when isOwner is true', () => {
    capabilitiesRef.current = { isOwner: true };
    renderAtFirstSteps();

    expect(screen.getByTestId('first-steps-page')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-landed')).not.toBeInTheDocument();
  });

  // [ETP-5395 QA] — ownership transferred (or the capabilities map otherwise refreshed to
  // isOwner: false) WHILE the user already has this page open, with no full page reload. The
  // gate is not a mount-only check: `useCapabilitiesSafe()` reads live context state and the
  // `if (capabilities.isOwner !== true) return <Navigate .../>` runs on every render, so the
  // very next re-render (triggered by AuthContext's own focus/visibility/poll-driven capability
  // refresh — see AuthContext.jsx's refresh()) must bounce the now-non-owner user out, not leave
  // them stranded on a page they can no longer legitimately see.
  it('redirects to /dashboard on the next render after isOwner flips to false mid-session (ownership transferred, no reload)', () => {
    capabilitiesRef.current = { isOwner: true };
    const { rerender } = renderAtFirstSteps();
    expect(screen.getByTestId('first-steps-page')).toBeInTheDocument();

    capabilitiesRef.current = { isOwner: false };
    rerender(
      <MemoryRouter initialEntries={['/first-steps']}>
        <Routes>
          <Route path="/first-steps" element={<FirstStepsPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard-landed" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('dashboard-landed')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-page')).not.toBeInTheDocument();
  });
});

describe('FirstStepsPage — finishing the setup (ETP-5364)', () => {
  it('offers "Finalizar configuración inicial" only once every step is done', () => {
    setHook({ completed: ['company-data', 'products', 'contacts'] });
    render(<FirstStepsPage />);
    expect(screen.queryByTestId('first-steps-finish-setup')).not.toBeInTheDocument();
  });

  it('shows the button, and what it does, at 8/8', () => {
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-finish-setup')).toHaveTextContent('firstStepsFinishSetup');
    // The hint is what keeps this from reading as a destructive, one-way action.
    expect(screen.getByTestId('first-steps-finish-setup-hint'))
      .toHaveTextContent('firstStepsFinishSetupHint');
  });

  it('persists the dismissal when clicked', async () => {
    const user = userEvent.setup();
    const { setDismissed } = setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-finish-setup'));
    expect(setDismissed).toHaveBeenCalledWith(true);
  });

  it('keeps the user on the page rather than navigating away', async () => {
    // The entry has just vanished from the sidebar; leaving the user in front of the banner
    // that explains it — and undoes it — is what makes the action reversible.
    const user = userEvent.setup();
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-finish-setup'));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed write, because the rollback alone is invisible', async () => {
    const user = userEvent.setup();
    setHook({ completed: ALL_DONE, dismissResult: false });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-finish-setup'));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('genericError'));
  });

  it('replaces the button with the way back once dismissed', () => {
    setHook({ completed: ALL_DONE, dismissed: true });
    render(<FirstStepsPage />);

    expect(screen.getByTestId('first-steps-dismissed-notice')).toBeInTheDocument();
    expect(screen.getByTestId('first-steps-reopen')).toHaveTextContent('firstStepsReopen');
    expect(screen.queryByTestId('first-steps-finish-setup')).not.toBeInTheDocument();
    // Creating the first invoice is still the point of reaching 8/8.
    expect(screen.getByTestId('first-steps-create-invoice')).toBeInTheDocument();
  });

  it('brings the checklist back from the banner', async () => {
    const user = userEvent.setup();
    const { setDismissed } = setHook({ completed: ALL_DONE, dismissed: true });
    render(<FirstStepsPage />);

    await user.click(screen.getByTestId('first-steps-reopen'));
    expect(setDismissed).toHaveBeenCalledWith(false);
  });

  it('shows the banner even mid-checklist, so a dismissal is never a dead end', () => {
    // `dismissed` is independent of completion: a user can dismiss at 8/8 and later un-tick a
    // step. Without this the banner would disappear and the entry would be unrecoverable.
    setHook({ completed: ['company-data'], dismissed: true });
    render(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-dismissed-notice')).toBeInTheDocument();
    expect(screen.getByTestId('first-steps-reopen')).toBeInTheDocument();
  });

  it('shows no banner while the checklist is still offered', () => {
    setHook({ completed: ALL_DONE });
    render(<FirstStepsPage />);
    expect(screen.queryByTestId('first-steps-dismissed-notice')).not.toBeInTheDocument();
  });
});

describe('FirstStepsPage — fiscal-config asks before it configures (ETP-5364)', () => {
  const openFiscal = (user) => user.click(screen.getByTestId('first-steps-title-fiscal-config'));

  it('replaces the description and the Configure button with a yes/no question', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);
    await openFiscal(user);

    expect(screen.getByTestId('first-steps-gate-fiscal-config')).toHaveTextContent(
      'firstStepsFiscalConfigQuestion');
    expect(screen.getByTestId('first-steps-gate-yes-fiscal-config')).toBeInTheDocument();
    expect(screen.getByTestId('first-steps-gate-no-fiscal-config')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-configure-fiscal-config')).not.toBeInTheDocument();
  });

  it('reveals the normal body on "yes" without persisting anything', async () => {
    const user = userEvent.setup();
    const { toggleStep } = setHook({ completed: [] });
    render(<FirstStepsPage />);
    await openFiscal(user);

    await user.click(screen.getByTestId('first-steps-gate-yes-fiscal-config'));
    expect(screen.getByTestId('first-steps-configure-fiscal-config')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-gate-fiscal-config')).not.toBeInTheDocument();
    // "Yes" is not an outcome — it only opens the step the user still has to do.
    expect(toggleStep).not.toHaveBeenCalled();
  });

  it('completes the step on "no", through the same toggle the checkbox uses', async () => {
    const user = userEvent.setup();
    const { toggleStep } = setHook({ completed: [] });
    render(<FirstStepsPage />);
    await openFiscal(user);

    await user.click(screen.getByTestId('first-steps-gate-no-fiscal-config'));
    expect(toggleStep).toHaveBeenCalledWith('fiscal-config');
    expect(toggleStep).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed "no" and leaves the question up', async () => {
    const user = userEvent.setup();
    setHook({ completed: [], toggleResult: false });
    render(<FirstStepsPage />);
    await openFiscal(user);

    await user.click(screen.getByTestId('first-steps-gate-no-fiscal-config'));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('genericError'));
    expect(screen.getByTestId('first-steps-gate-fiscal-config')).toBeInTheDocument();
  });

  it('asks nothing once the step is completed', async () => {
    const user = userEvent.setup();
    setHook({ completed: ['fiscal-config'] });
    render(<FirstStepsPage />);
    await openFiscal(user);

    expect(screen.queryByTestId('first-steps-gate-fiscal-config')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-steps-done-fiscal-config')).toBeInTheDocument();
  });

  it('asks again after the user un-ticks the step', async () => {
    // The whole reason the answer is not persisted: un-ticking is the escape hatch for someone
    // who answered wrongly. The re-render is driven by the mocked context, so the un-tick is
    // simulated by the state the provider would hand back next.
    const user = userEvent.setup();
    setHook({ completed: ['fiscal-config'] });
    const { rerender } = render(<FirstStepsPage />);
    await openFiscal(user);
    expect(screen.queryByTestId('first-steps-gate-fiscal-config')).not.toBeInTheDocument();

    setHook({ completed: [] });
    rerender(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-gate-fiscal-config')).toBeInTheDocument();
  });

  it('forgets a "yes" once the step is ticked and un-ticked', async () => {
    // The in-memory answer must not outlive the tick that followed it, or a user who said yes,
    // completed the step and later un-ticked it would land back on the Configure button with
    // the question never re-asked.
    const user = userEvent.setup();
    const { toggleStep } = setHook({ completed: [] });
    const { rerender } = render(<FirstStepsPage />);
    await openFiscal(user);

    await user.click(screen.getByTestId('first-steps-gate-yes-fiscal-config'));
    expect(screen.getByTestId('first-steps-configure-fiscal-config')).toBeInTheDocument();

    await user.click(screen.getByTestId('first-steps-toggle-fiscal-config'));
    await waitFor(() => expect(toggleStep).toHaveBeenCalledWith('fiscal-config'));

    // The provider hands back the completed state, then the user un-ticks it. The row stays
    // open throughout — `openedStepId` is untouched by either write.
    setHook({ completed: ['fiscal-config'] });
    rerender(<FirstStepsPage />);
    expect(screen.queryByTestId('first-steps-gate-fiscal-config')).not.toBeInTheDocument();

    setHook({ completed: [] });
    rerender(<FirstStepsPage />);
    expect(screen.getByTestId('first-steps-gate-fiscal-config')).toBeInTheDocument();
    expect(screen.queryByTestId('first-steps-configure-fiscal-config')).not.toBeInTheDocument();
  });

  it('gates no other step', async () => {
    const user = userEvent.setup();
    setHook({ completed: [] });
    render(<FirstStepsPage />);
    for (const id of ['company-data', 'products', 'contacts', 'invoice-sequence', 'team']) {
      await user.click(screen.getByTestId(`first-steps-title-${id}`));
      expect(screen.queryByTestId(`first-steps-gate-${id}`)).not.toBeInTheDocument();
    }
  });
});
