// @covers tools/app-shell/src/windows/custom/fiscal-models/FmCommon.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmDetailChrome.jsx
// Vitest component tests for FmCommon.jsx. Its `EmptyState` is the re-export of FmDetailChrome's
// FmEmptyState (hence the second @covers); FmDetailChrome's own helpers are in FmDetailChrome.vitest.jsx.
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
// Tabs is fed by FmDetailChrome's counter helpers on both detail pages.
import { tabCount, incidentsTabBadge } from '../FmDetailChrome.jsx';

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
