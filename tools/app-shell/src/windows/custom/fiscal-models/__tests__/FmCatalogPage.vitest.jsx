// @covers tools/app-shell/src/windows/custom/fiscal-models/FmCatalogPage.jsx
// Vitest component tests for FmCatalogPage.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
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
// ETP-5187 (adjacent scope) — FmCatalogPage now calls useNavigate() (IAE-activity reminder
// on 303 activation), which throws outside a <Router> ancestor. No test here exercises SPA
// navigation itself, so a plain stub is enough — mirrors FmModel303Page.vitest.jsx's own mock.
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

// ETP-5716 — the organization's SII status (controls the 390 activation warning). Not in the SII
// by default, so every pre-existing test toggles straight away.
const sii = vi.hoisted(() => ({ active: false, since: null, calls: 0 }));
vi.mock('../useOrgSiiStatus.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: () => () => { sii.calls += 1; return Promise.resolve({ active: sii.active, since: sii.since }); },
  };
});

import FmCatalogPage from '../FmCatalogPage.jsx';

const defaultProps = {
  onBack: vi.fn(),
  onSave: vi.fn(),
  activeModels: { '303': true, '349': true },
};

beforeEach(() => {
  vi.clearAllMocks();
  sii.active = false;
  sii.since = null;
  sii.calls = 0;
});

// ── Rendering ────────────────────────────────────────────────────────────────

