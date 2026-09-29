// @vitest-environment jsdom
// ETP-5479 (QA return): the Moneda field in Pedido de compra / Facturas (CurrencyRatePicker)
// had a lighter hover than every other field and no focus ring, while the same field in
// Albaranes (CreatableSearchSelect / disabled Input) had both. These tests pin the picker
// to the shared field shell.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'ctx-token' }),
}));

vi.mock('@/hooks/useNeoResource.js', () => ({
  getApiBase: () => '',
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

vi.mock('lucide-react', () => ({
  ChevronDown: (props) => <span data-testid={props['data-testid'] || 'icon-chevron'} />,
  Loader2: (props) => <span data-testid={props['data-testid'] || 'icon-loader'} />,
  Pencil: (props) => <span data-testid={props['data-testid'] || 'icon-pencil'} />,
  Check: (props) => <span data-testid={props['data-testid'] || 'icon-check'} />,
  X: (props) => <span data-testid={props['data-testid'] || 'icon-x'} />,
}));

import { CurrencyRatePicker } from '../CurrencyRatePicker.jsx';
import { FIELD_HEIGHT, LABEL_GAP } from '@/components/ui/formDensity';

const FIELD = { key: 'cCurrencyId', column: 'C_Currency_ID', id: 'fld-1', required: false };
const BASE_URL = 'http://localhost/sws/neo/purchase-order';

// The exact hover / disabled tokens CreatableSearchSelect and the core Input use.
const FIELD_HOVER = 'hover:bg-[hsl(var(--field-hover))]';
const DISABLED_FILL = 'bg-[hsl(var(--field-hover))]';
const DISABLED_BORDER = 'border-[hsl(var(--field-disabled-border))]';

function renderPicker(props = {}) {
  return render(
    <CurrencyRatePicker
      field={FIELD}
      value="usd-id"
      displayValue="USD"
      onChange={vi.fn()}
      formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2' }}
      resolvedLabel="Moneda"
      token="test-token"
      apiBaseUrl={BASE_URL}
      {...props}
    />,
  );
}

function classesOf(el) {
  return el.className.split(/\s+/);
}

describe('CurrencyRatePicker — unified field shell (ETP-5479)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/action/currencyOptions')) {
        return Promise.resolve({ ok: true, json: async () => [{ id: 'usd-id', isoCode: 'USD', rate: 1.2 }] });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hovers with the shared --field-hover fill, not the lighter muted/40', () => {
    renderPicker();
    const trigger = screen.getByTestId('currency-rate-trigger');
    expect(classesOf(trigger)).toContain(FIELD_HOVER);
    expect(trigger.className).not.toMatch(/hover:bg-muted/);
  });

  it('draws the same box as the other fields: FIELD_HEIGHT, rounded-lg, control border, card fill', () => {
    renderPicker();
    const cls = classesOf(screen.getByTestId('currency-rate-trigger'));
    expect(cls).toEqual(expect.arrayContaining([
      FIELD_HEIGHT, 'rounded-lg', 'border', 'border-[hsl(var(--border-control))]', 'bg-card', 'px-2',
    ]));
    expect(cls).not.toContain('rounded-md');
    expect(cls).not.toContain('border-input');
    expect(cls).not.toContain('dark:bg-background');
  });

  it('shows the focus ring on focus, like CreatableSearchSelect', () => {
    renderPicker();
    const cls = classesOf(screen.getByTestId('currency-rate-trigger'));
    expect(cls).toEqual(expect.arrayContaining(['focus:outline-none', 'focus:ring-2', 'focus:ring-primary']));
  });

  it('keeps the ring while the list is open (the search box takes focus) and drops it on close', () => {
    renderPicker();
    const trigger = screen.getByTestId('currency-rate-trigger');
    expect(classesOf(trigger)).not.toContain('ring-2');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(classesOf(trigger)).toEqual(expect.arrayContaining(['ring-2', 'ring-primary']));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(trigger);
    expect(classesOf(trigger)).not.toContain('ring-2');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('the manual-rate editor uses the same box and a focus-within ring', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('currency-rate-pencil'));
    const editor = screen.getByTestId('currency-rate-input').closest('div.w-full');
    const cls = classesOf(editor);
    expect(cls).toEqual(expect.arrayContaining([
      FIELD_HEIGHT, 'rounded-lg', 'border-[hsl(var(--border-control))]', 'bg-card',
      'focus-within:ring-2', 'focus-within:ring-primary',
    ]));
    expect(cls).not.toContain('rounded-md');
  });

  it('read-only renders the shared disabled field look (fill, border, text), no hover', () => {
    renderPicker({ isReadOnly: true });
    const box = screen.getByTestId('currency-rate-readonly');
    const cls = classesOf(box);
    expect(cls).toEqual(expect.arrayContaining([
      FIELD_HEIGHT, 'rounded-lg', DISABLED_FILL, DISABLED_BORDER, 'text-text-disabled', 'cursor-not-allowed',
    ]));
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(box.className).not.toMatch(/hover:/);
    expect(box.className).not.toContain('bg-muted/50');
    expect(box).toHaveTextContent('USD');
  });

  it('uses the shared LABEL_GAP between label and field (editable and read-only)', () => {
    const { unmount } = renderPicker();
    expect(classesOf(screen.getByTestId('field-cCurrencyId'))).toEqual(expect.arrayContaining(LABEL_GAP.split(' ')));
    unmount();
    renderPicker({ isReadOnly: true });
    expect(classesOf(screen.getByTestId('field-cCurrencyId'))).toEqual(expect.arrayContaining(LABEL_GAP.split(' ')));
  });
});
