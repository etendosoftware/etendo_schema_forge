/**
 * @covers tools/app-shell/src/windows/custom/product/ProductSidebarFrame.jsx
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@phosphor-icons/react', () => ({
  ArrowLineRightIcon: (p) => <span {...p} />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import ProductSidebarFrame from '../ProductSidebarFrame.jsx';

const tokens = (el) => el.className.split(/\s+/);

describe('ProductSidebarFrame', () => {
  it('renders the divider toggle as a sibling BEFORE the clip layer, so the clip never hides it', () => {
    const { container } = render(
      <ProductSidebarFrame collapsed={false} onToggle={vi.fn()}><p>content</p></ProductSidebarFrame>,
    );
    const toggle = screen.getByTestId('ProductSidebarCollapseButton');
    const clip = screen.getByTestId('ProductSidebarClip');
    expect(toggle.parentElement).toBe(clip.parentElement);
    expect(toggle.parentElement).toBe(container);
    expect(toggle.compareDocumentPosition(clip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clip.contains(toggle)).toBe(false);
  });

  it.each([
    [false, 'w-[319px]', 'w-[47px]', 'ProductSidebarCollapseButton'],
    [true, 'w-[47px]', 'w-[319px]', 'ProductSidebarOpenButton'],
  ])('collapsed=%s uses one fixed-width scroll layer inside the clip layer', (collapsed, width, other, testId) => {
    render(<ProductSidebarFrame collapsed={collapsed} onToggle={vi.fn()}><p>content</p></ProductSidebarFrame>);
    const clip = screen.getByTestId('ProductSidebarClip');
    expect(tokens(clip)).toEqual(expect.arrayContaining(['overflow-hidden', 'min-h-0', 'flex-1']));
    expect(clip.children).toHaveLength(1);
    const scroll = clip.firstElementChild;
    expect(tokens(scroll)).toEqual(expect.arrayContaining([width, 'shrink-0', 'overflow-y-auto', 'overflow-x-hidden']));
    expect(tokens(scroll)).not.toContain(other);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('expanded padding applies only to the wide layer; the strip keeps just the top padding', () => {
    const { rerender } = render(<ProductSidebarFrame collapsed={false} onToggle={vi.fn()}>x</ProductSidebarFrame>);
    expect(tokens(screen.getByTestId('ProductSidebarClip').firstElementChild)).toEqual(expect.arrayContaining(['pt-2', 'pr-4', 'pb-5']));
    rerender(<ProductSidebarFrame collapsed onToggle={vi.fn()}>x</ProductSidebarFrame>);
    const strip = tokens(screen.getByTestId('ProductSidebarClip').firstElementChild);
    expect(strip).toContain('pt-2');
    expect(strip).not.toContain('pr-4');
    expect(strip).not.toContain('pb-5');
  });

  it('renders the same children in both states, and keeps them mounted across the switch', () => {
    const { rerender } = render(
      <ProductSidebarFrame collapsed={false} onToggle={vi.fn()}><p data-testid="kid">content</p></ProductSidebarFrame>,
    );
    const kid = screen.getByTestId('kid');
    expect(screen.getByTestId('ProductSidebarClip').firstElementChild.contains(kid)).toBe(true);
    rerender(<ProductSidebarFrame collapsed onToggle={vi.fn()}><p data-testid="kid">content</p></ProductSidebarFrame>);
    expect(screen.getByTestId('kid')).toBe(kid);
    expect(screen.getByTestId('ProductSidebarClip').firstElementChild.contains(kid)).toBe(true);
  });

  it('forwards collapsed state and the click to the divider toggle', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ProductSidebarFrame collapsed={false} onToggle={onToggle}>x</ProductSidebarFrame>);
    const open = screen.getByTestId('ProductSidebarCollapseButton');
    expect(open.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(open);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<ProductSidebarFrame collapsed onToggle={onToggle}>x</ProductSidebarFrame>);
    const closed = screen.getByTestId('ProductSidebarOpenButton');
    expect(closed.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(closed);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('renders no children without crashing (empty panel)', () => {
    render(<ProductSidebarFrame collapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('ProductSidebarClip').firstElementChild.childNodes).toHaveLength(0);
  });
});

// Wiring contract: the button is anchored by CSS in the column, never by JS measurement, and the
// frame owns no animation of its own (the column's width transition and motion-reduce live in decisions.json).
describe('ProductSidebarFrame wiring contract', () => {
  const dir = resolve(__dirname, '..');
  const frame = readFileSync(resolve(dir, 'ProductSidebarFrame.jsx'), 'utf8');
  const toggle = readFileSync(resolve(dir, 'ProductSidebarDividerToggle.jsx'), 'utf8');

  it('uses no JS layout measurement or effects in the frame or the divider toggle', () => {
    [frame, toggle].forEach((src) => {
      expect(src).not.toMatch(/offsetLeft|getBoundingClientRect|ResizeObserver|useLayoutEffect|useEffect/);
    });
  });

  it('anchors the toggle on the column border with CSS classes only', () => {
    expect(toggle).toMatch(/absolute left-\[-0\.5px\]/);
    expect(toggle).toMatch(/-translate-x-1\/2/);
  });

  it('declares no width transition of its own, so content never animates inside the fixed layer', () => {
    expect(frame).not.toMatch(/transition|duration-|motion-reduce/);
  });
});
