import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DateRangePopoverContent,
  computeTriggerLabel,
} from '../components/ui/date-range-popover.jsx';
import { DistinctValuesFilter } from '../components/ui/distinct-values-filter.jsx';
import { MoneyAmount } from '../components/ui/money-amount.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.jsx';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const labels = {
      dateRangeToday: 'Hoy',
      dateRangeYesterday: 'Ayer',
      dateRangeLast7Days: 'Últimos 7 días',
      dateRangeLast30Days: 'Últimos 30 días',
      dateRangeLast12Months: 'Últimos 12 meses',
      dateRangeAllTime: 'Cualquier fecha',
      dateRangeAnyTime: 'Cualquier fecha',
      dateRangeCustom: 'Personalizado',
      dateRangeApply: 'Aplicar',
      dateRangeCancel: 'Cancelar',
      datePickerMonth: 'Mes',
      datePickerYear: 'Año',
    };
    return labels[key] ?? key;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const reexportModules = [
  ['auth context', '../auth/AuthContext.jsx'],
  ['auth api', '../auth/api.js'],
  ['auth fetch hook', '../auth/useApiFetch.js'],
  ['i18n barrel', '../i18n/index.js'],
  ['locale provider', '../i18n/LocaleProvider.jsx'],
  ['label resolver', '../i18n/resolveLabel.js'],
  ['ui resolver', '../i18n/resolveUI.js'],
  ['label hook', '../i18n/useLabel.js'],
  ['locale state hook', '../i18n/useLocaleState.js'],
  ['menu label hook', '../i18n/useMenuLabel.js'],
  ['ui hook', '../i18n/useUI.js'],
  ['currency hook', '../hooks/useCurrency.jsx'],
  ['mobile hook', '../hooks/use-mobile.jsx'],
  ['add-line button', '../components/ui/add-line-button.jsx'],
  ['add-line tokens', '../components/ui/add-line-button-tokens.js'],
  ['badge', '../components/ui/badge.jsx'],
  ['button', '../components/ui/button.jsx'],
  ['calendar', '../components/ui/calendar.jsx'],
  ['card', '../components/ui/card.jsx'],
  ['checkbox', '../components/ui/checkbox.jsx'],
  ['collapsible', '../components/ui/collapsible.jsx'],
  ['command', '../components/ui/command.jsx'],
  ['custom icons', '../components/ui/custom-icons.jsx'],
  ['date field', '../components/ui/date-field.jsx'],
  ['dialog', '../components/ui/dialog.jsx'],
  ['dropdown menu', '../components/ui/dropdown-menu.jsx'],
  ['input', '../components/ui/input.jsx'],
  ['label', '../components/ui/label.jsx'],
  ['popover', '../components/ui/popover.jsx'],
  ['select', '../components/ui/select.jsx'],
  ['separator', '../components/ui/separator.jsx'],
  ['sheet', '../components/ui/sheet.jsx'],
  ['sidebar', '../components/ui/sidebar.jsx'],
  ['skeleton', '../components/ui/skeleton.jsx'],
  ['sonner', '../components/ui/sonner.jsx'],
  ['status tag', '../components/ui/status-tag.jsx'],
  ['status tag tokens', '../components/ui/status-tag-tokens.js'],
  ['switch', '../components/ui/switch.jsx'],
  ['table', '../components/ui/table.jsx'],
  ['tag', '../components/ui/tag.jsx'],
  ['tag tokens', '../components/ui/tag-tokens.js'],
  ['tooltip', '../components/ui/tooltip.jsx'],
];

describe('app-shell legacy core package reexports', () => {
  it.each(reexportModules)('keeps %s available from the app-shell path', async (_name, modulePath) => {
    const module = await import(modulePath);

    expect(Object.keys(module).length).toBeGreaterThan(0);
  });
});

