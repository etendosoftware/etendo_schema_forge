import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// ETP-4600 Phase 2a — CreatableSearchSelect opt-in server-search mode.
// Reference behaviour ported from SearchInput (EntityForm.jsx): debounced
// `?q=` fetch (fetch always happens after the debounce window, but `q` is
// only appended once the typed term reaches 2 chars — same rule as
// SearchInput's `triggerServerSearch`), no local re-filtering of server
// results, `?id=` label resolution, initial page load on focus.
//
// Debounce-timing tests use fake timers with `vi.advanceTimersByTimeAsync`
// (flushes microtasks too, unlike the sync `advanceTimersByTime`). Other
// tests use real timers + RTL's `waitFor`, since `handleChipClick`'s
// `requestAnimationFrame` is not covered by vitest's default fake timer set.
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `${url}?${qs}` : url;
  },
}));

import { CreatableSearchSelect } from '../CreatableSearchSelect.jsx';

function mockFetchOnce(items) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items }),
  });
}

const baseProps = {
  formData: {},
  resolvedLabel: 'Business Partner',
  selectorUrl: '/api/selectors/business-partner',
  selectorContext: {},
  token: 'test-token',
  serverSearch: true,
};

describe('CreatableSearchSelect — serverSearch mode (ETP-4600 Phase 2a)', () => {
  const field = { key: 'partner', required: false };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces the fetch 300ms after the last keystroke, and only appends q= once 2+ chars are typed', async () => {
    vi.useFakeTimers();
    global.fetch = mockFetchOnce([{ id: '10', label: 'Acme Corp' }]);

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');

    // Initial focus load (empty query) fires immediately.
    await act(async () => {
      fireEvent.focus(input);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    global.fetch.mockClear();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'A' } });
      await vi.advanceTimersByTimeAsync(300);
    });
    // Single char: fetch still fires after the debounce window, but without q= (matches
    // SearchInput's own rule — only the `q` param is gated on length, not the fetch itself).
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).not.toContain('q=');
    global.fetch.mockClear();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Ac' } });
      // Not yet — debounce timer restarts on every keystroke.
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('q=Ac');
  });

  it('shows the options exactly as returned by the server (no local re-filtering), capped to 20', async () => {
    const manyItems = Array.from({ length: 25 }, (_, i) => ({ id: String(i), label: `Zzz-${i}` }));
    global.fetch = mockFetchOnce(manyItems);

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');
    fireEvent.focus(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'Zz' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 50 });

    // The full server page (25 items, capped to 20) renders as-is — proving the list comes
    // straight from the server response, not a local re-filter pass.
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(20));
  });

  it('resolves the chip label via a ?id= fetch when value is set without displayValue', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('id=42')) {
        return Promise.resolve({ ok: true, json: async () => ({ items: [{ id: '42', label: 'Resolved Co' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });

    render(<CreatableSearchSelect {...baseProps} field={field} value="42" displayValue="" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('field-partner-chip')).toHaveTextContent('Resolved Co');
    });
    const idCall = global.fetch.mock.calls.find(([url]) => url.includes('id=42'));
    expect(idCall).toBeTruthy();
  });

  it('starts with an empty search box on open even in serverSearch mode (Gap B parity)', async () => {
    global.fetch = mockFetchOnce([{ id: '42', label: 'Resolved Co' }]);
    render(<CreatableSearchSelect {...baseProps} field={field} value="42" displayValue="Resolved Co" onChange={vi.fn()} />);

    const chip = screen.getByTestId('field-partner-chip');
    expect(chip).toHaveTextContent('Resolved Co');

    fireEvent.click(chip);
    const input = await screen.findByTestId('field-partner');
    await waitFor(() => expect(document.activeElement).toBe(input));
    await waitFor(() => expect(screen.getByTestId('options-partner')).toBeInTheDocument());
    expect(input.value).toBe('');
  });

  it('reopening after a filtered search + blur-without-selecting reloads the fresh unfiltered page, not the stale filtered one (ETP-4600 regression)', async () => {
    // Real timers throughout (like the chip-reopen test above) — handleChipClick's
    // requestAnimationFrame isn't covered by vitest's default fake timer set, and this
    // scenario needs two separate chip-reopen cycles.
    //
    // Server responds with the full list by default, and the narrowed single match
    // whenever the request carries `q=Laura` — mirrors the live bug: reopening after
    // a filter must NOT keep showing only the filtered match.
    global.fetch = vi.fn((url) => {
      const items = url.includes('q=Laura')
        ? [{ id: '2', label: 'Laura Morat' }]
        : [{ id: '1', label: 'Juan Perez' }, { id: '2', label: 'Laura Morat' }];
      return Promise.resolve({ ok: true, json: async () => ({ items }) });
    });

    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value="1"
        displayValue="Juan Perez"
        onChange={vi.fn()}
      />
    );

    // 1. Open the dropdown from the chip — initial unfiltered page loads.
    fireEvent.click(screen.getByTestId('field-partner-chip'));
    const input = await screen.findByTestId('field-partner');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch.mock.calls[0][0]).not.toContain('q=');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    global.fetch.mockClear();

    // 2. Type "Laura" — server narrows to the single match.
    fireEvent.change(input, { target: { value: 'Laura' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 50 });
    expect(global.fetch.mock.calls[0][0]).toContain('q=Laura');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    global.fetch.mockClear();

    // 3. Blur WITHOUT selecting — reverts to the "Juan Perez" chip.
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByTestId('field-partner-chip')).toHaveTextContent('Juan Perez'));
    expect(screen.getByTestId('field-partner-chip')).not.toHaveTextContent('Laura Morat');

    // 4. Reopen — must issue a FRESH unfiltered fetch, not reuse the stale filtered page.
    fireEvent.click(screen.getByTestId('field-partner-chip'));
    await screen.findByTestId('field-partner');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch.mock.calls[0][0]).not.toContain('q=');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(screen.getByText('Laura Morat')).toBeInTheDocument();
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
  });

  it('clears serverOptions to an empty array when the search request rejects/fails, discarding the stale prior page', async () => {
    // First load succeeds with results; the SECOND (typed) search rejects. If the `.catch`
    // handler did nothing (instead of `setServerOptions([])`), the stale first-page options
    // would remain visible — asserting they disappear proves the catch handler actually ran.
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: '10', label: 'Acme Corp' }] }) })
      .mockRejectedValueOnce(new Error('network down'));

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');

    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    fireEvent.change(input, { target: { value: 'Ac' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 50 });

    // Loading must have resolved (not stuck) and the previously-shown option is gone.
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('serverSearch=false path is unchanged: local filter runs, no q= param is ever sent (regression)', async () => {
    global.fetch = mockFetchOnce([{ id: '1', label: 'Alpha' }, { id: '2', label: 'Bravo' }]);

    render(
      <CreatableSearchSelect
        {...baseProps}
        serverSearch={false}
        field={field}
        value=""
        displayValue=""
        onChange={vi.fn()}
      />
    );
    const input = screen.getByTestId('field-partner');
    fireEvent.focus(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch.mock.calls[0][0]).not.toContain('q=');

    fireEvent.change(input, { target: { value: 'Bra' } });
    await waitFor(() => expect(screen.getByTestId('option-partner-2')).toBeInTheDocument());
    // No additional network call — filtering happens locally against the already-fetched list.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('option-partner-1')).not.toBeInTheDocument();
  });
});
