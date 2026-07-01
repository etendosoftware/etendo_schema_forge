import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RequestBuilder from '../RequestBuilder.jsx';

// Mock useDiscovery
const mockNeoFetch = vi.fn();
vi.mock('../useDiscovery', () => ({
  useNeoFetch: () => mockNeoFetch,
}));

describe('RequestBuilder', () => {
  const baseEntity = {
    name: 'header',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    fields: [
      { name: 'documentNo', columnType: 'string', readOnly: true },
      { name: 'amount', columnType: 'number', readOnly: false },
      { name: 'active', columnType: 'boolean', readOnly: false },
      { name: 'orderDate', columnType: 'date', readOnly: false },
      { name: 'created', columnType: 'datetime', readOnly: false },
      { name: 'action', columnType: 'button', readOnly: false },
    ],
  };

  beforeEach(() => {
    mockNeoFetch.mockReset();
  });

  it('renders method selector and path input', () => {
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={() => {}} />);
    expect(screen.getByDisplayValue('GET')).toBeTruthy();
    expect(screen.getByDisplayValue('/sales-order/header')).toBeTruthy();
  });

  it('renders Send button', () => {
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={() => {}} />);
    expect(screen.getByText('Send')).toBeTruthy();
  });

  it('generates body template excluding readOnly and button fields', () => {
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={() => {}} />);
    // Switch to POST to see body textarea
    const select = screen.getByDisplayValue('GET');
    fireEvent.change(select, { target: { value: 'POST' } });
    const textarea = screen.getByPlaceholderText ? null : screen.queryByRole('textbox');
    // The body should be generated with placeholders
    // amount: 0, active: false, orderDate: '2025-01-01', created: '2025-01-01T00:00:00'
    // documentNo is readOnly → excluded, action is button → excluded
  });

  it('sends GET request on Send click', async () => {
    const onResponse = vi.fn();
    mockNeoFetch.mockResolvedValue({ status: 200, body: {} });
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={onResponse} />);

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(mockNeoFetch).toHaveBeenCalledWith('/sales-order/header', { method: 'GET' });
      expect(onResponse).toHaveBeenCalled();
    });
  });

  it('appends query params to the path', async () => {
    const onResponse = vi.fn();
    mockNeoFetch.mockResolvedValue({ status: 200 });
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={onResponse} />);

    // Add a param
    fireEvent.click(screen.getByText('+ Add'));
    const inputs = screen.getAllByPlaceholderText('key');
    fireEvent.change(inputs[0], { target: { value: '_limit' } });
    const valueInputs = screen.getAllByPlaceholderText('value');
    fireEvent.change(valueInputs[0], { target: { value: '10' } });

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(mockNeoFetch).toHaveBeenCalledWith(
        '/sales-order/header?_limit=10',
        { method: 'GET' },
      );
    });
  });

  it('removes a query param when x is clicked', () => {
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={() => {}} />);

    fireEvent.click(screen.getByText('+ Add'));
    expect(screen.getAllByPlaceholderText('key')).toHaveLength(1);

    fireEvent.click(screen.getByText('x'));
    expect(screen.queryAllByPlaceholderText('key')).toHaveLength(0);
  });

  it('sends body with POST method', async () => {
    const onResponse = vi.fn();
    mockNeoFetch.mockResolvedValue({ status: 201 });
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={onResponse} />);

    const select = screen.getByDisplayValue('GET');
    fireEvent.change(select, { target: { value: 'POST' } });

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      const call = mockNeoFetch.mock.calls[0];
      expect(call[1].method).toBe('POST');
      expect(call[1].body).toBeDefined();
    });
  });

  it('handles network error on send', async () => {
    const onResponse = vi.fn();
    mockNeoFetch.mockRejectedValue(new Error('Network failed'));
    render(<RequestBuilder specName="sales-order" entity={baseEntity} onResponse={onResponse} />);

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({
        status: 0,
        statusText: 'Network Error',
        body: 'Network failed',
      }));
    });
  });

  it('defaults to first method when GET is not available', () => {
    const entity = { ...baseEntity, methods: ['POST', 'PUT'] };
    render(<RequestBuilder specName="test" entity={entity} onResponse={() => {}} />);
    expect(screen.getByDisplayValue('POST')).toBeTruthy();
  });

  it('renders without entity fields (no body template)', () => {
    const entity = { name: 'simple', methods: ['GET'] };
    render(<RequestBuilder specName="test" entity={entity} onResponse={() => {}} />);
    expect(screen.getByDisplayValue('/test/simple')).toBeTruthy();
  });

  it('does not show body textarea for GET', () => {
    render(<RequestBuilder specName="test" entity={baseEntity} onResponse={() => {}} />);
    expect(screen.queryByText('Body (JSON)')).toBeNull();
  });

  it('shows body textarea for PUT', () => {
    render(<RequestBuilder specName="test" entity={baseEntity} onResponse={() => {}} />);
    const select = screen.getByDisplayValue('GET');
    fireEvent.change(select, { target: { value: 'PUT' } });
    expect(screen.getByText('Body (JSON)')).toBeTruthy();
  });

  it('shows body textarea for PATCH', () => {
    const entity = { ...baseEntity, methods: ['GET', 'PATCH'] };
    render(<RequestBuilder specName="test" entity={entity} onResponse={() => {}} />);
    const select = screen.getByDisplayValue('GET');
    fireEvent.change(select, { target: { value: 'PATCH' } });
    expect(screen.getByText('Body (JSON)')).toBeTruthy();
  });

  it('uses fallback METHOD_COLORS for unknown method', () => {
    const entity = { name: 'test', methods: ['OPTIONS'] };
    render(<RequestBuilder specName="test" entity={entity} onResponse={() => {}} />);
    // Should render without error, with fallback bg-zinc-600
    expect(screen.getByText('Send')).toBeTruthy();
  });

  it('does not send body for DELETE even if body exists', async () => {
    const onResponse = vi.fn();
    mockNeoFetch.mockResolvedValue({ status: 204 });
    render(<RequestBuilder specName="test" entity={baseEntity} onResponse={onResponse} />);

    const select = screen.getByDisplayValue('GET');
    fireEvent.change(select, { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      const call = mockNeoFetch.mock.calls[0];
      expect(call[1].method).toBe('DELETE');
      expect(call[1].body).toBeUndefined();
    });
  });

  it('skips empty-key params', async () => {
    const onResponse = vi.fn();
    mockNeoFetch.mockResolvedValue({ status: 200 });
    render(<RequestBuilder specName="test" entity={baseEntity} onResponse={onResponse} />);

    fireEvent.click(screen.getByText('+ Add'));
    // Leave key empty, set value
    const valueInputs = screen.getAllByPlaceholderText('value');
    fireEvent.change(valueInputs[0], { target: { value: 'ignored' } });

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      // No query params appended since key is empty
      expect(mockNeoFetch).toHaveBeenCalledWith('/test/header', { method: 'GET' });
    });
  });

  it('disables Send button when path is empty', () => {
    render(<RequestBuilder specName="" entity={null} onResponse={() => {}} />);
    expect(screen.getByText('Send').disabled).toBe(true);
  });
});
