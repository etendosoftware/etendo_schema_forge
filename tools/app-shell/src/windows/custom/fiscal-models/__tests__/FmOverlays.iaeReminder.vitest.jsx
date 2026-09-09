// Vitest tests for FmOverlays.jsx's NewDeclModal ETP-5187 IAE-activity
// reminder trigger: fires ONLY when the selected model is '303' AND the
// selected period is the last of the year (T4 quarterly / 12 monthly) — see
// the onClick handler on each period button in NewDeclModal.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('../fiscal-models.css', () => ({}));
vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (u) => u,
}));
vi.mock('lucide-react', () => ({
  Star: () => null, Play: () => null, ArrowUpRight: () => null, Info: () => null,
  OctagonAlert: () => null, TriangleAlert: () => null, X: () => null,
  Check: () => null, ChevronDown: () => null, Search: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => (
    React.createElement('input', { type: 'checkbox', checked: !!checked, onChange: onChange ?? (() => {}) })
  ),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../fiscalModelsUtils.js', () => ({
  showIaeActivityReminder: vi.fn(),
}));

import { NewDeclModal } from '../FmOverlays.jsx';
import { showIaeActivityReminder } from '../fiscalModelsUtils.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── helpers (mirrors FmOverlays.vitest.jsx's own NewDeclModal helpers) ──────

function getModelTrigger(container) {
  return container.querySelector('.fm-newdecl-model-trigger');
}
function openModelMenu(container) {
  fireEvent.click(getModelTrigger(container));
}
function getModelOption(container, id) {
  return Array.from(container.querySelectorAll('[role="option"]'))
    .find(o => o.querySelector('.fm-model-badge')?.textContent === id);
}
function selectModel(container, id) {
  openModelMenu(container);
  fireEvent.click(getModelOption(container, id));
}
function getFrequencyBtn(container, key) {
  return Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes(key));
}
function getPeriodBtn(container, period) {
  return Array.from(container.querySelectorAll('.fm-newdecl-period-btn'))
    .find(b => b.textContent.trim().startsWith(period));
}
function selectMonthly(container) {
  fireEvent.click(getFrequencyBtn(container, 'fm.new_decl.period_monthly'));
}

describe('NewDeclModal — IAE activity reminder trigger', () => {
  it('fires when model=303 (default) and period T4 (quarterly) is selected', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(getPeriodBtn(container, 'T4'));
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(1);
  });

  it('fires when model=303 and period 12 (monthly) is selected', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    selectMonthly(container);
    fireEvent.click(getPeriodBtn(container, '12'));
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire for model=303 and a non-last quarterly period (T1)', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(getPeriodBtn(container, 'T1'));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('does NOT fire for model=303 and a non-last monthly period (01)', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    selectMonthly(container);
    fireEvent.click(getPeriodBtn(container, '01'));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('does NOT fire for a different model (349) even when period T4 is selected', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    selectModel(container, '349');
    fireEvent.click(getPeriodBtn(container, 'T4'));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('does NOT fire for model 349 with period 12 (monthly)', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    selectModel(container, '349');
    selectMonthly(container);
    fireEvent.click(getPeriodBtn(container, '12'));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('fires again if T4 is re-selected after switching away and back to 303', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(getPeriodBtn(container, 'T4')); // 303 + T4 -> fires
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(1);

    selectModel(container, '349');
    fireEvent.click(getPeriodBtn(container, 'T4')); // 349 + T4 -> no fire
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(1);

    selectModel(container, '303');
    fireEvent.click(getPeriodBtn(container, 'T4')); // back to 303 + T4 -> fires again
    expect(showIaeActivityReminder).toHaveBeenCalledTimes(2);
  });
});
