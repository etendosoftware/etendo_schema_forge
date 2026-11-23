// @covers tools/app-shell/src/components/contract-ui/LinesBottomSection.jsx
// @covers tools/app-shell/src/components/contract-ui/LinesEmptyState.jsx
// ETP-6232 — behaviour of the shared components after the docStatus migration: editable only in
// draft, for every lifecycle status (DR/CO/VO/UE) and for an absent/unknown one.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));
vi.mock('../DocumentTotalsPanel.jsx', () => ({
  default: ({ readOnly }) => <div data-testid="totals-panel" data-readonly={String(Boolean(readOnly))} />,
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LinesBottomSection from '../LinesBottomSection.jsx';
import LinesEmptyState from '../LinesEmptyState.jsx';

const Docs = () => <div />;

describe('LinesBottomSection totals read-only (docStatus)', () => {
  it.each([
    ['DR', 'false'],
    ['CO', 'true'],
    ['VO', 'true'],
    ['UE', 'true'],
    ['XX', 'true'],
    [undefined, 'true'],
  ])('status %s -> readOnly=%s', (documentStatus, expected) => {
    render(<LinesBottomSection data={{ documentStatus }} lines={[]} notesField="description" relatedDocuments={Docs} />);
    expect(screen.getByTestId('totals-panel').dataset.readonly).toBe(expected);
  });

  it('stays read-only on a draft when the document itself is read-only', () => {
    render(<LinesBottomSection data={{ documentStatus: 'DR' }} isDocumentReadOnly lines={[]} notesField="description" relatedDocuments={Docs} />);
    expect(screen.getByTestId('totals-panel').dataset.readonly).toBe('true');
  });
});

describe('LinesEmptyState visibility (docStatus)', () => {
  it.each([
    ['DR', true],
    [undefined, true],
    ['CO', false],
    ['VO', false],
    ['UE', false],
    ['XX', false],
  ])('status %s -> shown=%s', (documentStatus, shown) => {
    const { container } = render(<LinesEmptyState data={{ id: 'H1', documentStatus }} onAddLine={() => {}} />);
    expect(Boolean(container.querySelector('[data-testid="lines-empty-state"]'))).toBe(shown);
  });
});
