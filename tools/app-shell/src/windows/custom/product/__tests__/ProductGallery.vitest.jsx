// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/hooks/useNeoImage', () => ({
  useNeoImage: vi.fn(),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? '',
}));

vi.mock('../ProductListCells', () => ({
  BoxIcon: (props) => <svg data-testid="BoxIcon__a29533" {...props} />,
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductGallery from '../ProductGallery.jsx';
import { useNeoImage } from '@/hooks/useNeoImage';
import { GALLERY_GRID_TEMPLATE_COLUMNS } from '@/components/ui/gallery-grid';

describe('ProductGallery', () => {
  beforeEach(() => {
    useNeoImage.mockReset();
    useNeoImage.mockReturnValue(null);
  });

  describe('empty state', () => {
    it('renders the placeholder when data is an empty array', () => {
      render(<ProductGallery data={[]} onNavigate={vi.fn()} />);
      expect(screen.getByTestId('BoxIcon__a29533')).toBeInTheDocument();
      expect(screen.getByText('noProductsFound')).toBeInTheDocument();
    });

    it('renders the placeholder when data is undefined', () => {
      render(<ProductGallery data={undefined} onNavigate={vi.fn()} />);
      expect(screen.getByTestId('BoxIcon__a29533')).toBeInTheDocument();
      expect(screen.getByText('noProductsFound')).toBeInTheDocument();
    });
  });

  describe('non-empty gallery', () => {
    it('renders an image card and a fallback card', () => {
      // Row A (image), Row B (no image) — drive useNeoImage per card render order.
      useNeoImage.mockReturnValueOnce('blob:img-a').mockReturnValueOnce(null);

      const data = [
        {
          id: 'a',
          name: 'Product A',
          image: 'img-a-ref',
          searchKey: 'SKU-A',
          'productCategory$_identifier': 'Category A',
        },
        { id: 'b', name: 'Product B' },
      ];

      render(<ProductGallery data={data} onNavigate={vi.fn()} />);

      // Row A: image with correct src + alt
      const img = screen.getByRole('img', { name: 'Product A' });
      expect(img).toHaveAttribute('src', 'blob:img-a');

      // Row A: searchKey chip and category label
      expect(screen.getByText('SKU-A')).toBeInTheDocument();
      expect(screen.getByText('Category A')).toBeInTheDocument();

      // Row B: no image -> fallback BoxIcon rendered
      expect(screen.getByTestId('BoxIcon__a29533')).toBeInTheDocument();
      expect(screen.getByText('Product B')).toBeInTheDocument();
    });

    it('omits the searchKey chip and category label when absent/empty', () => {
      useNeoImage.mockReturnValue('blob:img');
      const data = [{ id: 'a', name: 'Only Name' }];

      render(<ProductGallery data={data} onNavigate={vi.fn()} />);

      expect(screen.getByText('Only Name')).toBeInTheDocument();
      expect(screen.queryByText('SKU-A')).not.toBeInTheDocument();
      // category resolves to '' -> the category span is not rendered
      expect(screen.queryByText('Category A')).not.toBeInTheDocument();
    });

    it('calls onNavigate with the row id when a card is clicked', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      useNeoImage.mockReturnValue('blob:img');
      const data = [{ id: 'row-42', name: 'Clickable' }];

      render(<ProductGallery data={data} onNavigate={onNavigate} />);

      await user.click(screen.getByText('Clickable'));
      expect(onNavigate).toHaveBeenCalledWith('row-42');
    });
  });
  describe('width-driven grid (ETP-5516)', () => {
    const BREAKPOINT_COLS = /(?:^|\s)(?:sm|md|lg|xl|2xl):grid-cols-/;
    const ROWS = [
      { id: 'p1', name: 'Card One' },
      { id: 'p2', name: 'Card Two' },
      { id: 'p3', name: 'Card Three' },
    ];

    it('renders every card inside the shared gallery-grid', () => {
      render(<ProductGallery data={ROWS} onNavigate={vi.fn()} />);
      const grid = screen.getByTestId('gallery-grid');
      expect(grid.children).toHaveLength(ROWS.length);
      for (const row of ROWS) {
        expect(grid).toContainElement(screen.getByText(row.name));
      }
    });

    it('uses the shared min-width track template and keeps its top padding', () => {
      render(<ProductGallery data={ROWS} onNavigate={vi.fn()} />);
      const grid = screen.getByTestId('gallery-grid');
      expect(grid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
      expect(grid).toHaveClass('grid', 'gap-4', 'pt-2');
    });

    it('carries no viewport-breakpoint column classes anywhere', () => {
      const { container } = render(<ProductGallery data={ROWS} onNavigate={vi.fn()} />);
      for (const el of container.querySelectorAll('[class]')) {
        expect(el.getAttribute('class')).not.toMatch(BREAKPOINT_COLS);
      }
    });

    it('renders a single card inside the grid', () => {
      render(<ProductGallery data={[ROWS[0]]} onNavigate={vi.fn()} />);
      expect(screen.getByTestId('gallery-grid').children).toHaveLength(1);
    });

    it('does not render the grid for the empty state', () => {
      render(<ProductGallery data={[]} onNavigate={vi.fn()} />);
      expect(screen.queryByTestId('gallery-grid')).not.toBeInTheDocument();
    });

    it('keeps a long name on one truncated line', () => {
      const longName = 'Extra virgin olive oil from the Sierra de Cazorla cooperative, 5 litre tin';
      render(<ProductGallery data={[{ id: 'long', name: longName }]} onNavigate={vi.fn()} />);
      expect(screen.getByText(longName)).toHaveClass('truncate');
    });
  });
});
