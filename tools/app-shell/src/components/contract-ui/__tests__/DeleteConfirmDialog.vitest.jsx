/**
 * ETP-5111 — `DeleteConfirmDialog`: the app's ONE delete-confirmation dialog.
 *
 * Lifted verbatim out of `useBatchDeleteDialog` so a per-row delete and a bulk delete of the same
 * record are the same component rendered twice, not two dialogs that merely resemble each other.
 * Two surfaces depend on it today: the hook (every bulk-delete surface in the app) and the
 * Movimientos row kebab, which renders it directly with `count={1}` for a draft or a blocked row.
 *
 * SCOPE. That the hook's rendered output did not change through the extraction is already asserted
 * by `hooks/__tests__/useBatchDeleteDialog.vitest.jsx`, which drives the real dialog through the
 * real hook and reaches for `batch-delete-confirm` / `Button__batch-delete-cancel` /
 * `bulkDeleteConfirmTitle` / `bulkDeleteConfirmMessage` — so it fails if the markup or the keys
 * moved. This file deliberately does NOT restate that. It pins the component's own contract, which
 * nothing else covers now that a second, non-hook caller exists: the props it accepts and the
 * `data-testid`s it publishes, both of which are now a shared surface rather than an internal
 * detail of one hook.
 */

// Interpolating mock so the count actually reaching `bulkDeleteConfirmMessage` is observable —
// `count` is the one prop the two callers pass differently (N vs. a hardcoded 1).
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const map = {
      bulkDeleteConfirmTitle: 'Delete records',
      bulkDeleteConfirmMessage: 'Are you sure you want to delete {count} record(s)?',
      cancel: 'Cancel',
      delete: 'Delete',
      bulkDeleteInProgress: 'Deleting…',
      bulkDeleteInProgressMessage: 'Deleting {count} record(s). This may take a few seconds.',
    };
    let text = map[key] || key;
    if (params) Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    return text;
  },
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteConfirmDialog } from '../DeleteConfirmDialog.jsx';

