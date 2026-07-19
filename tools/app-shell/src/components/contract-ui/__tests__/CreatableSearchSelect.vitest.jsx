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
