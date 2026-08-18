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

import { render, screen, fireEvent } from '@testing-library/react';
import { toast } from 'sonner';
import CopyRecordLinkButton from '../CopyRecordLinkButton.jsx';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CopyRecordLinkButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://etendogo.example.com' },
      writable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('renders nothing when recordId is the "new" sentinel', () => {
    const { container } = render(<CopyRecordLinkButton recordId="new" windowName="sales-order" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without a recordId', () => {
    const { container } = render(<CopyRecordLinkButton windowName="sales-order" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders with an accessible label and a hover tooltip for a persisted record', () => {
    render(<CopyRecordLinkButton recordId="r1" windowName="sales-order" />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.getByTestId('tip')).toHaveTextContent('Copy link');
  });

  it('copies the record URL and toasts on click', async () => {
    render(<CopyRecordLinkButton recordId="r1" windowName="sales-order" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://etendogo.example.com/sales-order/r1');
    expect(toast.success).toHaveBeenCalledWith('Link copied');
  });
});
