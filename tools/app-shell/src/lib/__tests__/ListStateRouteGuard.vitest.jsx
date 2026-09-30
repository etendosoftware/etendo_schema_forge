/**
 * ETP-4994 (follow-up) — router wiring: the saved grid state of a window is dropped as soon
 * as the user navigates OUT of that window, and kept while they move between its list and
 * its records.
 *
 * `ListStateRouteGuard` (`@/lib/ListStateRouteGuard.jsx`) is a render-nothing component
 * mounted once inside the router (next to `ObservabilityRouteTracker` in `App.jsx`). On every
 * `location.pathname` change it calls `pruneListStateOnNavigation(prev, next)` from
 * `listViewSession.js`.
 *
 * The routed page here is a probe, not the real ListView: it reads the snapshot on mount
 * exactly like ListView does (`readListState(windowName)`, once per mount) and writes it
 * exactly like ListView's persistence effect (`persistListState`). ListView's own read/write
 * wiring is covered by `components/contract-ui/__tests__/ListView.sessionState.vitest.jsx`;
 * this file isolates the one new thing — WHEN the key disappears.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import {
  listStateKey,
  persistListState,
  readListState,
} from '@/lib/listViewSession.js';
import { ListStateRouteGuard } from '@/lib/ListStateRouteGuard.jsx';

const EMPTY_DEFAULTS = {
  columnFilters: {},
  advancedFilter: null,
  subsetIndex: null,
  quickFilterIndices: [],
  sortColumn: null,
  sortDirection: null,
};

const COMPLETED = {
  ...EMPTY_DEFAULTS,
  columnFilters: { documentStatus: { operator: 'equals', value: 'CO' } },
};

/** Mirrors ListView: read once per mount, write through `persistListState`. */
function ListProbe() {
  const { windowName } = useParams();
  const [restored] = useState(() => readListState(windowName));
  return (
    <div>
      <span data-testid="list-state">{restored ? 'filtered' : 'default'}</span>
      <button
        type="button"
        data-testid="apply-filter"
        onClick={() => persistListState(windowName, COMPLETED, EMPTY_DEFAULTS)}
      >
        apply
      </button>
    </div>
  );
}

/**
 * AppLayout keys the routed page by its window segment (`pageKey`), so moving between two
 * windows REMOUNTS the page. Without this key React Router would reuse the same ListProbe
 * instance for `/sales-invoice` and `/business-partner` and never re-read the snapshot.
 */
function KeyedListProbe() {
  const { windowName } = useParams();
  return <ListProbe key={windowName} />;
}

function RecordProbe() {
  return <span data-testid="record-page" />;
}

let navigateRef = null;
function NavigateCapture() {
  navigateRef = useNavigate();
  return null;
}

