// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxOpenedTracking.js
// The Invoice Inbox page is mounted only while it is on screen, so one opening is one mount:
// `invoice_inbox_opened` follows the mount, never a re-render.
import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';

const telemetry = vi.hoisted(() => ({ trackInvoiceInboxOpened: vi.fn() }));
vi.mock('@/lib/productUsageTelemetry.js', () => telemetry);

import { useInvoiceInboxOpenedTracking } from '../useInvoiceInboxOpenedTracking.js';

describe('useInvoiceInboxOpenedTracking', () => {
  beforeEach(() => {
    telemetry.trackInvoiceInboxOpened.mockClear();
  });

  it('records one opening when the page mounts', () => {
    renderHook(() => useInvoiceInboxOpenedTracking());

    expect(telemetry.trackInvoiceInboxOpened).toHaveBeenCalledTimes(1);
  });

  it('records one opening under StrictMode, which runs the effect twice', () => {
    renderHook(() => useInvoiceInboxOpenedTracking(), { wrapper: StrictMode });

    expect(telemetry.trackInvoiceInboxOpened).toHaveBeenCalledTimes(1);
  });

  it('does not record again on re-renders (list refresh, polling, drawer, locale change)', () => {
    const { rerender } = renderHook(() => useInvoiceInboxOpenedTracking());

    rerender();
    rerender();
    rerender();

    expect(telemetry.trackInvoiceInboxOpened).toHaveBeenCalledTimes(1);
  });

  it('records a new opening when the page is left and entered again', () => {
    const first = renderHook(() => useInvoiceInboxOpenedTracking());
    first.unmount();
    renderHook(() => useInvoiceInboxOpenedTracking());

    expect(telemetry.trackInvoiceInboxOpened).toHaveBeenCalledTimes(2);
  });
});
