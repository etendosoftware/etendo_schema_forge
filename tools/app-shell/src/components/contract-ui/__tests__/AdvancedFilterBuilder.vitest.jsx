/**
 * Functional integration smoke for AdvancedFilterBuilder.
 *
 * Post-split, the component itself lives in schema_forge_core; this repo only
 * ships a thin shim at `@/components/contract-ui/AdvancedFilterBuilder.jsx`
 * (`export * from '@etendosoftware/app-shell-core/components/contract-ui/...'`).
 * The exhaustive branch coverage now lives beside the source in core
 * (packages/app-shell-core/src/components/contract-ui/__tests__).
 *
 * This suite is deliberately re-angled to verify the FUNCTIONAL boundary:
 *   - the shim resolves to the real core component, AND
 *   - the real i18n runtime (also consumed by the component via core's
 *     `../../i18n/index.js`) produces the real Spanish dictionary strings.
 *
 * The component reads i18n through core's own module, so the old
 * `vi.mock('@/i18n', …)` identity stub would NOT intercept it — instead we wrap
 * the tree in the real core `LocaleProvider` (imported through the `@/i18n`
 * shim, which resolves to the same core context the component uses) fed the real
 * functional `es_ES` dictionary, then assert the actual translated strings. This
 * is the one place "Empieza por" (opStartsWith, ETP-4532) is exercised
 * end-to-end against the real dictionary.
 *
 * Run against local core source:
 *   LOCAL_CORE=1 npx vitest run \
 *     src/components/contract-ui/__tests__/AdvancedFilterBuilder.vitest.jsx
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Real core LocaleProvider (via the @/i18n shim → same core i18n module the
// component consumes) + the real functional Spanish dictionary. AuthProvider is
// wrapped too because the value pickers call useDistinctValues → useAuth (the
// hook runs unconditionally). Both providers are reached through the @/i18n and
// @/auth shims, so they share the exact context the component uses.
import { LocaleProvider } from '@/i18n';
import { AuthProvider } from '@/auth/AuthContext.jsx';
import esES from '@/locales/es_ES.json';

// Import THROUGH the functional shim — under LOCAL_CORE this resolves to the
// moved core source; against the published package it resolves to the package.
import { AdvancedFilterBuilder } from '@/components/contract-ui/AdvancedFilterBuilder.jsx';

const dictionaries = { es_ES: esES };

function renderES(ui) {
  return render(
    <AuthProvider>
      <LocaleProvider locale="es_ES" dictionaries={dictionaries}>
        {ui}
      </LocaleProvider>
    </AuthProvider>,
  );
}

// Radix Select needs a few pointer/scroll DOM APIs jsdom does not implement so
// the operator dropdown can open and options can be selected.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const COLUMNS = [
  { key: 'name', label: 'Name', type: 'text', column: 'Name' },
  { key: 'amount', label: 'Amount', type: 'amount', column: 'Amount' },
  { key: 'orderDate', label: 'Order Date', type: 'date', column: 'OrderDate' },
];

describe('AdvancedFilterBuilder (functional shim + real i18n)', () => {
  it('renders the builder chrome using the real Spanish dictionary', () => {
    renderES(<AdvancedFilterBuilder columns={COLUMNS} />);
    // Proves the shim resolved to the real component AND the real dictionary
    // produced translated strings (not raw i18n keys).
    expect(screen.getByText('Filtro por condicionales')).toBeInTheDocument();
    expect(screen.getByText('Donde')).toBeInTheDocument();
    expect(screen.getByText('Añadir condición')).toBeInTheDocument();
    expect(screen.getByText('Aplicar')).toBeInTheDocument();
    expect(screen.getByText('Limpiar')).toBeInTheDocument();
    expect(screen.getByText('Guardar filtro')).toBeInTheDocument();
  });

  it('disables Apply while the first row is incomplete', () => {
    renderES(<AdvancedFilterBuilder columns={COLUMNS} />);
    expect(screen.getByText('Aplicar').closest('button')).toBeDisabled();
  });

  it('disables Clear when no filter is applied', () => {
    renderES(<AdvancedFilterBuilder columns={COLUMNS} />);
    expect(screen.getByText('Limpiar').closest('button')).toBeDisabled();
  });

  it('adds and removes condition rows', async () => {
    const user = userEvent.setup();
    renderES(<AdvancedFilterBuilder columns={COLUMNS} />);
    await user.click(screen.getByText('Añadir condición'));
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(2);
    await user.click(screen.getAllByLabelText('Remove condition')[0]);
    expect(screen.getAllByLabelText('Remove condition')).toHaveLength(1);
  });

  it('calls onClear when Clear is clicked with an applied filter', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: 'test' }],
    };
    renderES(<AdvancedFilterBuilder columns={COLUMNS} value={value} onClear={onClear} />);
    await user.click(screen.getByText('Limpiar'));
    expect(onClear).toHaveBeenCalled();
  });

  it('calls onApply with cloned conditions and onClose after Apply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    const value = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNull', value: '' }],
    };
    renderES(
      <AdvancedFilterBuilder
        columns={COLUMNS}
        value={value}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByText('Aplicar'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0];
    expect(applied.conditions).toHaveLength(1);
    // Must be a clone, not the same reference.
    expect(applied.conditions).not.toBe(value.conditions);
  });

  // ================================================================
  // ETP-4532 — "starts with" (iStartsWith) end-to-end, real Spanish
  // ================================================================
  describe('iStartsWith operator — "Empieza por" (ETP-4532)', () => {
    // Seed a single row with the field already picked so the operator select is
    // enabled (it is `disabled={!col}` until a field is chosen).
    const seededValue = (field) => ({
      rowOperator: 'and',
      conditions: [{ field, operator: '', value: '' }],
    });

    it('offers the "Empieza por" option for a text column', async () => {
      const user = userEvent.setup();
      renderES(<AdvancedFilterBuilder columns={COLUMNS} value={seededValue('name')} />);
      await user.click(screen.getByText('Seleccionar condición').closest('button'));
      expect(await screen.findByRole('option', { name: 'Empieza por' })).toBeInTheDocument();
    });

    it('offers the "Empieza por" option for an identifier column', async () => {
      const user = userEvent.setup();
      const cols = [{ key: 'bp', label: 'Partner', type: 'selector', column: 'C_BPartner_ID' }];
      renderES(<AdvancedFilterBuilder columns={cols} value={seededValue('bp')} />);
      await user.click(screen.getByText('Seleccionar condición').closest('button'));
      expect(await screen.findByRole('option', { name: 'Empieza por' })).toBeInTheDocument();
    });

    it('emits a condition with operator iStartsWith after selecting it, typing a value, and applying', async () => {
      const user = userEvent.setup();
      const onApply = vi.fn();
      renderES(
        <AdvancedFilterBuilder columns={COLUMNS} value={seededValue('name')} onApply={onApply} />,
      );
      // Select the "Empieza por" operator.
      await user.click(screen.getByText('Seleccionar condición').closest('button'));
      await user.click(await screen.findByRole('option', { name: 'Empieza por' }));
      // The value input now appears (iStartsWith is not a nullish op).
      const input = screen.getByRole('textbox');
      await user.type(input, 'foo');
      await user.click(screen.getByText('Aplicar'));
      expect(onApply).toHaveBeenCalledTimes(1);
      const applied = onApply.mock.calls[0][0];
      expect(applied.conditions).toHaveLength(1);
      expect(applied.conditions[0]).toMatchObject({
        field: 'name',
        operator: 'iStartsWith',
        value: 'foo',
      });
    });
  });
});
