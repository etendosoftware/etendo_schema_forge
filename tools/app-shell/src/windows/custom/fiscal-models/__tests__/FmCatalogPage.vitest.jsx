// @covers tools/app-shell/src/windows/custom/fiscal-models/FmCatalogPage.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/catalogAvailability.js
// Vitest component tests for FmCatalogPage.jsx
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
vi.mock('../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  X: () => null,
  TriangleAlert: () => null,
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
const sii = vi.hoisted(() => ({ active: false, since: null, calls: 0, gate: null, rejectNext: false }));
vi.mock('../useOrgSiiStatus.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // `sii.gate` (a promise) holds the status read open, to click again while it is in flight.
    default: () => () => {
      sii.calls += 1;
      // `sii.rejectNext` makes the next read reject once (a getSiiStatus that breaks its
      // never-rejects contract), to check the in-flight lock is released on a failure too.
      if (sii.rejectNext) {
        sii.rejectNext = false;
        return Promise.reject(new Error('sii status read failed'));
      }
      const answer = () => ({ active: sii.active, since: sii.since });
      return sii.gate ? sii.gate.then(answer) : Promise.resolve(answer());
    },
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
  sii.gate = null;
  sii.rejectNext = false;
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

  // ETP-5831 CP-21 — the order is by model code and never depends on the active state: toggling
  // a model must not move its card (it used to jump, as the list sorted active models first).
  const badgeOrder = (container) => Array.from(container.querySelectorAll('.fm-catalog-card__badge'))
    .map(b => b.textContent);

  it('keeps the cards in model-code order when a model is deactivated', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    expect(badgeOrder(container)).toEqual(['303', '349', '390']);

    fireEvent.click(container.querySelectorAll('[role="switch"]')[0]); // 303 off
    expect(badgeOrder(container)).toEqual(['303', '349', '390']);
  });

  it('keeps the cards in model-code order when a model is activated', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} activeModels={{ '390': true }} />);
    // Active state at open time does not lead the order either.
    expect(badgeOrder(container)).toEqual(['303', '349', '390']);

    fireEvent.click(container.querySelectorAll('[role="switch"]')[1]); // 349 on
    expect(badgeOrder(container)).toEqual(['303', '349', '390']);
  });
});

// ── Save on toggle / close ────────────────────────────────────────────────────

