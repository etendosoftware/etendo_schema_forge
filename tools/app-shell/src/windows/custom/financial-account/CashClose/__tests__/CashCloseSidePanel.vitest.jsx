/**
 * CashCloseSidePanel — the window's "read-only" access tier (ETP-5457).
 *
 * Under `windowReadOnly` both actions (Confirmar cierre / Guardar borrador) are DISABLED rather
 * than hidden — hiding them would leave the pinned footer empty — and so are the two inputs, which
 * only feed those actions. The live summary keeps rendering. Every read-only case has a writable
 * twin so a test cannot pass merely because a control is always disabled in this fixture.
 *
 * The panel is purely presentational, so the real DateField / MaskedAmountInput render here: the
 * `disabled` attribute has to land on the element the user actually interacts with.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: vi.fn() }),
}));

import { CashCloseSidePanel } from '../CashCloseSidePanel.jsx';
import { summarize } from '../cashCloseMath.js';

const MOVEMENTS = [
  { id: 'm1', transactionDate: '2026-05-10', description: 'Venta mostrador', amount: 100 },
  { id: 'm2', transactionDate: '2026-05-11', description: 'Compra caja', amount: -40 },
];

function renderPanel(overrides = {}) {
  const props = {
    currency: 'EUR',
    // The real summarizer, so the panel receives exactly the shape the tab hands it.
    summary: summarize(MOVEMENTS, { marked: new Set(['m1']), openingBalance: 10, declared: 110 }),
    statementDate: '2026-05-31',
    onStatementDateChange: vi.fn(),
    declaredInput: '110',
    onDeclaredInputChange: vi.fn(),
    glItemDifference: null,
    busy: false,
    onConfirm: vi.fn(),
    onSaveDraft: vi.fn(),
    ...overrides,
  };
  return { ...render(<CashCloseSidePanel {...props} />), props };
}

describe('CashCloseSidePanel — window read-only access tier (ETP-5457)', () => {
  it('disables Confirmar cierre and Guardar borrador under read-only (ETP-5457)', () => {
    renderPanel({ windowReadOnly: true });
    expect(screen.getByTestId('cash-close-confirm')).toBeDisabled();
    expect(screen.getByTestId('cash-close-save-draft')).toBeDisabled();
  });

  it('enables both actions without read-only (ETP-5457)', () => {
    renderPanel({ windowReadOnly: false });
    expect(screen.getByTestId('cash-close-confirm')).toBeEnabled();
    expect(screen.getByTestId('cash-close-save-draft')).toBeEnabled();
  });

  it('defaults to writable when windowReadOnly is omitted (ETP-5457)', () => {
    renderPanel();
    expect(screen.getByTestId('cash-close-confirm')).toBeEnabled();
    expect(screen.getByTestId('cash-close-save-draft')).toBeEnabled();
  });

  it('keeps both actions in the DOM under read-only — disabled, not hidden (ETP-5457)', () => {
    renderPanel({ windowReadOnly: true });
    const actions = screen.getByTestId('cash-close-actions');
    expect(actions).toContainElement(screen.getByTestId('cash-close-confirm'));
    expect(actions).toContainElement(screen.getByTestId('cash-close-save-draft'));
  });

  it('never fires onConfirm / onSaveDraft when the disabled actions are clicked under read-only (ETP-5457)', () => {
    const { props } = renderPanel({ windowReadOnly: true });
    fireEvent.click(screen.getByTestId('cash-close-confirm'));
    fireEvent.click(screen.getByTestId('cash-close-save-draft'));
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(props.onSaveDraft).not.toHaveBeenCalled();
  });

  it('fires onConfirm / onSaveDraft from the same clicks without read-only (ETP-5457)', () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('cash-close-confirm'));
    fireEvent.click(screen.getByTestId('cash-close-save-draft'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it('disables the statement date and the declared balance inputs under read-only (ETP-5457)', () => {
    renderPanel({ windowReadOnly: true });
    expect(screen.getByTestId('cash-close-statement-date')).toBeDisabled();
    expect(screen.getByTestId('cash-close-declared-balance')).toBeDisabled();
  });

  it('enables the statement date and the declared balance inputs without read-only (ETP-5457)', () => {
    renderPanel();
    expect(screen.getByTestId('cash-close-statement-date')).toBeEnabled();
    expect(screen.getByTestId('cash-close-declared-balance')).toBeEnabled();
  });

  it('keeps the live summary rendering under read-only (ETP-5457)', () => {
    renderPanel({ windowReadOnly: true });
    expect(screen.getByTestId('cash-close-summary-card')).toBeInTheDocument();
    expect(screen.getByTestId('cash-close-row-opening')).toBeInTheDocument();
    expect(screen.getByTestId('cash-close-row-in')).toBeInTheDocument();
  });

  it('still disables both actions while busy, independently of the tier (ETP-5457)', () => {
    renderPanel({ busy: true, windowReadOnly: false });
    expect(screen.getByTestId('cash-close-confirm')).toBeDisabled();
    expect(screen.getByTestId('cash-close-save-draft')).toBeDisabled();
  });
});
