// @covers tools/app-shell/src/windows/custom/fiscal-models/FmBreadcrumb.jsx
//
// The in-page breadcrumb of the 303/349 detail headers. It renders the same item model as the
// TopBar breadcrumb (`normalizeBreadcrumb`): a level with `onClick` is a link, any other level is
// plain text, and levels are joined by the plain " / " separator. Page-level wiring (which crumb
// goes back, and that it discards unsaved edits) is covered by the page tests:
// models/303/__tests__/FmModel303Page.breadcrumb.i18n.vitest.jsx and
// models/303/__tests__/FmModel303Page.cancelDiscard.vitest.jsx.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FmBreadcrumb } from '../FmBreadcrumb.jsx';

describe('FmBreadcrumb', () => {
  it('renders a level without onClick as plain text, not a link', () => {
    render(<FmBreadcrumb items={['Finance', 'Fiscal Models', 'Form 303 - 2026/T2']} />);
    const root = screen.getByTestId('fm-breadcrumb');
    expect(root.querySelectorAll('button')).toHaveLength(0);
    expect(root.querySelectorAll('a')).toHaveLength(0);
    expect(root.textContent).toBe('Finance / Fiscal Models / Form 303 - 2026/T2');
  });

  it('renders only the levels with onClick as links, each firing its own handler', () => {
    const onSection = vi.fn();
    render(
      <FmBreadcrumb items={['Finance', { label: 'Fiscal Models', onClick: onSection }, 'Form 349 - 2026/01']} />,
    );
    const root = screen.getByTestId('fm-breadcrumb');
    const links = root.querySelectorAll('button');
    expect(links).toHaveLength(1);
    expect(links[0]).toBe(screen.getByTestId('fm-breadcrumb-level-1'));
    expect(links[0]).toHaveAttribute('type', 'button');
    expect(links[0].textContent).toBe('Fiscal Models');
    expect(screen.queryByTestId('fm-breadcrumb-level-0')).toBeNull();
    expect(screen.queryByTestId('fm-breadcrumb-level-2')).toBeNull();

    fireEvent.click(links[0]);
    expect(onSection).toHaveBeenCalledTimes(1);
  });

  it('an object level without onClick is plain text too', () => {
    render(<FmBreadcrumb items={[{ label: 'Finance' }, { label: 'Fiscal Models' }]} />);
    const root = screen.getByTestId('fm-breadcrumb');
    expect(root.querySelectorAll('button')).toHaveLength(0);
    expect(root.textContent).toBe('Finance / Fiscal Models');
  });

  it('separates levels with " / " and puts no separator before the first or after the last level', () => {
    const { rerender } = render(<FmBreadcrumb items={['A', { label: 'B', onClick: vi.fn() }, 'C']} />);
    const root = screen.getByTestId('fm-breadcrumb');
    expect(root.textContent).toBe('A / B / C');
    expect(root.textContent.startsWith(' / ')).toBe(false);
    expect(root.textContent.endsWith(' / ')).toBe(false);
    // The separator is text beside the link, never part of the link's own label.
    expect(screen.getByTestId('fm-breadcrumb-level-1').textContent).toBe('B');

    rerender(<FmBreadcrumb items={['Only']} />);
    expect(screen.getByTestId('fm-breadcrumb').textContent).toBe('Only');
  });

  it('drops blank levels so they leave no doubled separator', () => {
    render(<FmBreadcrumb items={['A', '', '   ', null, { label: '' }, 'B']} />);
    expect(screen.getByTestId('fm-breadcrumb').textContent).toBe('A / B');
  });

  it.each([
    ['an empty array', []],
    ['null', null],
    ['undefined', undefined],
  ])('renders an empty breadcrumb without crashing for %s', (_label, items) => {
    render(<FmBreadcrumb items={items} />);
    const root = screen.getByTestId('fm-breadcrumb');
    expect(root.textContent).toBe('');
    expect(root.children).toHaveLength(0);
  });

  it('applies the style it is given to the container', () => {
    render(<FmBreadcrumb items={['A']} style={{ fontSize: 12 }} />);
    expect(screen.getByTestId('fm-breadcrumb')).toHaveStyle({ fontSize: '12px' });
  });
});
