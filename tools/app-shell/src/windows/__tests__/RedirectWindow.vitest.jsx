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

  it('replaces the history entry instead of pushing a new one', async () => {
    const router = renderAt('/old-window', '/contacts');
    await screen.findByTestId('target');
    // Entries: /start, /contacts (the retired path was replaced, not kept behind it).
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/start');
  });
});
