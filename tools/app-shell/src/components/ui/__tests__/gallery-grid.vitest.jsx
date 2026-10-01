import { render, screen } from '@testing-library/react';
import GalleryGrid, {
  GALLERY_CARD_MIN_WIDTH_PX,
  GALLERY_GRID_TEMPLATE_COLUMNS,
} from '../gallery-grid.jsx';

/**
 * GalleryGrid — the width-driven card grid shared by the Products and Reports galleries (ETP-5516).
 *
 * jsdom does no layout, so these tests pin the CONTRACT that produces the layout: the inline
 * `grid-template-columns` track definition, the base classes and the prop forwarding. The real
 * column count per viewport / rail state is guarded by the Playwright spec
 * `e2e/tests/flows/platform/gallery-min-width.mocked.spec.js`.
 */

const renderGrid = (props = {}, children = <span data-testid="card-a">A</span>) =>
  render(<GalleryGrid {...props}>{children}</GalleryGrid>);

describe('gallery-grid constants', () => {
  it('fixes the minimum card width at 220 px', () => {
    expect(GALLERY_CARD_MIN_WIDTH_PX).toBe(220);
  });

  it('derives the track template from the minimum width constant', () => {
    expect(GALLERY_GRID_TEMPLATE_COLUMNS).toContain(`min(${GALLERY_CARD_MIN_WIDTH_PX}px, 100%)`);
    expect(GALLERY_GRID_TEMPLATE_COLUMNS).toBe(
      `repeat(auto-fill, minmax(min(${GALLERY_CARD_MIN_WIDTH_PX}px, 100%), 1fr))`,
    );
  });

  it('is width-driven: auto-fill tracks with a minmax floor and a 1fr ceiling', () => {
    expect(GALLERY_GRID_TEMPLATE_COLUMNS).toMatch(/^repeat\(auto-fill,/);
    expect(GALLERY_GRID_TEMPLATE_COLUMNS).toContain('minmax(');
    expect(GALLERY_GRID_TEMPLATE_COLUMNS).toMatch(/, 1fr\)\)$/);
    // auto-fit would collapse empty tracks and stretch a short row's cards — must not be used.
    expect(GALLERY_GRID_TEMPLATE_COLUMNS).not.toContain('auto-fit');
  });
});

describe('GalleryGrid', () => {
  it('renders with data-testid="gallery-grid" by default', () => {
    renderGrid();
    expect(screen.getByTestId('gallery-grid')).toBeInTheDocument();
  });

  it('honours a data-testid override', () => {
    renderGrid({ 'data-testid': 'my-gallery' });
    expect(screen.getByTestId('my-gallery')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-grid')).not.toBeInTheDocument();
  });

  it('applies the shared track template as an inline style', () => {
    renderGrid();
    const grid = screen.getByTestId('gallery-grid');
    expect(grid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
    expect(grid.getAttribute('style')).toContain(
      `grid-template-columns: ${GALLERY_GRID_TEMPLATE_COLUMNS}`,
    );
  });

  it('always carries grid and gap-4, and merges a caller className', () => {
    renderGrid({ className: 'pt-2 custom-x' });
    const grid = screen.getByTestId('gallery-grid');
    expect(grid).toHaveClass('grid', 'gap-4', 'pt-2', 'custom-x');
  });

  it('has no viewport-breakpoint column classes', () => {
    renderGrid({ className: 'pt-2' });
    expect(screen.getByTestId('gallery-grid').className).not.toMatch(/(?:^|\s)(?:\w+:)?grid-cols-/);
  });

  it('forwards other props to the div', () => {
    renderGrid({ id: 'g1', 'aria-label': 'Products', role: 'list' });
    const grid = screen.getByRole('list', { name: 'Products' });
    expect(grid).toHaveAttribute('id', 'g1');
    expect(grid.tagName).toBe('DIV');
  });

  it('renders its children', () => {
    renderGrid({}, (
      <>
        <span data-testid="card-a">A</span>
        <span data-testid="card-b">B</span>
      </>
    ));
    const grid = screen.getByTestId('gallery-grid');
    expect(grid).toContainElement(screen.getByTestId('card-a'));
    expect(grid).toContainElement(screen.getByTestId('card-b'));
  });

  describe('edge cases', () => {
    it('renders an empty grid (still with the template) when there are no children', () => {
      render(<GalleryGrid />);
      const grid = screen.getByTestId('gallery-grid');
      expect(grid).toBeEmptyDOMElement();
      expect(grid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
    });

    it('renders a single card without changing the track template', () => {
      renderGrid();
      const grid = screen.getByTestId('gallery-grid');
      expect(grid.children).toHaveLength(1);
      expect(grid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
    });

    it('keeps the base classes when className is empty', () => {
      renderGrid({ className: '' });
      expect(screen.getByTestId('gallery-grid')).toHaveClass('grid', 'gap-4');
    });

    it('cannot be stripped of its track template by a caller style prop', () => {
      // A caller `style` is spread first and then replaced by the component's own style, so
      // the template always wins. Documents current behaviour: any OTHER caller style
      // (here `color`) is silently dropped too.
      renderGrid({ style: { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', color: 'red' } });
      const grid = screen.getByTestId('gallery-grid');
      expect(grid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
      expect(grid.style.color).toBe('');
    });

    it('lets a conflicting display class from the caller win (tailwind-merge), template kept', () => {
      // Documents current behaviour: cn() runs tailwind-merge, so a caller `flex` replaces the
      // base `grid` (both are `display` utilities). The inline template survives but is inert
      // without display:grid — callers must not pass a display utility.
      renderGrid({ className: 'flex' });
      const grid = screen.getByTestId('gallery-grid');
      expect(grid).toHaveClass('flex', 'gap-4');
      expect(grid).not.toHaveClass('grid');
      expect(grid.style.gridTemplateColumns).toBe(GALLERY_GRID_TEMPLATE_COLUMNS);
    });
  });
});
