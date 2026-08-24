// EnumSearchSelect.jsx — brand-new component (ETP-4888 design-polish round), built
// for TaxSifModal.jsx's static enum fields (0–2 fixed AEAT catalogs per tax, never FK
// selectors). Narrower sibling of CreatableSearchSelect: no FK/server-search/
// inline-create/dependsOn machinery, since a static enum never needs any of it. Kept
// generic (no tax-specific knowledge) so any other static code+description enum can
// reuse it — these tests exercise it standalone, with no TaxSifModal involved.

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EnumSearchSelect } from '../EnumSearchSelect.jsx';

const ui = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

const OPTIONS = [
  { value: '01', code: '01', description: 'Operación de régimen general' },
  { value: '02', code: '02', description: 'Exportación' },
  { value: '03', code: '03', description: 'Operaciones a las que se aplique el régimen especial de bienes usados' },
];

function Harness({ options = OPTIONS, value, onChange, ...rest }) {
  return (
    <EnumSearchSelect
      id="test-field"
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Search..."
      ui={ui}
      testId="enum-test"
      {...rest}
    />
  );
}

async function openPanel() {
  const input = screen.getByTestId('enum-test-input');
  input.focus();
  await waitFor(() => expect(screen.getByTestId('enum-test-panel')).toBeInTheDocument());
  return input;
}

// The empty-state <div> carries no testId, so locate it by its `noResultsFor` prefix and
// then assert on the FULL rendered text. `noResultsFor` is a PREFIX key ("No results for"
// / "Sin resultados para"), never a standalone sentence: asserting only the bare key would
// still pass against the dangling-fragment regression this component shipped with.
const emptyState = () => screen.getByText(/^noResultsFor/);

describe('EnumSearchSelect — basic rendering', () => {
  it('renders the search icon and an input (no chip) when no value is selected', () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.getByTestId('enum-test-search-icon')).toBeInTheDocument();
    expect(screen.getByTestId('enum-test-input')).toBeInTheDocument();
    expect(screen.queryByTestId('enum-test-chip')).not.toBeInTheDocument();
  });

  it('renders a chip (code + description as distinct pieces) when a value is selected', () => {
    render(<Harness value="01" onChange={vi.fn()} />);
    const chip = screen.getByTestId('enum-test-chip');
    expect(chip).toBeInTheDocument();
    expect(screen.queryByTestId('enum-test-input')).not.toBeInTheDocument();

    // code and description render as TWO distinct <span> children, not one
    // concatenated string — an explicit design requirement.
    const spans = chip.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveTextContent('01');
    expect(spans[1]).toHaveTextContent('Operación de régimen general');
    // Neither span's own text contains the other piece.
    expect(spans[0].textContent).not.toContain('régimen general');
    expect(spans[1].textContent).not.toContain('01 —');
  });

  it('falls back to no chip when value matches no option', () => {
    render(<Harness value="does-not-exist" onChange={vi.fn()} />);
    expect(screen.queryByTestId('enum-test-chip')).not.toBeInTheDocument();
    expect(screen.getByTestId('enum-test-input')).toBeInTheDocument();
  });
});

describe('EnumSearchSelect — opening / closing the panel', () => {
  it('opens the panel on focus and lists every option, each rendering code and description separately', async () => {
    render(<Harness onChange={vi.fn()} />);
    await openPanel();

    for (const opt of OPTIONS) {
      const option = screen.getByTestId(`enum-test-option-${opt.value}`);
      const spans = option.querySelectorAll('span');
      expect(spans).toHaveLength(2);
      expect(spans[0]).toHaveTextContent(opt.code);
      expect(spans[1]).toHaveTextContent(opt.description);
    }
  });

  it('shows the "N of M" counter reflecting the currently filtered vs. total option count', async () => {
    render(<Harness onChange={vi.fn()} />);
    await openPanel();
    expect(screen.getByTestId('enum-test-count')).toHaveTextContent(
      `taxSif.modal.optionCount:${JSON.stringify({ shown: 3, total: 3 })}`,
    );
  });

  it('omits the counter entirely when there are zero matching options (empty-state message shown instead)', async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: 'zzz-no-match' } });

    // Prefix AND query must both be present — a bare `noResultsFor` is the regression.
    await waitFor(() => expect(emptyState()).toHaveTextContent('zzz-no-match'));
    expect(screen.queryByTestId('enum-test-count')).not.toBeInTheDocument();
  });

  it('Escape closes the panel', async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('enum-test-panel')).not.toBeInTheDocument());
  });

  it('blur closes the panel after the debounce window (mousedown-before-blur race guard)', async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.blur(input);
    await waitFor(() => expect(screen.queryByTestId('enum-test-panel')).not.toBeInTheDocument(), { timeout: 500 });
  });
});

