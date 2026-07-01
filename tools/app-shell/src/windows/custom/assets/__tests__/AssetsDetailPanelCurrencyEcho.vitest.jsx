import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// ── mock heavy children so we exercise AssetsDetailPanel's own effect logic ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// EntityForm is stubbed: this test only cares about the currency-echo useEffect,
// not field rendering.
vi.mock('@/components/contract-ui', () => ({
  EntityForm: ({ fields }) => (
    <div data-testid="entity-form" data-fields={(fields || []).map(f => f.key).join(',')} />
  ),
}));

import AssetsDetailPanel from '../AssetsDetailPanel.jsx';

const BASE_PROPS = {
  token: 'tok',
  apiBaseUrl: 'http://host/neo/assets',
  api: { labelOverrides: {} },
  catalogs: {},
  editing: true,
};

/**
 * Regression coverage for ETP-4333.
 *
 * The "New asset" form echoes the backend-provided default currency into the
 * form change handler. The original implementation kept the (unstable) `onChange`
 * — DetailView's `handleChangeWithCallout`, re-created on every `hook.editing`
 * identity change — in the effect deps. That produced an
 *   effect -> onChange -> setEditing -> new onChange identity -> effect
 * feedback loop. The loop cycles through the passive-effect phase (one commit per
 * frame) so it never trips React's synchronous "Maximum update depth" guard and
 * logs no console error: it silently starves the render queue and freezes route
 * transitions (Cancel / sidebar navigation stop unmounting the detail view).
 *
 * These tests assert the echo fires EXACTLY ONCE per new-record session and, the
 * core of the regression, that re-rendering with a NEW `onChange` function identity
 * does NOT re-fire the echo. Against the buggy version the re-render would re-emit
 * (the loop); the fixed version (useRef guard + onChange excluded from deps) must not.
 */
describe('AssetsDetailPanel — currency echo (ETP-4333 regression)', () => {
  it('echoes the default currency exactly once for a new record', () => {
    const onChange = vi.fn();
    render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ depreciate: 'N', currency: 'EUR' }}
      />,
    );
    const currencyCalls = onChange.mock.calls.filter(([field]) => field === 'currency');
    expect(currencyCalls).toHaveLength(1);
    expect(currencyCalls[0]).toEqual(['currency', 'EUR']);
  });

  it('does NOT re-fire the echo when onChange identity changes on re-render', () => {
    // This is the heart of the regression. DetailView re-creates
    // handleChangeWithCallout whenever hook.editing changes identity. The buggy
    // code (onChange in deps) would re-run the effect and re-emit, feeding the loop.
    const onChange1 = vi.fn();
    const data = { depreciate: 'N', currency: 'EUR' };
    const { rerender } = render(
      <AssetsDetailPanel {...BASE_PROPS} onChange={onChange1} data={data} />,
    );
    expect(onChange1.mock.calls.filter(([f]) => f === 'currency')).toHaveLength(1);

    // Simulate DetailView recreating the change handler: brand-new function identity,
    // same record reference (no real currency change).
    const onChange2 = vi.fn();
    rerender(<AssetsDetailPanel {...BASE_PROPS} onChange={onChange2} data={data} />);

    // Fixed code: the ref guard prevents a second echo through EITHER handler.
    expect(onChange2.mock.calls.filter(([f]) => f === 'currency')).toHaveLength(0);
    expect(onChange1.mock.calls.filter(([f]) => f === 'currency')).toHaveLength(1);
  });

  it('does NOT re-fire across many onChange-identity re-renders (loop guard)', () => {
    const data = { depreciate: 'N', currency: 'EUR' };
    let totalCurrencyEchoes = 0;
    const makeOnChange = () => vi.fn((field) => { if (field === 'currency') totalCurrencyEchoes += 1; });

    const first = makeOnChange();
    const { rerender } = render(
      <AssetsDetailPanel {...BASE_PROPS} onChange={first} data={data} />,
    );
    // Hammer with fresh onChange identities, as the feedback loop would.
    for (let i = 0; i < 10; i += 1) {
      rerender(<AssetsDetailPanel {...BASE_PROPS} onChange={makeOnChange()} data={data} />);
    }
    expect(totalCurrencyEchoes).toBe(1);
  });

  it('does NOT echo currency for an existing record (has id)', () => {
    const onChange = vi.fn();
    render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ id: 'a1', depreciate: 'N', currency: 'EUR' }}
      />,
    );
    expect(onChange.mock.calls.filter(([f]) => f === 'currency')).toHaveLength(0);
  });

  it('does NOT echo when the new record has no default currency', () => {
    const onChange = vi.fn();
    render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ depreciate: 'N' }}
      />,
    );
    expect(onChange.mock.calls.filter(([f]) => f === 'currency')).toHaveLength(0);
  });
});
