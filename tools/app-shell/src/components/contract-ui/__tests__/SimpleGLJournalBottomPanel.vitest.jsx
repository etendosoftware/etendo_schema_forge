// @covers artifacts/simple-g-l-journal/custom/SimpleGLJournalBottomPanel.jsx
//
// ETP-5611 — the manual-journal lines empty state. The component lives under `artifacts/**`,
// which vitest's `src/**` include never discovers, so the test lives here and reaches it through
// the `@generated` alias (same convention as AmortizationBulkActions.vitest.jsx).
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import { render, screen } from '@testing-library/react';
import SimpleGLJournalBottomPanel from '@generated/simple-g-l-journal/custom/SimpleGLJournalBottomPanel.jsx';

const EmptyState = SimpleGLJournalBottomPanel.linesEmptyState;

describe('SimpleGLJournalBottomPanel', () => {
  it('renders nothing itself — the balance row lives inside the lines grid', () => {
    const { container } = render(<SimpleGLJournalBottomPanel data={{ id: 'H1' }} />);
    expect(container).toBeEmptyDOMElement();
    expect(SimpleGLJournalBottomPanel.showLineTotals).toBe(false);
  });

  it('unsaved header: shows the message without the add button, even when lines could be added', () => {
    render(<EmptyState data={{ documentStatus: 'DR' }} canAddLine onAddLine={vi.fn()} />);
    expect(screen.getByTestId('lines-empty-state-title')).toHaveTextContent('noLinesYet');
    expect(screen.getByTestId('lines-empty-state-description')).toHaveTextContent('addLinesManually');
    expect(screen.queryByTestId('action-add-lines-empty-state')).not.toBeInTheDocument();
  });

  it('saved draft header: shows the message and the add button', () => {
    render(<EmptyState data={{ id: 'H1', documentStatus: 'DR' }} canAddLine onAddLine={vi.fn()} />);
    expect(screen.getByTestId('action-add-lines-empty-state')).toBeInTheDocument();
  });

  it('saved header that cannot add lines yet (required header fields missing): no button', () => {
    render(<EmptyState data={{ id: 'H1', documentStatus: 'DR' }} canAddLine={false} onAddLine={vi.fn()} />);
    expect(screen.getByTestId('lines-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('action-add-lines-empty-state')).not.toBeInTheDocument();
  });

  it('completed journal: no empty state at all', () => {
    render(<EmptyState data={{ id: 'H1', documentStatus: 'CO' }} canAddLine onAddLine={vi.fn()} />);
    expect(screen.queryByTestId('lines-empty-state')).not.toBeInTheDocument();
  });
});
