// ETP-5255 class C — AmortizationLinesTable had FOUR independent triggers into saveField on one
// row (the asset selector's onChange, the percentage/amount inputs' onBlur, and the dimensions
// panel's onFieldSave), all writing PUT /lines/{id}. `updated` is a per-record optimistic-locking
// token, so any two of those overlapping sent the same token twice and the second came back a
// false 409 — even though nothing else touched the row. These tests hold a PUT open by hand (a
// controllable deferred, not a timer) to make the overlap deterministic, then assert the queue
// serializes it: at most one PUT per line, the second trigger's value replayed once the first
// settles. They also cover the two other ETP-5255/ETP-4981 rules for this file: a refused write
// must surface (toast + refetch, never the old bare `catch { /* silencioso */ }`), and an
// unchanged value must never write at all.
//
// This file REPLACES the former AmortizationLinesTable.test.js, a source-reading suite
// (readFileSync + regex against the .jsx text) prohibited since ETP-4958. Its own delete/DELETE
// case proved the risk empirically: its regex `/\`\/lines\/\$\{lineId\}\`/` kept matching after
// the PUT template literal was rewritten, because it happened to also match the unrelated DELETE
// call in the same file. Its mechanism-only assertions (prop names, imports, i18n hook usage,
// column header text, DIMENSION_FIELD_CANDIDATES array contents, add/delete URL shapes, hover
// strip styling) are dropped without replacement: every one of them is already covered
// behaviorally by AmortizationLinesTable.vitest.jsx, which renders the component and asserts on
// the real fetch calls and DOM — the source-reading versions added no coverage the behavioral
// suite doesn't already have, and would have silently kept passing through the same drift that
// their DELETE-regex sibling did.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (col) => col,
}));

vi.mock('@/components/contract-ui/SelectorInput', () => ({
  default: ({ field, onChange }) => (
    <button
      data-testid={`selector-${field.key}`}
      onClick={() => onChange('new-val', 'New Label')}
    >
      selector-{field.key}
    </button>
  ),
}));

vi.mock('@/components/ui/add-line-button', () => ({
  AddLineButton: ({ onClick, label }) => (
    <button data-testid="add-line-btn" onClick={onClick}>{label}</button>
  ),
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, indeterminate, disabled, onChange, 'aria-label': ariaLabel }) => (
    <button
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={indeterminate ? 'mixed' : Boolean(checked)}
      disabled={disabled}
      onClick={disabled ? undefined : onChange}
    />
  ),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: vi.fn(() => ({ readOnly: {}, visibility: {} })),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/hooks/useEntity', () => ({
  extractErrorMessage: vi.fn(),
}));

import { toast } from 'sonner';
import { extractErrorMessage } from '@/hooks/useEntity';
import AmortizationLinesTable from '../AmortizationLinesTable.jsx';

const LINE = {
  id: 'line-1',
  asset: 'asset-1',
  'asset$_identifier': 'AS_Module',
  amortizationPercentage: 27.42,
  amortizationAmount: 548.39,
};

const BASE_PROPS = {
  recordId: 'amort-1',
  data: { id: 'amort-1', processed: 'N' },
  token: 'tok',
  apiBaseUrl: 'http://host/neo/amortization',
  api: { labelOverrides: {} },
  editing: true,
  catalogs: {},
};

const renderInRouter = (ui) => render(ui, { wrapper: MemoryRouter });

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

/**
 * A fetch double where GET (fetchLines, on mount and on every refetch) resolves immediately
 * with `rows`, and every PUT is held open until the test releases the matching deferred via
 * `puts[n].resolve(response)`. This is what makes "two triggers overlapping" deterministic
 * instead of latency-dependent — the false 409 this hook prevents only ever reproduced while
 * the first write was still in flight.
 */
function installControllablePutFetch(rows) {
  const puts = [];
  const fetchMock = vi.fn((url, opts) => {
    if (opts?.method === 'PUT') {
      const d = deferred();
      puts.push(d);
      return d.promise;
    }
    return Promise.resolve({ ok: true, json: async () => ({ response: { data: rows } }) });
  });
  global.fetch = fetchMock;
  return { fetchMock, puts };
}

function putCallCount(fetchMock) {
  return fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'PUT').length;
}