describe('EnumSearchSelect — search / filter behavior', () => {
  it('filters options by matching the query against the code', async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: '02' } });

    await waitFor(() => {
      expect(screen.getByTestId('enum-test-option-02')).toBeInTheDocument();
      expect(screen.queryByTestId('enum-test-option-01')).not.toBeInTheDocument();
      expect(screen.queryByTestId('enum-test-option-03')).not.toBeInTheDocument();
    });
  });

  it('filters options by matching the query against the description (case-insensitive)', async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: 'EXPORTACIÓN' } });

    await waitFor(() => {
      expect(screen.getByTestId('enum-test-option-02')).toBeInTheDocument();
      expect(screen.queryByTestId('enum-test-option-01')).not.toBeInTheDocument();
    });
  });

  it('shows the localized empty-state message when nothing matches', async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: 'no-such-option' } });

    // Exact full text: the prefix, a space, and the query wrapped in typographic quotes —
    // the same shape CreatableSearchSelect renders. The pre-fix source emitted only
    // `noResultsFor`, which this assertion rejects.
    await waitFor(() => expect(emptyState().textContent).toBe('noResultsFor \u201cno-such-option\u201d'));
  });

  it('appends the query even when the option list itself is empty (fallback is keyed on the query, not on the options)', async () => {
    render(<Harness options={[]} onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: 'anything' } });

    await waitFor(() => expect(emptyState().textContent).toBe('noResultsFor \u201canything\u201d'));
  });

  it('renders the complete `noResults` sentence instead of the dangling prefix when the option list is empty and no query is typed', async () => {
    render(<Harness options={[]} onChange={vi.fn()} />);
    await openPanel();

    // With no query there is nothing to append to the prefix, so the component must switch
    // to the standalone `noResults` sentence rather than render a dangling `noResultsFor`.
    expect(screen.getByText('noResults')).toBeInTheDocument();
    expect(screen.queryByText(/noResultsFor/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('enum-test-count')).not.toBeInTheDocument();
  });

  it('treats a whitespace-only query as no query at all (still the complete `noResults` sentence)', async () => {
    render(<Harness options={[]} onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: '   ' } });

    await waitFor(() => expect(screen.getByText('noResults')).toBeInTheDocument());
    expect(screen.queryByText(/noResultsFor/)).not.toBeInTheDocument();
  });

  it('clearing the query back to empty restores the full option list', async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: '02' } });
    await waitFor(() => expect(screen.queryByTestId('enum-test-option-01')).not.toBeInTheDocument());

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByTestId('enum-test-option-01')).toBeInTheDocument();
      expect(screen.getByTestId('enum-test-option-02')).toBeInTheDocument();
      expect(screen.getByTestId('enum-test-option-03')).toBeInTheDocument();
    });
  });
});

describe('EnumSearchSelect — selecting an option', () => {
  it('calls onChange with the selected option\'s value', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await openPanel();

    screen.getByTestId('enum-test-option-02').click();
    expect(onChange).toHaveBeenCalledWith('02');
  });

  it('closes the panel and shows the chip for the newly selected value once the parent re-renders with it', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Harness onChange={onChange} />);
    await openPanel();

    screen.getByTestId('enum-test-option-03').click();
    await waitFor(() => expect(screen.queryByTestId('enum-test-panel')).not.toBeInTheDocument());

    rerender(<Harness value="03" onChange={onChange} />);
    const chip = screen.getByTestId('enum-test-chip');
    expect(chip).toHaveTextContent('03');
  });

  it('clicking the chip re-enters search mode, focused and ready to type', async () => {
    render(<Harness value="01" onChange={vi.fn()} />);
    const chip = screen.getByTestId('enum-test-chip');
    chip.click();

    const input = await screen.findByTestId('enum-test-input');
    expect(screen.queryByTestId('enum-test-chip')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('highlights the currently selected option in the open panel', async () => {
    render(<Harness value="02" onChange={vi.fn()} />);
    // Re-entering search mode via the chip re-opens with the panel closed by default;
    // click the chip to get back into the input, then focus to open the panel.
    screen.getByTestId('enum-test-chip').click();
    const input = await screen.findByTestId('enum-test-input');
    input.focus();
    await waitFor(() => expect(screen.getByTestId('enum-test-panel')).toBeInTheDocument());

    expect(screen.getByTestId('enum-test-option-02').className).toContain('bg-accent/60');
    expect(screen.getByTestId('enum-test-option-01').className).not.toContain('bg-accent/60');
  });
});

describe('EnumSearchSelect — options without code/description fall back to label/value', () => {
  const FALLBACK_OPTIONS = [
    { value: 'X1', label: 'Fallback label X1' },
    { value: 'X2' },
  ];

  it('uses label as the description piece and value as the code piece when code/description are absent', async () => {
    render(<Harness options={FALLBACK_OPTIONS} onChange={vi.fn()} />);
    await openPanel();

    const opt = screen.getByTestId('enum-test-option-X1');
    const spans = opt.querySelectorAll('span');
    expect(spans[0]).toHaveTextContent('X1');
    expect(spans[1]).toHaveTextContent('Fallback label X1');
  });

  it('falls back to the raw value for both pieces when neither code/description nor label are present', async () => {
    render(<Harness options={FALLBACK_OPTIONS} onChange={vi.fn()} />);
    await openPanel();

    const opt = screen.getByTestId('enum-test-option-X2');
    const spans = opt.querySelectorAll('span');
    expect(spans[0]).toHaveTextContent('X2');
  });

  it('filters fallback options by the raw value when no code is present', async () => {
    render(<Harness options={FALLBACK_OPTIONS} onChange={vi.fn()} />);
    const input = await openPanel();
    fireEvent.change(input, { target: { value: 'x2' } });

    await waitFor(() => {
      expect(screen.getByTestId('enum-test-option-X2')).toBeInTheDocument();
      expect(screen.queryByTestId('enum-test-option-X1')).not.toBeInTheDocument();
    });
  });
});
