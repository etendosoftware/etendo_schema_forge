// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Render the Radix tooltip pieces inline so the content is synchronously in the
// DOM (no portal / hover / act warnings) and the manual-vs-queued key is assertable.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <>{children}</>,
  Tooltip: ({ children }) => <>{children}</>,
  TooltipTrigger: ({ children }) => <>{children}</>,
  TooltipContent: ({ children }) => <div data-testid="tip">{children}</div>,
}));

import { render, screen } from '@testing-library/react';
import { ComputedFreshnessHint } from '../ComputedFreshnessHint.jsx';

describe('ComputedFreshnessHint', () => {
  describe('renders nothing', () => {
    it('when computed is undefined', () => {
      const { container } = render(<ComputedFreshnessHint />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByTestId('Clock__2a800a')).not.toBeInTheDocument();
    });

    it('when computed.mode is not "stored"', () => {
      const { container } = render(<ComputedFreshnessHint computed={{ mode: 'live' }} />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByTestId('Clock__2a800a')).not.toBeInTheDocument();
    });

    it('when refresh is "synchronous" (stored but never stale)', () => {
      const { container } = render(
        <ComputedFreshnessHint computed={{ mode: 'stored', refresh: 'synchronous' }} />,
      );
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByTestId('Clock__2a800a')).not.toBeInTheDocument();
    });
  });

  describe('renders the clock hint', () => {
    it('uses the manual key for refresh === "manual"', () => {
      render(<ComputedFreshnessHint computed={{ mode: 'stored', refresh: 'manual' }} />);
      expect(screen.getByTestId('Clock__2a800a')).toBeInTheDocument();
      expect(screen.getByTestId('tip')).toHaveTextContent('computedFreshnessManual');
    });

    it('uses the queued key for refresh === "queued"', () => {
      render(<ComputedFreshnessHint computed={{ mode: 'stored', refresh: 'queued' }} />);
      expect(screen.getByTestId('Clock__2a800a')).toBeInTheDocument();
      expect(screen.getByTestId('tip')).toHaveTextContent('computedFreshnessQueued');
    });

    it('defaults to the queued key for any other refresh value', () => {
      render(<ComputedFreshnessHint computed={{ mode: 'stored', refresh: 'foo' }} />);
      expect(screen.getByTestId('Clock__2a800a')).toBeInTheDocument();
      expect(screen.getByTestId('tip')).toHaveTextContent('computedFreshnessQueued');
    });

    it('defaults to the queued key when refresh is absent', () => {
      render(<ComputedFreshnessHint computed={{ mode: 'stored' }} />);
      expect(screen.getByTestId('Clock__2a800a')).toBeInTheDocument();
      expect(screen.getByTestId('tip')).toHaveTextContent('computedFreshnessQueued');
    });
  });
});
