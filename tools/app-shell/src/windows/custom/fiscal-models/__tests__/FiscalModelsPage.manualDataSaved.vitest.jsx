// ETP-5338 Bug A fix — end-to-end wiring test, mirroring
// FiscalModelsPage.statusChange.vitest.jsx's own coverage of `declStatusPatch`.
//
// Root cause: `FmModel303Page` used to autosave `identChecks`/`manualOverrides` in the
// background, and nothing ever told `FmListPage` a save had happened — reopening the declaration
// from the always-mounted list showed the pre-edit `manualData` again. `FmModel303Page` now calls
// `onManualDataSaved(id, { identification, manualOverrides })` only on a SUCCESSFUL explicit
// save (Guardar/Calcular), and `FiscalModelsPage` wires that into a `declManualDataPatch` state,
// mirroring the pre-existing `declStatusPatch` pattern exactly (see FiscalModelsPage.jsx).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../fiscal-monitor/useDebugMode.js', () => ({
  useDebugMode: () => false,
}));

vi.mock('../FmListPage.jsx', () => ({
  // Surfaces `declManualDataPatch` as text so a test can assert on it without reaching into
  // FmListPage's own state; FmListPage.declManualDataPatch.vitest.jsx already covers that
  // FmListPage itself applies this patch correctly to its `decls`.
  default: ({ onSelect, declManualDataPatch }) => (
    <>
      <button
        data-testid="select-303"
        onClick={() => onSelect({ id: '303-2026-T2', model: '303', status: 'draft', year: 2026, period: 'T2' })}
      >
        select 303
      </button>
      <div data-testid="decl-manual-data-patch">
        {declManualDataPatch ? JSON.stringify(declManualDataPatch) : ''}
      </div>
    </>
  ),
}));

vi.mock('../models/303/FmModel303Page.jsx', () => ({
  default: ({ onManualDataSaved }) => (
    <button
      data-testid="save-303"
      onClick={() => onManualDataSaved('303-2026-T2', {
        identification: { nif: 'SAVED-NIF' },
        manualOverrides: { 46: 500 },
      })}
    >
      save 303
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

describe('FiscalModelsPage — onManualDataSaved wiring (ETP-5338 Bug A fix)', () => {
  it('pushes a declManualDataPatch down to FmListPage after a successful manualData save', async () => {
    render(<FiscalModelsPage token={TOKEN} apiBaseUrl={API_BASE} />);

    // Before saving, FmListPage has received no manualData patch at all.
    expect(screen.getByTestId('decl-manual-data-patch').textContent).toBe('');

    fireEvent.click(screen.getByTestId('select-303'));
    fireEvent.click(screen.getByTestId('save-303'));

    // Once `onManualDataSaved` fires, FmListPage must receive the SAME id/manualData that was
    // just saved, so its own `decls` cache — which never refetches on its own — can patch the
    // row instead of showing the pre-save value the next time it's reopened.
    await waitFor(() => {
      const patch = JSON.parse(screen.getByTestId('decl-manual-data-patch').textContent);
      expect(patch).toEqual({
        id: '303-2026-T2',
        patch: {
          manualData: {
            identification: { nif: 'SAVED-NIF' },
            manualOverrides: { 46: 500 },
          },
        },
      });
    });
  });

  it('does not push a declManualDataPatch before any save happens', () => {
    render(<FiscalModelsPage token={TOKEN} apiBaseUrl={API_BASE} />);

    fireEvent.click(screen.getByTestId('select-303'));

    expect(screen.getByTestId('decl-manual-data-patch').textContent).toBe('');
  });
});
