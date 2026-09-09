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