function renderApp(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NavigateCapture />
      <ListStateRouteGuard />
      <Routes>
        <Route path="/dashboard" element={<span data-testid="dashboard" />} />
        <Route path="/:windowName/:recordId" element={<RecordProbe />} />
        <Route path="/:windowName" element={<KeyedListProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function go(to) {
  await act(async () => { navigateRef(to); });
}

const KEY = listStateKey('sales-invoice');

describe('ListStateRouteGuard', () => {
  it('renders nothing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/sales-invoice']}><ListStateRouteGuard /></MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe('case 1 — list -> record -> list keeps the filter', () => {
    it('restores the filter after opening a record and coming back (breadcrumb / Cancel)', async () => {
      const user = userEvent.setup();
      renderApp(['/sales-invoice']);
      await user.click(screen.getByTestId('apply-filter'));

      await go('/sales-invoice/INV-1');
      expect(screen.getByTestId('record-page')).toBeInTheDocument();
      expect(sessionStorage.getItem(KEY)).not.toBeNull();

      await go('/sales-invoice');
      expect(screen.getByTestId('list-state')).toHaveTextContent('filtered');
    });

    it('restores the filter after opening a record and pressing browser back', async () => {
      const user = userEvent.setup();
      renderApp(['/sales-invoice']);
      await user.click(screen.getByTestId('apply-filter'));

      await go('/sales-invoice/INV-1');
      await go(-1);
      expect(screen.getByTestId('list-state')).toHaveTextContent('filtered');
    });
  });

  describe('case 2 — leaving the window drops the filter', () => {
    it('clears the key as soon as the user reaches another window', async () => {
      const user = userEvent.setup();
      renderApp(['/sales-invoice']);
      await user.click(screen.getByTestId('apply-filter'));

      await go('/business-partner');
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('comes back to the default view when re-entering from the menu', async () => {
      const user = userEvent.setup();
      renderApp(['/sales-invoice']);
      await user.click(screen.getByTestId('apply-filter'));

      await go('/business-partner');
      await go('/sales-invoice');
      expect(screen.getByTestId('list-state')).toHaveTextContent('default');
    });

    it('comes back to the default view when re-entering with browser back', async () => {
      const user = userEvent.setup();
      renderApp(['/sales-invoice']);
      await user.click(screen.getByTestId('apply-filter'));

      await go('/business-partner');
      await go(-1);
      expect(screen.getByTestId('list-state')).toHaveTextContent('default');
    });

    it('also clears when leaving from a record page', async () => {
      const user = userEvent.setup();
      renderApp(['/sales-invoice']);
      await user.click(screen.getByTestId('apply-filter'));

      await go('/sales-invoice/INV-1');
      await go('/dashboard');
      expect(sessionStorage.getItem(KEY)).toBeNull();

      await go('/sales-invoice');
      expect(screen.getByTestId('list-state')).toHaveTextContent('default');
    });
  });

  describe('case 3 — F5 inside the window keeps the filter', () => {
    it('keeps the state on a fresh mount at the list route', () => {
      persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
      renderApp(['/sales-invoice']);
      expect(screen.getByTestId('list-state')).toHaveTextContent('filtered');
      expect(sessionStorage.getItem(KEY)).not.toBeNull();
    });

    it('keeps the state on a fresh mount at a record route, then back to the list', async () => {
      persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
      renderApp(['/sales-invoice/INV-1']);
      expect(sessionStorage.getItem(KEY)).not.toBeNull();

      await go('/sales-invoice');
      expect(screen.getByTestId('list-state')).toHaveTextContent('filtered');
    });
  });

  describe('case 4 — dashboard shortcut with a URL filter does not leak', () => {
    it('drops the deep-linked filter after leaving and re-entering from the menu', async () => {
      renderApp(['/dashboard']);
      // Dashboard "Por cobrar" card -> ListView persists the deep-linked view (ETP-5009).
      await go('/sales-invoice?filter=pending-collection');
      await act(async () => {
        persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
      });

      await go('/business-partner');
      expect(sessionStorage.getItem(KEY)).toBeNull();

      await go('/sales-invoice');
      expect(screen.getByTestId('list-state')).toHaveTextContent('default');
    });

    it('drops it when going back to the dashboard and re-entering from the menu', async () => {
      renderApp(['/dashboard']);
      await go('/sales-invoice?filter=pending-collection');
      await act(async () => {
        persistListState('sales-invoice', COMPLETED, EMPTY_DEFAULTS);
      });

      await go('/dashboard');
      await go('/sales-invoice');
      expect(screen.getByTestId('list-state')).toHaveTextContent('default');
    });
  });

  describe('case 5 — only the window being left is cleared', () => {
    it("removes the left window's key and keeps the destination window's key", async () => {
      persistListState('business-partner', COMPLETED, EMPTY_DEFAULTS);
      const user = userEvent.setup();
      renderApp(['/sales-invoice']);
      await user.click(screen.getByTestId('apply-filter'));

      await go('/business-partner');
      expect(sessionStorage.getItem(KEY)).toBeNull();
      expect(sessionStorage.getItem(listStateKey('business-partner'))).not.toBeNull();
    });
  });
});

describe('App wiring', () => {
  const appSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'App.jsx'),
    'utf8',
  );

  it('imports ListStateRouteGuard', () => {
    expect(appSrc).toMatch(/import\s*\{\s*ListStateRouteGuard\s*\}\s*from\s*['"][^'"]*ListStateRouteGuard(\.jsx)?['"]/);
  });

  it('mounts it inside AppShellRuntime (inside the router)', () => {
    expect(appSrc).toMatch(/<AppShellRuntime[\s\S]*<ListStateRouteGuard[\s\S]*<\/AppShellRuntime>/);
  });
});
