// Regression test for the "manual status change is lost on navigating back to
// the list" bug: FiscalModelsPage's onStatusChange callbacks must persist the
// new status via persistDeclarationStatus (PUT /fiscal303/declarations) before
// updating local view state — not just mutate React state in memory.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../fiscal-monitor/useDebugMode.js', () => ({
  useDebugMode: () => false,
}));

vi.mock('../FmListPage.jsx', () => ({
  default: ({ onSelect }) => (
    <button
      data-testid="select-303"
      onClick={() => onSelect({ id: '303-2026-T2', model: '303', status: 'draft', year: 2026, period: 'T2' })}
    >
      select 303
    </button>
  ),
}));

vi.mock('../models/303/FmModel303Page.jsx', () => ({
  default: ({ onStatusChange }) => (
    <button data-testid="present-303" onClick={() => onStatusChange('303-2026-T2', 'submitted')}>
      present 303
    </button>
  ),
}));

vi.mock('../models/349/FmModel349Page.jsx', () => ({
  default: () => null,
}));

vi.mock('../FmDebugPanel.jsx', () => ({
  default: () => null,
}));

import FiscalModelsPage from '../FiscalModelsPage.jsx';

const TOKEN = 'test-token';
const API_BASE = 'http://host/neo/fiscal-models';

describe('FiscalModelsPage — onStatusChange persistence (303)', () => {
  beforeEach(() => { vi.spyOn(global, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('persists the new status via PUT before applying it to local view state', async () => {
    fetch.mockResolvedValueOnce({ ok: true });

    render(<FiscalModelsPage token={TOKEN} apiBaseUrl={API_BASE} />);

    fireEvent.click(screen.getByTestId('select-303'));
    fireEvent.click(screen.getByTestId('present-303'));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://host/neo/fiscal303/declarations?id=303-2026-T2');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ status: 'submitted' });
  });

  it('does not update local view state when the PUT fails', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });

    render(<FiscalModelsPage token={TOKEN} apiBaseUrl={API_BASE} />);

    fireEvent.click(screen.getByTestId('select-303'));
    fireEvent.click(screen.getByTestId('present-303'));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // The detail view for the 303 declaration must still be mounted — a
    // failed persist must not throw or unmount the page.
    expect(screen.getByTestId('present-303')).toBeInTheDocument();
  });
});
