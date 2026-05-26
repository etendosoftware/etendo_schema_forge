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
  it('calls useFiscalAutoCompute with enabled=false in demo mode', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1].enabled).toBe(false);
  });
});
