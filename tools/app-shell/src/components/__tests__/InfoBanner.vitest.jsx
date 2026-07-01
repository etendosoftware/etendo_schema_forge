import { render, screen, fireEvent } from '@testing-library/react';
import { InfoBanner } from '../InfoBanner.jsx';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

describe('InfoBanner', () => {
  it('renders children text', () => {
    render(<InfoBanner>Hello banner</InfoBanner>);
    expect(screen.getByText('Hello banner')).toBeTruthy();
  });

  it('applies info tone by default', () => {
    const { container } = render(<InfoBanner>msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-[#00ACFF]');
  });

  it('applies warning tone', () => {
    const { container } = render(<InfoBanner tone="warning">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-[#F5A623]');
  });

  it('applies success tone', () => {
    const { container } = render(<InfoBanner tone="success">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-[#2BB673]');
  });

  it('applies danger tone', () => {
    const { container } = render(<InfoBanner tone="danger">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-[#E5484D]');
  });

  it('falls back to info tone for unknown tone value', () => {
    const { container } = render(<InfoBanner tone="unknown">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('border-[#00ACFF]');
  });

  it('does not render dismiss button when dismissible is false', () => {
    render(<InfoBanner>msg</InfoBanner>);
    expect(screen.queryByTestId('info-banner-dismiss')).toBeNull();
  });

  it('renders dismiss button when dismissible is true', () => {
    render(<InfoBanner dismissible onDismiss={() => {}}>msg</InfoBanner>);
    expect(screen.getByTestId('info-banner-dismiss')).toBeTruthy();
  });

  it('calls onDismiss when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    render(<InfoBanner dismissible onDismiss={onDismiss}>msg</InfoBanner>);
    fireEvent.click(screen.getByTestId('info-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses custom dismissTestId', () => {
    render(<InfoBanner dismissible dismissTestId="custom-dismiss" onDismiss={() => {}}>msg</InfoBanner>);
    expect(screen.getByTestId('custom-dismiss')).toBeTruthy();
  });

  it('passes extra className to container', () => {
    const { container } = render(<InfoBanner className="my-extra">msg</InfoBanner>);
    expect(container.firstChild.className).toContain('my-extra');
  });
});
