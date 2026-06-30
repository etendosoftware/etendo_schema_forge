import { test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useLocation } from 'react-router-dom';
import { AppShellRuntime } from '../AppShellRuntime.jsx';

function RouteAwareProbe() {
  // Throws outside a Router context — proves children mount inside BrowserRouter.
  const location = useLocation();
  return <div data-testid="probe">{location.pathname}</div>;
}

test('AppShellRuntime renders children inside the router so they can use router hooks', () => {
  const html = renderToStaticMarkup(
    <AppShellRuntime
      basename="/"
      menuGroups={[]}
      routes={[{ path: 'home', index: true, public: true, element: <div>home</div> }]}
      auth={{ loginPath: '/login' }}
    >
      <RouteAwareProbe />
    </AppShellRuntime>
  );

  expect(html).toMatch(/data-testid="probe"/);
});

test('AppShellRuntime uses a custom layout component when one is provided', () => {
  function CustomLayout({ menuGroups }) {
    return <div data-testid="custom-layout">{menuGroups.length} groups</div>;
  }

  const html = renderToStaticMarkup(
    <AppShellRuntime
      basename="/"
      menuGroups={[{ id: 'g1', title: 'Group 1', items: [] }]}
      routes={[{ path: 'home', index: true, public: false, element: <div>home</div> }]}
      auth={{ loginPath: '/login', unauthenticatedFallback: <div>n/a</div>, initialSession: { token: 'test-token' } }}
      layout={CustomLayout}
    />
  );

  expect(html).toMatch(/data-testid="custom-layout"/);
  expect(html).toMatch(/1 groups/);
});

test('AppShellRuntime falls back to ShellLayout when no layout override is given', () => {
  const html = renderToStaticMarkup(
    <AppShellRuntime
      basename="/"
      menuGroups={[{ id: 'g1', title: 'Group 1', items: [] }]}
      routes={[{ path: 'home', index: true, public: false, element: <div>home</div> }]}
      auth={{ loginPath: '/login', unauthenticatedFallback: <div>n/a</div>, initialSession: { token: 'test-token' } }}
    />
  );

  expect(html).toMatch(/Group 1/);
});
