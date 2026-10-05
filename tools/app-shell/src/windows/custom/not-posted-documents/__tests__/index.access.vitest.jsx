// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/hooks/useRoleMenu.js', () => ({ useRoleMenu: vi.fn() }));

import { useRoleMenu } from '@/hooks/useRoleMenu.js';
import NotPostedDocumentsRoute from '../index.jsx';

// ETP-5485 (BUG-2) — the route entry registered in `windows/registry.js`
// (`'not-posted-documents'`) must gate the page on the "Not Posted Documents" OBUIAPP process
// (the same id the sidebar filters this entry by), so a role without it never mounts the page
// and never fires its requests.
describe('not-posted-documents route entry', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ rows: [] }) }));
  });

  it('shows the access-denied screen and never mounts the page for a role without the process', () => {
    useRoleMenu.mockReturnValue(new Set(['unrelated']));
    render(<NotPostedDocumentsRoute token="t" apiBaseUrl="/swebsf/not-posted-documents" />);
    expect(screen.getByTestId('window-access-denied')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('mounts the page for a role holding the process', async () => {
    useRoleMenu.mockReturnValue(new Set(['D6AB95CE52D34E1599590526115E26C6']));
    render(
      <MemoryRouter initialEntries={['/not-posted-documents']}>
        <NotPostedDocumentsRoute token="t" apiBaseUrl="/swebsf/not-posted-documents" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('npd-empty-none')).toBeInTheDocument();
    expect(screen.queryByTestId('window-access-denied')).not.toBeInTheDocument();
  });
});
