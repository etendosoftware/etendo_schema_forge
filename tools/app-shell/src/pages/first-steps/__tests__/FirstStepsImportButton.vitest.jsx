/**
 * ETP-5371 — what base URL the First Steps checklist drives a window's import with.
 *
 * The checklist opens the same `ImportDialog` the list view opens, through the same
 * `useWindowImportDialog`. That hook is written against the base `WindowLoader` hands
 * `ListView` — the SPEC's URL (`/etendo/sws/neo/product`) — and this button used to hand it
 * `getApiBase()`, the deployment prefix (`/etendo`). Nothing downstream could tell the two
 * apart, so both of the hook's consumers built plausible URLs that pointed nowhere: the batch
 * POST at `/batch` (CloudFront 403, which read as an infrastructure outage) and the duplicate
 * pre-check at `/etendo/product` (404, swallowed — so no row was ever marked as existing).
 *
 * Asserting the value this component passes IN is the whole point: the wrong value produced no
 * error here, only two wrong requests two layers away.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  useWindowImportDialog: vi.fn(() => ({})),
  loadImportConfig: vi.fn(),
}));

vi.mock('@/components/contract-ui/useWindowImportDialog.js', () => ({
  useWindowImportDialog: H.useWindowImportDialog,
}));

vi.mock('@/pages/first-steps/firstStepsImport.js', () => ({
  loadImportConfig: H.loadImportConfig,
}));

vi.mock('@etendosoftware/app-shell-core/auth', () => ({
  useAuthOptional: () => ({ token: 'tok' }),
}));

vi.mock('@etendosoftware/app-shell-core/components/import/ImportDialog.jsx', () => ({
  ImportDialog: () => <div data-testid="import-dialog" />,
}));

// Imported after the `vi.mock` calls above only in source order — Vitest hoists them, so the
// component sees the mocks.
const { default: FirstStepsImportButton } = await import('../FirstStepsImportButton.jsx');


const originalLocation = window.location;

function setPathname(pathname) {
  Object.defineProperty(window, 'location', { value: { pathname }, writable: true, configurable: true });
}

/** The base URL the component handed `useWindowImportDialog` on its latest render. */
function passedApiBaseUrl() {
  const calls = H.useWindowImportDialog.mock.calls;
  return calls[calls.length - 1][0].apiBaseUrl;
}

beforeEach(() => {
  H.useWindowImportDialog.mockClear();
  H.loadImportConfig.mockResolvedValue({ enabled: true, entity: 'product' });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
  delete import.meta.env.VITE_API_BASE;
});

function renderButton(importSpec = 'product') {
  return render(
    <FirstStepsImportButton
      step={{ id: 'load-products', importSpec }}
      ui={(key) => key}
    />,
  );
}

describe('FirstStepsImportButton — import base URL', () => {
  it('drives the import with the SPEC url, not the deployment prefix', async () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');

    renderButton('product');

    await waitFor(() => expect(passedApiBaseUrl()).toBe('/etendo/sws/neo/product'));
    // The exact value the bug shipped: a non-empty string that every consumer accepted.
    expect(passedApiBaseUrl()).not.toBe('/etendo');
  });

  it('uses each step\'s own spec, so Contacts does not import against the Products url', async () => {
    import.meta.env.VITE_API_BASE = '/etendo';
    setPathname('/first-steps');

    renderButton('contacts');

    await waitFor(() => expect(passedApiBaseUrl()).toBe('/etendo/sws/neo/contacts'));
  });

  it('works at the domain root, where the prefix is empty and the bug was invisible', async () => {
    // Local dev has no VITE_API_BASE, so the old code fell into `useBatch`'s `if (!apiBaseUrl)`
    // branch and produced the right URL by accident — which is why this never reproduced
    // locally, and why the assertion has to hold here too.
    setPathname('/');

    renderButton('product');

    await waitFor(() => expect(passedApiBaseUrl()).toBe('/sws/neo/product'));
  });

  it('renders nothing when the step declares no import', async () => {
    H.loadImportConfig.mockResolvedValue(null);
    setPathname('/');

    const { container } = renderButton('unknown');

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the button once the config has loaded', async () => {
    setPathname('/');

    renderButton('product');

    await waitFor(() => expect(screen.getByTestId('first-steps-import-load-products')).toBeEnabled());
  });
});
