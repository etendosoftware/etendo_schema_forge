// @covers tools/app-shell/src/windows/RedirectWindow.jsx
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { makeRedirectWindow } from '../RedirectWindow.jsx';

function renderAt(initialPath, to) {
  const Redirect = makeRedirectWindow(to);
  const router = createMemoryRouter(
    [
      { path: initialPath, element: <Redirect /> },
      { path: to, element: <div data-testid="target">{to}</div> },
      { path: '/start', element: <div /> },
    ],
    { initialEntries: ['/start', initialPath], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('makeRedirectWindow', () => {
  it.each([
    ['/business-partner', '/contacts'],
    ['/fiscal-calendar', '/calendar'],
  ])('navigates from %s to %s', async (from, to) => {
    const router = renderAt(from, to);
    expect(await screen.findByTestId('target')).toHaveTextContent(to);
    expect(router.state.location.pathname).toBe(to);
  });

  describe('keepPath (ETP-5720)', () => {
    function renderKeepPath(initialPath, keepPath) {
      const Redirect = makeRedirectWindow('/manual-journals', keepPath);
      const target = <div data-testid="target" />;
      const router = createMemoryRouter(
        [
          { path: '/simple-g-l-journal', element: <Redirect /> },
          { path: '/simple-g-l-journal/:recordId', element: <Redirect /> },
          { path: '/manual-journals', element: target },
          { path: '/manual-journals/:recordId', element: target },
        ],
        { initialEntries: [initialPath] },
      );
      render(<RouterProvider router={router} />);
      return router;
    }

    it('keeps the record ID, query string and hash', async () => {
      const router = renderKeepPath('/simple-g-l-journal/ABC123?x=1#y', true);
      await screen.findByTestId('target');
      const { pathname, search, hash } = router.state.location;
      expect(`${pathname}${search}${hash}`).toBe('/manual-journals/ABC123?x=1#y');
    });

    it('lands on the list when there is no record ID', async () => {
      const router = renderKeepPath('/simple-g-l-journal', true);
      await screen.findByTestId('target');
      expect(router.state.location.pathname).toBe('/manual-journals');
    });

    it('drops the record ID without the flag', async () => {
      const router = renderKeepPath('/simple-g-l-journal/ABC123?x=1', false);
      await screen.findByTestId('target');
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/manual-journals');
    });
  });

  it('replaces the history entry instead of pushing a new one', async () => {
    const router = renderAt('/old-window', '/contacts');
    await screen.findByTestId('target');
    // Entries: /start, /contacts (the retired path was replaced, not kept behind it).
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/start');
  });
});
