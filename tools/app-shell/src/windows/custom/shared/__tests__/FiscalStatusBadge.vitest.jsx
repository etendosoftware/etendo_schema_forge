import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { normalizeVerifactuStatus, FiscalStatusBadge } from '../FiscalStatusBadge.jsx';

// ── normalizeVerifactuStatus ───────────────────────────────────────────────────

describe('normalizeVerifactuStatus — falsy inputs', () => {
  it('returns null as-is', () => expect(normalizeVerifactuStatus(null)).toBeNull());
  it('returns undefined as-is', () => expect(normalizeVerifactuStatus(undefined)).toBeUndefined());
  it('returns empty string as-is', () => expect(normalizeVerifactuStatus('')).toBe(''));
});

describe('normalizeVerifactuStatus — known short codes', () => {
  it('maps AC → accepted',          () => expect(normalizeVerifactuStatus('AC')).toBe('accepted'));
  it('maps AE → partiallyAccepted', () => expect(normalizeVerifactuStatus('AE')).toBe('partiallyAccepted'));
  it('maps ER → rejected',          () => expect(normalizeVerifactuStatus('ER')).toBe('rejected'));
  it('maps IN → invalid',           () => expect(normalizeVerifactuStatus('IN')).toBe('invalid'));
  it('maps PE → vf_pending',        () => expect(normalizeVerifactuStatus('PE')).toBe('vf_pending'));
});

describe('normalizeVerifactuStatus — pass-through for unknown codes', () => {
  it('passes through already-normalised "accepted"', () => expect(normalizeVerifactuStatus('accepted')).toBe('accepted'));
  it('passes through unknown code "XY"',             () => expect(normalizeVerifactuStatus('XY')).toBe('XY'));
});

// ── FiscalStatusBadge ─────────────────────────────────────────────────────────

describe('FiscalStatusBadge — loading state', () => {
  it('renders a skeleton span when loading=true', () => {
    const { container } = render(<FiscalStatusBadge loading status="CO" />);
    const span = container.querySelector('span');
    expect(span).toBeTruthy();
    expect(span.style.animation).toContain('pulse');
  });

  it('does not render status text when loading', () => {
    render(<FiscalStatusBadge loading status="CO" />);
    expect(screen.queryByText('CO')).toBeNull();
  });
});

describe('FiscalStatusBadge — no status', () => {
  it('renders em-dash when status is null', () => {
    const { container } = render(<FiscalStatusBadge status={null} />);
    expect(container.textContent).toBe('—');
  });

  it('renders em-dash when status is undefined', () => {
    const { container } = render(<FiscalStatusBadge />);
    expect(container.textContent).toBe('—');
  });
});

describe('FiscalStatusBadge — known status', () => {
  it('renders the i18n key for status CO', () => {
    render(<FiscalStatusBadge status="CO" />);
    expect(screen.getByText('fiscalMonitor.status.sii.CO')).toBeTruthy();
  });

  it('renders the i18n key for tbai Recibido', () => {
    render(<FiscalStatusBadge status="Recibido" />);
    expect(screen.getByText('fiscalMonitor.tbai.status.Recibido')).toBeTruthy();
  });

  it('renders the i18n key for verifactu accepted', () => {
    render(<FiscalStatusBadge status="accepted" />);
    expect(screen.getByText('fiscalMonitor.status.vf.accepted')).toBeTruthy();
  });
});

describe('FiscalStatusBadge — unknown status', () => {
  it('renders raw status code when not in CONFIG', () => {
    render(<FiscalStatusBadge status="UNKNOWN_CODE" />);
    expect(screen.getByText('UNKNOWN_CODE')).toBeTruthy();
  });
});