function getPencilButton(container) {
  const row = container.querySelector('[data-row-id="line-1"]');
  const lastTd = row.querySelector('td:last-child');
  return lastTd.querySelector('[title="editLineTooltip"]');
}

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
  extractErrorMessage.mockClear();
  extractErrorMessage.mockResolvedValue('mocked error message');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AmortizationLinesTable — single-flight write queue per line (ETP-5255)', () => {
  it('the asset selector onChange and the percentage onBlur never send two overlapping PUTs to the same line', async () => {
    const { fetchMock, puts } = installControllablePutFetch([LINE]);
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(getPencilButton(container));
    await waitFor(() => expect(container.querySelector('input[type="number"]')).not.toBeNull());

    // Trigger 1 — the asset selector's onChange fires saveField immediately.
    fireEvent.click(screen.getByTestId('selector-asset'));
    await waitFor(() => expect(putCallCount(fetchMock)).toBe(1));

    // Trigger 2 — a DIFFERENT field of the SAME line, while trigger 1's PUT is still open.
    const percentageInput = container.querySelectorAll('input[type="number"]')[0];
    fireEvent.change(percentageInput, { target: { value: '99' } });
    fireEvent.blur(percentageInput);

    // Must NOT have opened a second PUT — it is queued, not fired.
    expect(putCallCount(fetchMock)).toBe(1);
    expect(puts).toHaveLength(1);

    // Settle the open write — the queued percentage edit must replay now, sequentially.
    puts[0].resolve({ ok: true });
    await waitFor(() => expect(putCallCount(fetchMock)).toBe(2));

    const secondPutBody = JSON.parse(fetchMock.mock.calls.filter(([, o]) => o?.method === 'PUT')[1][1].body);
    expect(secondPutBody).toEqual({ amortizationPercentage: '99' });

    puts[1].resolve({ ok: true });
    await waitFor(() => expect(putCallCount(fetchMock)).toBe(2)); // nothing left queued
  });

  it('the dimensions panel onFieldSave and a core-field onBlur on the same line coalesce instead of overlapping', async () => {
    const { fetchMock, puts } = installControllablePutFetch([LINE]);
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    // Expand the dimensions panel (independent of edit mode — the row-click chevron toggle).
    fireEvent.click(screen.getByText('AS_Module'));
    await waitFor(() => expect(screen.getByTestId('selector-costcenter')).toBeInTheDocument());

    // Also enter inline edit mode for the amount field.
    fireEvent.click(getPencilButton(container));
    await waitFor(() => expect(container.querySelectorAll('input[type="number"]').length).toBeGreaterThan(0));

    // Trigger 1 — a dimension selector's onChange (onFieldSave).
    fireEvent.click(screen.getByTestId('selector-costcenter'));
    await waitFor(() => expect(putCallCount(fetchMock)).toBe(1));

    // Trigger 2 — the amount input's onBlur, a completely different field, while trigger 1 is open.
    const amountInput = container.querySelectorAll('input[type="number"]')[1];
    fireEvent.change(amountInput, { target: { value: '777' } });
    fireEvent.blur(amountInput);

    expect(putCallCount(fetchMock)).toBe(1); // queued, not a second concurrent PUT

    puts[0].resolve({ ok: true });
    await waitFor(() => expect(putCallCount(fetchMock)).toBe(2));
    const secondPutBody = JSON.parse(fetchMock.mock.calls.filter(([, o]) => o?.method === 'PUT')[1][1].body);
    expect(secondPutBody).toEqual({ amortizationAmount: '777' });

    puts[1].resolve({ ok: true });
  });

  it('a refused PUT surfaces a toast.error and refetches — never the old silent catch', async () => {
    const putResponse = { ok: false, status: 409 };
    const fetchMock = vi.fn((url, opts) => {
      if (opts?.method === 'PUT') return Promise.resolve(putResponse);
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [LINE] } }) });
    });
    global.fetch = fetchMock;
    extractErrorMessage.mockResolvedValueOnce('stale_record: the line changed underneath you');

    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(getPencilButton(container));
    await waitFor(() => expect(container.querySelector('input[type="number"]')).not.toBeNull());

    fetchMock.mockClear();
    const percentageInput = container.querySelectorAll('input[type="number"]')[0];
    fireEvent.change(percentageInput, { target: { value: '15' } });
    fireEvent.blur(percentageInput);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('stale_record: the line changed underneath you'),
    );

    // The old bug: no toast AND no refetch (a bare `catch { /* silencioso */ }`) — the row just
    // silently reappeared with its old value. Assert the refetch actually happened too.
    await waitFor(() => {
      const getCalls = fetchMock.mock.calls.filter(([, opts]) => !opts?.method || opts.method === 'GET');
      expect(getCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('re-committing the same value on blur sends no PUT at all', async () => {
    const { fetchMock } = installControllablePutFetch([LINE]);
    const { container } = renderInRouter(<AmortizationLinesTable {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('AS_Module')).toBeInTheDocument());

    fireEvent.click(getPencilButton(container));
    await waitFor(() => expect(container.querySelector('input[type="number"]')).not.toBeNull());

    fetchMock.mockClear();
    const percentageInput = container.querySelectorAll('input[type="number"]')[0];
    // Blur without ever changing the value away from its defaultValue (27.42).
    fireEvent.blur(percentageInput);

    // Give any (incorrect) async write a turn to fire before asserting its absence.
    await new Promise((r) => setTimeout(r, 0));
    expect(putCallCount(fetchMock)).toBe(0);
  });
});
