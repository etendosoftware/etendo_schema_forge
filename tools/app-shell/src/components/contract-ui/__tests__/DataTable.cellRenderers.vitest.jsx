import React from 'react';
import { render, screen } from '@testing-library/react';

const statusLabelMock = vi.fn((raw, _dict, _translate, enumLabels) => {
  if (enumLabels?.[raw] != null) return `enum:${enumLabels[raw]}`;
  return `status-label-${raw}`;
});

vi.mock('@/lib/statusBadge.js', async () => {
  const actual = await vi.importActual('@/lib/statusBadge.js');
  return {
    getStatusDotColor: (raw) => `dot-${raw ?? 'none'}`,
    getStatusTone: actual.getStatusTone,
    statusLabel: (...args) => statusLabelMock(...args),
  };
});

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label, tone }) => (
    <span data-testid="status-tag" data-status={status} data-tone={tone}>{label || status}</span>
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

const useNeoImageMock = vi.fn();

vi.mock('@/hooks/useNeoImage', () => ({
  useNeoImage: (...args) => useNeoImageMock(...args),
}));

vi.mock('@/components/ui/box-icon', () => ({
  BoxIcon: () => <span data-testid="box-icon" />,
}));

import {
  CELL_RENDERERS,
  renderAmountCell,
  renderBooleanCell,
  renderDateCell,
  renderDefaultCell,
  renderEnumCell,
  renderMultiFieldCell,
  renderPercentCell,
  renderSignedDeltaCell,
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
      signedDelta: renderSignedDeltaCell,
      multiField: renderMultiFieldCell,
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

  it('passes the real (local) tone for RPR so StatusTag renders it as deposited (success), not the stale published-package classification', () => {
    renderCell(renderStatusCell({
      ...baseContext,
      row: { id: '1', status: 'RPR' },
      col: { key: 'status', type: 'status' },
    }));

    const tag = screen.getByTestId('status-tag');
    expect(tag).toHaveAttribute('data-tone', 'success');
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
    expect(container.querySelector('.bg-status-warning')).toBeTruthy();
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
    expect(container.querySelector('.text-status-success-foreground')).toBeTruthy();
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

describe('renderSignedDeltaCell', () => {
  it('renders a negative value as "-N" with the negative color', () => {
    const { container } = renderCell(renderSignedDeltaCell({
      ...baseContext,
      row: { id: '1', etgoQtydiff: -8 },
      col: { key: 'etgoQtydiff', type: 'signedDelta' },
    }));

    const cell = screen.getByText('-8');
    expect(cell).toBeInTheDocument();
    expect(cell.style.color).toBe('hsl(var(--destructive))');
    expect(container.querySelector('span.text-right.tabular-nums')).toBeTruthy();
  });

  it('renders exactly-zero as "±0" with the neutral color', () => {
    renderCell(renderSignedDeltaCell({
      ...baseContext,
      row: { id: '1', etgoQtydiff: 0 },
      col: { key: 'etgoQtydiff', type: 'signedDelta' },
    }));

    const cell = screen.getByText('±0');
    expect(cell).toBeInTheDocument();
    expect(cell.style.color).toBe('hsl(var(--foreground))');
  });

  it('renders a positive value as "+N" with the positive color', () => {
    renderCell(renderSignedDeltaCell({
      ...baseContext,
      row: { id: '1', etgoQtydiff: 2 },
      col: { key: 'etgoQtydiff', type: 'signedDelta' },
    }));

    const cell = screen.getByText('+2');
    expect(cell).toBeInTheDocument();
    expect(cell.style.color).toBe('var(--status-success-fg)');
  });

  it('renders the signed text with fontWeight 600', () => {
    renderCell(renderSignedDeltaCell({
      ...baseContext,
      row: { id: '1', etgoQtydiff: -3 },
      col: { key: 'etgoQtydiff', type: 'signedDelta' },
    }));

    expect(screen.getByText('-3').style.fontWeight).toBe('600');
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

describe('renderMultiFieldCell', () => {
  beforeEach(() => {
    useNeoImageMock.mockReset();
    useNeoImageMock.mockReturnValue(null);
  });

  it('renders the title in bold from row[col.title]', () => {
    const { container } = renderCell(renderMultiFieldCell({
      row: { id: '1', name: 'Widget A' },
      col: { key: 'name', type: 'multiField', title: 'name' },
      token: 'tok',
      apiBaseUrl: '/api',
    }));

    const title = screen.getByText('Widget A');
    expect(title.className).toBe('text-sm font-semibold text-[hsl(var(--foreground))] leading-5');
    expect(container.querySelector('.flex.items-center.gap-3')).toBeTruthy();
  });

  it('renders the subtitle chip only when row[col.subtitle] is present', () => {
    renderCell(renderMultiFieldCell({
      row: { id: '1', name: 'Widget A', searchKey: 'SKU-1' },
      col: { key: 'name', type: 'multiField', title: 'name', subtitle: 'searchKey' },
      token: 'tok',
      apiBaseUrl: '/api',
    }));

    const chip = screen.getByText('SKU-1');
    expect(chip.className).toBe(
      'inline-flex items-center px-2 py-0.5 bg-[hsl(var(--muted))] rounded-full text-xs text-[hsl(var(--muted-foreground))] leading-4 w-fit',
    );
  });

  it('omits the subtitle chip when row[col.subtitle] is absent', () => {
    renderCell(renderMultiFieldCell({
      row: { id: '1', name: 'Widget A' },
      col: { key: 'name', type: 'multiField', title: 'name', subtitle: 'searchKey' },
      token: 'tok',
      apiBaseUrl: '/api',
    }));

    expect(screen.queryByText('SKU-1')).toBeNull();
  });

  it('does not render a media box when col.media is not configured', () => {
    const { container } = renderCell(renderMultiFieldCell({
      row: { id: '1', name: 'Widget A' },
      col: { key: 'name', type: 'multiField', title: 'name' },
      token: 'tok',
      apiBaseUrl: '/api',
    }));

    expect(container.querySelector('.w-10.h-10.rounded-lg')).toBeNull();
    expect(useNeoImageMock).toHaveBeenCalledWith(undefined, 'tok', '/api');
  });

  it('renders the resolved image when useNeoImage returns a url', () => {
    useNeoImageMock.mockReturnValue('blob:fake-url');
    const { container } = renderCell(renderMultiFieldCell({
      row: { id: '1', name: 'Widget A', image: 'img-1' },
      col: { key: 'name', type: 'multiField', title: 'name', media: { field: 'image', kind: 'neoImage', fallback: 'box' } },
      token: 'tok',
      apiBaseUrl: '/api',
    }));

    const box = container.querySelector('.w-10.h-10.rounded-lg.bg-\\[hsl\\(var\\(--muted\\)\\)\\]');
    expect(box).toBeTruthy();
    const img = box.querySelector('img');
    expect(img).toHaveAttribute('src', 'blob:fake-url');
    expect(img).toHaveAttribute('alt', 'Widget A');
    expect(useNeoImageMock).toHaveBeenCalledWith('img-1', 'tok', '/api');
  });

  it('renders the BoxIcon fallback when useNeoImage returns null', () => {
    useNeoImageMock.mockReturnValue(null);
    const { container } = renderCell(renderMultiFieldCell({
      row: { id: '1', name: 'Widget A', image: 'img-1' },
      col: { key: 'name', type: 'multiField', title: 'name', media: { field: 'image', kind: 'neoImage', fallback: 'box' } },
      token: 'tok',
      apiBaseUrl: '/api',
    }));

    const box = container.querySelector('.w-10.h-10.rounded-lg.bg-\\[hsl\\(var\\(--muted\\)\\)\\]');
    expect(box).toBeTruthy();
    expect(screen.getByTestId('box-icon')).toBeInTheDocument();
    expect(box.querySelector('img')).toBeNull();
  });
});
