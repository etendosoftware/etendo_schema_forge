// Tests for FmPrimitives React components: RowActionBtn, ExportIcon, WipBadge, ScrollSentinel.
// Mock heavy dependencies before importing the module.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  TriangleAlert: () => null,
  ArrowUpRight: () => null,
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => children,
  TooltipContent: ({ children }) => children,
  TooltipProvider: ({ children }) => children,
  TooltipTrigger: ({ children }) => children,
}));

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowActionBtn, ExportIcon, WipBadge, ScrollSentinel } from '../FmPrimitives.jsx';

// RowActionBtn -----------------------------------------------------------------

describe('RowActionBtn', () => {
  it('renders a button element', () => {
    const { container } = render(<RowActionBtn onClick={() => {}} title="Open" />);
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('renders an SVG inside the button', () => {
    const { container } = render(<RowActionBtn onClick={() => {}} title="Open" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('applies the fm-icon-btn and row-action class names', () => {
    const { container } = render(<RowActionBtn onClick={() => {}} title="Action" />);
    const btn = container.querySelector('button');
    expect(btn.className).toContain('fm-icon-btn');
    expect(btn.className).toContain('row-action');
  });

  it('sets the title attribute from the title prop', () => {
    const { container } = render(<RowActionBtn onClick={() => {}} title="Open invoice" />);
    expect(container.querySelector('button').title).toBe('Open invoice');
  });

  it('calls onClick when clicked', async () => {
    const handler = vi.fn();
    render(<RowActionBtn onClick={handler} title="Go" />);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ExportIcon ------------------------------------------------------------------

describe('ExportIcon', () => {
  it('renders without crashing', () => {
    expect(() => render(<ExportIcon />)).not.toThrow();
  });

  it('renders an SVG element', () => {
    const { container } = render(<ExportIcon />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('SVG has the expected dimensions (13×13)', () => {
    const { container } = render(<ExportIcon />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('13');
    expect(svg.getAttribute('height')).toBe('13');
  });
});

// WipBadge --------------------------------------------------------------------

describe('WipBadge', () => {
  it('renders without crashing (absolute positioning by default)', () => {
    expect(() => render(<WipBadge />)).not.toThrow();
  });

  it('renders without crashing when inline=true', () => {
    expect(() => render(<WipBadge inline />)).not.toThrow();
  });

  it('renders the badge wrapper element', () => {
    const { container } = render(<WipBadge />);
    expect(container.firstChild).not.toBeNull();
  });

  it('uses absolute positioning class when inline is false', () => {
    const { container } = render(<WipBadge inline={false} />);
    expect(container.firstChild.className).toContain('absolute');
  });

  it('uses empty class when inline is true', () => {
    const { container } = render(<WipBadge inline={true} />);
    expect(container.firstChild.className).toBe('');
  });
});

// ScrollSentinel --------------------------------------------------------------

describe('ScrollSentinel', () => {
  it('renders without crashing', () => {
    expect(() =>
      render(<ScrollSentinel hasMore={false} loading={false} onVisible={() => {}} />)
    ).not.toThrow();
  });

  it('renders a div with height 1', () => {
    const { container } = render(
      <ScrollSentinel hasMore={false} loading={false} onVisible={() => {}} />
    );
    const div = container.querySelector('div');
    expect(div).not.toBeNull();
    expect(div.style.height).toBe('1px');
  });

  it('renders when hasMore=true and loading=true (no IntersectionObserver created)', () => {
    expect(() =>
      render(<ScrollSentinel hasMore={true} loading={true} onVisible={() => {}} />)
    ).not.toThrow();
  });

  it('renders when hasMore=false and loading=false (early return guard)', () => {
    expect(() =>
      render(<ScrollSentinel hasMore={false} loading={false} onVisible={() => {}} />)
    ).not.toThrow();
  });
});
