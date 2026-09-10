// ETP-5269 — render tests for the admin-only accounting-process monitor page.
//
// The page is presentational: `useAcctProcessMonitor()` owns every piece of state, so it is mocked
// per test and this file asserts only what the admin ends up seeing. Three properties are
// load-bearing enough to have a test each rather than being implied by the happy path:
//
//   1. `AD_PROCESS_RUN.LOG` never reaches the DOM. The fixtures below deliberately carry a `log`
//      field (a backend that regressed WOULD send one) and the tests require it to be absent from
//      the rendered output — a page-level guard on top of the backend's own omission.
//   2. "Run now" cannot double-fire: it is off while a trigger is in flight AND while the backend
//      still reports a run in progress.
//   3. An UNKNOWN trigger reason still renders a message. A blank outcome line would leave an
//      admin who just pressed the button with no idea whether anything happened.
//
// The i18n mock returns the key, so every assertion is against a key — never a hardcoded English
// string — and every query is by `data-testid`.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

const mockUseAcctProcessMonitor = vi.fn();
// `parseRunTimestamp` and `statusMeta` stay REAL: RunStatusPill renders unmocked here, so the
// status-label assertions below exercise the actual code-to-label mapping.
vi.mock('../acct-process-monitor/useAcctProcessMonitor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useAcctProcessMonitor: () => mockUseAcctProcessMonitor(),
}));

vi.mock('lucide-react', () => ({
  Loader2: (p) => <span data-testid={p['data-testid']} />,
  Play: (p) => <span data-testid={p['data-testid']} />,
  RefreshCw: (p) => <span data-testid={p['data-testid']} />,
  ShieldAlert: (p) => <span data-testid={p['data-testid']} />,
  TriangleAlert: (p) => <span data-testid={p['data-testid']} />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, className }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props) => <div {...props} />,
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children, ...props }) => <table {...props}>{children}</table>,
  TableBody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  TableCell: ({ children, ...props }) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }) => <th {...props}>{children}</th>,
  TableHeader: ({ children, ...props }) => <thead {...props}>{children}</thead>,
  TableRow: ({ children, ...props }) => <tr {...props}>{children}</tr>,
}));

// ── Import under test ────────────────────────────────────────────────────────

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcctProcessMonitorPage from '../AcctProcessMonitorPage.jsx';

/** The sentinel a regressed backend would put in `log`; must never be rendered. */
const LOG_SENTINEL = 'SECRET-PROCESS-OUTPUT-DO-NOT-LEAK';

const RUNS = [
  {
    id: 'run-1',
    status: 'SUC',
    startTime: '2026-09-10T18:00:00',
    endTime: '2026-09-10T18:00:01',
    duration: '00:00:01',
    manual: false,
    log: LOG_SENTINEL,
  },
  {
    id: 'run-2',
    status: 'ERR',
    startTime: '2026-09-10T17:55:00',
    endTime: null,
    duration: null,
    manual: true,
    log: LOG_SENTINEL,
  },
];

const LOADED = Object.freeze({
  processName: 'Accounting server process',
  scheduled: true,
  nextRunTime: '2026-09-10T18:05:00',
  running: false,
  lastRun: RUNS[0],
  history: RUNS,
});

