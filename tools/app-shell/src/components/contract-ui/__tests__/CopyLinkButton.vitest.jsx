// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => {
    const map = {
      copyLink: 'Copy link',
      linkCopied: 'Link copied',
      copyFailed: 'Failed to copy',
    };
    return map[key] || key;
  },
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <>{children}</>,
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: ({ children }) => <div data-testid="tip">{children}</div>,
}));

import { render, screen } from '@testing-library/react';
import CopyLinkButton from '../CopyLinkButton.jsx';

describe('CopyLinkButton', () => {
  it('renders nothing with 0 selected rows', () => {
    const { container } = render(<CopyLinkButton selectedRows={[]} windowName="sales-order" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing with 2+ selected rows', () => {
    const { container } = render(
      <CopyLinkButton selectedRows={[{ id: 'r1' }, { id: 'r2' }]} windowName="sales-order" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders with an accessible label and a hover tooltip when exactly 1 row is selected', () => {
    render(<CopyLinkButton selectedRows={[{ id: 'r1' }]} windowName="sales-order" />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.getByTestId('tip')).toHaveTextContent('Copy link');
  });
});
