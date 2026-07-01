import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

const mockRefreshSpec = vi.fn();
vi.mock('../useDiscovery', () => ({
  useSpecDetail: () => ({ spec: { name: 'test-spec', entities: [] }, loading: false, error: null, refresh: mockRefreshSpec }),
}));

vi.mock('../SpecList', () => ({
  default: ({ selected, onSelect }) => (
    <div data-testid="spec-list">
      <button data-testid="spec-item-sales" onClick={() => onSelect('sales-order')}>sales-order</button>
      <button data-testid="spec-item-purchase" onClick={() => onSelect('purchase-order')}>purchase-order</button>
    </div>
  ),
}));

vi.mock('../AddSpec', () => ({
  default: ({ onCreated }) => (
    <div data-testid="add-spec">
      <button data-testid="add-spec-btn" onClick={onCreated}>Add</button>
    </div>
  ),
}));

vi.mock('../EntityPanel', () => ({
  default: ({ specName, onSelectEntity }) => (
    <div data-testid="entity-panel">
      <span>{specName || 'none'}</span>
      <button data-testid="select-entity" onClick={() => onSelectEntity({ name: 'header', methods: ['GET'] })}>Select Entity</button>
    </div>
  ),
}));

vi.mock('../RequestBuilder', () => ({
  default: ({ specName, entity, onResponse }) => (
    <div data-testid="request-builder">
      <span>{specName}-{entity?.name || 'none'}</span>
      <button data-testid="send-request" onClick={() => onResponse({ status: 200, data: [] })}>Send</button>
    </div>
  ),
}));

vi.mock('../ResponseViewer', () => ({
  default: ({ response }) => (
    <div data-testid="response-viewer">{response ? JSON.stringify(response) : 'no response'}</div>
  ),
}));

vi.mock('../SpecManager', () => ({
  default: ({ spec, onRefresh }) => (
    <div data-testid="spec-manager">
      <span>{spec?.name}</span>
      <button data-testid="refresh-spec-manager" onClick={onRefresh}>Refresh</button>
    </div>
  ),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams],
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExplorerPage from '../ExplorerPage.jsx';

describe('ExplorerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('renders without crashing', () => {
    render(<ExplorerPage />);
    expect(screen.getByText('NEO Explorer')).toBeInTheDocument();
  });

  it('shows test mode by default', () => {
    render(<ExplorerPage />);
    expect(screen.getByTestId('entity-panel')).toBeInTheDocument();
    expect(screen.getByTestId('request-builder')).toBeInTheDocument();
    expect(screen.getByTestId('response-viewer')).toBeInTheDocument();
  });

  it('renders spec list', () => {
    render(<ExplorerPage />);
    expect(screen.getByTestId('spec-list')).toBeInTheDocument();
  });

  it('selects a spec when clicked', async () => {
    const user = userEvent.setup();
    render(<ExplorerPage />);
    await user.click(screen.getByTestId('spec-item-sales'));
    expect(screen.getByTestId('entity-panel')).toHaveTextContent('sales-order');
  });

  it('switches to manage mode', async () => {
    const user = userEvent.setup();
    render(<ExplorerPage />);
    await user.click(screen.getByText('Manage'));
    expect(screen.getByTestId('spec-manager')).toBeInTheDocument();
    expect(screen.getByTestId('add-spec')).toBeInTheDocument();
    expect(screen.queryByTestId('entity-panel')).not.toBeInTheDocument();
  });

  it('switches back to test mode', async () => {
    const user = userEvent.setup();
    render(<ExplorerPage />);
    await user.click(screen.getByText('Manage'));
    await user.click(screen.getByText('Test'));
    expect(screen.getByTestId('entity-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('spec-manager')).not.toBeInTheDocument();
  });

  it('does not show AddSpec in test mode', () => {
    render(<ExplorerPage />);
    expect(screen.queryByTestId('add-spec')).not.toBeInTheDocument();
  });

  it('selects an entity via entity panel', async () => {
    const user = userEvent.setup();
    render(<ExplorerPage />);
    await user.click(screen.getByTestId('select-entity'));
    expect(screen.getByTestId('request-builder')).toHaveTextContent('header');
  });

  it('receives a response from request builder', async () => {
    const user = userEvent.setup();
    render(<ExplorerPage />);
    await user.click(screen.getByTestId('send-request'));
    expect(screen.getByTestId('response-viewer')).toHaveTextContent('200');
  });

  it('initializes spec from URL search params', () => {
    mockSearchParams = new URLSearchParams({ spec: 'purchase-order' });
    render(<ExplorerPage />);
    expect(screen.getByTestId('entity-panel')).toHaveTextContent('purchase-order');
  });

  it('resets entity and response when selecting a different spec', async () => {
    const user = userEvent.setup();
    render(<ExplorerPage />);
    // Select entity and get response
    await user.click(screen.getByTestId('select-entity'));
    await user.click(screen.getByTestId('send-request'));
    expect(screen.getByTestId('request-builder')).toHaveTextContent('header');

    // Switch to a different spec
    await user.click(screen.getByTestId('spec-item-purchase'));
    expect(screen.getByTestId('request-builder')).toHaveTextContent('purchase-order-none');
    expect(screen.getByTestId('response-viewer')).toHaveTextContent('no response');
  });

  it('has mode toggle buttons', () => {
    render(<ExplorerPage />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
  });
});
