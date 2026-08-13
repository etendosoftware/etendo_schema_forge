import { fireEvent, render } from '@testing-library/react';
import { AccountLogoAvatar } from '../AccountLogoAvatar.jsx';

describe('AccountLogoAvatar', () => {
  it('renders a round 40x40 avatar with the gray Figma palette', () => {
    const { container } = render(<AccountLogoAvatar account={{ type: 'B' }} />);
    const avatar = container.firstChild;
    expect(avatar.className).toMatch(/rounded-full/);
    expect(avatar.className).toMatch(/h-10/);
    expect(avatar.className).toMatch(/w-10/);
    expect(avatar.className).toMatch(/bg-\[hsl\(var\(--border-subtle\)\)\]/);
  });

  // AccountSummaryStrip (the detail header) deliberately pins its own smaller size via
  // className, and twMerge must let that override win over the bigger row default.
  it('lets a caller-provided size override the default via className', () => {
    const { container } = render(
      <AccountLogoAvatar account={{ type: 'B' }} className="h-8 w-8 shrink-0" />,
    );
    const avatar = container.firstChild;
    expect(avatar.className).toMatch(/h-8/);
    expect(avatar.className).toMatch(/w-8/);
    expect(avatar.className).not.toMatch(/h-10/);
    expect(avatar.className).not.toMatch(/w-10/);
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

  // The connected bank's real logo, persisted from Salt Edge's provider catalog (ETP-4764
  // follow-up), takes priority over the generic per-type icon.
  describe('with a provider logo', () => {
    const LOGO_URL = 'https://cdn.saltedge.com/bank_icons/bbva.png';

    it('renders the logo image instead of the generic icon', () => {
      const { container } = render(
        <AccountLogoAvatar account={{ type: 'B', providerLogoUrl: LOGO_URL }} />,
      );
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', LOGO_URL);
      expect(container.querySelector('svg')).not.toBeInTheDocument();
    });

    // The icon's muted gray circle is meant to give a plain glyph contrast; a real logo is
    // typically an SVG/PNG with a transparent backdrop, so that same gray showed through around
    // the mark instead of framing it. The logo gets a white/card background instead.
    it('sits on a white card background instead of the icon\'s gray circle', () => {
      const { container } = render(
        <AccountLogoAvatar account={{ type: 'B', providerLogoUrl: LOGO_URL }} />,
      );
      const avatar = container.firstChild;
      expect(avatar.className).toMatch(/bg-card/);
      expect(avatar.className).not.toMatch(/bg-\[hsl\(var\(--border-subtle\)\)\]/);
    });

    it('falls back to the generic icon when the image fails to load', () => {
      const { container } = render(
        <AccountLogoAvatar account={{ type: 'B', providerLogoUrl: LOGO_URL }} />,
      );
      fireEvent.error(container.querySelector('img'));
      expect(container.querySelector('img')).not.toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('ignores a blank logo URL and shows the generic icon', () => {
      const { container } = render(
        <AccountLogoAvatar account={{ type: 'B', providerLogoUrl: '' }} />,
      );
      expect(container.querySelector('img')).not.toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('retries a new logo URL after a previous one failed for the same row', () => {
      const { container, rerender } = render(
        <AccountLogoAvatar account={{ type: 'B', providerLogoUrl: LOGO_URL }} />,
      );
      fireEvent.error(container.querySelector('img'));
      expect(container.querySelector('img')).not.toBeInTheDocument();

      const nextLogoUrl = 'https://cdn.saltedge.com/bank_icons/santander.png';
      rerender(<AccountLogoAvatar account={{ type: 'B', providerLogoUrl: nextLogoUrl }} />);

      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', nextLogoUrl);
    });
  });
});