describe('FmCatalogPage — rendering', () => {
  it('renders the catalog title', () => {
    render(<FmCatalogPage {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.catalog.title');
  });

  // ETP-5716 — the registry has 3 models (303, 349 and the annual 390).
  it('renders a card for each catalog model (3 total)', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const cards = container.querySelectorAll('.fm-catalog-card');
    expect(cards.length).toBe(3);
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

  it('303 pills render in the same order as 349: monthly then quarterly', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const card303 = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.textContent.includes('303'));
    const pillText = Array.from(card303.querySelectorAll('.fm-catalog-card__pill'))
      .map(p => p.textContent);
    expect(pillText).toEqual([
      'fm.catalog.periodicity.monthly',
      'fm.catalog.periodicity.quarterly',
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
    // 2 pills each for 303 and 349 + 1 ("Anual") for 390 (ETP-5716), rendered together.
    expect(allPills.length).toBe(5);
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

  it('every model (303, 349, 390) has a toggle switch (no locked models in the catalog)', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const switches = container.querySelectorAll('[role="switch"]');
    expect(switches.length).toBe(3);
  });

  it('no cards have the --locked CSS class', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const locked = container.querySelectorAll('.fm-catalog-card--locked');
    expect(locked.length).toBe(0);
  });

  it('re-sorts cards so the still-active model renders first after a toggle', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    // Initially 303 and 349 active — id order wins the tie-break (303 before 349); the inactive
    // 390 (ETP-5716, not in activeModels) sorts after them.
    let order = Array.from(container.querySelectorAll('.fm-catalog-card__badge'))
      .map(b => b.textContent);
    expect(order).toEqual(['303', '349', '390']);

    // Deactivate 303 (first switch) — 349 (still active) should now sort first.
    const switches = container.querySelectorAll('[role="switch"]');
    fireEvent.click(switches[0]);

    order = Array.from(container.querySelectorAll('.fm-catalog-card__badge'))
      .map(b => b.textContent);
    expect(order).toEqual(['349', '303', '390']);
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

  // Regression: previously the backdrop overlay was rendered externally by
  // FmListPage, so clicking it to close the drawer bypassed FmCatalogPage's
  // onSave entirely and silently discarded toggled model states. Now
  // FmCatalogPage owns its own overlay + drawer wrapper, and a single
  // handleClose (calling onSave then onBack) backs BOTH the backdrop click
  // and the X button, so both close paths save consistently.
  it('calls onSave and onBack when the backdrop overlay is clicked (not just the X button)', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    const overlay = container.querySelector('.fm-catalog-overlay');
    fireEvent.click(overlay);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ '303': true, '349': true }));
    expect(onBack).toHaveBeenCalled();
  });

  it('persists a toggle made before closing via the backdrop overlay (the actual bug being fixed)', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    const switches = container.querySelectorAll('[role="switch"]');
    fireEvent.click(switches[0]); // toggle 303 off
    const overlay = container.querySelector('.fm-catalog-overlay');
    fireEvent.click(overlay);
    const savedActive = onSave.mock.calls[0][0];
    expect(savedActive['303']).toBe(false);
    expect(savedActive['349']).toBe(true);
    expect(onBack).toHaveBeenCalled();
  });

  it('does not close when clicking inside the drawer itself (stopPropagation on the drawer wrapper)', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    const drawer = container.querySelector('.fm-catalog-drawer');
    fireEvent.click(drawer);
    expect(onSave).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('calls onSave/onBack with the unchanged activeModels when the backdrop is clicked without any toggle', () => {
    // Edge case: closing via backdrop when `active` state is identical to the
    // original `activeModels` prop — no toggles made before closing.
    const onBack = vi.fn();
    const onSave = vi.fn();
    const original = { '303': true, '349': true };
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={original} />
    );
    const overlay = container.querySelector('.fm-catalog-overlay');
    fireEvent.click(overlay);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ '303': true, '349': true });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // Gap: handleClose has no idempotency guard (no "already closed" flag). In
  // the real app this is masked because FmListPage unmounts FmCatalogPage on
  // the first onBack, but the component itself does not protect against being
  // invoked twice (e.g. two click events reaching it before that unmount
  // commits). This test documents the current (unguarded) behavior — see
  // BUG report to Forge for the risk assessment.
  it('handleClose has no de-dup guard: firing the backdrop click twice invokes onSave/onBack twice', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    const overlay = container.querySelector('.fm-catalog-overlay');
    fireEvent.click(overlay);
    fireEvent.click(overlay);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('handleClose has no de-dup guard: firing the X button twice invokes onSave/onBack twice', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    const closeBtn = container.querySelector('.fm-catalog-header__back');
    fireEvent.click(closeBtn);
    fireEvent.click(closeBtn);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onBack).toHaveBeenCalledTimes(2);
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

// ── SII warning on activating 390 (ETP-5716) ─────────────────────────────────

describe('FmCatalogPage — SII warning when activating the 390', () => {
  const switchOf = (container, id) => {
    const card = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.querySelector('.fm-catalog-card__badge')?.textContent === id);
    return card.querySelector('[role="switch"]');
  };

  it('shows the 390 card with the single "Anual" chip', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    const card = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.querySelector('.fm-catalog-card__badge')?.textContent === '390');
    const pills = Array.from(card.querySelectorAll('.fm-catalog-card__pill')).map(p => p.textContent);
    expect(pills).toEqual(['fm.catalog.periodicity.annual']);
    expect(card.textContent).toContain('fm.catalog.390.name');
  });

  it('organization in the SII: asks first, "Activar" activates it', async () => {
    sii.active = true;
    const onSave = vi.fn();
    const { container } = render(<FmCatalogPage {...defaultProps} onSave={onSave} />);
    fireEvent.click(switchOf(container, '390'));
    await screen.findByTestId('FmCatalogPage__siiWarning');
    expect(screen.getByTestId('FmCatalogPage__siiWarning').textContent).toContain('fm.catalog.sii_warning');
    expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByTestId('FmCatalogPage__siiConfirm'));
    expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();
    expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(container.querySelector('.fm-catalog-header__back'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ '390': true }));
  });

  it('organization that joined the SII this year: the warning says "since <date>", not exempt', async () => {
    sii.active = true;
    const year = new Date().getFullYear();
    sii.since = `${year}-09-15`;
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    fireEvent.click(switchOf(container, '390'));
    const warning = await screen.findByTestId('FmCatalogPage__siiWarning');
    expect(warning.textContent).toContain('fm.catalog.sii_warning_since');
    expect(warning.textContent).toContain(`15/09/${year}`);
  });

  it('organization in the SII since a previous year (or since 1 January): the plain warning', async () => {
    sii.active = true;
    sii.since = `${new Date().getFullYear()}-01-01`;
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    fireEvent.click(switchOf(container, '390'));
    const warning = await screen.findByTestId('FmCatalogPage__siiWarning');
    expect(warning.textContent).toBe('fm.catalog.sii_warningfm.action.cancelfm.catalog.activate');
  });

  it('organization in the SII: "Cancelar" leaves it inactive', async () => {
    sii.active = true;
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    fireEvent.click(switchOf(container, '390'));
    fireEvent.click(await screen.findByTestId('FmCatalogPage__siiCancel'));
    expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();
    expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('false');
  });

  it('organization outside the SII: activates without asking', async () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    fireEvent.click(switchOf(container, '390'));
    await waitFor(() => expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('true'));
    expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();
  });

  it('never asks for 303/349, nor when deactivating the 390', async () => {
    sii.active = true;
    const { container } = render(<FmCatalogPage {...defaultProps} activeModels={{ '303': true, '349': false, '390': true }} />);
    fireEvent.click(switchOf(container, '349'));
    fireEvent.click(switchOf(container, '390'));
    await waitFor(() => expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('false'));
    expect(switchOf(container, '349').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();
    expect(sii.calls).toBe(0);
  });
});
