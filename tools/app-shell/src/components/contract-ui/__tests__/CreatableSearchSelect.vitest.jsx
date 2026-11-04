// @covers tools/app-shell/src/components/contract-ui/CreatableSearchSelect.jsx
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Behavioral tests against the REAL CreatableSearchSelect component.
//
// NOTE: the co-located CreatableSearchSelect.test.js is a source-reading
// (node:test) suite and is NOT picked up by vitest (include glob only matches
// *.vitest.{js,jsx} / *.spec.{js,jsx}). These render-based cases therefore live
// in a *.vitest.jsx file so vitest's jsdom runner actually executes them.
//
// i18n useUI is mocked to return the key as-is; buildUrlWithParams is stubbed so
// no real URL building / fetch wiring is exercised — the empty-option behaviour
// is purely client-side.
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

import { CreatableSearchSelect } from '../CreatableSearchSelect.jsx';

describe('CreatableSearchSelect — empty-option behaviour', () => {
  const baseProps = {
    value: '',
    displayValue: '',
    formData: {},
    resolvedLabel: 'Financial Account',
    selectorUrl: null,
    selectorContext: {},
    token: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an empty-option row (and clears to null on click) when emptyOptionLabel is set and the field is NOT required', () => {
    const field = { key: 'financialAccount', required: false };
    const onChange = vi.fn();
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        emptyOptionLabel="All accounts"
        onChange={onChange}
      />
    );

    // Dropdown opens on input focus.
    fireEvent.focus(screen.getByTestId('field-financialAccount'));

    const emptyRow = screen.getByTestId('option-financialAccount-__empty__');
    expect(emptyRow).toBeInTheDocument();
    expect(emptyRow).toHaveTextContent('All accounts');

    // The empty option clears to null via onMouseDown (not onClick).
    fireEvent.mouseDown(emptyRow);
    expect(onChange).toHaveBeenCalledWith('', '', null);
  });

  it('does NOT render the empty-option row when the field is required', () => {
    const field = { key: 'financialAccount', required: true };
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        emptyOptionLabel="All accounts"
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    expect(
      screen.queryByTestId('option-financialAccount-__empty__')
    ).not.toBeInTheDocument();
  });

  it('surfaces emptyOptionLabel as the closed-control placeholder when nothing is selected', () => {
    const field = { key: 'financialAccount', required: false };
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        emptyOptionLabel="All accounts"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('field-financialAccount')).toHaveAttribute(
      'placeholder',
      'All accounts'
    );
  });

  it('does NOT render the create action button when createLabel / onCreateRequest are absent (match-rule case)', () => {
    const field = { key: 'financialAccount', required: false };
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        emptyOptionLabel="All accounts"
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    // Dropdown is open (empty option proves it), but no create action is rendered.
    expect(screen.getByTestId('option-financialAccount-__empty__')).toBeInTheDocument();
    expect(
      screen.queryByTestId('action-create-financialAccount')
    ).not.toBeInTheDocument();
  });
});

