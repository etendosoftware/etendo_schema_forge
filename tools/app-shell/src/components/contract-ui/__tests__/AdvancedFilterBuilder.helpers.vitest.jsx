/**
 * Functional behavioral suite for AdvancedFilterBuilder — re-angled through the
 * shim after the component moved to schema_forge_core.
 *
 * The component reads i18n through core's own `../../i18n/index.js`, so the old
 * `vi.mock('@/i18n', …)` identity stub no longer intercepts it. Instead we wrap
 * the tree in the real core `LocaleProvider` (imported through the `@/i18n` shim,
 * which resolves to the same core context the component consumes) fed the real
 * functional `es_ES` dictionary, and assert the real translated strings. The
 * remaining assertions are structural/behavioral (row counts via the hardcoded
 * `Remove condition` aria-label, disabled states, callback payloads) and are
 * label-independent.
 *
 * Run against local core source:
 *   LOCAL_CORE=1 npx vitest run \
 *     src/components/contract-ui/__tests__/AdvancedFilterBuilder.helpers.vitest.jsx
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LocaleProvider } from '@/i18n';
import { AuthProvider } from '@/auth/AuthContext.jsx';
import esES from '@/locales/es_ES.json';
import { AdvancedFilterBuilder } from '@/components/contract-ui/AdvancedFilterBuilder.jsx';

const dictionaries = { es_ES: esES };

// AuthProvider is required because the enum/identifier value pickers call
// useDistinctValues → useAuth (the hook runs unconditionally even when its
// fetch is disabled). Both providers are the real core modules, reached through
// the @/i18n and @/auth shims, so they share the exact context the component
// consumes under LOCAL_CORE.
function renderES(ui) {
  return render(
    <AuthProvider>
      <LocaleProvider locale="es_ES" dictionaries={dictionaries}>
        {ui}
      </LocaleProvider>
    </AuthProvider>,
  );
}

// ---------------------------------------------------------------------------
// Operator catalog — self-contained contract documentation (no i18n / shim).
// Mirrors OPERATORS_BY_MODE / TEXTUAL_IDENT_OPS inside the component; the
// exhaustive rendered-option coverage lives in core's colocated tests.
// ---------------------------------------------------------------------------

const OPERATORS_BY_MODE = {
  text:         ['iContains', 'iNotContains', 'iStartsWith', 'iEquals', 'iNotEqual', 'isNull', 'isNotNull'],
  identifier:   ['iContains', 'iNotContains', 'iStartsWith', 'equals', 'notEqual', 'isNull', 'isNotNull'],
  enumLabel:    ['equals', 'notEqual', 'inSet', 'isNull', 'isNotNull'],
  booleanLabel: ['equals'],
  numeric:      ['equals', 'notEqual', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'between', 'isNull', 'isNotNull'],
  date:         ['equals', 'lessThan', 'greaterThan', 'between', 'isNull', 'isNotNull'],
};

const TEXTUAL_IDENT_OPS = new Set(['iContains', 'iNotContains', 'iStartsWith', 'iEquals', 'iNotEqual']);

describe('AdvancedFilterBuilder operator catalog', () => {
  describe('OPERATORS_BY_MODE', () => {
    it('text mode has 7 operators including starts-with', () => {
      expect(OPERATORS_BY_MODE.text).toHaveLength(7);
      expect(OPERATORS_BY_MODE.text).toContain('iContains');
      expect(OPERATORS_BY_MODE.text).toContain('isNull');
      expect(OPERATORS_BY_MODE.text).toContain('iStartsWith');
    });

    it('identifier mode has 7 operators including starts-with', () => {
      expect(OPERATORS_BY_MODE.identifier).toHaveLength(7);
      expect(OPERATORS_BY_MODE.identifier).toContain('iContains');
      expect(OPERATORS_BY_MODE.identifier).toContain('equals');
      expect(OPERATORS_BY_MODE.identifier).toContain('iStartsWith');
    });

    it('enumLabel has inSet for multi-select', () => {
      expect(OPERATORS_BY_MODE.enumLabel).toContain('inSet');
    });

    it('booleanLabel only has equals', () => {
      expect(OPERATORS_BY_MODE.booleanLabel).toEqual(['equals']);
    });

    it('numeric has between and comparison ops', () => {
      expect(OPERATORS_BY_MODE.numeric).toContain('between');
      expect(OPERATORS_BY_MODE.numeric).toContain('greaterThan');
      expect(OPERATORS_BY_MODE.numeric).toContain('lessOrEqual');
    });

    it('date has between and comparison ops', () => {
      expect(OPERATORS_BY_MODE.date).toContain('between');
      expect(OPERATORS_BY_MODE.date).toContain('lessThan');
      expect(OPERATORS_BY_MODE.date).toContain('greaterThan');
    });

    it('all modes include isNull/isNotNull except booleanLabel', () => {
      for (const [mode, ops] of Object.entries(OPERATORS_BY_MODE)) {
        if (mode === 'booleanLabel') continue;
        expect(ops).toContain('isNull');
        expect(ops).toContain('isNotNull');
      }
    });
  });

  describe('TEXTUAL_IDENT_OPS', () => {
    it('contains the 5 textual identifier operators', () => {
      expect(TEXTUAL_IDENT_OPS.has('iContains')).toBe(true);
      expect(TEXTUAL_IDENT_OPS.has('iNotContains')).toBe(true);
      expect(TEXTUAL_IDENT_OPS.has('iStartsWith')).toBe(true);
      expect(TEXTUAL_IDENT_OPS.has('iEquals')).toBe(true);
      expect(TEXTUAL_IDENT_OPS.has('iNotEqual')).toBe(true);
    });

    it('does not contain discrete ops', () => {
      expect(TEXTUAL_IDENT_OPS.has('equals')).toBe(false);
      expect(TEXTUAL_IDENT_OPS.has('notEqual')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Render / behavior — through the shim + real Spanish dictionary
// ---------------------------------------------------------------------------

describe('AdvancedFilterBuilder — render (functional shim + real i18n)', () => {
  const columns = [
    { key: 'name', type: 'string', label: 'Name' },
    { key: 'amount', type: 'amount', label: 'Amount' },
    { key: 'status', type: 'status', label: 'Status', enumLabels: { DR: 'Draft', CO: 'Complete' } },
    { key: 'active', type: 'boolean', label: 'Active', badgeLabels: { true: 'Yes', false: 'No' } },
    { key: 'orderDate', type: 'date', label: 'Date' },
  ];

  const baseProps = () => ({
    columns,
    rows: [],
    value: null,
    onApply: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
  });

  const remove = () => screen.getAllByRole('button', { name: /remove condition/i });
  const applyBtn = () => screen.getByText('Aplicar').closest('button');
  const clearBtn = () => screen.getByText('Limpiar').closest('button');

  it('renders the chrome in real Spanish (proves shim + real dictionary)', () => {
    renderES(<AdvancedFilterBuilder {...baseProps()} />);
    expect(screen.getByText('Filtro por condicionales')).toBeInTheDocument();
    expect(screen.getByText('Añadir condición')).toBeInTheDocument();
    expect(screen.getByText('Aplicar')).toBeInTheDocument();
    expect(screen.getByText('Limpiar')).toBeInTheDocument();
    expect(screen.getByText('Donde')).toBeInTheDocument();
    expect(screen.getByText('Guardar filtro')).toBeInTheDocument();
  });

  it('renders a single remove-condition button by default', () => {
    renderES(<AdvancedFilterBuilder {...baseProps()} />);
    expect(remove()).toHaveLength(1);
  });

  it('adds condition rows when the add button is clicked', async () => {
    const user = userEvent.setup();
    renderES(<AdvancedFilterBuilder {...baseProps()} />);
    await user.click(screen.getByText('Añadir condición'));
    expect(remove()).toHaveLength(2);
  });

  it('adds multiple rows in sequence', async () => {
    const user = userEvent.setup();
    renderES(<AdvancedFilterBuilder {...baseProps()} />);
    const add = screen.getByText('Añadir condición');
    await user.click(add);
    await user.click(add);
    await user.click(add);
    expect(remove()).toHaveLength(4);
  });

  it('renders one remove button per initial value condition', () => {
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
        { field: 'amount', operator: 'greaterThan', value: '100' },
      ],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(remove()).toHaveLength(2);
  });

  it('removes the middle row and keeps the others', async () => {
    const user = userEvent.setup();
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'first' },
        { field: 'amount', operator: 'greaterThan', value: '100' },
        { field: 'status', operator: 'equals', value: 'DR' },
      ],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(remove()).toHaveLength(3);
    await user.click(remove()[1]);
    expect(remove()).toHaveLength(2);
  });

  it('resets to a single empty row after removing the last extra row', async () => {
    const user = userEvent.setup();
    renderES(<AdvancedFilterBuilder {...baseProps()} />);
    await user.click(screen.getByText('Añadir condición'));
    expect(remove()).toHaveLength(2);
    await user.click(remove()[0]);
    expect(remove()).toHaveLength(1);
  });

  it('shows the presets dropdown label when presets are enabled', () => {
    renderES(
      <AdvancedFilterBuilder
        {...baseProps()}
        presets={{ 'My Filter': {} }}
        onApplyPreset={vi.fn()}
        onSavePreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />,
    );
    expect(screen.getByText('Mis filtros')).toBeInTheDocument();
  });

  it('disables Apply when conditions are incomplete', () => {
    renderES(<AdvancedFilterBuilder {...baseProps()} />);
    expect(applyBtn()).toBeDisabled();
  });

  it('disables Clear when nothing is started and no filter is applied', () => {
    renderES(<AdvancedFilterBuilder {...baseProps()} value={null} />);
    expect(clearBtn()).toBeDisabled();
  });

  it('enables Clear when there is an applied filter', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(clearBtn()).not.toBeDisabled();
  });

  it('calls onClear when Clear is clicked with an applied filter', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} onClear={onClear} />);
    await user.click(screen.getByText('Limpiar'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(remove()).toHaveLength(1);
  });

  it('calls onApply + onClose with complete conditions', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    renderES(
      <AdvancedFilterBuilder {...baseProps()} value={value} onApply={onApply} onClose={onClose} />,
    );
    expect(applyBtn()).not.toBeDisabled();
    await user.click(applyBtn());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const calledWith = onApply.mock.calls[0][0];
    expect(calledWith.rowOperator).toBe('and');
    expect(calledWith.conditions).toHaveLength(1);
    expect(calledWith.conditions[0].field).toBe('name');
  });

  it('does not call onApply when conditions are incomplete', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderES(<AdvancedFilterBuilder {...baseProps()} onApply={onApply} />);
    expect(applyBtn()).toBeDisabled();
    await user.click(applyBtn());
    expect(onApply).not.toHaveBeenCalled();
  });

  it('calls onApply with the correct payload for multiple conditions', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const value = {
      rowOperator: 'or',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'alpha' },
        { field: 'amount', operator: 'greaterThan', value: '50' },
      ],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} onApply={onApply} />);
    await user.click(screen.getByText('Aplicar'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const calledWith = onApply.mock.calls[0][0];
    expect(calledWith.rowOperator).toBe('or');
    expect(calledWith.conditions).toHaveLength(2);
    expect(calledWith.conditions[0].value).toBe('alpha');
    expect(calledWith.conditions[1].value).toBe('50');
  });

  it('renders with empty columns gracefully', () => {
    renderES(<AdvancedFilterBuilder {...baseProps()} columns={[]} />);
    expect(screen.getByText('Filtro por condicionales')).toBeInTheDocument();
  });

  it('renders with labelOverrides without crashing', () => {
    renderES(
      <AdvancedFilterBuilder {...baseProps()} labelOverrides={{ name: 'Custom Name Label' }} />,
    );
    expect(screen.getByText('Filtro por condicionales')).toBeInTheDocument();
  });

  // --- Row completeness rules --------------------------------------------

  it('enables Apply for a nullish operator (isNull) with no value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNull', value: null }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).not.toBeDisabled();
  });

  it('enables Apply for isNotNull with no value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNotNull', value: null }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).not.toBeDisabled();
  });

  it('enables Apply when numeric between has both bounds', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['100', '500'] }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).not.toBeDisabled();
  });

  it('disables Apply when numeric between has only one bound', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['', '500'] }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).toBeDisabled();
  });

  it('disables Apply when between has null bounds', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: [null, null] }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).toBeDisabled();
  });

  it('enables Apply for a date equals condition with a value', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'equals', value: '2024-01-15' }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).not.toBeDisabled();
  });

  it('enables Apply for a date between condition with both bounds', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'between', value: ['2024-01-01', '2024-12-31'] }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).not.toBeDisabled();
  });

  it('disables Apply when date between has only the first bound', () => {
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'between', value: ['2024-01-01', ''] }],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).toBeDisabled();
  });

  it('enables Apply when a nullish and a complete condition are mixed', () => {
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'isNull', value: null },
        { field: 'amount', operator: 'greaterThan', value: '100' },
      ],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).not.toBeDisabled();
  });

  it('disables Apply when any condition in a multi-row set is incomplete', () => {
    const value = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
        { field: 'amount', operator: '', value: '' },
      ],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(applyBtn()).toBeDisabled();
  });

  it('handles the or rowOperator', () => {
    const value = {
      rowOperator: 'or',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'a' },
        { field: 'name', operator: 'iContains', value: 'b' },
      ],
    };
    renderES(<AdvancedFilterBuilder {...baseProps()} value={value} />);
    expect(remove()).toHaveLength(2);
  });
});
