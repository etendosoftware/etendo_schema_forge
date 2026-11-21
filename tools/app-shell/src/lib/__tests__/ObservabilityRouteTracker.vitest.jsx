import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

import { ObservabilityRouteTracker } from '../observability/RouteTracker.jsx';

function TestPage({ target }) {
  return <Link to={target}>go</Link>;
}

function renderTracker(initialEntries, events) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ObservabilityRouteTracker trackPage={(path) => events.push(path)} />
      <Routes>
        <Route path="/sales-order/:recordId" element={<TestPage target="/dashboard?token=secret#hash" />} />
        <Route path="/dashboard" element={<TestPage target="/dashboard?token=changed#other" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ObservabilityRouteTracker', () => {
  it('tracks initial route and subsequent pathname changes once', async () => {
    const events = [];
    renderTracker(['/sales-order/ABC123?token=secret#hash'], events);

    expect(events).toEqual(['/sales-order/ABC123']);

    await userEvent.click(screen.getByText('go'));
    expect(events).toEqual(['/sales-order/ABC123', '/dashboard']);
  });

  it('does not duplicate events for query or hash changes on the same pathname', async () => {
    const events = [];
    renderTracker(['/dashboard?token=secret#hash'], events);

    expect(events).toEqual(['/dashboard']);

    await userEvent.click(screen.getByText('go'));
    expect(events).toEqual(['/dashboard']);
  });
});

describe('ObservabilityRouteTracker feature wiring (ETP-5646)', () => {
  function renderWithFeatures(initialEntries, seen) {
    const resolveFeature = (pathname, search) => ({ key: `f:${pathname}${search}` });
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <ObservabilityRouteTracker
          trackPage={() => {}}
          resolveFeature={resolveFeature}
          onFeature={(feature) => seen.push(feature?.key)}
        />
        <Routes>
          <Route path="/dashboard" element={<TestPage target="/dashboard?report=x" />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('resolves the feature of a direct URL on mount, and again when only the query changes', async () => {
    const seen = [];
    renderWithFeatures(['/dashboard'], seen);
    expect(seen).toEqual(['f:/dashboard']);
    await userEvent.click(screen.getByText('go'));
    expect(seen).toEqual(['f:/dashboard', 'f:/dashboard?report=x']);
  });
});
