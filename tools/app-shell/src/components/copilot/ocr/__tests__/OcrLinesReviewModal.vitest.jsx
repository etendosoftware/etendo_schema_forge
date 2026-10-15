/**
 * Lines review modal — the "no purchase tax at that rate" hint (ETP-5585 behavior, named by unit).
 *
 * @covers tools/app-shell/src/components/copilot/ocr/OcrLinesReviewModal.jsx
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}|${JSON.stringify(vars)}` : key),
}));

// The cell stub exposes pick/clear buttons that drive the modal's onChange wiring.
vi.mock('../kinds/KindRenderer.jsx', () => ({
  default: ({ kind, value, onChange }) => (
    <div data-testid={`cell-${kind}`}>
      <span data-testid={`value-${kind}`}>{typeof value === 'object' && value ? value.id : String(value)}</span>
      {kind === 'entity' && (
        <>
          <button type="button" data-testid="pick" onClick={() => onChange({ id: 'T10', label: 'IVA 10%' })}>pick</button>
          <button type="button" data-testid="clear" onClick={() => onChange(null)}>clear</button>
        </>
      )}
    </div>
  ),
}));

import OcrLinesReviewModal from '../OcrLinesReviewModal.jsx';

const COLUMNS = [
  { key: 'description', label: 'ocrLinesDescription', kind: 'text', extractFrom: 'description' },
  { key: 'tax', label: 'ocrLinesTax', kind: 'entity', extractFrom: 'tax_label' },
];

function renderModal(lines, extra = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<OcrLinesReviewModal columns={COLUMNS} lines={lines} onSubmit={onSubmit} onCancel={onCancel} {...extra} />);
  return { onSubmit, onCancel };
}

describe('OcrLinesReviewModal — tax hint', () => {
  it('shows the hint with the rate interpolated when the row has no tax and no rate match', () => {
    renderModal([{ description: 'A', tax_label: '', tax_id: null, tax_rate: 21, tax_no_rate_match: true }]);
    expect(screen.getByTestId('ocr-tax-no-rate-match')).toHaveTextContent('ocrLinesTaxNoRateMatch|{"rate":21}');
  });

  it('does not show the hint when the flag is absent or the row already holds a tax', () => {
    renderModal([
      { description: 'A', tax_id: null, tax_rate: 21 },
      { description: 'B', tax_id: 'T21', tax_rate: 21, tax_no_rate_match: true },
    ]);
    expect(screen.queryByTestId('ocr-tax-no-rate-match')).not.toBeInTheDocument();
  });

  it('hides the hint once the user picks a tax', async () => {
    const user = userEvent.setup();
    renderModal([{ description: 'A', tax_id: null, tax_rate: 21, tax_no_rate_match: true }]);
    expect(screen.getByTestId('ocr-tax-no-rate-match')).toBeInTheDocument();

    await user.click(screen.getByTestId('pick'));

    expect(screen.queryByTestId('ocr-tax-no-rate-match')).not.toBeInTheDocument();
    expect(screen.getByTestId('value-entity')).toHaveTextContent('T10');
  });

  it('keeps the hint hidden after clearing a pick (the flag was reset)', async () => {
    const user = userEvent.setup();
    renderModal([{ description: 'A', tax_id: null, tax_rate: 21, tax_no_rate_match: true }]);
    await user.click(screen.getByTestId('pick'));
    await user.click(screen.getByTestId('clear'));

    expect(screen.queryByTestId('ocr-tax-no-rate-match')).not.toBeInTheDocument();
  });

  it('keeps the submit button enabled while the hint is visible and submits the row state', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal([{ description: 'A', tax_id: null, tax_rate: 21, tax_no_rate_match: true }]);
    const submit = screen.getByRole('button', { name: 'ocrReviewSubmit' });
    expect(submit).toBeEnabled();

    await user.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0][0]).toMatchObject({ description: 'A', tax_id: null, tax_no_rate_match: true });
  });
});

// ETP-5585 UX — column widths must not depend on the cell content (jsdom cannot measure layout;
// these pin the classes that fix it).
describe('OcrLinesReviewModal — stable layout', () => {
  it('uses a fixed table layout and lets cells shrink below their content', () => {
    renderModal([{ description: 'A', tax_id: 'T4', tax_label: 'Adquisiciones a Canarias,Ceuta y Melilla 4% - IVA Super Reducido' }]);
    const table = screen.getByRole('table');
    expect(table.className).toContain('table-fixed');
    screen.getAllByRole('cell').forEach((cell) => expect(cell.className).toContain('min-w-0'));
  });
});
