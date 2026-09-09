// ETP-5116 — SmartScanPage had zero real access control (any authenticated
// user, any role, could reach it by URL regardless of the menu). This suite
// covers the useWindowAccess()/WindowAccessGuard gate added to close that
// gap, mirroring the pattern already covered for sales-order/purchase-order
// (see src/windows/custom/sales-order/__tests__/index.vitest.jsx) and
// financial-account (src/windows/custom/financial-account/__tests__/index.wrapper.vitest.jsx).

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));

let currentWindowAccessTier = 'full';
vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: () => currentWindowAccessTier,
  WindowAccessGuard: (props) => (
    <div data-testid="window-access-guard" data-window-id={props.windowId} />
  ),
}));

import SmartScanPage from '../SmartScanPage.jsx';

describe('SmartScanPage — window access gate (ETP-5116)', () => {
  beforeEach(() => {
    currentWindowAccessTier = 'full';
  });

  it('renders the normal page content when the access tier is full', () => {
    render(<SmartScanPage />);

    expect(screen.getByTestId('smartscan-page')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-guard')).not.toBeInTheDocument();
  });

  it('renders the normal page content when the access tier is read-only', () => {
    currentWindowAccessTier = 'read-only';
    render(<SmartScanPage />);

    expect(screen.getByTestId('smartscan-page')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-guard')).not.toBeInTheDocument();
  });

  it('renders the WindowAccessGuard (windowId 33705E0F52874D91B0BB2FF8BB648B8E) instead of the page when the access tier is none', () => {
    currentWindowAccessTier = 'none';
    render(<SmartScanPage />);

    expect(screen.getByTestId('window-access-guard')).toHaveAttribute(
      'data-window-id',
      '33705E0F52874D91B0BB2FF8BB648B8E',
    );
    expect(screen.queryByTestId('smartscan-page')).not.toBeInTheDocument();
  });
});
