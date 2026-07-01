import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n (kept for safety; the component no longer renders i18n strings itself)
vi.mock('../../../i18n/index.js', () => ({
  useUI: () => (key) => key,
}));

// Mock Radix dropdown — render a simplified version that works in jsdom.
vi.mock('../dropdown-menu.jsx', async () => {
  const React = await import('react');
  return {
    DropdownMenu: ({ children }) => <>{children}</>,
    DropdownMenuTrigger: React.forwardRef(({ children, asChild, ...props }, ref) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, { ...props, ref });
      }
      return <div {...props} ref={ref}>{children}</div>;
    }),
    DropdownMenuContent: ({ children }) => <div role="menu">{children}</div>,
    DropdownMenuItem: ({ children, onSelect, disabled, ...props }) => (
      <button
        role="menuitem"
        onClick={onSelect}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    ),
  };
});

import { AddLineButton } from '../add-line-button.jsx';

describe('AddLineButton', () => {
  it('renders with label text', () => {
    render(<AddLineButton onClick={vi.fn()} label="Add line" />);
    expect(screen.getByText('Add line')).toBeInTheDocument();
  });

  it('calls onClick when primary button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AddLineButton onClick={onClick} label="Add line" />);
    await user.click(screen.getByTestId('action-add-line'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AddLineButton onClick={onClick} label="Add line" disabled={true} />);
    await user.click(screen.getByTestId('action-add-line'));
    expect(onClick).not.toHaveBeenCalled();
  });

  // --- State 1: 0 additional actions ---
  describe('with 0 additional actions', () => {
    it('renders only the primary button (no chevron) when menuActions is undefined', () => {
      render(<AddLineButton onClick={vi.fn()} label="Add line" />);
      expect(screen.getByTestId('action-add-line')).toBeInTheDocument();
      expect(screen.queryByTestId('action-add-line-more')).not.toBeInTheDocument();
    });

    it('renders only the primary button when menuActions is empty', () => {
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={[]} />);
      expect(screen.getByTestId('action-add-line')).toBeInTheDocument();
      expect(screen.queryByTestId('action-add-line-more')).not.toBeInTheDocument();
    });

    it('does not render the "no additional actions" placeholder', () => {
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={[]} />);
      expect(screen.queryByText('noAdditionalActions')).not.toBeInTheDocument();
    });

    it('treats hideChevron as the 0-action case even with actions provided', () => {
      const menuActions = [
        { key: 'a', label: 'Action A', onClick: vi.fn() },
        { key: 'b', label: 'Action B', onClick: vi.fn() },
      ];
      render(
        <AddLineButton onClick={vi.fn()} label="Add line" menuActions={menuActions} hideChevron />
      );
      expect(screen.getByTestId('action-add-line')).toBeInTheDocument();
      expect(screen.queryByTestId('action-add-line-more')).not.toBeInTheDocument();
    });
  });

  // --- State 2: exactly 1 additional action (still uses the chevron dropdown) ---
  describe('with exactly 1 additional action', () => {
    it('renders the chevron and a one-item dropdown (no single-pill button)', () => {
      const menuActions = [{ key: 'import', label: 'Import Lines', onClick: vi.fn() }];
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={menuActions} />);
      expect(screen.getByTestId('action-add-line-more')).toBeInTheDocument();
      expect(screen.getByLabelText('More actions')).toBeInTheDocument();
      expect(screen.getByText('Import Lines')).toBeInTheDocument();
      expect(screen.queryByTestId('action-add-line-single')).not.toBeInTheDocument();
    });

    it('fires the action onClick when its dropdown item is clicked', async () => {
      const user = userEvent.setup();
      const actionClick = vi.fn();
      const menuActions = [{ key: 'do', label: 'Do Something', onClick: actionClick }];
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={menuActions} />);
      await user.click(screen.getByText('Do Something'));
      expect(actionClick).toHaveBeenCalledTimes(1);
    });

    it('respects a disabled single action in the dropdown', () => {
      const menuActions = [{ key: 'nope', label: 'Cannot Click', onClick: vi.fn(), disabled: true }];
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={menuActions} />);
      expect(screen.getByText('Cannot Click').closest('button')).toBeDisabled();
    });
  });

  // --- State 3: 2+ additional actions ---
  describe('with 2 or more additional actions', () => {
    it('renders the chevron and lists all actions in the dropdown', () => {
      const menuActions = [
        { key: 'delete-all', label: 'Delete All', onClick: vi.fn() },
        { key: 'import', label: 'Import Lines', onClick: vi.fn() },
      ];
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={menuActions} />);
      expect(screen.getByTestId('action-add-line-more')).toBeInTheDocument();
      expect(screen.getByLabelText('More actions')).toBeInTheDocument();
      expect(screen.getByText('Delete All')).toBeInTheDocument();
      expect(screen.getByText('Import Lines')).toBeInTheDocument();
    });

    it('calls a menu action onClick when its item is clicked', async () => {
      const user = userEvent.setup();
      const actionClick = vi.fn();
      const menuActions = [
        { key: 'a1', label: 'Do Something', onClick: actionClick },
        { key: 'a2', label: 'Other', onClick: vi.fn() },
      ];
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={menuActions} />);
      await user.click(screen.getByText('Do Something'));
      expect(actionClick).toHaveBeenCalledTimes(1);
    });

    it('renders a disabled menu action as disabled', () => {
      const menuActions = [
        { key: 'nope', label: 'Cannot Click', onClick: vi.fn(), disabled: true },
        { key: 'ok', label: 'Can Click', onClick: vi.fn() },
      ];
      render(<AddLineButton onClick={vi.fn()} label="Add line" menuActions={menuActions} />);
      expect(screen.getByText('Cannot Click').closest('button')).toBeDisabled();
    });
  });
});