describe('app-shell local UI primitives retained outside core', () => {
  it('formats money amounts with automatic tone and sign', () => {
    const { rerender } = render(<MoneyAmount value={1245.5} currency="EUR" />);

    expect(screen.getByText('+1,245.50 €')).toHaveClass('text-[var(--status-success-fg)]');

    rerender(<MoneyAmount value={-99} currency="EUR" />);
    expect(screen.getByText('-99.00 €')).toHaveClass('text-[hsl(var(--destructive))]');

    rerender(<MoneyAmount value={0} currency="EUR" tone="neutral" className="extra-class" />);
    expect(screen.getByText('0.00 €')).toHaveClass('text-[hsl(var(--foreground))]', 'extra-class');
  });

  it('applies thousand-separator grouping above 999 across tones', () => {
    const { rerender } = render(<MoneyAmount value={-2345} currency="EUR" />);
    expect(screen.getByText('-2,345.00 €')).toHaveClass('text-[hsl(var(--destructive))]');

    rerender(<MoneyAmount value={2345} currency="EUR" tone="neutral" />);
    expect(screen.getByText('2,345.00 €')).toHaveClass('text-[hsl(var(--foreground))]');
  });

  it('renders tabs, badges, icon slots, and active content', () => {
    function Icon(props) {
      return <svg aria-label="icon" {...props} />;
    }

    const changes = [];
    const { rerender } = render(
      <Tabs value="summary" onValueChange={(value) => changes.push(value)} className="outer">
        <TabsList className="list">
          <TabsTrigger value="summary" icon={Icon} badge={2}>Summary</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="panel">Visible summary</TabsContent>
        <TabsContent value="details">Hidden details</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tablist')).toHaveClass('list');
    expect(screen.getByRole('tab', { name: /summary/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('icon')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Visible summary');
    expect(screen.queryByText('Hidden details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /details/i }));
    expect(changes).toEqual(['details']);

    rerender(
      <Tabs value="details" onValueChange={(value) => changes.push(value)}>
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">Hidden summary</TabsContent>
        <TabsContent value="details">Visible details</TabsContent>
      </Tabs>,
    );

    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Visible details');
  });

  it('renders date range presets and emits preset/all-time selections', () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<DateRangePopoverContent value={null} onChange={onChange} onClose={onClose} />);

    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByText('Ayer')).toBeInTheDocument();
    expect(screen.getByText('Últimos 7 días')).toBeInTheDocument();
    expect(screen.getByText('Personalizado')).toBeInTheDocument();
    expect(screen.getByText('Aplicar').closest('button')).toBeDisabled();

    fireEvent.click(screen.getByText('Últimos 7 días'));
    expect(onChange).toHaveBeenCalledWith({ presetId: 'last7' });
    expect(onClose).toHaveBeenCalled();

    onChange.mockClear();
    render(<DateRangePopoverContent value={null} onChange={onChange} onClose={() => {}} />);
    fireEvent.click(screen.getAllByText('Cualquier fecha')[0]);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('computes date range trigger labels for empty, preset, unknown, and custom values', () => {
    const ui = (key) => ({
      dateRangeToday: 'Hoy',
      dateRangeLast30Days: 'Últimos 30 días',
      dateRangeAnyTime: 'Cualquier fecha',
    }[key] ?? key);

    expect(computeTriggerLabel(null, undefined, ui, 'es-ES')).toBe('Cualquier fecha');
    expect(computeTriggerLabel(null, 'Selecciona', ui, 'es-ES')).toBe('Selecciona');
    expect(computeTriggerLabel({ presetId: 'today' }, undefined, ui, 'es-ES')).toBe('Hoy');
    expect(computeTriggerLabel({ presetId: 'last30' }, undefined, ui, 'es-ES')).toBe('Últimos 30 días');
    expect(computeTriggerLabel({ presetId: 'unknown' }, 'fallback', ui, 'es-ES')).toBe('fallback');

    const label = computeTriggerLabel({
      from: new Date(2026, 0, 5),
      to: new Date(2026, 0, 12),
    }, undefined, ui, 'es-ES');
    expect(label).toContain('5');
    expect(label).toContain('12');
    expect(label).toContain('–');
  });

  it('filters fixed distinct values and emits selected codes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const labels = {
      RPR: 'Ejecutado',
      RPAP: 'Pendiente',
      RPVOID: 'Anulado',
      PPM: 'Otro',
    };
    render(
      <DistinctValuesFilter
        value={null}
        onChange={onChange}
        codes={Object.keys(labels)}
        labelFor={(code) => labels[code] ?? code}
        allLabel="Todos los estados"
        searchPlaceholder="Buscar..."
      />,
    );

    expect(screen.getByText('Todos los estados')).toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Ejecutado')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'anu' } });
    expect(screen.getByText('Anulado')).toBeInTheDocument();
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Anulado'));
    expect(onChange).toHaveBeenCalledWith('RPVOID');
  });
});
