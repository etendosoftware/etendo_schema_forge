// Vitest tests for FmRowActions.jsx — the hover-revealed Edit/Delete/Reactivate
// icon set for a declaration row (ETP-5187 Edit/Delete, ETP-5338 Reactivate).
// Own render contract only; the caller-side wiring (which status gets which
// action, confirm-dialog flows) is covered in FmListPage.rowActions.vitest.jsx
// since this component has no status awareness of its own — each button only
// renders when its handler prop is passed (see the component's doc comment).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('lucide-react', () => ({
  Pencil: () => null,
  Trash2: () => null,
  Loader2: () => null,
  RotateCcw: () => null,
}));

import FmRowActions from '../FmRowActions.jsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmRowActions — rendering', () => {
  it('renders both Edit and Delete buttons', () => {
    render(<FmRowActions onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('FmRowActions__edit')).toBeInTheDocument();
    expect(screen.getByTestId('FmRowActions__delete')).toBeInTheDocument();
  });

  it('Delete button is enabled by default (deleting=false)', () => {
    render(<FmRowActions onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('FmRowActions__delete')).not.toBeDisabled();
  });

  it('Delete button is disabled while deleting=true', () => {
    render(<FmRowActions onEdit={vi.fn()} onDelete={vi.fn()} deleting />);
    expect(screen.getByTestId('FmRowActions__delete')).toBeDisabled();
  });

  it('does not render the Reactivate button when onReactivate is not passed', () => {
    render(<FmRowActions onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByTestId('FmRowActions__reactivate')).not.toBeInTheDocument();
  });

  it('does not render Edit/Delete when only onReactivate is passed', () => {
    render(<FmRowActions onReactivate={vi.fn()} />);
    expect(screen.queryByTestId('FmRowActions__edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('FmRowActions__delete')).not.toBeInTheDocument();
    expect(screen.getByTestId('FmRowActions__reactivate')).toBeInTheDocument();
  });

  it('renders the Reactivate button when onReactivate is passed', () => {
    render(<FmRowActions onReactivate={vi.fn()} />);
    expect(screen.getByTestId('FmRowActions__reactivate')).toBeInTheDocument();
  });

  it('Reactivate button is enabled by default (reactivating=false)', () => {
    render(<FmRowActions onReactivate={vi.fn()} />);
    expect(screen.getByTestId('FmRowActions__reactivate')).not.toBeDisabled();
  });

  it('Reactivate button is disabled while reactivating=true', () => {
    render(<FmRowActions onReactivate={vi.fn()} reactivating />);
    expect(screen.getByTestId('FmRowActions__reactivate')).toBeDisabled();
  });
});

describe('FmRowActions — interactions', () => {
  it('calls onEdit when the Edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<FmRowActions onEdit={onEdit} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('FmRowActions__edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when the Delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<FmRowActions onEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('FmRowActions__delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not call onDelete when the Delete button is disabled (deleting=true)', () => {
    const onDelete = vi.fn();
    render(<FmRowActions onEdit={vi.fn()} onDelete={onDelete} deleting />);
    fireEvent.click(screen.getByTestId('FmRowActions__delete'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('stops the click from bubbling up to an ancestor row click handler', () => {
    const rowClick = vi.fn();
    const { container } = render(
      <div onClick={rowClick}>
        <FmRowActions onEdit={vi.fn()} onDelete={vi.fn()} />
      </div>
    );
    fireEvent.click(container.querySelector('.fm-row-actions'));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('edit click does not bubble up to trigger an ancestor row click handler either', () => {
    const rowClick = vi.fn();
    const onEdit = vi.fn();
    render(
      <div onClick={rowClick}>
        <FmRowActions onEdit={onEdit} onDelete={vi.fn()} />
      </div>
    );
    fireEvent.click(screen.getByTestId('FmRowActions__edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('calls onReactivate when the Reactivate button is clicked', () => {
    const onReactivate = vi.fn();
    render(<FmRowActions onReactivate={onReactivate} />);
    fireEvent.click(screen.getByTestId('FmRowActions__reactivate'));
    expect(onReactivate).toHaveBeenCalledTimes(1);
  });

  it('does not call onReactivate when the Reactivate button is disabled (reactivating=true)', () => {
    const onReactivate = vi.fn();
    render(<FmRowActions onReactivate={onReactivate} reactivating />);
    fireEvent.click(screen.getByTestId('FmRowActions__reactivate'));
    expect(onReactivate).not.toHaveBeenCalled();
  });

  it('reactivate click does not bubble up to an ancestor row click handler', () => {
    const rowClick = vi.fn();
    const onReactivate = vi.fn();
    render(
      <div onClick={rowClick}>
        <FmRowActions onReactivate={onReactivate} />
      </div>
    );
    fireEvent.click(screen.getByTestId('FmRowActions__reactivate'));
    expect(onReactivate).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });
});
