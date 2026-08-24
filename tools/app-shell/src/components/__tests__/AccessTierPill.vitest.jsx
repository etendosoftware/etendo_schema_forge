// Vitest coverage for the generic tri-state access-tier pill (ETP-4907),
// shared by the "Configuración > Roles" access matrix.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import AccessTierPill from '../AccessTierPill.jsx';

describe('AccessTierPill', () => {
  it('renders a check mark for tier="full"', () => {
    render(<AccessTierPill tier="full" />);
    const el = screen.getByTestId('AccessTierPill__full');
    expect(el.textContent).toBe('✓');
  });

  it('renders the accessTierReadOnly i18n key for tier="readOnly"', () => {
    render(<AccessTierPill tier="readOnly" />);
    const el = screen.getByTestId('AccessTierPill__readOnly');
    expect(el.textContent).toBe('accessTierReadOnly');
  });

  it('renders a plain em-dash for tier="none"', () => {
    render(<AccessTierPill tier="none" />);
    const el = screen.getByTestId('AccessTierPill__none');
    expect(el.textContent).toBe('—');
  });

  it('treats null/undefined tier the same as "none" (no pill, no crash)', () => {
    render(<AccessTierPill tier={null} />);
    expect(screen.getByTestId('AccessTierPill__none').textContent).toBe('—');
  });

  it('honors a custom data-testid override', () => {
    render(<AccessTierPill tier="full" data-testid="Custom__cellId" />);
    expect(screen.getByTestId('Custom__cellId')).toBeTruthy();
  });
});
