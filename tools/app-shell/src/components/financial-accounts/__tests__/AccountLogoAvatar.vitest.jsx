import { render } from '@testing-library/react';
import { AccountLogoAvatar } from '../AccountLogoAvatar.jsx';

describe('AccountLogoAvatar', () => {
  it('renders a round 32x32 avatar with the gray Figma palette', () => {
    const { container } = render(<AccountLogoAvatar account={{ type: 'B' }} />);
    const avatar = container.firstChild;
    expect(avatar.className).toMatch(/rounded-full/);
    expect(avatar.className).toMatch(/h-8/);
    expect(avatar.className).toMatch(/w-8/);
    expect(avatar.className).toMatch(/bg-\[#E8EAEF\]/);
  });

  it('renders a Landmark icon for bank accounts', () => {
    const { container } = render(<AccountLogoAvatar account={{ type: 'B' }} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders a Wallet icon for cash accounts', () => {
    const { container } = render(<AccountLogoAvatar account={{ type: 'C' }} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders a CreditCard icon for card accounts', () => {
    const { container } = render(<AccountLogoAvatar account={{ type: 'CA' }} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('falls back to the Building2 icon when type is unknown', () => {
    const { container } = render(<AccountLogoAvatar account={{ type: 'X' }} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('appends a custom className to the wrapper', () => {
    const { container } = render(
      <AccountLogoAvatar account={{ type: 'B' }} className="custom-test-class" />,
    );
    expect(container.firstChild.className).toContain('custom-test-class');
  });
});
