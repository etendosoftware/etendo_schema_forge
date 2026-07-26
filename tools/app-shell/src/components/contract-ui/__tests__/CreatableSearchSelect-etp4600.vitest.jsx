import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// ETP-4600 Phase 1 — CreatableSearchSelect unification gaps:
//   Gap A: keyboard navigation (ArrowUp/Down, Enter, Esc)
//   Gap B: search text starts empty on open/reopen; the chip label survives
//   Gap C: auto-width, non-truncating dropdown panel
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

import { CreatableSearchSelect } from '../CreatableSearchSelect.jsx';

const OPTIONS = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Bravo' },
  { id: '3', name: 'Charlie' },
];

const baseProps = {
  formData: {},
  resolvedLabel: 'Contact',
  selectorUrl: null,
  selectorContext: {},
  token: null,
};

describe('CreatableSearchSelect — keyboard navigation (ETP-4600 Gap A)', () => {
  const field = { key: 'contact', required: false };

  it('ArrowDown highlights the first option, then the next, and Enter selects the highlighted option', () => {
    const onChange = vi.fn();
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={onChange}
      />
    );

    const input = screen.getByTestId('field-contact');
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('option-contact-1')).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('option-contact-2')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('option-contact-1')).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2', 'Bravo', OPTIONS[1]);
  });

  it('ArrowUp moves the highlight back up (clamped at the first option)', () => {
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={vi.fn()}
      />
    );
    const input = screen.getByTestId('field-contact');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('option-contact-1')).toHaveAttribute('aria-selected', 'true');

    // Clamped — does not go negative / wrap.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('option-contact-1')).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes the dropdown WITHOUT changing the selection', () => {
    const onChange = vi.fn();
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={onChange}
      />
    );
    const input = screen.getByTestId('field-contact');
    fireEvent.focus(input);
    expect(screen.getByTestId('options-contact')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByTestId('options-contact')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes combobox ARIA wiring (aria-expanded, aria-activedescendant) on the input', () => {
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={vi.fn()}
      />
    );
    const input = screen.getByTestId('field-contact');
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'contact-option-1');
    expect(screen.getByTestId('options-contact')).toHaveAttribute('role', 'listbox');
    expect(screen.getByTestId('option-contact-1')).toHaveAttribute('role', 'option');
  });

  // Caught live via Chrome DevTools against the real sales-order Partner Address picker
  // (PartnerAddressPicker passes createLabel="+ Add address"): showDropdown used to be a
  // plain `||` chain, so when `open` was true it short-circuited on the truthy `createLabel`
  // STRING instead of a boolean — rendering aria-expanded="+ Add address" instead of "true".
  it('renders aria-expanded as a real boolean string, never the createLabel text (regression)', () => {
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        createLabel="+ Add address"
        onCreateRequest={vi.fn()}
        onChange={vi.fn()}
      />
    );
    const input = screen.getByTestId('field-contact');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-expanded')).not.toBe('+ Add address');
  });
});

describe('CreatableSearchSelect — decoupled search text (ETP-4600 Gap B)', () => {
  const field = { key: 'contact', required: false };

  it('starts with an EMPTY search box when reopening a field that already has a selected value', async () => {
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value="1"
        displayValue="Alpha"
        staticOptions={OPTIONS}
        onChange={vi.fn()}
      />
    );

    // Chip shows the selected label.
    const chip = screen.getByTestId('field-contact-chip');
    expect(chip).toHaveTextContent('Alpha');

    // Clicking the chip enters edit mode — the text input must be EMPTY, not prefilled.
    fireEvent.click(chip);
    const input = await screen.findByTestId('field-contact');
    // handleChipClick focuses the input via requestAnimationFrame — wait for it, then for
    // the resulting onFocus -> setOpen(true) render.
    await waitFor(() => expect(document.activeElement).toBe(input));
    await waitFor(() => expect(screen.getByTestId('options-contact')).toBeInTheDocument());
    expect(input.value).toBe('');

    // And the full, unfiltered option list is shown (not filtered by "Alpha").
    expect(screen.getByTestId('option-contact-1')).toBeInTheDocument();
    expect(screen.getByTestId('option-contact-2')).toBeInTheDocument();
    expect(screen.getByTestId('option-contact-3')).toBeInTheDocument();
  });

  it('clears the search text on close so a later reopen does not persist the previous search term', () => {
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={vi.fn()}
      />
    );

    const input = screen.getByTestId('field-contact');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Bra' } });
    expect(input.value).toBe('Bra');
    expect(screen.queryByTestId('option-contact-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('option-contact-2')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('options-contact')).not.toBeInTheDocument();

    // Reopen — search text must be blank again, not "Bra".
    fireEvent.focus(screen.getByTestId('field-contact'));
    expect(screen.getByTestId('field-contact').value).toBe('');
    expect(screen.getByTestId('option-contact-1')).toBeInTheDocument();
  });

  it('keeps the chip label after selecting an option, even if the caller never passes displayValue back', () => {
    // Harness mirrors a caller that only tracks `value` (production callers that don't
    // maintain a separate displayValue field) — resolvedDisplay must carry the chip label
    // on its own, derived from `options` + `value`.
    function ValueOnlyHarness() {
      const [value, setValue] = React.useState('');
      return (
        <CreatableSearchSelect
          {...baseProps}
          field={field}
          value={value}
          displayValue=""
          staticOptions={OPTIONS}
          onChange={(id) => setValue(id ?? '')}
        />
      );
    }

    render(<ValueOnlyHarness />);
    const input = screen.getByTestId('field-contact');
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByTestId('option-contact-2'));

    const chip = screen.getByTestId('field-contact-chip');
    expect(chip).toHaveTextContent('Bravo');
  });
});

describe('CreatableSearchSelect — auto-width dropdown (ETP-4600 Gap C)', () => {
  const field = { key: 'contact', required: false };

  it('produces a max-content, viewport-clamped dropdown style instead of matching the trigger width exactly', () => {
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByTestId('field-contact'));
    const panel = screen.getByTestId('options-contact');
    expect(panel.style.width).toBe('max-content');
    expect(panel.style.minWidth).not.toBe('');
    expect(panel.style.maxWidth).not.toBe('');
  });

  it('applies whitespace-nowrap to option rows so long labels do not wrap', () => {
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByTestId('field-contact'));
    expect(screen.getByTestId('option-contact-1').className).toMatch(/whitespace-nowrap/);
  });

  it('rows use block (not the <button> default inline-block) alongside w-full so the panel collapses to content width', () => {
    // Regression for the 3rd width iteration: a width:100% row that stays display:inline-block
    // (the browser default for <button>) makes Chrome's shrink-to-fit calculation for the
    // ancestor's width:max-content balloon far past the longest option's actual text width.
    // Pairing w-full with an explicit block fixes it — see the className comment in
    // CreatableSearchSelect.jsx for the full mechanism.
    render(
      <CreatableSearchSelect
        {...baseProps}
        field={field}
        value=""
        displayValue=""
        staticOptions={OPTIONS}
        onChange={vi.fn()}
      />
    );
    fireEvent.focus(screen.getByTestId('field-contact'));
    expect(screen.getByTestId('option-contact-1').className).toMatch(/\bw-full\b/);
    expect(screen.getByTestId('option-contact-1').className).toMatch(/\bblock\b/);
  });
});
