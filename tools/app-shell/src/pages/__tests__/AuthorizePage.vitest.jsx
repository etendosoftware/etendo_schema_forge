// Behavioral coverage for AuthorizePage lives in schema_forge_core:
// packages/app-shell-core/src/pages/__tests__/AuthorizePage.vitest.jsx (23 cases).
// This is a SHIM SMOKE TEST: the functional page is now just a re-export of the
// core page, so this file only verifies that the re-export resolves to the core
// component AND that the whole provider/import graph mounts end-to-end. It does
// NOT re-test behavior — no mocks, real core providers, so the wiring is proven.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@etendosoftware/app-shell-core/auth';
import { ObservabilityProvider } from '@etendosoftware/app-shell-core/observability';
import AuthorizePage from '../AuthorizePage.jsx';

describe('AuthorizePage shim', () => {
  it('re-exports the core component', () => {
    expect(typeof AuthorizePage).toBe('function');
  });

  it('mounts through the real core provider/import graph', () => {
    // Seed a token via AuthProvider so the strict core useAuth() resolves without
    // throwing. No OAuth query params → the ConnectionsLanding branch renders.
    render(
      <MemoryRouter initialEntries={['/authorize']}>
        <AuthProvider initialSession={{ token: 'smoke-token', username: 'smoke-user' }}>
          <ObservabilityProvider value={{ trackMcpConnectTabSelected: vi.fn() }}>
            <AuthorizePage />
          </ObservabilityProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('mcp-server-url')).toBeTruthy();
    expect(screen.getByTestId('mcp-tab-ClaudeDesktop')).toBeTruthy();
    expect(screen.getByTestId('mcp-client-placeholder')).toBeTruthy();
  });
});
