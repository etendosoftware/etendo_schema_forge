import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

/**
 * ETP-5184 — AppLayout must mount HighlightProvider ABOVE CopilotProvider.
 *
 * useAiCopilotChat() calls useHighlight(), and useHighlight() degrades to a
 * no-op outside its provider instead of throwing. So getting the nesting wrong
 * does not fail loudly: `highlight_element` would keep reporting `ok: true` to
 * the model while nothing at all appears on screen. This suite pins the
 * ordering by probing, from CopilotProvider's own position in the tree,
 * whether the highlight state it sees is the real one.
 */

const seen = { highlight: null };

vi.mock('@/i18n', () => ({ useUI: () => key => key }));
vi.mock('@/auth/useLogout.js', () => ({ useLogout: () => vi.fn() }));
vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet">Outlet</div>,
  useLocation: () => ({ pathname: '/sales-order/123' }),
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}));
vi.mock('@/hooks/useRoleMenu.js', () => ({ useRoleMenu: vi.fn(() => null) }));
vi.mock('@/lib/flags/useAccountIdentity.js', () => ({ useAccountIdentity: vi.fn() }));
vi.mock('@/components/layout/SideMenu', () => ({ default: () => <div data-testid="side-menu" /> }));
vi.mock('@/components/layout/SidebarContext', () => ({
  SidebarProvider: ({ children }) => <div>{children}</div>,
  useSidebar: () => ({ expanded: true, toggle: vi.fn() }),
}));
vi.mock('@/components/layout/FavoritesContext', () => ({
  FavoritesProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/layout/PageMetaContext', () => ({
  PageMetaProvider: ({ children }) => <div>{children}</div>,
  usePageMeta: () => ({ title: 'Test', breadcrumb: 'Test', onBack: vi.fn() }),
}));
vi.mock('@/components/layout/TopBar', () => ({ default: () => <div data-testid="top-bar" /> }));
vi.mock('@/components/CommandPalette.jsx', () => ({ CommandPalette: () => <div /> }));
vi.mock('@/components/CopilotWidget', () => ({ CopilotWidget: () => <div /> }));
vi.mock('@/components/CurrentWindowContext', () => ({
  CurrentWindowProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/support/SupportChatContext.jsx', () => ({
  SupportChatProvider: ({ children }) => <div>{children}</div>,
  useSupportChat: () => ({ state: { isOpen: false, unreadCount: 0 }, actions: { open: vi.fn(), close: vi.fn() } }),
}));
vi.mock('@/components/support/SupportChatWidget.jsx', () => ({ SupportChatWidget: () => <div /> }));
vi.mock('@/components/webmcp/WebMcpEtendoGoTools.jsx', () => ({ WebMcpEtendoGoTools: () => <div /> }));

// Stands in for the real CopilotProvider at exactly its place in the tree, and
// reports what useHighlight() resolves to from there — which is what
// useAiCopilotChat would get.
vi.mock('@/components/CopilotContext', async () => {
  const { useHighlight } = await import('@/components/copilot/highlight/HighlightContext.jsx');
  return {
    CopilotProvider: ({ children }) => {
      seen.highlight = useHighlight();
      return <div data-testid="copilot-provider">{children}</div>;
    },
  };
});

import AppLayout from '../AppLayout.jsx';

describe('AppLayout — highlight wiring', () => {
  it('gives the Copilot a real highlight context, not the no-op fallback', () => {
    render(<AppLayout menuGroups={[{ label: 'Sales', items: [] }]} />);
    expect(screen.getByTestId('copilot-provider')).toBeInTheDocument();
    expect(seen.highlight).not.toBeNull();

    // The no-op fallback is a frozen singleton whose highlight() changes
    // nothing; the real provider's does.
    const element = document.createElement('div');
    document.body.appendChild(element);
    act(() => seen.highlight.highlight({ element, note: 'probe' }));
    // Re-read: the provider re-rendered CopilotProvider with fresh state.
    expect(seen.highlight.element).toBe(element);
    expect(seen.highlight.note).toBe('probe');
    element.remove();
  });
});
