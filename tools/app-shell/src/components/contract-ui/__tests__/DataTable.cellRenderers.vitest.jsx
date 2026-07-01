import React from 'react';
import { render, screen } from '@testing-library/react';

const statusLabelMock = vi.fn((raw, _dict, _translate, enumLabels) => {
  if (enumLabels?.[raw] != null) return `enum:${enumLabels[raw]}`;
  return `status-label-${raw}`;
});

vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: (raw) => `dot-${raw ?? 'none'}`,
  statusLabel: (...args) => statusLabelMock(...args),
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => (
    <span data-testid="status-tag" data-status={status}>{label || status}</span>
  ),
}));

vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, disabled, onCheckedChange, 'aria-label': ariaLabel }) => (
    <input
      type="checkbox"
      data-testid="switch"
      role="switch"
      aria-label={ariaLabel}
      checked={!!checked}
      disabled={!!disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val, currency) => `${currency ?? ''}${val != null ? String(val) : ''}`.trim(),
}));

import {
  CELL_RENDERERS,
  renderAmountCell,
  renderBooleanCell,
  renderDateCell,
  renderDefaultCell,
  renderEnumCell,
  renderPercentCell,
  renderStatusCell,
} from '../DataTable.cellRenderers.jsx';

const baseContext = {
  row: { id: '1' },
  col: { key: 'value', label: 'Value' },
  display: 'Display',
  rawValue: 'Display',
  toggleKey: '1:value',
  visibleColumns: [],
  tMenu: (value) => value,
  dictionary: {},
  savingToggles: {},
  handleInlineToggle: vi.fn(),
  locale: 'en_US',
  t: (value) => value,
  ui: (key) => ({ yes: 'yes', no: 'no', statusComplete: 'Complete', statusInProcess: 'In Process' }[key] ?? key),
  dateFormatter: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
};

function renderCell(node) {
  return render(<div data-testid="cell">{node}</div>);
}

describe('CELL_RENDERERS', () => {
  it('exposes a renderer for every accepted DataTable cell type', () => {
    expect(CELL_RENDERERS).toMatchObject({
      enum: renderEnumCell,
      status: renderStatusCell,
      percent: renderPercentCell,
      boolean: renderBooleanCell,
      date: renderDateCell,
      amount: renderAmountCell,
      default: renderDefaultCell,
    });
  });
});

describe('renderEnumCell', () => {
  it('maps enumLabels and renders the display label', () => {
    renderCell(renderEnumCell({
      ...baseContext,
      col: { key: 'kind', type: 'enum', enumLabels: { A: 'Alpha' } },
      rawValue: 'A',
    }));

    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
});

describe('renderStatusCell', () => {
  it('renders StatusTag by default', () => {
    renderCell(renderStatusCell({
      ...baseContext,
      row: { id: '1', status: 'CO' },
      col: { key: 'status', type: 'status' },
    }));

    const tag = screen.getByTestId('status-tag');
    expect(tag).toHaveAttribute('data-status', 'CO');
    expect(tag).toHaveTextContent('status-label-CO');
  });

  it('passes col.enumLabels to statusLabel and renders the resolved label', () => {
    // statusLabelMock (defined at module scope) is wired into the vi.mock factory.
    // When col.enumLabels is provided, the mock returns `enum:<value>` so we can
    // assert both the call signature and the rendered output.
    statusLabelMock.mockClear();
    const enumLabels = { true: 'statusProcessed', false: 'statusDraft' };

    renderCell(renderStatusCell({
      ...baseContext,
      row: { id: '1', processed: true },
      col: { key: 'processed', type: 'status', enumLabels },
    }));

    // Verify statusLabel was invoked with the enumLabels map as 4th argument
    expect(statusLabelMock).toHaveBeenCalledWith(
      true,
      expect.anything(),
      expect.anything(),
      enumLabels,
    );

    // The label returned by the mock (enum:statusProcessed) must appear in the tag
    const tag = screen.getByTestId('status-tag');
    expect(tag).toHaveTextContent('enum:statusProcessed');
  });
});

describe('renderPercentCell', () => {
  it('renders the percentage with the expected palette', () => {
    const { container } = renderCell(renderPercentCell({
      ...baseContext,
      row: { id: '1', progress: 45 },
      col: { key: 'progress', type: 'percent' },
    }));

    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(container.querySelector('.bg-amber-400')).toBeTruthy();
  });
});

describe('renderBooleanCell', () => {
  it('renders the boolean fallback label and color', () => {
    const { container } = renderCell(renderBooleanCell({
      ...baseContext,
      col: { key: 'active', label: 'Active', type: 'boolean' },
      rawValue: true,
    }));

    expect(screen.getByText('yes')).toBeInTheDocument();
    expect(container.querySelector('.text-emerald-600')).toBeTruthy();
  });
});

describe('renderDateCell', () => {
  it('renders an em dash when the value is empty', () => {
    renderCell(renderDateCell({
      ...baseContext,
      row: { id: '1', date: null },
      col: { key: 'date', type: 'date' },
    }));

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('renderAmountCell', () => {
  it('renders formatted amount with currency inside a tabular span', () => {
    const { container } = renderCell(renderAmountCell({
      ...baseContext,
      row: { id: '1', total: 1234.5, 'currency$_identifier': 'USD' },
      col: { key: 'total', type: 'amount' },
    }));

    expect(screen.getByText('USD1234.5')).toBeInTheDocument();
    expect(container.querySelector('span.tabular-nums')).toBeTruthy();
  });
});

describe('renderDefaultCell', () => {
  it('truncates long string display values', () => {
    const long = 'x'.repeat(40);
    const { container } = renderCell(renderDefaultCell({
      ...baseContext,
      display: long,
      rawValue: long,
      col: { key: 'note', type: 'string' },
      visibleColumns: [{ key: 'name', type: 'string' }, { key: 'note', type: 'string' }],
    }));

    const truncated = container.querySelector('span.truncate');
    expect(truncated).toBeTruthy();
    expect(truncated).toHaveAttribute('title', long);
    expect(truncated).toHaveTextContent(long);
  });
});
