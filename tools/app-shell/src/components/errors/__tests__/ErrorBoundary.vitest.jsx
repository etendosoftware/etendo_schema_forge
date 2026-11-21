// @covers tools/app-shell/src/components/errors/ErrorBoundary.jsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary.jsx';

function Boom() {
  throw new Error('boom');
}

describe('ETP-5792 — ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the fallback instead of a blank page when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary fallback={<p>fallback</p>}><Boom /></ErrorBoundary>);
    expect(screen.getByText('fallback')).toBeTruthy();
  });

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary fallback={<p>fallback</p>}><p>ok</p></ErrorBoundary>);
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('recovers when remounted with a new key (what navigating to another page does)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary key="a" fallback={<p>fallback</p>}><Boom /></ErrorBoundary>,
    );
    expect(screen.getByText('fallback')).toBeTruthy();
    rerender(<ErrorBoundary key="b" fallback={<p>fallback</p>}><p>ok</p></ErrorBoundary>);
    expect(screen.getByText('ok')).toBeTruthy();
  });
});
