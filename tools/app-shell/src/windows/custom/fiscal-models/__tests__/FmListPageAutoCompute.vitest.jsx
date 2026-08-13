import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import FmListPage from '../FmListPage.jsx';

vi.mock('../useFiscalAutoCompute.js', () => ({
  default: vi.fn(() => ({ computedMap: {} })),
}));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import useFiscalAutoCompute from '../useFiscalAutoCompute.js';

describe('FmListPage — auto-compute wiring', () => {
  it('passes enabled=true when token and apiBaseUrl are present', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Both auto-compute calls must gate on token+apiBaseUrl being present
    calls.forEach(call => {
      expect(call[1].enabled).toBe(true);
    });
  });
});
