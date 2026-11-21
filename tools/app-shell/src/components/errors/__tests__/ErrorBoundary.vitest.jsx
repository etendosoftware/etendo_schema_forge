import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary.jsx';

function Boom() {
  throw new Error('boom');
}

describe('ETP-5792 — ErrorBoundary', () => {
  it('renders the fallback instead of a blank page when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary fallback={<p>fallback</p>}><Boom /></ErrorBoundary>);
    expect(screen.getByText('fallback')).toBeTruthy();
  });

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary fallback={<p>fallback</p>}><p>ok</p></ErrorBoundary>);
    expect(screen.getByText('ok')).toBeTruthy();
  });
});
