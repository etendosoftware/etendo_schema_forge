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
});
