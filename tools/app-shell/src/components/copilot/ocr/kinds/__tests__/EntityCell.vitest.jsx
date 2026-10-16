/**
 * EntityCell — the tax cell of the lines review keeps a stable box (ETP-5585): long labels
 * truncate with the full text in `title`, and the results list renders in a portal instead of
 * inside the modal's scrolling body. Real layout cannot be measured in jsdom; these tests pin the
 * classes and the DOM placement that produce it.
 *
 * @covers tools/app-shell/src/components/copilot/ocr/kinds/EntityCell.jsx
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

vi.mock('../entityLookup', () => ({
  deriveEntityEndpoint: () => '/sws/neo/purchase-invoice/tax',
  useEntitySearch: () => ({
    loading: false,
    items: [{ id: 'T4', name: 'Adquisiciones a Canarias,Ceuta y Melilla 4% - IVA Super Reducido' }],
  }),
}));

import EntityCell from '../EntityCell.jsx';

const LONG = 'Adquisiciones a Canarias,Ceuta y Melilla 4% - IVA Super Reducido';
const column = { key: 'tax', kind: 'entity', emptyOptionLabel: 'ocrLinesTaxDefault' };

function renderCell(props = {}) {
  const onChange = vi.fn();
  const view = render(
    <div data-testid="scroll-body" className="overflow-auto">
      <EntityCell column={column} value={{ id: 'T4', label: LONG }} onChange={onChange} {...props} />
    </div>,
  );
  return { onChange, ...view };
}

describe('EntityCell layout', () => {
  it('truncates a long label on one line and exposes the full text in title', () => {
    renderCell();
    const button = screen.getByTitle(LONG);
    expect(button.className).toContain('min-w-0');
    const label = screen.getByText(LONG);
    expect(label.className).toContain('truncate');
    expect(label.className).toContain('min-w-0');
  });

  it('has no title for the empty "Autocompletar" state', () => {
    renderCell({ value: null });
    expect(screen.getByText('ocrLinesTaxDefault').closest('button')).not.toHaveAttribute('title');
  });

  it('renders the results list in a portal, outside the scrolling container, when opened', async () => {
    const user = userEvent.setup();
    renderCell();
    await user.click(screen.getByTitle(LONG));

    const results = await screen.findByTestId('entity-cell-results');
    expect(screen.getByTestId('scroll-body').contains(results)).toBe(false);
    // The search box replaces the closed select with the same border/padding box.
    const input = screen.getByPlaceholderText('ocrLinesTaxSearch');
    expect(input.parentElement.className).toContain('px-2 py-1.5');
    expect(input.className).toContain('min-w-0');
  });

  it('keeps the dropdown open while typing in the search input and picks an item', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCell({ value: null });
    await user.click(screen.getByText('ocrLinesTaxDefault'));
    const input = await screen.findByPlaceholderText('ocrLinesTaxSearch');
    await user.type(input, 'ca');
    expect(screen.getByTestId('entity-cell-results')).toBeInTheDocument();

    await user.click(screen.getByTitle(LONG));
    expect(onChange).toHaveBeenCalledWith({ id: 'T4', label: LONG });
  });

  it('clears the pick from the first row of the results', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCell();
    await user.click(screen.getByTitle(LONG));
    await user.click(await screen.findByText('ocrLinesTaxClear'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
