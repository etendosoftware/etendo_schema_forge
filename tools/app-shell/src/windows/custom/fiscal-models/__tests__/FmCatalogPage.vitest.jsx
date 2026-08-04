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

  it('renders a card for each catalog model (2 total)', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const cards = container.querySelectorAll('.fm-catalog-card');
    expect(cards.length).toBe(2);
  });

  it('shows total catalog count badge (2)', () => {
    render(<FmCatalogPage {...defaultProps} />);
    // The count badge text contains '2'
    expect(document.body.textContent).toContain('2');
  });

  it('shows model 303 and 349 name keys', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.catalog.303.name');
    expect(document.body.textContent).toContain('fm.catalog.349.name');
  });

  it('does not render discontinued models 111, 115, 180, 190', () => {
    render(<FmCatalogPage {...defaultProps} />);
    for (const id of ['111', '115', '180', '190']) {
      expect(document.body.textContent).not.toContain(`fm.catalog.${id}.name`);
    }
  });

  it('shows periodicity labels from i18n', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.catalog.periodicity.quarterly');
    expect(document.body.textContent).toContain('fm.catalog.periodicity.monthly');
  });

  it('303 shows both Trimestral and Mensual periodicity pills', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const card303 = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.textContent.includes('303'));
    const pills = card303.querySelectorAll('.fm-catalog-card__pill');
    const pillText = Array.from(pills).map(p => p.textContent);
    expect(pillText).toContain('fm.catalog.periodicity.quarterly');
    expect(pillText).toContain('fm.catalog.periodicity.monthly');
  });

  it('349 shows both Mensual and Trimestral periodicity pills', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const card349 = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.textContent.includes('349'));
    const pills = card349.querySelectorAll('.fm-catalog-card__pill');
    const pillText = Array.from(pills).map(p => p.textContent);
    expect(pillText).toContain('fm.catalog.periodicity.monthly');
    expect(pillText).toContain('fm.catalog.periodicity.quarterly');
  });

  it('303 pills render in exact declared order: quarterly then monthly', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const card303 = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.textContent.includes('303'));
    const pillText = Array.from(card303.querySelectorAll('.fm-catalog-card__pill'))
      .map(p => p.textContent);
    expect(pillText).toEqual([
      'fm.catalog.periodicity.quarterly',
      'fm.catalog.periodicity.monthly',
    ]);
  });

  it('349 pills render in exact declared order: monthly then quarterly', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const card349 = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.textContent.includes('349'));
    const pillText = Array.from(card349.querySelectorAll('.fm-catalog-card__pill'))
      .map(p => p.textContent);
    expect(pillText).toEqual([
      'fm.catalog.periodicity.monthly',
      'fm.catalog.periodicity.quarterly',
    ]);
  });

  it('303 and 349 pills render simultaneously without cross-contamination', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const allPills = container.querySelectorAll('.fm-catalog-card__pill');
    // 2 pills per model x 2 models = 4 pills total, rendered together.
    expect(allPills.length).toBe(4);
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

  it('both 303 and 349 have a toggle switch (no locked models in the catalog)', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const switches = container.querySelectorAll('[role="switch"]');
    expect(switches.length).toBe(2);
  });

  it('no cards have the --locked CSS class', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const locked = container.querySelectorAll('.fm-catalog-card--locked');
    expect(locked.length).toBe(0);
  });

  it('re-sorts cards so the still-active model renders first after a toggle', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    // Initially both active — id order wins the tie-break (303 before 349).
    let order = Array.from(container.querySelectorAll('.fm-catalog-card__badge'))
      .map(b => b.textContent);
    expect(order).toEqual(['303', '349']);

    // Deactivate 303 (first switch) — 349 (still active) should now sort first.
    const switches = container.querySelectorAll('[role="switch"]');
    fireEvent.click(switches[0]);

    order = Array.from(container.querySelectorAll('.fm-catalog-card__badge'))
      .map(b => b.textContent);
    expect(order).toEqual(['349', '303']);
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
