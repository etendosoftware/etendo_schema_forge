import { renderHook } from '@testing-library/react';

// ETP-4529 review fix — useAccountingDimensionFields used to call useDisplayLogic without
// cacheableKeys, so none of its callers (AssetsDetailPanel, AmortizationLinesTable) benefited
// from the "last known good" cache that eliminates the dimension-visibility flicker.
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: vi.fn(() => ({ readOnly: {}, visibility: {} })),
}));

import { useDisplayLogic } from '@/hooks/useDisplayLogic';
import { useAccountingDimensionFields } from '../useAccountingDimensionFields.js';

describe('useAccountingDimensionFields', () => {
  beforeEach(() => {
    useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: {} });
  });

  it('passes the candidate fields\' keys as cacheableKeys to useDisplayLogic', () => {
    const fields = [{ key: 'project' }, { key: 'costcenter' }];
    renderHook(() => useAccountingDimensionFields('assets', { id: '1' }, fields, {
      token: 'tok', apiBaseUrl: 'http://host',
    }));

    expect(useDisplayLogic).toHaveBeenCalledWith(
      'assets',
      { id: '1' },
      expect.objectContaining({ token: 'tok', apiBaseUrl: 'http://host', cacheableKeys: ['project', 'costcenter'] }),
    );
  });

  it('filters out a field only when the evaluator explicitly resolves it false', () => {
    useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: { project: false } });
    const fields = [{ key: 'project' }, { key: 'costcenter' }];
    const { result } = renderHook(() => useAccountingDimensionFields('assets', { id: '1' }, fields, {}));

    expect(result.current.map(f => f.key)).toEqual(['costcenter']);
  });

  it('fails open: keeps a field the evaluator never mentions', () => {
    useDisplayLogic.mockReturnValue({ readOnly: {}, visibility: {} });
    const fields = [{ key: 'project' }];
    const { result } = renderHook(() => useAccountingDimensionFields('assets', { id: '1' }, fields, {}));

    expect(result.current.map(f => f.key)).toEqual(['project']);
  });
});
