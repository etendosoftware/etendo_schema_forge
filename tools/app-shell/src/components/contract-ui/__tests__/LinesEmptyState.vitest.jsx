// Render tests for the shared LinesEmptyState — focuses on the import-only
// lines pattern (ETP-4462, canAddLine=false): the manual "+ add lines" primary
// button must disappear while the secondaryAction (e.g. an import trigger) and
// the description keep rendering. DetailView computes canAddLine from the
// generated always-false addLineGuard emitted for windows that declare
// window.maxDetailLines = 0 in decisions.json. Complements the source-reading
// suite in LinesEmptyState.test.js (node:test).
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LinesEmptyState from '../LinesEmptyState.jsx';

const DRAFT = { id: 'H1', documentStatus: 'DR' };

describe('LinesEmptyState (render)', () => {
  describe('default mode (canAddLine omitted / true)', () => {
    it('renders title, default description and the primary add button', () => {
      render(<LinesEmptyState data={DRAFT} onAddLine={vi.fn()} />);
      expect(screen.getByTestId('lines-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('lines-empty-state-title')).toHaveTextContent('noLinesYet');
      expect(screen.getByTestId('lines-empty-state-description')).toHaveTextContent('addLinesManually');
      expect(screen.getByTestId('action-add-lines-empty-state')).toBeInTheDocument();
    });

    it('calls onAddLine when the primary button is clicked', async () => {
      const user = userEvent.setup();
      const onAddLine = vi.fn();
      render(<LinesEmptyState data={DRAFT} onAddLine={onAddLine} />);
      await user.click(screen.getByTestId('action-add-lines-empty-state'));
      expect(onAddLine).toHaveBeenCalledTimes(1);
    });

    it('renders both the primary button and a secondaryAction side by side', () => {
      render(
        <LinesEmptyState
          data={DRAFT}
          onAddLine={vi.fn()}
          secondaryAction={<button type="button" data-testid="secondary-action">import</button>}
        />
      );
      expect(screen.getByTestId('action-add-lines-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('secondary-action')).toBeInTheDocument();
    });
  });

  describe('import-only mode (canAddLine=false)', () => {
    it('hides the primary add button but keeps the secondaryAction', () => {
      render(
        <LinesEmptyState
          data={DRAFT}
          onAddLine={vi.fn()}
          canAddLine={false}
          secondaryAction={<button type="button" data-testid="secondary-action">import</button>}
        />
      );
      expect(screen.queryByTestId('action-add-lines-empty-state')).not.toBeInTheDocument();
      expect(screen.getByTestId('secondary-action')).toBeInTheDocument();
    });

    it('still shows the description (custom prop override)', () => {
      render(
        <LinesEmptyState
          data={DRAFT}
          onAddLine={vi.fn()}
          canAddLine={false}
          description="linesImportOnlyFromShipment"
          secondaryAction={<button type="button" data-testid="secondary-action">import</button>}
        />
      );
      expect(screen.getByTestId('lines-empty-state-description')).toHaveTextContent('linesImportOnlyFromShipment');
      expect(screen.getByTestId('lines-empty-state-title')).toHaveTextContent('noLinesYet');
    });

    it('renders no buttons at all when secondaryAction is also absent', () => {
      render(<LinesEmptyState data={DRAFT} onAddLine={vi.fn()} canAddLine={false} />);
      expect(screen.getByTestId('lines-empty-state')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('draft gating', () => {
    it('renders nothing when the document is not in draft', () => {
      const { container } = render(
        <LinesEmptyState data={{ id: 'H1', documentStatus: 'CO' }} onAddLine={vi.fn()} />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('renders when documentStatus is missing (new record)', () => {
      render(<LinesEmptyState data={{ id: 'H1' }} onAddLine={vi.fn()} />);
      expect(screen.getByTestId('lines-empty-state')).toBeInTheDocument();
    });
  });
});
