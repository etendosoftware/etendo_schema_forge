/**
 * Tests for roleSelectionContext.js — ETP-4906. See the module's own doc comment for
 * why `AssignTemplateRolesControl` needs a shared React Context at all (the
 * `formFooter`/`headerExtra` slot has no prop-override mechanism, unlike
 * `customTabs[].props`) and the documented "never throws when unwrapped" fallback
 * behavior, which several sibling components' own test suites rely on instead of
 * wrapping every render in a `RoleSelectionProvider`.
 */
import { render, screen } from '@testing-library/react';
import { useRoleSelection, RoleSelectionProvider } from '../roleSelectionContext.js';

function Probe() {
  const { selectedRoleIds, setSelectedRoleIds } = useRoleSelection();
  return (
    <div>
      <div data-testid="ids">{JSON.stringify(selectedRoleIds)}</div>
      <button type="button" data-testid="set" onClick={() => setSelectedRoleIds(['x'])}>set</button>
    </div>
  );
}

describe('roleSelectionContext', () => {
  describe('useRoleSelection outside a RoleSelectionProvider', () => {
    it('falls back to an empty selectedRoleIds array without throwing', () => {
      expect(() => render(<Probe />)).not.toThrow();
      expect(screen.getByTestId('ids')).toHaveTextContent('[]');
    });

    it('falls back to a no-op setSelectedRoleIds that does not throw when called', () => {
      render(<Probe />);
      expect(() => screen.getByTestId('set').click()).not.toThrow();
      // The fallback setter is inert — the local snapshot never changes.
      expect(screen.getByTestId('ids')).toHaveTextContent('[]');
    });
  });

  describe('useRoleSelection inside a RoleSelectionProvider', () => {
    it('reads the value supplied by the Provider', () => {
      render(
        <RoleSelectionProvider value={{ selectedRoleIds: ['role-fin', 'role-sales'], setSelectedRoleIds: vi.fn() }}>
          <Probe />
        </RoleSelectionProvider>,
      );
      expect(screen.getByTestId('ids')).toHaveTextContent('["role-fin","role-sales"]');
    });

    it('calls the Provider\'s own setSelectedRoleIds, not the inert fallback', () => {
      const setSelectedRoleIds = vi.fn();
      render(
        <RoleSelectionProvider value={{ selectedRoleIds: [], setSelectedRoleIds }}>
          <Probe />
        </RoleSelectionProvider>,
      );
      screen.getByTestId('set').click();
      expect(setSelectedRoleIds).toHaveBeenCalledWith(['x']);
    });
  });
});
