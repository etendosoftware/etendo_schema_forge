// Vitest tests for FmRowActions.jsx — the hover-revealed Edit/Delete icon pair
// for a draft declaration row (ETP-5187). Own render contract only; the
// caller-side wiring (only rendered for draft rows, delete confirmation flow)
// is covered in FmListPage.rowActions.vitest.jsx since this component has no
// status awareness of its own (see its own doc comment).

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
});
