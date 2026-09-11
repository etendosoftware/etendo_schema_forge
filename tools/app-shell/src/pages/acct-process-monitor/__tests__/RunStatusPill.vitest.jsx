// ETP-5269 — RunStatusPill turns an AD_PROCESS_RUN.STATUS code into a human, tone-coded pill.
// The point of the component is that an admin never sees a raw three-letter code, so that is what
// this file asserts: the label comes from i18n for every mapped code, and an UNMAPPED code still
// renders something legible instead of an empty pill.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import RunStatusPill from '../RunStatusPill.jsx';
import { RUN_STATUS_META } from '../useAcctProcessMonitor.js';

describe('RunStatusPill', () => {
  it('renders the i18n label for a mapped status, not the raw code', () => {
    render(<RunStatusPill status="SUC" />);
    const pill = screen.getByTestId('RunStatusPill__SUC');
    expect(pill.textContent).toBe('acctProcessStatusSuccess');
    expect(pill.textContent).not.toBe('SUC');
  });

  it('renders a label for every status code the data layer knows about', () => {
    for (const [code, meta] of Object.entries(RUN_STATUS_META)) {
      const { unmount } = render(<RunStatusPill status={code} />);
      expect(screen.getByTestId(`RunStatusPill__${code}`).textContent).toBe(meta.labelKey);
      unmount();
    }
  });

  it('exposes the status and tone as data attributes for assertions and styling', () => {
    render(<RunStatusPill status="ERR" />);
    const pill = screen.getByTestId('RunStatusPill__ERR');
    expect(pill).toHaveAttribute('data-status', 'ERR');
    expect(pill).toHaveAttribute('data-tone', 'error');
  });

  it('applies the semantic status utilities, never a raw colour', () => {
    render(<RunStatusPill status="SUC" />);
    expect(screen.getByTestId('RunStatusPill__SUC').className).toContain('bg-status-success');
  });

  it('uses the destructive tone for errors, since the preset defines no status-error', () => {
    render(<RunStatusPill status="KIL" />);
    expect(screen.getByTestId('RunStatusPill__KIL').className).toContain('destructive');
  });

  it('falls back to the raw code and the neutral tone for a status core adds later', () => {
    render(<RunStatusPill status="XYZ" />);
    const pill = screen.getByTestId('RunStatusPill__XYZ');
    expect(pill.textContent).toBe('XYZ');
    expect(pill).toHaveAttribute('data-tone', 'neutral');
  });

  it('honours an explicit data-testid from the caller', () => {
    render(<RunStatusPill status="SUC" data-testid="custom-pill" />);
    const pill = screen.getByTestId('custom-pill');
    expect(pill).toHaveAttribute('data-status', 'SUC');
  });
});