describe('CreatableSearchSelect — portaled options panel (modal-scroll fix)', () => {
  const baseProps = {
    value: '',
    displayValue: '',
    formData: {},
    resolvedLabel: 'Financial Account',
    selectorUrl: null,
    selectorContext: {},
    token: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('portals the options panel to document.body (not nested inside the field root) once opened', () => {
    const field = { key: 'financialAccount', required: false };
    const { container } = render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        emptyOptionLabel="All accounts"
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByTestId('field-financialAccount'));

    // Panel is still queryable via RTL (which searches document.body) ...
    const panel = screen.getByTestId('options-financialAccount');
    expect(panel).toBeInTheDocument();
    // ... but it lives OUTSIDE the component's field-box root, proving the portal.
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it('positions the panel with fixed positioning so it does not extend the modal scroll height', () => {
    const field = { key: 'financialAccount', required: false };
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        emptyOptionLabel="All accounts"
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    const panel = screen.getByTestId('options-financialAccount');
    expect(panel.style.position).toBe('fixed');
    // Direction flag is exposed for flip-aware styling/testing.
    expect(panel).toHaveAttribute('data-open-up');
  });

  it('still renders the empty-option row, options and respects empty-while-typing inside the portaled panel', () => {
    const field = { key: 'financialAccount', required: false };
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        emptyOptionLabel="All accounts"
        onChange={vi.fn()}
      />
    );

    const input = screen.getByTestId('field-financialAccount');
    fireEvent.focus(input);
    // Empty option visible while not typing.
    expect(screen.getByTestId('option-financialAccount-__empty__')).toBeInTheDocument();

    // Typing hides the empty option (behavior preserved through the portal).
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(
      screen.queryByTestId('option-financialAccount-__empty__')
    ).not.toBeInTheDocument();
  });
});

describe('CreatableSearchSelect — staticOptions content comparison (review fix)', () => {
  const baseProps = {
    value: '',
    displayValue: '',
    formData: {},
    resolvedLabel: 'Financial Account',
    selectorUrl: null,
    selectorContext: {},
    token: null,
  };
  const field = { key: 'financialAccount', required: false };

  // A caller re-rendering with an inline-mapped array (new reference, same content) is common
  // in this codebase. Re-syncing unconditionally on every reference change used to clobber a
  // locally-created option (pushed straight into `options` by `onCreated`) the moment the
  // parent next re-rendered — this proves that no longer happens.
  it('does not clobber a locally-created option when staticOptions re-renders with the same content under a new array reference', () => {
    let capturedCallback;
    const onCreateRequest = vi.fn((query, cb) => { capturedCallback = cb; });
    const { rerender } = render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        staticOptions={[{ id: '1', name: 'Existing' }]}
        createLabel="Create new"
        onCreateRequest={onCreateRequest}
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    fireEvent.mouseDown(screen.getByTestId('action-create-financialAccount'));
    expect(onCreateRequest).toHaveBeenCalled();
    capturedCallback('new-id', 'Freshly created');

    // handleCreate closes the dropdown before invoking onCreateRequest — reopen it to
    // inspect the (now locally-updated) options list.
    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    expect(screen.getByTestId('option-financialAccount-new-id')).toBeInTheDocument();

    // Parent re-renders with a NEW array reference, same content as before.
    rerender(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        staticOptions={[{ id: '1', name: 'Existing' }]}
        createLabel="Create new"
        onCreateRequest={onCreateRequest}
        onChange={vi.fn()}
      />
    );

    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    expect(screen.getByTestId('option-financialAccount-new-id')).toBeInTheDocument();
  });

  it('still re-syncs when staticOptions content genuinely changes (e.g. async fetch resolves)', () => {
    const { rerender } = render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        staticOptions={[]}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    expect(screen.queryByText('Loaded Account')).not.toBeInTheDocument();

    rerender(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        staticOptions={[{ id: '1', name: 'Loaded Account' }]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Loaded Account')).toBeInTheDocument();
  });
});

describe('CreatableSearchSelect — onWheel avoids double-scroll outside a Dialog (review fix)', () => {
  const baseProps = {
    value: '',
    displayValue: '',
    formData: {},
    resolvedLabel: 'Financial Account',
    selectorUrl: null,
    selectorContext: {},
    token: null,
  };

  function dispatchWheel(el, { deltaY, defaultPrevented }) {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    if (defaultPrevented) event.preventDefault();
    el.dispatchEvent(event);
  }

  it('does NOT manually adjust scrollTop when native scroll was not blocked (no Dialog present)', () => {
    const field = { key: 'financialAccount', required: false };
    render(
      <CreatableSearchSelect {...baseProps} field={field} emptyOptionLabel="All accounts" onChange={vi.fn()} />
    );
    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    const panel = screen.getByTestId('options-financialAccount');
    panel.scrollTop = 0;

    dispatchWheel(panel, { deltaY: 40, defaultPrevented: false });

    expect(panel.scrollTop).toBe(0);
  });

  it('manually adjusts scrollTop when native scroll WAS blocked (e.g. inside a Radix Dialog)', () => {
    const field = { key: 'financialAccount', required: false };
    render(
      <CreatableSearchSelect {...baseProps} field={field} emptyOptionLabel="All accounts" onChange={vi.fn()} />
    );
    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    const panel = screen.getByTestId('options-financialAccount');
    panel.scrollTop = 0;

    dispatchWheel(panel, { deltaY: 40, defaultPrevented: true });

    expect(panel.scrollTop).toBe(40);
  });
});

describe('CreatableSearchSelect — resize reflow does not throw on Node.contains (review fix)', () => {
  const baseProps = {
    value: '',
    displayValue: '',
    formData: {},
    resolvedLabel: 'Financial Account',
    selectorUrl: null,
    selectorContext: {},
    token: null,
  };

  // A native 'resize' event's target is `window` itself (not a Node). The reflow
  // listener used to call dropdownRef.current?.contains(e.target) unconditionally for
  // both 'scroll' and 'resize', and Node.prototype.contains() throws a TypeError when
  // given a non-Node argument — so the dropdown's reflow handler crashed the moment the
  // viewport resized while the options panel was open. Gating the containment check to
  // 'scroll' only (and always recomputing on 'resize') fixes this.
  it('does NOT throw when the window is resized while the dropdown is open', () => {
    const field = { key: 'financialAccount', required: false };
    render(
      <CreatableSearchSelect {...baseProps} field={field} emptyOptionLabel="All accounts" onChange={vi.fn()} />
    );
    fireEvent.focus(screen.getByTestId('field-financialAccount'));
    expect(screen.getByTestId('options-financialAccount')).toBeInTheDocument();

    // jsdom (like real browsers) reports an exception thrown INSIDE an event listener
    // via a window 'error' event rather than propagating it synchronously to
    // dispatchEvent's caller — so a plain `expect(() => dispatchEvent(...)).not.toThrow()`
    // would NOT catch the regression. Capture the window 'error' event explicitly instead.
    const onWindowError = vi.fn();
    window.addEventListener('error', onWindowError);
    try {
      window.dispatchEvent(new Event('resize'));
    } finally {
      window.removeEventListener('error', onWindowError);
    }

    expect(onWindowError).not.toHaveBeenCalled();
    // The dropdown remains functional after the reflow recompute.
    expect(screen.getByTestId('options-financialAccount')).toBeInTheDocument();
  });
});

// ETP-5728 — hook-driven lookup mode, `disabled`, and the renderOption / filterFn / chipLabel
// extension points used by the Finance selectors (ChipSelect wrapper, FundsTransferModal).
describe('CreatableSearchSelect — lookup mode and extension points (ETP-5728)', () => {
  const field = { key: 'fx', id: 'fx', clearable: true };
  const rows = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  const base = { field, value: '', displayValue: '', formData: {}, resolvedLabel: 'X' };
  const open = () => !!screen.queryByTestId('options-fx');

  it('useLookup: rows come from the hook, the query is forwarded and the list is not re-filtered locally', () => {
    const useLookup = vi.fn(() => ({ results: rows, loading: false }));
    render(<CreatableSearchSelect {...base} onChange={vi.fn()} useLookup={useLookup} />);
    fireEvent.focus(screen.getByTestId('field-fx'));
    expect(screen.getByTestId('option-fx-a')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('field-fx'), { target: { value: 'zzz' } });
    expect(useLookup).toHaveBeenLastCalledWith('zzz');
    // hook decides the result set: both rows still shown although neither matches "zzz"
    expect(screen.getByTestId('option-fx-b')).toBeInTheDocument();
  });

  it('useLookup: selecting a row reports id, name and the full row', () => {
    const onChange = vi.fn();
    render(<CreatableSearchSelect {...base} onChange={onChange} useLookup={() => ({ results: rows })} />);
    fireEvent.focus(screen.getByTestId('field-fx'));
    fireEvent.mouseDown(screen.getByTestId('option-fx-b'));
    expect(onChange).toHaveBeenCalledWith('b', 'Beta', rows[1]);
  });

  it('useLookup: never scrolls for more, even with serverSearch set (short result must not page)', () => {
    const useLookup = () => ({ results: rows, loading: false });
    render(<CreatableSearchSelect {...base} onChange={vi.fn()} useLookup={useLookup} serverSearch selectorUrl="/x" />);
    fireEvent.focus(screen.getByTestId('field-fx'));
    fireEvent.scroll(screen.getByTestId('options-fx'));
    expect(screen.getByTestId('option-fx-a')).toBeInTheDocument();
  });

  it('chevron toggles: second click closes the open list', () => {
    render(<CreatableSearchSelect {...base} onChange={vi.fn()} useLookup={() => ({ results: rows })} />);
    fireEvent.click(screen.getByTestId('ChevronDown__fx'));
    expect(open()).toBe(true);
    fireEvent.click(screen.getByTestId('ChevronDown__fx'));
    expect(open()).toBe(false);
  });

  it('chevron has the openOptions aria-label', () => {
    render(<CreatableSearchSelect {...base} onChange={vi.fn()} useLookup={() => ({ results: rows })} />);
    expect(screen.getByTestId('ChevronDown__fx').closest('button')).toHaveAttribute('aria-label', 'openOptions');
  });

  it('disabled: input and chevron disabled, no open; a selected value stays a read-only chip', () => {
    const { rerender } = render(
      <CreatableSearchSelect {...base} onChange={vi.fn()} disabled useLookup={() => ({ results: rows })} />,
    );
    expect(screen.getByTestId('field-fx')).toBeDisabled();
    expect(screen.getByTestId('ChevronDown__fx').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('ChevronDown__fx'));
    expect(open()).toBe(false);
    rerender(
      <CreatableSearchSelect {...base} value="a" displayValue="Alpha" onChange={vi.fn()} disabled
        useLookup={() => ({ results: rows })} />,
    );
    expect(screen.getByTestId('field-fx-chip')).toBeDisabled();
  });

  it('renderOption / filterFn / chipLabel customise rows, local filter and the chip label (staticOptions)', () => {
    const accounts = [
      { id: 'a', name: 'Main', iban: 'ES11', currencyIso: 'EUR' },
      { id: 'b', name: 'Other', iban: 'ES99', currencyIso: 'USD' },
    ];
    const props = {
      ...base,
      onChange: vi.fn(),
      staticOptions: accounts,
      renderOption: (o) => <span data-testid={`row-${o.id}`}>{o.name}|{o.iban}</span>,
      filterFn: (o, q) => o.iban.toLowerCase().includes(q),
      chipLabel: (o) => `${o.name} · ${o.currencyIso}`,
    };
    const { rerender } = render(<CreatableSearchSelect {...props} />);
    fireEvent.focus(screen.getByTestId('field-fx'));
    expect(screen.getByTestId('row-a')).toHaveTextContent('Main|ES11');
    fireEvent.change(screen.getByTestId('field-fx'), { target: { value: 'es99' } });
    expect(screen.queryByTestId('row-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-b')).toBeInTheDocument();
    rerender(<CreatableSearchSelect {...props} value="a" displayValue="Main" />);
    expect(screen.getByTestId('field-fx-chip')).toHaveTextContent('Main · EUR');
  });
});

describe('CreatableSearchSelect — Escape inside a modal (document-level handlers)', () => {
  const field = { key: 'acct', required: false };
  const staticOptions = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  const renderSelect = () => render(
    <CreatableSearchSelect
      field={field} value="" displayValue="" formData={{}} resolvedLabel="Acct"
      selectorUrl={null} selectorContext={{}} token={null}
      staticOptions={staticOptions} onChange={vi.fn()}
    />
  );

  it('Escape with the list open closes only the list: a document capture handler (Radix Dialog) is not reached', () => {
    const dialogEscape = vi.fn();
    document.addEventListener('keydown', dialogEscape, { capture: true });
    try {
      renderSelect();
      const input = screen.getByTestId('field-acct');
      fireEvent.focus(input);
      expect(screen.getByTestId('option-acct-a')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(dialogEscape).not.toHaveBeenCalled();
      expect(screen.queryByTestId('option-acct-a')).not.toBeInTheDocument();
    } finally {
      document.removeEventListener('keydown', dialogEscape, { capture: true });
    }
  });

  it('Escape with the list closed is untouched: it still reaches document handlers', () => {
    const dialogEscape = vi.fn();
    document.addEventListener('keydown', dialogEscape, { capture: true });
    try {
      renderSelect();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(dialogEscape).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', dialogEscape, { capture: true });
    }
  });
});

describe('CreatableSearchSelect — ETP-5902 labelPrefix', () => {
  const baseProps = {
    value: '',
    displayValue: '',
    formData: {},
    resolvedLabel: 'Tax',
    selectorUrl: null,
    selectorContext: {},
    token: null,
  };
  const field = { key: 'tax', required: false };
  const staticOptions = [
    { id: 'iva21', name: 'IVA 21%', labelPrefix: '21%' },
    { id: 'exento', name: 'Exento' },
  ];

  it('shows "<labelPrefix> - <name>" in the list and commits the plain name', () => {
    const onChange = vi.fn();
    render(<CreatableSearchSelect {...baseProps} field={field} staticOptions={staticOptions} onChange={onChange} />);

    fireEvent.focus(screen.getByTestId('field-tax'));
    expect(screen.getByTestId('option-tax-iva21')).toHaveTextContent('21% - IVA 21%');
    expect(screen.getByTestId('option-tax-exento')).toHaveTextContent(/^Exento$/);

    fireEvent.mouseDown(screen.getByTestId('option-tax-iva21'));
    expect(onChange).toHaveBeenCalledWith('iva21', 'IVA 21%', expect.objectContaining({ labelPrefix: '21%' }));
  });
});
