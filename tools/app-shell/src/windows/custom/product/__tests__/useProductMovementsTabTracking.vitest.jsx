// @covers tools/app-shell/src/windows/custom/product/useProductMovementsTabTracking.js
// ETP-5889 — the Movements tab is mounted with the record, hidden until selected, so the
// `product_movements_tab_opened` event must follow `isActive`, never the mount.
import { renderHook } from '@testing-library/react';

const telemetry = vi.hoisted(() => ({ trackProductMovementsTabOpened: vi.fn() }));
vi.mock('@/lib/productUsageTelemetry.js', () => telemetry);

import { useProductMovementsTabTracking } from '../useProductMovementsTabTracking';

describe('useProductMovementsTabTracking (ETP-5889)', () => {
  beforeEach(() => {
    telemetry.trackProductMovementsTabOpened.mockClear();
  });

  it('does not count a tab that is mounted but not active', () => {
    renderHook(() => useProductMovementsTabTracking({ isActive: false }));

    expect(telemetry.trackProductMovementsTabOpened).not.toHaveBeenCalled();
  });

  it('counts one opening when the tab becomes active', () => {
    const { rerender } = renderHook((props) => useProductMovementsTabTracking(props), {
      initialProps: { isActive: false },
    });

    rerender({ isActive: true });

    expect(telemetry.trackProductMovementsTabOpened).toHaveBeenCalledTimes(1);
    expect(telemetry.trackProductMovementsTabOpened).toHaveBeenCalledWith({
      entity: 'product',
      specName: 'product',
      source: 'tab',
    });
  });

  it('counts a tab that is already active when it mounts', () => {
    renderHook(() => useProductMovementsTabTracking({ isActive: true }));

    expect(telemetry.trackProductMovementsTabOpened).toHaveBeenCalledTimes(1);
  });

  it('does not count again while the tab stays active across re-renders', () => {
    const { rerender } = renderHook((props) => useProductMovementsTabTracking(props), {
      initialProps: { isActive: true },
    });

    rerender({ isActive: true });
    rerender({ isActive: true });

    expect(telemetry.trackProductMovementsTabOpened).toHaveBeenCalledTimes(1);
  });

  it('counts each new activation after the tab was left', () => {
    const { rerender } = renderHook((props) => useProductMovementsTabTracking(props), {
      initialProps: { isActive: true },
    });

    rerender({ isActive: false });
    rerender({ isActive: true });

    expect(telemetry.trackProductMovementsTabOpened).toHaveBeenCalledTimes(2);
  });

  it('reports the side panel link as the source when told so', () => {
    renderHook(() => useProductMovementsTabTracking({ isActive: true, source: 'side_panel_link' }));

    expect(telemetry.trackProductMovementsTabOpened).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'side_panel_link' }),
    );
  });
});
