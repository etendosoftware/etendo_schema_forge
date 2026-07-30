import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// ETP-4600 regression — CreatableSearchSelect (serverSearch mode) used to null out
// `serverOptions` from a 200ms setTimeout scheduled on blur. That state mutation landed
// ~200ms AFTER the user had already left the selector — e.g. after toggling an unrelated
// field and clicking Save — and raced the save (observed live: an asset's `depreciate`
// flag reverted to `false` on save even though the user had toggled it ON).
//
// Fix: `serverOptions` invalidation now happens synchronously on OPEN (the input's
// onFocus), never on CLOSE/BLUR. These tests assert the CONTRACT going forward:
//   1. Blurring schedules no deferred fetch/state mutation for serverOptions.
//   2. Every open (focus) still gets a guaranteed-fresh, unfiltered fetch.
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

const baseProps = {
  formData: {},
  resolvedLabel: 'Business Partner',
  selectorUrl: '/api/selectors/business-partner',
  selectorContext: {},
  token: 'test-token',
  serverSearch: true,
};

describe('CreatableSearchSelect — no deferred state mutation on blur (ETP-4600 regression)', () => {
  const field = { key: 'partner', required: false };

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not issue any fetch during the blur-close window, even after the 200ms close timeout fires', async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');

    // Open: exactly one fetch (the fresh-open invalidation + load).
    await act(async () => {
      fireEvent.focus(input);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    global.fetch.mockClear();

    // Blur without selecting, then advance well past the internal 200ms close delay.
    // A caller could act on external state (e.g. toggle another field, hit Save) in this
    // exact window — nothing here should trigger a network call or state write.
    await act(async () => {
      fireEvent.blur(input);
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('every open (focus) still triggers a guaranteed-fresh fetch, not gated by a stale null-check', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: '1', label: 'Alpha' }] }),
    });

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');

    fireEvent.focus(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fireEvent.blur(input);
    // Real timers here (no fake timers in this test) — RTL's waitFor below covers the
    // 200ms internal close delay naturally.
    await waitFor(() => expect(screen.queryByTestId('options-partner')).not.toBeInTheDocument());

    fireEvent.focus(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