const baseProps = {
  open: true,
  count: 3,
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeleteConfirmDialog', () => {
  it('renders the title and the count-interpolated message', () => {
    render(<DeleteConfirmDialog {...baseProps} />);

    expect(screen.getByText('Delete records')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete 3 record(s)?')).toBeInTheDocument();
  });

  // The single-row case the row kebab introduced. Same copy, same plural-agnostic wording — the
  // component has no special case for one record, and must not grow one.
  it('interpolates a count of 1 through the same message', () => {
    render(<DeleteConfirmDialog {...baseProps} count={1} />);

    expect(screen.getByText('Are you sure you want to delete 1 record(s)?')).toBeInTheDocument();
  });

  /**
   * The testids are a cross-surface contract, not an internal detail: `batch-delete-confirm` is
   * reached for by the bulk-delete suites, the Movimientos kebab suite and the e2e specs alike.
   * Renaming one would break tests far from this file, so it is pinned where the name is defined.
   */
  it('publishes the shared confirm/cancel testids', () => {
    render(<DeleteConfirmDialog {...baseProps} />);

    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('Button__batch-delete-cancel')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(<DeleteConfirmDialog {...baseProps} open={false} />);

    expect(screen.queryByText('Delete records')).not.toBeInTheDocument();
    expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument();
  });

  it('calls onConfirm when the destructive button is pressed', async () => {
    const onConfirm = vi.fn();
    render(<DeleteConfirmDialog {...baseProps} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByTestId('batch-delete-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the dialog is dismissed', async () => {
    const onClose = vi.fn();
    render(<DeleteConfirmDialog {...baseProps} onClose={onClose} />);

    await userEvent.click(screen.getByTestId('Button__batch-delete-cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // In-flight state: both buttons lock so a slow delete cannot be double-submitted or cancelled
  // half-way. This is the ONLY disabled state the dialog has — it never gates on eligibility.
  it('disables both buttons while deleting', () => {
    render(<DeleteConfirmDialog {...baseProps} deleting />);

    expect(screen.getByTestId('batch-delete-confirm')).toBeDisabled();
    expect(screen.getByTestId('Button__batch-delete-cancel')).toBeDisabled();
  });

  it('leaves both buttons enabled when not deleting', () => {
    render(<DeleteConfirmDialog {...baseProps} />);

    expect(screen.getByTestId('batch-delete-confirm')).not.toBeDisabled();
    expect(screen.getByTestId('Button__batch-delete-cancel')).not.toBeDisabled();
  });

  // `deleting` is optional and defaults to false — the row kebab relies on that default when it
  // has no in-flight state of its own to pass.
  it('treats a missing deleting prop as not deleting', () => {
    render(
      <DeleteConfirmDialog open count={1} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('batch-delete-confirm')).not.toBeDisabled();
  });
});

// ETP-5758 — the in-progress state lives in this dialog, so every bulk-delete surface reads the
// same while its DELETEs run and the dialog cannot be dismissed half-way through the batch.
describe('DeleteConfirmDialog — in-progress state (ETP-5758)', () => {
  it('shows the spinner and the in-progress label on the destructive button while deleting', () => {
    render(<DeleteConfirmDialog {...baseProps} deleting />);

    const confirm = screen.getByTestId('batch-delete-confirm');
    expect(screen.getByTestId('batch-delete-spinner')).toBeInTheDocument();
    expect(confirm).toContainElement(screen.getByTestId('batch-delete-spinner'));
    expect(confirm).toHaveTextContent('Deleting…');
    expect(confirm).not.toHaveTextContent(/^Delete$/);
  });

  it('switches the description to the count-interpolated in-progress message', () => {
    render(<DeleteConfirmDialog {...baseProps} count={4} deleting />);

    expect(screen.getByTestId('DialogDescription__batch-delete'))
      .toHaveTextContent('Deleting 4 record(s). This may take a few seconds.');
    expect(screen.queryByText('Are you sure you want to delete 4 record(s)?')).not.toBeInTheDocument();
    // The title stays the same — only the body and the button change.
    expect(screen.getByText('Delete records')).toBeInTheDocument();
  });

  it('announces the description politely so a screen reader hears the state change', () => {
    render(<DeleteConfirmDialog {...baseProps} deleting />);

    expect(screen.getByTestId('DialogDescription__batch-delete')).toHaveAttribute('aria-live', 'polite');
  });

  it('marks the dialog content aria-busy while deleting, and not otherwise', () => {
    const { rerender } = render(<DeleteConfirmDialog {...baseProps} />);
    expect(screen.getByTestId('DialogContent__batch-delete')).not.toHaveAttribute('aria-busy');

    rerender(<DeleteConfirmDialog {...baseProps} deleting />);
    expect(screen.getByTestId('DialogContent__batch-delete')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows no spinner and the plain Delete label when idle', () => {
    render(<DeleteConfirmDialog {...baseProps} />);

    expect(screen.queryByTestId('batch-delete-spinner')).not.toBeInTheDocument();
    expect(screen.getByTestId('batch-delete-confirm')).toHaveTextContent('Delete');
    expect(screen.getByTestId('batch-delete-confirm')).not.toHaveTextContent('Deleting…');
  });

  it('Escape closes the idle dialog (control) but is swallowed while deleting', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<DeleteConfirmDialog {...baseProps} onClose={onClose} deleting />);

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('DialogContent__batch-delete')).toBeInTheDocument();

    rerender(<DeleteConfirmDialog {...baseProps} onClose={onClose} deleting={false} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click on the overlay closes the idle dialog (control) but not while deleting', async () => {
    // The scrim sits under `pointer-events: none` on <body> while the modal is open; skip
    // user-event's CSS check so the click reaches Radix's outside-pointer handler as in a browser.
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    const onCloseBusy = vi.fn();
    const busy = render(<DeleteConfirmDialog {...baseProps} onClose={onCloseBusy} deleting />);
    await user.click(screen.getByTestId('DialogOverlay__6a5928'));
    expect(onCloseBusy).not.toHaveBeenCalled();
    expect(screen.getByTestId('DialogContent__batch-delete')).toBeInTheDocument();
    busy.unmount();

    const onCloseIdle = vi.fn();
    render(<DeleteConfirmDialog {...baseProps} onClose={onCloseIdle} />);
    await user.click(screen.getByTestId('DialogOverlay__6a5928'));
    expect(onCloseIdle).toHaveBeenCalledTimes(1);
  });

  it('hides the primitive corner X (the content\'s direct <button> child) only while deleting', () => {
    const { rerender } = render(<DeleteConfirmDialog {...baseProps} />);
    const content = screen.getByTestId('DialogContent__batch-delete');
    const cornerX = screen.getByRole('button', { name: 'Close' });
    // Precondition for the `[&>button]:hidden` rule: the X is a DIRECT child, the footer buttons are not.
    expect(cornerX.parentElement).toBe(content);
    expect(screen.getByTestId('batch-delete-confirm').parentElement).not.toBe(content);
    expect(content.className).not.toContain('[&>button]:hidden');

    rerender(<DeleteConfirmDialog {...baseProps} deleting />);
    expect(screen.getByTestId('DialogContent__batch-delete').className).toContain('[&>button]:hidden');
  });

  it('does not call onConfirm when the disabled destructive button is clicked while deleting', async () => {
    const onConfirm = vi.fn();
    render(<DeleteConfirmDialog {...baseProps} onConfirm={onConfirm} deleting />);

    await userEvent.click(screen.getByTestId('batch-delete-confirm'));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('DeleteConfirmDialog — testIdScope (ETP-5758)', () => {
  const SCOPED_IDS = (scope) => [
    `DialogContent__${scope}`,
    `DialogHeader__${scope}`,
    `DialogTitle__${scope}`,
    `DialogDescription__${scope}`,
    `DialogFooter__${scope}`,
    `Button__${scope}-cancel`,
    `${scope}-confirm`,
    `${scope}-spinner`,
  ];

  it('defaults every rendered testid to the batch-delete scope', () => {
    render(<DeleteConfirmDialog {...baseProps} deleting />);

    for (const id of SCOPED_IDS('batch-delete')) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('applies a custom scope to every rendered testid and drops the default one', () => {
    render(<DeleteConfirmDialog {...baseProps} deleting testIdScope="lines-bulk-delete" />);

    for (const id of SCOPED_IDS('lines-bulk-delete')) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    for (const id of SCOPED_IDS('batch-delete')) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
  });

  it('keeps the bulk-delete family ListView / ListModalWindow publish', () => {
    render(<DeleteConfirmDialog {...baseProps} testIdScope="bulk-delete" />);

    expect(screen.getByTestId('bulk-delete-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('Button__bulk-delete-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('DialogContent__bulk-delete')).toBeInTheDocument();
  });
});
