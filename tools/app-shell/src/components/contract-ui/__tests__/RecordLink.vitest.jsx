// @covers tools/app-shell/src/components/contract-ui/RecordLink.jsx
//
// The shared «open this record» link: underlined value + ↗, used by the lines grid's `link` cell
// and the document picker's Documento column. Rendered inside a real MemoryRouter; the route the
// router lands on is what proves the navigation.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RecordLink } from '../RecordLink.jsx';

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

function renderLink(props = {}, { onParentClick = vi.fn() } = {}) {
  render(
    <MemoryRouter initialEntries={['/remittance/rem-1']}>
      <Routes>
        <Route
          path="*"
          element={(
            <>
              <CurrentPath />
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div data-testid="parent-row" onClick={onParentClick}>
                <RecordLink to="/sales-invoice/INV-1" {...props}>FAC-001</RecordLink>
              </div>
            </>
          )} />
      </Routes>
    </MemoryRouter>,
  );
  return { onParentClick };
}

describe('RecordLink', () => {
  it('renders the value as an underlined button with the ↗ icon', () => {
    renderLink();
    const link = screen.getByTestId('record-link');
    expect(link.tagName).toBe('BUTTON');
    expect(link).toHaveAttribute('type', 'button');
    expect(link).toHaveTextContent('FAC-001');
    expect(link).toHaveClass('underline');
    expect(screen.getByTestId('ArrowUpRight__record-link')).toBeInTheDocument();
  });

  it('navigates to the route on click', () => {
    renderLink();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/remittance/rem-1');
    fireEvent.click(screen.getByTestId('record-link'));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/sales-invoice/INV-1');
  });

  it('stops the click from reaching the row it sits in', () => {
    const { onParentClick } = renderLink();
    fireEvent.click(screen.getByTestId('record-link'));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('runs onNavigate before navigating (a modal closes itself there)', () => {
    let pathAtCallback = null;
    const onNavigate = vi.fn(() => { pathAtCallback = screen.getByTestId('current-path').textContent; });
    renderLink({ onNavigate });
    fireEvent.click(screen.getByTestId('record-link'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(pathAtCallback).toBe('/remittance/rem-1');
    expect(screen.getByTestId('current-path')).toHaveTextContent('/sales-invoice/INV-1');
  });

  it('takes a custom test id and icon test id', () => {
    renderLink({ 'data-testid': 'line-link-invoice', iconTestId: 'ArrowUpRight__3b7ec2' });
    expect(screen.getByTestId('line-link-invoice')).toBeInTheDocument();
    expect(screen.getByTestId('ArrowUpRight__3b7ec2')).toBeInTheDocument();
    expect(screen.queryByTestId('record-link')).toBeNull();
    expect(screen.queryByTestId('ArrowUpRight__record-link')).toBeNull();
  });
});
