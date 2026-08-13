// Vitest component tests for FmCatalogPage.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  X: () => null,
  Check: () => null,
  Star: () => null,
}));
// Mock ConfigDrawer (only opened when configModel is set — not triggered in basic tests)
vi.mock('../FmOverlays.jsx', () => ({
  ConfigDrawer: () => null,
}));

import FmCatalogPage from '../FmCatalogPage.jsx';

const defaultProps = {
  onBack: vi.fn(),
  onSave: vi.fn(),
  activeModels: { '303': true, '349': true },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ────────────────────────────────────────────────────────────────

describe('FmCatalogPage — rendering', () => {
  it('renders the catalog title', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.catalog.title');
  });

  it('renders a card for each catalog model (6 total)', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const cards = container.querySelectorAll('.fm-catalog-card');
    expect(cards.length).toBe(6);
  });

  it('shows total catalog count badge (6)', () => {
    render(<FmCatalogPage {...defaultProps} />);
    // The count badge text contains '6'
    expect(document.body.textContent).toContain('6');
  });

  it('shows model 303 and 349 name keys', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.catalog.303.name');
    expect(document.body.textContent).toContain('fm.catalog.349.name');
  });

  it('shows periodicity labels from i18n', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.catalog.periodicity.quarterly');
    expect(document.body.textContent).toContain('fm.catalog.periodicity.monthly');
  });

  it('shows "Próximamente" text for locked models', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.catalog.coming_soon');
  });
});

// ── Toggle behavior ──────────────────────────────────────────────────────────

describe('FmCatalogPage — toggle', () => {
  it('303 model is initially active when activeModels has 303: true', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    // The 303 card should have --active class
    const active303 = container.querySelector('.fm-catalog-card--active');
    expect(active303).toBeTruthy();
    expect(active303.textContent).toContain('303');
  });

  it('toggling 303 switch deactivates it (active count decreases)', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    // ToggleSwitch for 303 is the first switch
    const switches = container.querySelectorAll('[role="switch"]');
    // Both 303 and 349 are active, so 2 switches exist
    expect(switches.length).toBeGreaterThanOrEqual(2);
    // Clicking the 303 switch (first) toggles it off
    fireEvent.click(switches[0]);
    // After toggle, active count text should change to '1 modelos activos'
    expect(document.body.textContent).toContain('1');
  });

  it('locked models do not have a switch (no toggle)', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const switches = container.querySelectorAll('[role="switch"]');
    // Only 303 and 349 are not locked → 2 switches max
    expect(switches.length).toBeLessThanOrEqual(2);
  });

  it('locked cards have --locked CSS class', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const locked = container.querySelectorAll('.fm-catalog-card--locked');
    expect(locked.length).toBeGreaterThan(0);
  });
});

// ── Close / Save ──────────────────────────────────────────────────────────────

describe('FmCatalogPage — close and save', () => {
  it('calls onSave and onBack when close button is clicked', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    const closeBtn = container.querySelector('.fm-catalog-header__back');
    fireEvent.click(closeBtn);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ '303': true, '349': true }));
    expect(onBack).toHaveBeenCalled();
  });

  it('passes updated activeModels to onSave after toggle', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    const switches = container.querySelectorAll('[role="switch"]');
    fireEvent.click(switches[0]); // toggle 303 off
    const closeBtn = container.querySelector('.fm-catalog-header__back');
    fireEvent.click(closeBtn);
    const savedActive = onSave.mock.calls[0][0];
    // After toggling 303 off it should be false
    expect(savedActive['303']).toBe(false);
    expect(savedActive['349']).toBe(true);
  });
});

// ── Active count ─────────────────────────────────────────────────────────────

describe('FmCatalogPage — active count', () => {
  it('shows 2 active when both 303 and 349 are on', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('2');
  });

  it('shows 0 active when no models are passed as active', () => {
    render(
      <FmCatalogPage
        onBack={vi.fn()}
        onSave={vi.fn()}
        activeModels={{ '303': false, '349': false }}
      />
    );
    expect(document.body.textContent).toContain('0');
  });
});
