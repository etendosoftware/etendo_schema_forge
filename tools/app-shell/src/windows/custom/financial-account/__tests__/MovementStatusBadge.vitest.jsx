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

  it('renders "Unreconciled" for processed-but-not-cleared codes (RPR, RDNC)', () => {
    const { rerender } = render(<MovementStatusBadge status="RPR" />);
    expect(screen.getByText('financeAccountMovementsStatusUnreconciled')).toBeInTheDocument();
    rerender(<MovementStatusBadge status="RDNC" />);
    expect(screen.getByText('financeAccountMovementsStatusUnreconciled')).toBeInTheDocument();
  });

  it('renders "Borrador" (Draft) for the draft codes RPAP / RPAE', () => {
    const { rerender } = render(<MovementStatusBadge status="RPAP" />);
    expect(screen.getByText('financeAccountMovementsStatusDraft')).toBeInTheDocument();
    rerender(<MovementStatusBadge status="RPAE" />);
    expect(screen.getByText('financeAccountMovementsStatusDraft')).toBeInTheDocument();
  });

  it('shows Borrador when processed=false regardless of the code (reactivated RPR/PPM)', () => {
    const { rerender } = render(<MovementStatusBadge status="RPR" processed={false} />);
    expect(screen.getByText('financeAccountMovementsStatusDraft')).toBeInTheDocument();
    rerender(<MovementStatusBadge status="PPM" processed={false} />);
    expect(screen.getByText('financeAccountMovementsStatusDraft')).toBeInTheDocument();
  });

  it('honors the status-code family when processed=true (RPR → Unreconciled)', () => {
    render(<MovementStatusBadge status="RPR" processed />);
    expect(screen.getByText('financeAccountMovementsStatusUnreconciled')).toBeInTheDocument();
  });

  it('applies the cleared (green) tone for the reconciled status', () => {
    const { container } = render(<MovementStatusBadge status="RPPC" />);
    const span = container.firstChild;
    // cleared family: bg #EEFBF4
    expect(span.style.backgroundColor).toMatch(/238,\s*251,\s*244|#EEFBF4/i);
  });

  it('uses the neutral unreconciled tone for processed-not-cleared statuses (RDNC)', () => {
    const { container } = render(<MovementStatusBadge status="RDNC" />);
    const span = container.firstChild;
    // unreconciled family: bg #F5F7F9
    expect(span.style.backgroundColor).toMatch(/245,\s*247,\s*249|#F5F7F9/i);
  });

  it('uses the grey draft tone for the draft status (RPAE)', () => {
    const { container } = render(<MovementStatusBadge status="RPAE" />);
    const span = container.firstChild;
    // draft family: bg #F1F2F4
    expect(span.style.backgroundColor).toMatch(/241,\s*242,\s*244|#F1F2F4/i);
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
