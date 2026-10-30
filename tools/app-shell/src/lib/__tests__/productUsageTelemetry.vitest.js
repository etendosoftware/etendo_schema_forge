// @covers tools/app-shell/src/lib/productUsageTelemetry.js
const observabilityMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/lib/observability.js', () => ({
  track: observabilityMocks.track,
}));

import {
  isCompletionProcess,
  trackDocumentCompleted,
  trackProductMovementsTabOpened,
  trackRecordCreated,
  trackRecordUpdated,
  trackSearchPerformed,
  trackSearchResultSelected,
  trackWindowOpened,
} from '../productUsageTelemetry.js';
import { clearSessionIdentity, setSessionIdentity } from '../sessionIdentity.js';

describe('productUsageTelemetry', () => {
  beforeEach(() => {
    observabilityMocks.track.mockReset();
    observabilityMocks.track.mockResolvedValue(undefined);
  });

  it('tracks window openings with product usage defaults', () => {
    trackWindowOpened({ entity: 'salesOrder', specName: 'sales-order' });

    expect(observabilityMocks.track).toHaveBeenCalledWith('window_opened', {
      category: 'product_usage',
      entity: 'salesOrder',
      specName: 'sales-order',
      source: 'contract_ui',
    });
  });

  it('tracks searches without unsafe query or record properties', () => {
    trackSearchPerformed({
      entity: 'salesOrder',
      specName: 'sales-order',
      count: 2,
      query: 'Acme',
      recordId: '123',
    });

    expect(observabilityMocks.track).toHaveBeenCalledWith('search_performed', {
      attempt: 1,
      category: 'product_usage',
      count: 2,
      entity: 'salesOrder',
      source: 'list_filter',
      specName: 'sales-order',
      type: 'filter',
    });
  });

  describe('product movements tab opened (ETP-5889)', () => {
    afterEach(() => {
      clearSessionIdentity();
    });

    it('tracks the tab opening with the tenant and the default source', () => {
      setSessionIdentity({ clientId: 'client-1' });

      trackProductMovementsTabOpened({ entity: 'product', specName: 'product' });

      expect(observabilityMocks.track).toHaveBeenCalledWith('product_movements_tab_opened', {
        account_id: 'client-1',
        category: 'product_usage',
        entity: 'product',
        source: 'tab',
        specName: 'product',
      });
    });

    it('reports the side panel link as the source when the user comes from there', () => {
      setSessionIdentity({ clientId: 'client-1' });

      trackProductMovementsTabOpened({ entity: 'product', source: 'side_panel_link' });

      expect(observabilityMocks.track).toHaveBeenCalledWith(
        'product_movements_tab_opened',
        expect.objectContaining({ source: 'side_panel_link' }),
      );
    });

    it('omits the account when nobody is signed in', () => {
      trackProductMovementsTabOpened({ entity: 'product' });

      const [, properties] = observabilityMocks.track.mock.calls[0];
      expect(properties).not.toHaveProperty('account_id');
    });

    it('never sends the product, the record, the user or the role', () => {
      setSessionIdentity({ clientId: 'client-1', username: 'jane' });

      trackProductMovementsTabOpened({
        entity: 'product',
        recordId: '88AD998AD10841F99D4F605014113EE3',
        productId: '88AD998AD10841F99D4F605014113EE3',
        username: 'jane',
        role: 'warehouse',
      });

      const [, properties] = observabilityMocks.track.mock.calls[0];
      expect(Object.keys(properties).sort()).toEqual(
        ['account_id', 'category', 'entity', 'source'],
      );
    });
  });

  it('tracks search result selections with source and position metadata', () => {
    trackSearchResultSelected({ entity: 'product', specName: 'product', position: 3 });

    expect(observabilityMocks.track).toHaveBeenCalledWith('search_result_selected', {
      category: 'product_usage',
      entity: 'product',
      position: 3,
      source: 'table',
      specName: 'product',
      type: 'filter',
    });
  });

  it('tracks record updates from the detail view', () => {
    trackRecordUpdated({ entity: 'salesOrder', specName: 'sales-order' });

    expect(observabilityMocks.track).toHaveBeenCalledWith('record_updated', {
      category: 'product_usage',
      entity: 'salesOrder',
      operation: 'update',
      source: 'detail_view',
      specName: 'sales-order',
      value: 1,
    });
  });

  it('identifies completion processes by known token patterns', () => {
    expect(isCompletionProcess({ columnName: 'DocAction' })).toBe(true);
    expect(isCompletionProcess({ name: 'Complete Order' })).toBe(true);
    expect(isCompletionProcess({ key: 'confirmPayment' })).toBe(true);
    expect(isCompletionProcess({ label: 'Save Draft' })).toBe(false);
    expect(isCompletionProcess({})).toBe(false);
  });

  it('tracks create and complete events with low-cardinality properties', () => {
    trackRecordCreated({ entity: 'invoice', specName: 'sales-invoice' });
    trackDocumentCompleted({ entity: 'invoice', specName: 'sales-invoice' });

    expect(observabilityMocks.track).toHaveBeenNthCalledWith(1, 'record_created', {
      category: 'product_usage',
      entity: 'invoice',
      operation: 'create',
      source: 'detail_view',
      specName: 'sales-invoice',
      value: 1,
    });
    expect(observabilityMocks.track).toHaveBeenNthCalledWith(2, 'document_completed', {
      category: 'product_usage',
      entity: 'invoice',
      operation: 'complete',
      source: 'detail_view',
      specName: 'sales-invoice',
      value: 1,
    });
  });
});