// ETP-5831 CP-22 — every toggle is saved right away with the full new selection; closing the
// drawer only closes it. Saving on close lost every change made before a reload or a navigation
// with the drawer open (the access log showed no PUT at all).
describe('FmCatalogPage — save on toggle, close only closes', () => {
  const switchOf = (container, id) => Array.from(container.querySelectorAll('.fm-catalog-card'))
    .find(c => c.querySelector('.fm-catalog-card__badge')?.textContent === id)
    .querySelector('[role="switch"]');

  it('saves the full new selection as soon as a model is toggled, without closing', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(switchOf(container, '303'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ '303': false, '349': true });
    expect(onBack).not.toHaveBeenCalled();
    expect(container.querySelector('.fm-catalog-drawer')).not.toBeNull();
  });

  it('closing with the X button only closes: nothing is saved, with or without a previous toggle', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(container.querySelector('.fm-catalog-header__back'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(switchOf(container, '303'));
    fireEvent.click(container.querySelector('.fm-catalog-header__back'));
    expect(onSave).toHaveBeenCalledTimes(1); // the toggle, not the close
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('closing via the backdrop overlay only closes: nothing is saved', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(container.querySelector('.fm-catalog-overlay'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the drawer itself (stopPropagation on the drawer wrapper)', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={onBack} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(container.querySelector('.fm-catalog-drawer'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('two fast toggles each save the cumulative selection, in order', () => {
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={onSave} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(switchOf(container, '303'));
    fireEvent.click(switchOf(container, '349'));
    expect(onSave.mock.calls.map(([sel]) => sel)).toEqual([
      { '303': false, '349': true },
      { '303': false, '349': false },
    ]);
  });

  it('toggling a model on and back off saves twice and ends on the original value', () => {
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={onSave} activeModels={{ '303': true }} />
    );
    fireEvent.click(switchOf(container, '349'));
    fireEvent.click(switchOf(container, '349'));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0]).toEqual({ '303': true, '349': false });
  });

  // The page rolls a failed save back by handing the drawer the last confirmed catalog.
  it('follows the activeModels prop, so a rolled-back toggle visibly flips back', () => {
    const onSave = vi.fn();
    const confirmed = { '303': true, '349': true };
    const { container, rerender } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={onSave} activeModels={confirmed} />
    );
    fireEvent.click(switchOf(container, '303'));
    expect(switchOf(container, '303').getAttribute('aria-checked')).toBe('false');
    rerender(<FmCatalogPage onBack={vi.fn()} onSave={onSave} activeModels={{ ...confirmed }} />);
    expect(switchOf(container, '303').getAttribute('aria-checked')).toBe('true');
    // The next toggle builds on the rolled-back selection.
    fireEvent.click(switchOf(container, '349'));
    expect(onSave).toHaveBeenLastCalledWith({ '303': true, '349': false });
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
    const warning = screen.getByTestId('FmCatalogPage__siiWarning');
    // Bold first sentence, then the rest; the 390 card is highlighted while it is open.
    expect(warning.querySelector('strong').textContent).toBe('fm.catalog.sii_warning_title');
    expect(warning.textContent).toContain('fm.catalog.sii_warning_body');
    const card390 = () => Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.querySelector('.fm-catalog-card__badge')?.textContent === '390');
    expect(card390().className).toContain('fm-catalog-card--attention');
    expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('false');
    expect(onSave).not.toHaveBeenCalled(); // nothing is saved while the warning is open

    fireEvent.click(screen.getByTestId('FmCatalogPage__siiConfirm'));
    expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();
    expect(card390().className).not.toContain('fm-catalog-card--attention');
    expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('true');
    // ETP-5831 CP-22 — "Activar" saves right away, with the full selection.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ '303': true, '349': true, '390': true });
  });

  it('organization that joined the SII this year: the warning says "since <date>", not exempt', async () => {
    sii.active = true;
    const year = new Date().getFullYear();
    sii.since = `${year}-09-15`;
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    fireEvent.click(switchOf(container, '390'));
    const warning = await screen.findByTestId('FmCatalogPage__siiWarning');
    expect(warning.querySelector('strong').textContent).toContain('fm.catalog.sii_warning_since_title');
    expect(warning.querySelector('strong').textContent).toContain(`15/09/${year}`);
    expect(warning.textContent).toContain('fm.catalog.sii_warning_since_body');
  });

  it('organization in the SII since a previous year (or since 1 January): the plain warning', async () => {
    sii.active = true;
    sii.since = `${new Date().getFullYear()}-01-01`;
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    fireEvent.click(switchOf(container, '390'));
    const warning = await screen.findByTestId('FmCatalogPage__siiWarning');
    expect(warning.textContent).toBe('fm.catalog.sii_warning_title fm.catalog.sii_warning_bodyfm.action.cancelfm.catalog.activate');
  });

  it('organization in the SII: "Cancelar" leaves it inactive and saves nothing', async () => {
    sii.active = true;
    const onSave = vi.fn();
    const { container } = render(<FmCatalogPage {...defaultProps} onSave={onSave} />);
    fireEvent.click(switchOf(container, '390'));
    fireEvent.click(await screen.findByTestId('FmCatalogPage__siiCancel'));
    expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();
    expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('false');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('organization outside the SII: activates without asking, and saves right away', async () => {
    const onSave = vi.fn();
    const { container } = render(<FmCatalogPage {...defaultProps} onSave={onSave} />);
    fireEvent.click(switchOf(container, '390'));
    await waitFor(() => expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('true'));
    expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();
    expect(onSave).toHaveBeenCalledWith({ '303': true, '349': true, '390': true });
  });

  // ETP-5831 (review W3) — the SII status is read across an await; a second click on the same
  // switch during it used to take the activate branch again (double flip, two saves).
  it('ignores a second click on the 390 while its SII status is still being read (outside the SII)', async () => {
    let release;
    sii.gate = new Promise((r) => { release = r; });
    const onSave = vi.fn();
    const { container } = render(<FmCatalogPage {...defaultProps} onSave={onSave} />);
    fireEvent.click(switchOf(container, '390'));
    fireEvent.click(switchOf(container, '390'));
    release();
    await waitFor(() => expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('true'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sii.calls).toBe(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ '303': true, '349': true, '390': true });
  });

  it('ignores a second click on the 390 while its SII status is still being read (in the SII)', async () => {
    sii.active = true;
    let release;
    sii.gate = new Promise((r) => { release = r; });
    const onSave = vi.fn();
    const { container } = render(<FmCatalogPage {...defaultProps} onSave={onSave} />);
    fireEvent.click(switchOf(container, '390'));
    fireEvent.click(switchOf(container, '390'));
    release();
    expect(await screen.findAllByTestId('FmCatalogPage__siiWarning')).toHaveLength(1);
    expect(sii.calls).toBe(1);
    expect(onSave).not.toHaveBeenCalled();
    // Once the read settled, the switch answers clicks again.
    fireEvent.click(screen.getByTestId('FmCatalogPage__siiConfirm'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  describe('when the SII status read rejects', () => {
    // ETP-5831 — the per-model lock is released in a `finally`: a failed SII read must not leave
    // the 390 switch dead for the rest of the drawer's life. `toggleModel` has no `catch` (the real
    // getSiiStatus never rejects), so the switch's discarded promise rejects at process level; that
    // expected rejection is swallowed for the duration of the test, as LifecycleConfirmModal does.
    let ignoreExpectedRejection;
    beforeEach(() => {
      ignoreExpectedRejection = () => {};
      process.on('unhandledRejection', ignoreExpectedRejection);
    });
    afterEach(() => {
      process.removeListener('unhandledRejection', ignoreExpectedRejection);
    });

    it('releases the in-flight lock when the SII status read rejects, so the next click still saves', async () => {
      sii.rejectNext = true;
      const onSave = vi.fn();
      const { container } = render(<FmCatalogPage {...defaultProps} onSave={onSave} />);
      fireEvent.click(switchOf(container, '390'));
      await waitFor(() => expect(sii.calls).toBe(1));
      await new Promise(resolve => setTimeout(resolve, 0));
      // The failed read toggles nothing and saves nothing.
      expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('false');
      expect(onSave).not.toHaveBeenCalled();

      // The second click is not swallowed by a stale lock: it reads the status again and activates.
      fireEvent.click(switchOf(container, '390'));
      await waitFor(() => expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('true'));
      expect(sii.calls).toBe(2);
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({ '303': true, '349': true, '390': true });
    });

    it('releases the in-flight lock when the SII status read rejects (in the SII): the next click asks', async () => {
      sii.active = true;
      sii.rejectNext = true;
      const onSave = vi.fn();
      const { container } = render(<FmCatalogPage {...defaultProps} onSave={onSave} />);
      fireEvent.click(switchOf(container, '390'));
      await waitFor(() => expect(sii.calls).toBe(1));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.queryByTestId('FmCatalogPage__siiWarning')).toBeNull();

      fireEvent.click(switchOf(container, '390'));
      fireEvent.click(await screen.findByTestId('FmCatalogPage__siiConfirm'));
      expect(sii.calls).toBe(2);
      expect(switchOf(container, '390').getAttribute('aria-checked')).toBe('true');
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({ '303': true, '349': true, '390': true });
    });
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

// ── Models the backend marks unavailable (backend-only flag `fiscal-model-390`) ──

describe('FmCatalogPage — unavailable models', () => {
  const badges = (container) => Array.from(container.querySelectorAll('.fm-catalog-card__badge'))
    .map(b => b.textContent);
  // The header renders the catalog size in the badge next to the title, and the active count in
  // the subtitle ("• N fm.catalog.active_count").
  const headerTitleBadge = (container) =>
    container.querySelector('.fm-catalog-header__titles span').textContent;
  const headerActiveLine = (container) =>
    container.querySelector('.fm-catalog-header__sub').textContent;

  it('renders no 390 card when the 390 is unavailable', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} unavailableModels={['390']} />);
    expect(badges(container).sort()).toEqual(['303', '349']);
    expect(document.body.textContent).not.toContain('fm.catalog.390.name');
  });

  it('does not count the 390 in the header when it is unavailable', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} unavailableModels={['390']} />);
    expect(headerTitleBadge(container)).toBe('2');
    expect(headerActiveLine(container)).toContain('2');
  });

  it('does not save a 390 value when it is unavailable and there is no stored catalog', () => {
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={onSave} activeModels={undefined} unavailableModels={['390']} />
    );
    fireEvent.click(container.querySelectorAll('[role="switch"]')[0]); // a toggle saves right away
    const saved = onSave.mock.calls[0][0];
    expect('390' in saved).toBe(false);
    expect(Object.keys(saved).sort()).toEqual(['303', '349']);
  });

  it('does not save a 390 value after toggling the other models while it is unavailable', () => {
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={onSave} activeModels={{ '303': true }} unavailableModels={['390']} />
    );
    const card349 = Array.from(container.querySelectorAll('.fm-catalog-card'))
      .find(c => c.querySelector('.fm-catalog-card__badge')?.textContent === '349');
    fireEvent.click(card349.querySelector('[role="switch"]'));
    expect(onSave).toHaveBeenCalledWith({ '303': true, '349': true });
  });

  it('shows the 390 card, counts it and saves it when it is available (no marker)', () => {
    const onSave = vi.fn();
    const { container } = render(
      <FmCatalogPage onBack={vi.fn()} onSave={onSave} activeModels={undefined} unavailableModels={[]} />
    );
    expect(badges(container).sort()).toEqual(['303', '349', '390']);
    expect(headerTitleBadge(container)).toBe('3');
    fireEvent.click(container.querySelectorAll('[role="switch"]')[0]); // a toggle saves right away
    expect(onSave.mock.calls[0][0]).toHaveProperty('390');
  });

  it('treats a missing unavailableModels prop as nothing unavailable', () => {
    const { container } = render(<FmCatalogPage {...defaultProps} />);
    expect(badges(container)).toContain('390');
  });
});
