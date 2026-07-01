import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

const mockUseSpecDetail = vi.fn();
vi.mock('../useDiscovery', () => ({
  useSpecDetail: (...args) => mockUseSpecDetail(...args),
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntityPanel from '../EntityPanel.jsx';

describe('EntityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Select a spec" when specName is falsy', () => {
    mockUseSpecDetail.mockReturnValue({ spec: null, loading: false, error: null });
    render(<EntityPanel specName="" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText('Select a spec')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseSpecDetail.mockReturnValue({ spec: null, loading: true, error: null });
    render(<EntityPanel specName="test-spec" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseSpecDetail.mockReturnValue({ spec: null, loading: false, error: 'Failed to load' });
    render(<EntityPanel specName="test-spec" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('returns null when spec is null and not loading/error', () => {
    mockUseSpecDetail.mockReturnValue({ spec: null, loading: false, error: null });
    const { container } = render(<EntityPanel specName="test-spec" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders spec name and type for a Window', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: { name: 'Sales Order', type: 'W', entities: [] },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText('Sales Order')).toBeInTheDocument();
    expect(screen.getByText(/Window/)).toBeInTheDocument();
    expect(screen.getByText(/0 entities/)).toBeInTheDocument();
  });

  it('renders spec name and type for a Process', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: { name: 'Post Invoice', type: 'P', entities: [] },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="post-invoice" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText(/Process/)).toBeInTheDocument();
  });

  it('renders entities with methods', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: {
        name: 'Sales Order',
        type: 'W',
        entities: [
          { name: 'header', methods: ['GET', 'POST', 'PUT'], tabLevel: 0 },
          { name: 'line', methods: ['GET', 'DELETE'], tabLevel: 1, fields: [{ name: 'qty' }, { name: 'product' }] },
        ],
      },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText('header')).toBeInTheDocument();
    expect(screen.getByText('line')).toBeInTheDocument();
    // GET appears on both entities, so use getAllByText
    const getLabels = screen.getAllByText('GET');
    expect(getLabels.length).toBe(2);
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('DELETE')).toBeInTheDocument();
    expect(screen.getByText('2 fields')).toBeInTheDocument();
  });

  it('shows tab level indicator for nested entities', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: {
        name: 'Sales Order',
        type: 'W',
        entities: [
          { name: 'line', methods: ['GET'], tabLevel: 2 },
        ],
      },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText('L2')).toBeInTheDocument();
  });

  it('does not show tab level for level 0', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: {
        name: 'Sales Order',
        type: 'W',
        entities: [
          { name: 'header', methods: ['GET'], tabLevel: 0 },
        ],
      },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.queryByText('L0')).not.toBeInTheDocument();
  });

  it('calls onSelectEntity when entity button is clicked', async () => {
    const user = userEvent.setup();
    const onSelectEntity = vi.fn();
    const entity = { name: 'header', methods: ['GET'], tabLevel: 0 };
    mockUseSpecDetail.mockReturnValue({
      spec: { name: 'Sales Order', type: 'W', entities: [entity] },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={onSelectEntity} />);
    await user.click(screen.getByText('header'));
    expect(onSelectEntity).toHaveBeenCalledWith(entity);
  });

  it('highlights the selected entity', () => {
    const entity = { name: 'header', methods: ['GET'], tabLevel: 0 };
    mockUseSpecDetail.mockReturnValue({
      spec: { name: 'Sales Order', type: 'W', entities: [entity] },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={entity} onSelectEntity={vi.fn()} />);
    const button = screen.getByRole('button', { name: /header/ });
    expect(button.className).toContain('bg-zinc-800');
  });

  it('handles entity without methods array', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: {
        name: 'Sales Order',
        type: 'W',
        entities: [{ name: 'header', tabLevel: 0 }],
      },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText('header')).toBeInTheDocument();
  });

  it('handles entity without fields', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: {
        name: 'Sales Order',
        type: 'W',
        entities: [{ name: 'header', methods: ['GET'], tabLevel: 0 }],
      },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.queryByText(/fields/)).not.toBeInTheDocument();
  });

  it('renders entity count in header', () => {
    mockUseSpecDetail.mockReturnValue({
      spec: {
        name: 'Sales Order',
        type: 'W',
        entities: [
          { name: 'header', methods: ['GET'], tabLevel: 0 },
          { name: 'line', methods: ['GET'], tabLevel: 1 },
        ],
      },
      loading: false,
      error: null,
    });
    render(<EntityPanel specName="sales-order" selectedEntity={null} onSelectEntity={vi.fn()} />);
    expect(screen.getByText(/2 entities/)).toBeInTheDocument();
  });
});
