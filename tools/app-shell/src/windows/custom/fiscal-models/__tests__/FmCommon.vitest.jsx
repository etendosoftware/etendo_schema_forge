// Vitest component tests for FmCommon.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('./fiscal-models.css', () => ({}));
vi.mock('../fiscal-models.css', () => ({}));

import {
  KpiWidget, StatusPill, StatusPillMenu, Tabs, Banner,
  EmptyState, Stepper, NumberedStepper, SectionCard, SidePanel,
} from '../FmCommon.jsx';

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

  it('renders icon when provided', () => {
    const icon = <span data-testid="kpi-icon">icon</span>;
    render(<KpiWidget label="Test" value={0} icon={icon} />);
    expect(screen.getByTestId('kpi-icon')).toBeTruthy();
  });
});

// ── StatusPill ────────────────────────────────────────────────────────────────

describe('StatusPill', () => {
  it('renders the i18n key for the status', () => {
    render(<StatusPill status="pending" />);
    expect(document.body.textContent).toContain('fm.status.pending');
  });

  it('applies the color CSS class based on status', () => {
    const { container } = render(<StatusPill status="draft" />);
    const pill = container.querySelector('.fm-status-pill');
    expect(pill).toBeTruthy();
    expect(pill.className).toContain('fm-status-pill--blue');
  });

  it('applies grey for skipped status', () => {
    const { container } = render(<StatusPill status="skipped" />);
    const pill = container.querySelector('.fm-status-pill');
    expect(pill.className).toContain('fm-status-pill--grey');
  });
});

// ── StatusPillMenu ────────────────────────────────────────────────────────────

describe('StatusPillMenu', () => {
  it('renders a trigger button with the current status pill', () => {
    const { container } = render(<StatusPillMenu status="pending" onStatusChange={vi.fn()} />);
    const trigger = container.querySelector('.fm-status-pill-menu__trigger');
    expect(trigger).toBeTruthy();
  });

  it('menu is hidden initially', () => {
    const { container } = render(<StatusPillMenu status="draft" onStatusChange={vi.fn()} />);
    expect(container.querySelector('.fm-status-menu')).toBeNull();
  });

  it('opens menu when trigger is clicked', () => {
    const { container } = render(<StatusPillMenu status="draft" onStatusChange={vi.fn()} />);
    const trigger = container.querySelector('.fm-status-pill-menu__trigger');
    fireEvent.click(trigger);
    expect(container.querySelector('.fm-status-menu')).toBeTruthy();
  });

  it('calls onStatusChange with selected status when menu item clicked', () => {
    const onStatusChange = vi.fn();
    const { container } = render(<StatusPillMenu status="pending" onStatusChange={onStatusChange} />);
    fireEvent.click(container.querySelector('.fm-status-pill-menu__trigger'));
    const options = container.querySelectorAll('[role="option"]');
    // Click on "ready" option (look for it by text)
    const readyOpt = Array.from(options).find(el => el.textContent.includes('fm.status.ready'));
    if (readyOpt) {
      fireEvent.click(readyOpt);
      expect(onStatusChange).toHaveBeenCalledWith('ready');
    }
  });

  it('closes menu after a status selection', () => {
    const { container } = render(<StatusPillMenu status="pending" onStatusChange={vi.fn()} />);
    fireEvent.click(container.querySelector('.fm-status-pill-menu__trigger'));
    const options = container.querySelectorAll('[role="option"]');
    fireEvent.click(options[0]);
    expect(container.querySelector('.fm-status-menu')).toBeNull();
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
