// @covers tools/app-shell/src/windows/custom/contacts/ContactsEmptyState.jsx
// @covers tools/app-shell/src/lib/walkthrough/useLaunchWalkthrough.js

// The empty state is driven through the REAL useLaunchWalkthrough hook: only its core
// boundaries (the walkthrough engine/progress store and observability) are mocked, so the
// "Ver guía" tests below guard the hook's gating and call order, not a stub of it.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

let copilot = null;
vi.mock('@/components/CopilotContext.jsx', () => ({
  useCopilotOptional: () => copilot,
}));

const calls = [];
let walkthrough = null;
vi.mock('@etendosoftware/app-shell-core/walkthrough', () => ({
  useWalkthrough: () => walkthrough,
  getFlowStatus: vi.fn(() => 'not_started'),
  markFlowStarted: vi.fn((id) => calls.push(['markFlowStarted', id])),
}));

const trackWalkthroughStarted = vi.fn((payload) => calls.push(['track', payload]));
vi.mock('@etendosoftware/app-shell-core/observability', () => ({
  useObservability: () => ({ trackWalkthroughStarted }),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import ContactsEmptyState from '../ContactsEmptyState.jsx';

const CREATE_CONTACT = { id: 'create-contact', revision: 2, steps: [{}, {}, {}] };

function walkthroughState(overrides = {}) {
  return {
    available: true,
    flows: [CREATE_CONTACT],
    isRunning: false,
    start: vi.fn((id) => { calls.push(['start', id]); return true; }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  copilot = null;
  walkthrough = walkthroughState();
});

describe('ContactsEmptyState — entry points render only when they can work', () => {
  it('shows the drop zone only with onImport, and hands it the selected file', () => {
    const onImport = vi.fn();
    const { rerender } = render(<ContactsEmptyState context={{}} />);
    expect(screen.queryByTestId('contacts-empty-state-dropzone')).toBeNull();

    rerender(<ContactsEmptyState context={{ onImport, importFormats: ['csv'] }} />);
    const file = new File(['name\nAcme'], 'contacts.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('ImportDropzone__fileInput'), { target: { files: [file] } });

    expect(onImport).toHaveBeenCalledWith(file);
  });

  it('hides the Copilot button without a provider, and opens (never toggles) the panel with one', () => {
    const { rerender } = render(<ContactsEmptyState context={{}} />);
    expect(screen.queryByTestId('contacts-empty-state-copilot')).toBeNull();

    copilot = { open: vi.fn(), toggle: vi.fn() };
    rerender(<ContactsEmptyState context={{}} />);
    fireEvent.click(screen.getByTestId('contacts-empty-state-copilot'));

    expect(copilot.open).toHaveBeenCalledTimes(1);
    expect(copilot.toggle).not.toHaveBeenCalled();
  });

  it('hides New without onCreate, and runs onCreate with it', () => {
    const onCreate = vi.fn();
    const { rerender } = render(<ContactsEmptyState context={{}} />);
    expect(screen.queryByTestId('contacts-empty-state-new')).toBeNull();

    rerender(<ContactsEmptyState context={{ onCreate }} />);
    fireEvent.click(screen.getByTestId('contacts-empty-state-new'));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['there is no WalkthroughProvider (available: false)', { available: false }],
    ['the create-contact flow is not registered', { flows: [{ id: 'other-flow', steps: [] }] }],
  ])('hides the guide banner when %s', (_label, overrides) => {
    walkthrough = walkthroughState(overrides);
    render(<ContactsEmptyState context={{}} />);
    expect(screen.queryByTestId('contacts-empty-state-view-guide')).toBeNull();
  });
});

describe('ContactsEmptyState — "Ver guía" launches the create-contact walkthrough', () => {
  it('tracks the start, marks the flow started, then starts the engine, in that order', () => {
    render(<ContactsEmptyState context={{}} />);
    fireEvent.click(screen.getByTestId('contacts-empty-state-view-guide'));

    expect(calls).toEqual([
      ['track', { flowId: 'create-contact', status: 'not_started', total: 3, source: 'contacts_empty_state' }],
      ['markFlowStarted', 'create-contact'],
      ['start', 'create-contact'],
    ]);
  });

  it('does nothing while another walkthrough is running', () => {
    walkthrough = walkthroughState({ isRunning: true });
    render(<ContactsEmptyState context={{}} />);
    fireEvent.click(screen.getByTestId('contacts-empty-state-view-guide'));

    expect(calls).toEqual([]);
  });
});
