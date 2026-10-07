// @covers tools/app-shell/src/windows/custom/fiscal-models/index.jsx
//
// ETP-5546 — "Modelos Fiscales" was reachable at /fiscal-models with no window-access guard
// at all: index.jsx was a bare `export { default } from './FiscalModelsPage'`, so a role
// without the Tax Report window grant (the "Modelos Fiscales" access proxy, ETP-5116) still
// rendered the full page when navigating directly to the route — the sidebar already hid the
// entry, but the route itself enforced nothing. Mirrors the `useWindowAccess` +
// `WindowAccessGuard` route-level gate convention already proven in
// `fiscal-config/__tests__/FiscalConfigPage.vitest.jsx` ("FiscalConfigPage — no access").
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: vi.fn(),
  WindowAccessGuard: ({ windowId }) => (
    <div data-testid="window-access-guard" data-window-id={windowId} />
  ),
}));

vi.mock('../FiscalModelsPage', () => ({
  default: (props) => <div data-testid="fiscal-models-page" data-props={JSON.stringify(props)} />,
}));

import { useWindowAccess } from '@/auth/AuthContext.jsx';
import FiscalModelsRoute, { FISCAL_MODELS_WINDOW_ID } from '../index.jsx';

describe('FiscalModelsRoute (ETP-5546)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks access against the Tax Report window id (the "Modelos Fiscales" access proxy, ETP-5116)', () => {
    expect(FISCAL_MODELS_WINDOW_ID).toBe('3E8FEA1EA7404D979306C9EE7FD2E7E8');
  });

  it('renders WindowAccessGuard instead of FiscalModelsPage when the tier is "none"', () => {
    vi.mocked(useWindowAccess).mockReturnValue('none');

    render(<FiscalModelsRoute token="tok" apiBaseUrl="/api" />);

    expect(useWindowAccess).toHaveBeenCalledWith(FISCAL_MODELS_WINDOW_ID);
    expect(screen.getByTestId('window-access-guard')).toHaveAttribute(
      'data-window-id',
      FISCAL_MODELS_WINDOW_ID,
    );
    expect(screen.queryByTestId('fiscal-models-page')).not.toBeInTheDocument();
  });

  it('renders FiscalModelsPage, forwarding props, when the tier is "full"', () => {
    vi.mocked(useWindowAccess).mockReturnValue('full');

    render(<FiscalModelsRoute token="tok" apiBaseUrl="/api" />);

    expect(screen.getByTestId('fiscal-models-page')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-guard')).not.toBeInTheDocument();
    const props = JSON.parse(screen.getByTestId('fiscal-models-page').dataset.props);
    expect(props).toMatchObject({ token: 'tok', apiBaseUrl: '/api' });
  });

  it('renders FiscalModelsPage when the tier is "read-only" too (window-gated, not write-gated)', () => {
    vi.mocked(useWindowAccess).mockReturnValue('read-only');

    render(<FiscalModelsRoute token="tok" apiBaseUrl="/api" />);

    expect(screen.getByTestId('fiscal-models-page')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-guard')).not.toBeInTheDocument();
  });
});