/** Base hook return; every test overrides only what it is about. */
function hookState(overrides = {}) {
  return {
    loading: false,
    error: null,
    denied: false,
    notInstalled: false,
    data: LOADED,
    running: false,
    triggering: false,
    triggerOutcome: null,
    trigger: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

describe('AcctProcessMonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── shells ─────────────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows the skeletons and nothing else', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ loading: true, data: null }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__loading')).toBeInTheDocument();
      expect(screen.queryByTestId('AcctProcessMonitorPage__content')).toBeNull();
      expect(screen.queryByTestId('AcctProcessMonitorPage__error')).toBeNull();
      expect(screen.queryByTestId('AcctProcessMonitorPage__runNow')).toBeNull();
    });
  });

  describe('error state', () => {
    it('shows the error card with a retry action', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ error: 'network down', data: null }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__error')).toBeInTheDocument();
      expect(screen.getByTestId('AcctProcessMonitorPage__retry')).toBeInTheDocument();
      expect(screen.queryByTestId('AcctProcessMonitorPage__content')).toBeNull();
    });

    it('retry invokes reload()', async () => {
      const reload = vi.fn();
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ error: 'boom', data: null, reload }));
      const user = userEvent.setup();
      render(<AcctProcessMonitorPage />);
      await user.click(screen.getByTestId('AcctProcessMonitorPage__retry'));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('offers no way to launch a run from the error shell', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ error: 'boom', data: null }));
      render(<AcctProcessMonitorPage />);
      expect(screen.queryByTestId('AcctProcessMonitorPage__runNow')).toBeNull();
    });
  });

  describe('no-access state', () => {
    it('shows the no-access card, not the error card', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ denied: true, data: null }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__noAccess')).toBeInTheDocument();
      expect(screen.queryByTestId('AcctProcessMonitorPage__error')).toBeNull();
      expect(screen.queryByTestId('AcctProcessMonitorPage__runNow')).toBeNull();
    });
  });

  describe('not-installed state', () => {
    it('shows the not-installed card, distinct from the no-access one', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ notInstalled: true, data: null }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__notInstalled')).toBeInTheDocument();
      expect(screen.queryByTestId('AcctProcessMonitorPage__noAccess')).toBeNull();
    });
  });

  // ── content ────────────────────────────────────────────────────────────────

  describe('status card', () => {
    beforeEach(() => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState());
    });

    it('renders the status card with the process name and the three summary tiles', () => {
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__statusCard')).toBeInTheDocument();
      expect(screen.getByTestId('AcctProcessMonitorPage__lastStatus')).toBeInTheDocument();
      expect(screen.getByTestId('AcctProcessMonitorPage__lastRun')).toBeInTheDocument();
      expect(screen.getByTestId('AcctProcessMonitorPage__nextRun')).toBeInTheDocument();
    });

    it('shows the last status as a pill, not a raw three-letter code', () => {
      render(<AcctProcessMonitorPage />);
      const tile = screen.getByTestId('AcctProcessMonitorPage__lastStatus');
      expect(tile.textContent).toContain('acctProcessStatusSuccess');
      expect(tile.textContent).not.toContain('SUC');
    });

    it('says the manual run only ADDS to the automatic schedule', () => {
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__cadenceHint').textContent)
        .toBe('acctProcessManualRunHint');
    });

    it('does not show a running indicator while the process is idle', () => {
      render(<AcctProcessMonitorPage />);
      expect(screen.queryByTestId('AcctProcessMonitorPage__running')).toBeNull();
    });

    it('refresh invokes reload()', async () => {
      const reload = vi.fn();
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ reload }));
      const user = userEvent.setup();
      render(<AcctProcessMonitorPage />);
      await user.click(screen.getByTestId('AcctProcessMonitorPage__refresh'));
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('unscheduled instance', () => {
    it('says so on the tile and switches the hint, instead of showing a next-run time', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        data: { ...LOADED, scheduled: false, nextRunTime: null },
      }));
      render(<AcctProcessMonitorPage />);
      // The tile testid wraps its own label plus the value, so this asserts on the value inside it.
      expect(screen.getByTestId('AcctProcessMonitorPage__nextRun').textContent)
        .toBe('acctProcessNextRunacctProcessNotScheduled');
      expect(screen.getByTestId('AcctProcessMonitorPage__cadenceHint').textContent)
        .toBe('acctProcessNotScheduledHint');
    });
  });

  describe('never-run instance', () => {
    it('says the process has never run instead of rendering an empty status pill', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        data: { ...LOADED, lastRun: null, history: [] },
      }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__lastStatus').textContent)
        .toBe('acctProcessLastStatusacctProcessNeverRun');
      expect(screen.queryByTestId('RunStatusPill__17e70d')).toBeNull();
    });
  });

  // ── the Run now button ─────────────────────────────────────────────────────

  describe('Run now', () => {
    it('is enabled and calls trigger() once on an idle, scheduled instance', async () => {
      const trigger = vi.fn();
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ trigger }));
      const user = userEvent.setup();
      render(<AcctProcessMonitorPage />);
      const button = screen.getByTestId('AcctProcessMonitorPage__runNow');
      expect(button).toBeEnabled();
      await user.click(button);
      expect(trigger).toHaveBeenCalledTimes(1);
    });

    it('is disabled while a trigger is in flight, so a second click cannot stack a duplicate run', async () => {
      const trigger = vi.fn();
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ triggering: true, trigger }));
      const user = userEvent.setup();
      render(<AcctProcessMonitorPage />);
      const button = screen.getByTestId('AcctProcessMonitorPage__runNow');
      expect(button).toBeDisabled();
      await user.click(button, { pointerEventsCheck: 0 });
      expect(trigger).not.toHaveBeenCalled();
    });

    it('is disabled while the backend still reports a run in progress', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ running: true }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__runNow')).toBeDisabled();
      expect(screen.getByTestId('AcctProcessMonitorPage__running')).toBeInTheDocument();
    });

    it('is disabled on an instance where the process is not scheduled at all', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        data: { ...LOADED, scheduled: false },
      }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__runNow')).toBeDisabled();
    });

    it('also locks refresh while a trigger is in flight', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ triggering: true }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__refresh')).toBeDisabled();
    });
  });

  // ── the trigger outcome line ───────────────────────────────────────────────

  describe('trigger outcome', () => {
    it('renders nothing before the button has been pressed', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState());
      render(<AcctProcessMonitorPage />);
      expect(screen.queryByTestId('AcctProcessMonitorPage__triggerOutcome')).toBeNull();
    });

    it('confirms a started run', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        triggerOutcome: { started: true, reason: 'started' },
      }));
      render(<AcctProcessMonitorPage />);
      const outcome = screen.getByTestId('AcctProcessMonitorPage__triggerOutcome');
      expect(outcome.textContent).toBe('acctProcessTriggerStarted');
      expect(outcome.className).not.toContain('text-destructive');
    });

    it.each([
      ['alreadyRunning', 'acctProcessTriggerAlreadyRunning'],
      ['notScheduled', 'acctProcessTriggerNotScheduled'],
      ['schedulerUnavailable', 'acctProcessTriggerSchedulerUnavailable'],
      ['systemClientNotScopable', 'acctProcessTriggerSystemClient'],
      ['scheduleFailed', 'acctProcessTriggerFailed'],
    ])('explains the %s refusal with its own message', (reason, expectedKey) => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        triggerOutcome: { started: false, reason },
      }));
      render(<AcctProcessMonitorPage />);
      const outcome = screen.getByTestId('AcctProcessMonitorPage__triggerOutcome');
      expect(outcome.textContent).toBe(expectedKey);
      expect(outcome).toHaveAttribute('data-reason', reason);
      expect(outcome.className).toContain('text-destructive');
    });

    it('still renders a message for an UNKNOWN reason, never a blank line', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        triggerOutcome: { started: false, reason: 'somethingNewFromANewerBackend' },
      }));
      render(<AcctProcessMonitorPage />);
      const outcome = screen.getByTestId('AcctProcessMonitorPage__triggerOutcome');
      expect(outcome.textContent).toBe('acctProcessTriggerFailed');
      expect(outcome.textContent.trim()).not.toBe('');
    });

    it('reports success by `started`, not by the reason string', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        triggerOutcome: { started: true, reason: 'anythingAtAll' },
      }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__triggerOutcome').textContent)
        .toBe('acctProcessTriggerStarted');
    });
  });

  // ── the history table ──────────────────────────────────────────────────────

  describe('history', () => {
    beforeEach(() => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState());
    });

    it('renders one row per run, keyed by the run id', () => {
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__historyTable')).toBeInTheDocument();
      expect(screen.getByTestId('AcctProcessMonitorPage__row-run-1')).toBeInTheDocument();
      expect(screen.getByTestId('AcctProcessMonitorPage__row-run-2')).toBeInTheDocument();
    });

    it('renders each row status as a human label, never the raw code', () => {
      render(<AcctProcessMonitorPage />);
      const success = within(screen.getByTestId('AcctProcessMonitorPage__row-run-1'));
      expect(success.getByTestId('RunStatusPill__17e70d').textContent)
        .toBe('acctProcessStatusSuccess');
      const failed = within(screen.getByTestId('AcctProcessMonitorPage__row-run-2'));
      expect(failed.getByTestId('RunStatusPill__17e70d')).toHaveAttribute('data-status', 'ERR');
      expect(failed.getByTestId('RunStatusPill__17e70d').textContent)
        .toBe('acctProcessStatusError');
    });

    it('labels each row manual or automatic', () => {
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__row-run-1').textContent)
        .toContain('acctProcessTriggerAutomatic');
      expect(screen.getByTestId('AcctProcessMonitorPage__row-run-2').textContent)
        .toContain('acctProcessTriggerManual');
    });

    it('renders an em dash for a run that has not finished, instead of an empty cell', () => {
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__row-run-2').textContent).toContain('—');
    });

    it('shows the empty state and no table when the process has never run', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({
        data: { ...LOADED, lastRun: null, history: [] },
      }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__historyEmpty')).toBeInTheDocument();
      expect(screen.queryByTestId('AcctProcessMonitorPage__historyTable')).toBeNull();
    });

    it('tolerates a payload with no history key at all', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState({ data: { scheduled: true } }));
      render(<AcctProcessMonitorPage />);
      expect(screen.getByTestId('AcctProcessMonitorPage__historyEmpty')).toBeInTheDocument();
    });
  });

  // ── the log must never be rendered ─────────────────────────────────────────

  describe('log exposure', () => {
    it('never renders the raw process output, even when a payload carries one', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState());
      render(<AcctProcessMonitorPage />);
      expect(document.body.textContent).not.toContain(LOG_SENTINEL);
    });

    it('offers no log column and no per-row drill-down', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState());
      render(<AcctProcessMonitorPage />);
      const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent);
      expect(headers).toEqual([
        'acctProcessColStatus',
        'acctProcessColStart',
        'acctProcessColEnd',
        'acctProcessColDuration',
        'acctProcessColTrigger',
      ]);
      const testIds = Array.from(document.querySelectorAll('[data-testid]'))
        .map((el) => el.getAttribute('data-testid'));
      expect(testIds.some((id) => /log|detail|expand/i.test(id))).toBe(false);
      expect(document.querySelectorAll('tbody tr button')).toHaveLength(0);
    });

    it('exposes no create/edit/delete affordance anywhere — the page is read-only bar the trigger', () => {
      mockUseAcctProcessMonitor.mockReturnValue(hookState());
      render(<AcctProcessMonitorPage />);
      const testIds = Array.from(document.querySelectorAll('[data-testid]'))
        .map((el) => el.getAttribute('data-testid'));
      expect(testIds.some((id) => /delete|create|edit/i.test(id))).toBe(false);
      expect(document.querySelector('form')).toBeNull();
    });
  });
});
