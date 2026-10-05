// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/hooks/useRoleMenu.js', () => ({ useRoleMenu: vi.fn() }));

import { useRoleMenu } from '@/hooks/useRoleMenu.js';
import ProcessAccessGuard from '../ProcessAccessGuard.jsx';

const PROCESS_ID = 'D6AB95CE52D34E1599590526115E26C6';

function renderGuard() {
  return render(
    <ProcessAccessGuard processId={PROCESS_ID}>
      <div data-testid="guarded-child">content</div>
    </ProcessAccessGuard>,
  );
}

describe('ProcessAccessGuard (ETP-5485)', () => {
  it('renders the shared access-denied screen and not the children when the role lacks the process', () => {
    useRoleMenu.mockReturnValue(new Set(['some-other-id']));
    renderGuard();
    expect(screen.getByTestId('window-access-denied')).toHaveTextContent('windowAccessDenied');
    expect(screen.queryByTestId('guarded-child')).not.toBeInTheDocument();
  });

  it('renders the children when the role can reach the process', () => {
    useRoleMenu.mockReturnValue(new Set([PROCESS_ID]));
    renderGuard();
    expect(screen.getByTestId('guarded-child')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-denied')).not.toBeInTheDocument();
  });

  it('renders neither the children nor the denied screen while access is still loading', () => {
    useRoleMenu.mockReturnValue(undefined);
    renderGuard();
    expect(screen.getByTestId('process-access-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('guarded-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('window-access-denied')).not.toBeInTheDocument();
  });

  it('fails open (renders the children) when the access map is unreachable, like the sidebar', () => {
    useRoleMenu.mockReturnValue(null);
    renderGuard();
    expect(screen.getByTestId('guarded-child')).toBeInTheDocument();
  });

  it('denies an empty (zero-access) role', () => {
    useRoleMenu.mockReturnValue(new Set());
    renderGuard();
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
  });
});
