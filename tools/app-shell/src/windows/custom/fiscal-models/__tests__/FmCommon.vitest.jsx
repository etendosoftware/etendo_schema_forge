// @covers tools/app-shell/src/windows/custom/fiscal-models/FmCommon.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmDetailChrome.jsx
// Vitest component tests for FmCommon.jsx and the presentational helpers of FmDetailChrome.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('./fiscal-models.css', () => ({}));
vi.mock('../fiscal-models.css', () => ({}));

const toggleFavorite = vi.fn();
let mockIsFavorite = vi.fn(() => false);
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ toggleFavorite, isFavorite: mockIsFavorite }),
}));

const supportSetTab = vi.fn();
const supportOpen = vi.fn();
vi.mock('@/components/support/SupportChatContext.jsx', () => ({
  useSupportChatSafe: () => ({ actions: { setTab: supportSetTab, open: supportOpen } }),
}));

import {
  KpiWidget, Tabs, Banner,
  EmptyState, Stepper, NumberedStepper, SectionCard, SidePanel,
} from '../FmCommon.jsx';
import {
  FmStatusChip, fiscalStatusTone, statusLabelKey, tabCount, incidentsTabBadge,
} from '../FmDetailChrome.jsx';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

// ── KpiWidget ─────────────────────────────────────────────────────────────────

describe('KpiWidget', () => {
  it('renders the value', () => {
    render(<KpiWidget label="Test" value={42} />);
    expect(document.body.textContent).toContain('42');
  });

  it('renders the label', () => {
    render(<KpiWidget label="My Label" value={0} />);
    expect(document.body.textContent).toContain('My Label');
  });

  it('renders the badge when provided', () => {
    render(<KpiWidget label="Test" value={1} badge="Esta semana" badgeBg="#fff" badgeColor="#333" />);
    expect(document.body.textContent).toContain('Esta semana');
  });

  it('does not render badge when badge prop is null', () => {
    render(<KpiWidget label="Test" value={1} badge={null} />);
    // badge text should not appear
    expect(document.body.textContent).not.toContain('Esta semana');
  });

  // ETP-5584 (P15) — label and badge never wrap: at 1280px four cards leave ~210px for both.
  it('keeps the label and the badge on one line (nowrap; the label ellipsises, the badge never shrinks)', () => {
    render(<KpiWidget label="Total operaciones" value={1} badge="Base total" />);
    const label = screen.getByText('Total operaciones');
    const badge = screen.getByText('Base total');
    expect(label.style.whiteSpace).toBe('nowrap');
    expect(label.style.textOverflow).toBe('ellipsis');
    expect(label.getAttribute('title')).toBe('Total operaciones');
    expect(badge.style.whiteSpace).toBe('nowrap');
    expect(badge.style.flexShrink).toBe('0');
  });

  it('renders icon when provided', () => {
    const icon = <span data-testid="kpi-icon">icon</span>;
    render(<KpiWidget label="Test" value={0} icon={icon} />);
    expect(screen.getByTestId('kpi-icon')).toBeTruthy();
  });
});

// ── KpiWidget — click-to-filter (onClick/active, ETP-4755) ─────────────────────

