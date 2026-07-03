// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// --- Imports ---

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReactivarModal from '../ReactivarModal.jsx';

// --- Helpers ---

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// --- Tests ---

describe('ReactivarModal', () => {
  it('renders the collection (cobro) copy for dir="in"', () => {
    render(<ReactivarModal dir="in" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('reactivarInTitle')).toBeInTheDocument();
    expect(screen.getByText('reactivarInSub')).toBeInTheDocument();
    expect(screen.getByText('reactivarWarningIn')).toBeInTheDocument();
    expect(screen.queryByText('reactivarOutTitle')).not.toBeInTheDocument();
  });

  it('renders the payment (pago) copy for dir="out"', () => {
    render(<ReactivarModal dir="out" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('reactivarOutTitle')).toBeInTheDocument();
    expect(screen.getByText('reactivarOutSub')).toBeInTheDocument();
    expect(screen.getByText('reactivarWarningOut')).toBeInTheDocument();
    expect(screen.queryByText('reactivarInTitle')).not.toBeInTheDocument();
  });

  it('renders all three warning items with their title and description', () => {
    render(<ReactivarModal dir="in" onConfirm={vi.fn()} onClose={vi.fn()} />);
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(new RegExp(`reactivarItem${n}Title`))).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`reactivarItem${n}Desc`))).toBeInTheDocument();
    }
  });

  it('calls onClose when the header close (X) button is clicked', async () => {
    const onClose = vi.fn();
    render(<ReactivarModal dir="in" onConfirm={vi.fn()} onClose={onClose} />);
    const [closeXButton] = screen.getAllByRole('button');
    await userEvent.click(closeXButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the footer Cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(<ReactivarModal dir="in" onConfirm={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ReactivarModal dir="in" onConfirm={onConfirm} onClose={vi.fn()} />);
    await userEvent.click(screen.getByText('reactivarTodosModoss'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('disables the confirm button and shows an ellipsis while onConfirm is pending, then reverts', async () => {
    const { promise, resolve } = deferred();
    const onConfirm = vi.fn(() => promise);
    render(<ReactivarModal dir="in" onConfirm={onConfirm} onClose={vi.fn()} />);

    const confirmButton = screen.getByText('reactivarTodosModoss');
    await userEvent.click(confirmButton);

    // Loading state: button text becomes '...' and gets disabled.
    const loadingButton = await screen.findByText('...');
    expect(loadingButton).toBeDisabled();

    resolve();

    // Reverts once the promise settles.
    const restoredButton = await screen.findByText('reactivarTodosModoss');
    expect(restoredButton).not.toBeDisabled();
  });

  it('ignores extra clicks while a confirm is already in-flight (no duplicate onConfirm calls)', async () => {
    const { promise, resolve } = deferred();
    const onConfirm = vi.fn(() => promise);
    render(<ReactivarModal dir="in" onConfirm={onConfirm} onClose={vi.fn()} />);

    const confirmButton = screen.getByText('reactivarTodosModoss');
    await userEvent.click(confirmButton);
    // Button is now disabled/showing '...' — clicking again should be a no-op
    // because the DOM button element itself is disabled.
    const loadingButton = await screen.findByText('...');
    await userEvent.click(loadingButton);

    resolve();
    await screen.findByText('reactivarTodosModoss');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('resets loading state even when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
    render(<ReactivarModal dir="in" onConfirm={onConfirm} onClose={vi.fn()} />);

    await userEvent.click(screen.getByText('reactivarTodosModoss'));

    const restoredButton = await screen.findByText('reactivarTodosModoss');
    expect(restoredButton).not.toBeDisabled();
  });
});
