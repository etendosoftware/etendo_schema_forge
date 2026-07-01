import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { MovementStatusBadge } from '../MovementStatusBadge.jsx';

describe('MovementStatusBadge', () => {
  it('renders "Reconciled" for the cleared status (RPPC)', () => {
    render(<MovementStatusBadge status="RPPC" />);
    expect(screen.getByText('financeAccountMovementsStatusReconciled')).toBeInTheDocument();
  });

  it('renders "Unreconciled" for every non-cleared status (e.g. RPR, RPAP)', () => {
    const { rerender } = render(<MovementStatusBadge status="RPR" />);
    expect(screen.getByText('financeAccountMovementsStatusUnreconciled')).toBeInTheDocument();
    rerender(<MovementStatusBadge status="RPAP" />);
    expect(screen.getByText('financeAccountMovementsStatusUnreconciled')).toBeInTheDocument();
  });

  it('applies the cleared (green) tone for the reconciled status', () => {
    const { container } = render(<MovementStatusBadge status="RPPC" />);
    const span = container.firstChild;
    // cleared family: bg #EEFBF4
    expect(span.style.backgroundColor).toMatch(/238,\s*251,\s*244|#EEFBF4/i);
  });

  it('uses the neutral unreconciled tone for non-cleared statuses (RPAE)', () => {
    const { container } = render(<MovementStatusBadge status="RPAE" />);
    const span = container.firstChild;
    // unreconciled family: bg #F5F7F9
    expect(span.style.backgroundColor).toMatch(/245,\s*247,\s*249|#F5F7F9/i);
  });

  it('returns null for an unknown status code', () => {
    const { container } = render(<MovementStatusBadge status="UNKNOWN_CODE" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when status is missing', () => {
    const { container } = render(<MovementStatusBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('forwards a custom className onto the badge span', () => {
    const { container } = render(
      <MovementStatusBadge status="RPR" className="ml-2 custom-class" />,
    );
    expect(container.firstChild.className).toContain('custom-class');
  });
});