describe('KpiWidget — onClick/active (opt-in click-to-filter)', () => {
  it('does not set role="button" when onClick is omitted (regression guard for 303/349 plain KPIs)', () => {
    const { container } = render(<KpiWidget label="Test" value={1} />);
    const card = container.firstChild;
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();
    expect(card.getAttribute('aria-pressed')).toBeNull();
  });

  it('sets role="button" and tabIndex when onClick is provided', () => {
    const { container } = render(<KpiWidget label="Test" value={1} onClick={vi.fn()} />);
    const card = container.firstChild;
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  it('sets aria-pressed="true" when active is true', () => {
    const { container } = render(<KpiWidget label="Test" value={1} onClick={vi.fn()} active />);
    expect(container.firstChild.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets aria-pressed="false" when active is false/omitted but onClick is provided', () => {
    const { container } = render(<KpiWidget label="Test" value={1} onClick={vi.fn()} />);
    expect(container.firstChild.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    const { container } = render(<KpiWidget label="Test" value={1} onClick={onClick} />);
    fireEvent.click(container.firstChild);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Enter key press', () => {
    const onClick = vi.fn();
    const { container } = render(<KpiWidget label="Test" value={1} onClick={onClick} />);
    fireEvent.keyDown(container.firstChild, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Space key press', () => {
    const onClick = vi.fn();
    const { container } = render(<KpiWidget label="Test" value={1} onClick={onClick} />);
    fireEvent.keyDown(container.firstChild, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick on other key presses', () => {
    const onClick = vi.fn();
    const { container } = render(<KpiWidget label="Test" value={1} onClick={onClick} />);
    fireEvent.keyDown(container.firstChild, { key: 'Tab' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not throw when a key is pressed and onClick is omitted', () => {
    const { container } = render(<KpiWidget label="Test" value={1} />);
    expect(() => fireEvent.keyDown(container.firstChild, { key: 'Enter' })).not.toThrow();
  });
});

// ── Tabs ─────────────────────────────────────────────────────────────────────

describe('Tabs', () => {
  const tabs = [
    { id: 'tab1', label: 'Tab One' },
    { id: 'tab2', label: 'Tab Two' },
    { id: 'tab3', label: 'Tab Three', badge: 5 },
  ];

  it('renders all tab buttons', () => {
    render(<Tabs tabs={tabs} active="tab1" onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('tab');
    expect(buttons).toHaveLength(3);
  });

  it('marks the active tab with aria-selected=true', () => {
    render(<Tabs tabs={tabs} active="tab2" onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('tab');
    const activeBtn = buttons.find(b => b.textContent.includes('Tab Two'));
    expect(activeBtn.getAttribute('aria-selected')).toBe('true');
  });

  it('marks inactive tabs with aria-selected=false', () => {
    render(<Tabs tabs={tabs} active="tab1" onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('tab');
    const inactiveBtn = buttons.find(b => b.textContent.includes('Tab Two'));
    expect(inactiveBtn.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelect with tab id when clicked', () => {
    const onSelect = vi.fn();
    render(<Tabs tabs={tabs} active="tab1" onSelect={onSelect} />);
    const buttons = screen.getAllByRole('tab');
    const tab2 = buttons.find(b => b.textContent.includes('Tab Two'));
    fireEvent.click(tab2);
    expect(onSelect).toHaveBeenCalledWith('tab2');
  });

  it('renders badge when provided on a tab', () => {
    render(<Tabs tabs={tabs} active="tab1" onSelect={vi.fn()} />);
    expect(document.body.textContent).toContain('5');
  });

  // tabCount() yields 0 for an empty list; a `t.badge && …` guard would swallow it (React
  // renders nothing for `0 &&`), and every page test mocks Tabs, so only this test sees it.
  it('renders a badge of 0 as a visible "0" counter', () => {
    const { container } = render(
      <Tabs tabs={[{ id: 'a', label: 'A', badge: tabCount(0) }]} active="a" onSelect={vi.fn()} />,
    );
    const badges = container.querySelectorAll('.fm-tabs__badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe('0');
  });

  it('renders no badge while the count is unknown (null)', () => {
    const { container } = render(
      <Tabs tabs={[{ id: 'a', label: 'A', badge: tabCount(null) }]} active="a" onSelect={vi.fn()} />,
    );
    expect(container.querySelector('.fm-tabs__badge')).toBeNull();
  });

  it('applies the badge tone modifier class from incidentsTabBadge', () => {
    const { container } = render(
      <Tabs tabs={[{ id: 'inc', label: 'Inc', ...incidentsTabBadge(1, 2) }]} active="inc" onSelect={vi.fn()} />,
    );
    const badge = container.querySelector('.fm-tabs__badge');
    expect(badge.textContent).toBe('3');
    expect(badge.classList.contains('fm-tabs__badge--danger')).toBe(true);
  });

  it('applies active CSS class to the active tab', () => {
    render(<Tabs tabs={tabs} active="tab1" onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('tab');
    const activeBtn = buttons.find(b => b.textContent.includes('Tab One'));
    expect(activeBtn.className).toContain('fm-tabs__tab--active');
  });
});

// ── Banner ───────────────────────────────────────────────────────────────────

describe('Banner', () => {
  it('renders simple message form', () => {
    render(<Banner type="info" message="Test message" />);
    expect(document.body.textContent).toContain('Test message');
  });

  it('applies correct CSS type class', () => {
    const { container } = render(<Banner type="error" message="Error" />);
    expect(container.querySelector('.fm-banner--error')).toBeTruthy();
  });

  it('renders rich form with title and sub', () => {
    render(<Banner title="Rich Title" sub="Sub text" tone="warn" />);
    expect(document.body.textContent).toContain('Rich Title');
    expect(document.body.textContent).toContain('Sub text');
  });

  it('renders actions in rich form', () => {
    const actions = <button data-testid="banner-action">Act</button>;
    render(<Banner title="Title" actions={actions} tone="info" />);
    expect(screen.getByTestId('banner-action')).toBeTruthy();
  });

  it('renders close button when onClose is provided (rich form)', () => {
    const onClose = vi.fn();
    const { container } = render(<Banner title="Title" onClose={onClose} tone="info" />);
    const closeBtn = container.querySelector('.fm-banner__close');
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('has role="alert"', () => {
    const { container } = render(<Banner type="info" message="msg" />);
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });
});

// ── EmptyState ────────────────────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders simple form with message', () => {
    render(<EmptyState message="No items found" />);
    expect(document.body.textContent).toContain('No items found');
  });

  it('renders rich form with icon and title', () => {
    const icon = <span data-testid="es-icon">icon</span>;
    render(<EmptyState icon={icon} title="Empty" sub="Try adding items" />);
    expect(screen.getByTestId('es-icon')).toBeTruthy();
    expect(document.body.textContent).toContain('Empty');
    expect(document.body.textContent).toContain('Try adding items');
  });

  it('falls back to i18n key when no message provided', () => {
    render(<EmptyState />);
    // useUI mock returns key as-is: fm.list.empty
    expect(document.body.textContent).toContain('fm.list.empty');
  });
});

// ── Stepper ───────────────────────────────────────────────────────────────────

describe('Stepper', () => {
  const steps = ['Draft', 'Ready', 'Submitted'];

  it('renders all step labels', () => {
    render(<Stepper steps={steps} current={0} />);
    expect(document.body.textContent).toContain('Draft');
    expect(document.body.textContent).toContain('Ready');
    expect(document.body.textContent).toContain('Submitted');
  });

  it('marks the active step', () => {
    const { container } = render(<Stepper steps={steps} current={1} />);
    const activeSteps = container.querySelectorAll('.fm-stepper__step--active');
    expect(activeSteps.length).toBe(1);
    expect(activeSteps[0].textContent).toContain('Ready');
  });

  it('marks done steps with --done class', () => {
    const { container } = render(<Stepper steps={steps} current={2} />);
    const doneSteps = container.querySelectorAll('.fm-stepper__step--done');
    expect(doneSteps.length).toBe(2); // Draft and Ready are done
  });

  it('renders checkmarks for done steps', () => {
    const { container } = render(<Stepper steps={steps} current={1} />);
    const doneSteps = container.querySelectorAll('.fm-stepper__step--done');
    doneSteps.forEach(s => expect(s.textContent).toContain('✓'));
  });

  it('renders separators between steps', () => {
    const { container } = render(<Stepper steps={steps} current={0} />);
    const seps = container.querySelectorAll('.fm-stepper__sep');
    expect(seps.length).toBe(steps.length - 1);
  });
});

// ── NumberedStepper ───────────────────────────────────────────────────────────

describe('NumberedStepper', () => {
  const steps = ['Step A', 'Step B', 'Step C'];

  it('renders all step labels', () => {
    render(<NumberedStepper steps={steps} current={0} />);
    steps.forEach(s => expect(document.body.textContent).toContain(s));
  });

  it('shows circle with checkmark for done steps', () => {
    const { container } = render(<NumberedStepper steps={steps} current={2} />);
    const circles = container.querySelectorAll('.fm-stepper-num__circle');
    expect(circles[0].textContent).toBe('✓');
    expect(circles[1].textContent).toBe('✓');
  });

  it('shows circle with step number for future steps', () => {
    const { container } = render(<NumberedStepper steps={steps} current={0} />);
    const circles = container.querySelectorAll('.fm-stepper-num__circle');
    // Step B (index 1) and C (index 2) are future: show numbers 2 and 3
    expect(circles[1].textContent).toBe('2');
    expect(circles[2].textContent).toBe('3');
  });
});

// ── SectionCard ───────────────────────────────────────────────────────────────

describe('SectionCard', () => {
  it('renders title', () => {
    render(<SectionCard title="My Section">content</SectionCard>);
    expect(document.body.textContent).toContain('My Section');
  });

  it('renders children', () => {
    render(<SectionCard title="Test"><span data-testid="child">child</span></SectionCard>);
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('renders sub text when provided', () => {
    render(<SectionCard title="T" sub="subtitle text">c</SectionCard>);
    expect(document.body.textContent).toContain('subtitle text');
  });

  it('applies flush class when flush prop is true', () => {
    const { container } = render(<SectionCard flush>c</SectionCard>);
    expect(container.querySelector('.fm-section-card--flush')).toBeTruthy();
  });
});

// ── FmDetailChrome — tab counters ─────────────────────────────────────────────

describe('tabCount', () => {
  it('keeps 0 as a real count and maps null/undefined to null (counter hidden)', () => {
    expect(tabCount(0)).toBe(0);
    expect(tabCount(7)).toBe(7);
    expect(tabCount(null)).toBeNull();
    expect(tabCount(undefined)).toBeNull();
  });
});

describe('incidentsTabBadge', () => {
  it('is danger when there is any blocking incident, even with warnings', () => {
    expect(incidentsTabBadge(2, 3)).toEqual({ badge: 5, badgeTone: 'danger' });
  });

  it('is warn when there are only warnings', () => {
    expect(incidentsTabBadge(0, 4)).toEqual({ badge: 4, badgeTone: 'warn' });
  });

  it('has no tone and a 0 count when there are no incidents', () => {
    expect(incidentsTabBadge(0, 0)).toEqual({ badge: 0, badgeTone: null });
  });

  it('treats missing or non-numeric counts as 0', () => {
    expect(incidentsTabBadge(undefined, null)).toEqual({ badge: 0, badgeTone: null });
    expect(incidentsTabBadge('x', '2')).toEqual({ badge: 2, badgeTone: 'warn' });
  });
});

// ── FmDetailChrome — status chip ──────────────────────────────────────────────

describe('statusLabelKey', () => {
  it('collapses submitted_ack onto the submitted label key', () => {
    expect(statusLabelKey('submitted_ack')).toBe('submitted');
  });

  it('leaves every other status unchanged', () => {
    ['draft', 'pending', 'ready', 'submitted', 'submitted_ext'].forEach((s) => {
      expect(statusLabelKey(s)).toBe(s);
    });
  });
});

describe('fiscalStatusTone', () => {
  it.each(['ready', 'submitted', 'submitted_ack', 'submitted_ext'])('%s is green (success)', (s) => {
    expect(fiscalStatusTone(s)).toBe('success');
  });

  it.each(['draft', 'pending', 'skipped', undefined])('%s is grey (neutral)', (s) => {
    expect(fiscalStatusTone(s)).toBe('neutral');
  });
});

describe('FmStatusChip', () => {
  const t = (key) => key;
  const chipOf = (container) => container.querySelector('.fm-status-chip');

  it('list variant (default) renders the core StatusTag with the method label below it', () => {
    const { container } = render(
      <FmStatusChip status="submitted" submissionMethod="manual_ack" t={t} />,
    );
    const chip = chipOf(container);
    expect(chip.getAttribute('data-variant')).toBe('list');
    expect(chip.style.flexDirection).toBe('column');
    const badge = screen.getByTestId('FmStatusChip__badge');
    const tag = badge.querySelector('.status-tag');
    expect(tag).toBeTruthy();
    expect(tag.classList.contains('status-tag--success')).toBe(true);
    expect(tag.textContent).toBe('fm.status.submitted');
    // Method label is the badge's next sibling, stacked under it by the column layout.
    expect(badge.nextElementSibling.textContent).toBe('fm.present.method.manual_ack');
  });

  it('detail variant renders the method label inline, to the right of the pill', () => {
    const { container } = render(
      <FmStatusChip status="submitted_ack" submissionMethod="aeat_telematic" t={t} variant="detail" />,
    );
    const chip = chipOf(container);
    expect(chip.getAttribute('data-variant')).toBe('detail');
    expect(chip.style.flexDirection).toBe('row');
    const badge = screen.getByTestId('FmStatusChip__badge');
    expect(badge.querySelector('.status-tag')).toBeNull();
    expect(badge.nextElementSibling.textContent).toBe('fm.present.method.aeat_telematic');
  });

  // ETP-5584 — `submitted_ext` used to be a hardcoded Spanish string in the chip, so it never
  // translated. It now goes through `fm.status.submitted_ext` like every other status.
  it.each([
    ['es_ES', 'Presentado · otra plataforma'],
    ['en_US', 'Submitted · other platform'],
  ])('translates submitted_ext through fm.status.submitted_ext (%s)', (locale, expected) => {
    const realT = makeRealUI(loadLocaleDictionary(locale));
    const { unmount } = render(<FmStatusChip status="submitted_ext" t={realT} />);
    expect(screen.getByTestId('FmStatusChip__badge').textContent).toBe(expected);
    unmount();
    render(<FmStatusChip status="submitted_ext" t={realT} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__badge').textContent).toBe(expected);
  });

  it('submitted_ack reads as the submitted label', () => {
    render(<FmStatusChip status="submitted_ack" t={t} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__badge').textContent).toBe('fm.status.submitted');
  });

  it.each(['submitted', 'submitted_ack'])('shows the method label for %s', (status) => {
    const { container } = render(<FmStatusChip status={status} submissionMethod="no_receipt" t={t} />);
    expect(chipOf(container).textContent).toContain('fm.present.method.no_receipt');
  });

  it.each(['draft', 'pending', 'ready', 'submitted_ext'])('hides the method label for %s', (status) => {
    const { container } = render(<FmStatusChip status={status} submissionMethod="no_receipt" t={t} />);
    expect(chipOf(container).textContent).not.toContain('fm.present.method');
    expect(screen.getByTestId('FmStatusChip__badge').nextElementSibling).toBeNull();
  });

  it('shows no method label when the status allows one but none is given', () => {
    render(<FmStatusChip status="submitted" t={t} />);
    expect(screen.getByTestId('FmStatusChip__badge').nextElementSibling).toBeNull();
  });

  it.each([
    ['ready', 'success'], ['submitted', 'success'], ['submitted_ack', 'success'],
    ['draft', 'neutral'], ['pending', 'neutral'],
  ])('%s gets the %s tone on both variants', (status, tone) => {
    const { unmount } = render(<FmStatusChip status={status} t={t} />);
    expect(screen.getByTestId('FmStatusChip__badge').getAttribute('data-tone')).toBe(tone);
    unmount();
    render(<FmStatusChip status={status} t={t} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__badge').getAttribute('data-tone')).toBe(tone);
  });

  it('shows the success Check icon on the detail variant only', () => {
    const { unmount } = render(<FmStatusChip status="ready" t={t} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__icon')).toBeTruthy();
    unmount();
    render(<FmStatusChip status="ready" t={t} />);
    expect(screen.queryByTestId('FmStatusChip__icon')).toBeNull();
  });

  it('shows no icon for a neutral status on the detail variant', () => {
    render(<FmStatusChip status="draft" t={t} variant="detail" />);
    expect(screen.queryByTestId('FmStatusChip__icon')).toBeNull();
  });
});
