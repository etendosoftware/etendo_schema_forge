// ETP-5547 — confirming a reactivated draft payment from the processConfirmModal left the
// payment-in detail on "Borrador": the modal's onRefresh called fetchById WITHOUT
// { force: true }, so the pre-confirm record was served from the in-memory cache.
// refreshRecordAfterMutation is the one shared "the record changed server-side" refresh:
// invalidate the entity cache, force-refetch the record, reload the mounted list.
//
// Imports ONLY detailViewHelpers.jsx (same isolation as detailViewHelpers.vitest.js).

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, field) => (field ? data?.[field] : undefined),
}));

import {
  refreshRecordAfterMutation,
  renderProcessConfirmModal,
  renderExtraActionButtons,
} from '../detailViewHelpers.jsx';

function fullHook() {
  return {
    invalidateEntityCache: vi.fn(),
    fetchById: vi.fn(),
    refresh: vi.fn(),
  };
}

describe('refreshRecordAfterMutation', () => {
  it('force-refetches the record so the cached pre-mutation copy is not served', () => {
    const hook = fullHook();
    refreshRecordAfterMutation(hook, 'pay-1');
    expect(hook.fetchById).toHaveBeenCalledTimes(1);
    expect(hook.fetchById).toHaveBeenCalledWith('pay-1', expect.objectContaining({ force: true }));
  });

  it('invalidates the entity cache and reloads the list', () => {
    const hook = fullHook();
    refreshRecordAfterMutation(hook, 'pay-1');
    expect(hook.invalidateEntityCache).toHaveBeenCalledTimes(1);
    expect(hook.refresh).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache before refetching, so the refetch cannot hit the stale entry', () => {
    const hook = fullHook();
    refreshRecordAfterMutation(hook, 'pay-1');
    const [invalidateOrder] = hook.invalidateEntityCache.mock.invocationCallOrder;
    const [fetchOrder] = hook.fetchById.mock.invocationCallOrder;
    expect(invalidateOrder).toBeLessThan(fetchOrder);
  });

  it.each([
    ['invalidateEntityCache'],
    ['fetchById'],
    ['refresh'],
  ])('tolerates a hook without %s and still calls the other two', (missing) => {
    const hook = fullHook();
    delete hook[missing];
    expect(() => refreshRecordAfterMutation(hook, 'pay-1')).not.toThrow();
    Object.values(hook).forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  });

  it('tolerates a hook with none of the three methods', () => {
    expect(() => refreshRecordAfterMutation({}, 'pay-1')).not.toThrow();
  });

  it.each([[null], [undefined]])('does not throw with a %s id', (id) => {
    const hook = fullHook();
    expect(() => refreshRecordAfterMutation(hook, id)).not.toThrow();
  });
});

describe('renderProcessConfirmModal — onRefresh forwarding', () => {
  it('forwards onRefresh (7th argument) to the Modal as a prop', () => {
    const Modal = vi.fn(() => <div data-testid="confirm-modal" />);
    const onRefresh = vi.fn();
    const process = { name: 'aPRMProcessPayment' };
    const record = { id: 'pay-1' };

    const element = renderProcessConfirmModal(
      process, Modal, vi.fn(), vi.fn(), record, '/sws/neo/payment-in', onRefresh);
    render(element);

    expect(Modal).toHaveBeenCalled();
    const props = Modal.mock.calls[0][0];
    expect(props.onRefresh).toBe(onRefresh);
    expect(props.record).toBe(record);
    expect(props.process).toBe(process);
  });

  it('the forwarded onRefresh, wired as DetailView does, force-refetches the record', () => {
    const hook = fullHook();
    const Modal = vi.fn(() => null);
    const element = renderProcessConfirmModal(
      { name: 'aPRMProcessPayment' }, Modal, vi.fn(), vi.fn(), { id: 'pay-1' }, '/api',
      () => refreshRecordAfterMutation(hook, 'pay-1'));
    render(element);

    Modal.mock.calls[0][0].onRefresh();

    expect(hook.fetchById).toHaveBeenCalledWith('pay-1', expect.objectContaining({ force: true }));
  });

  it('renders nothing without a process or a Modal', () => {
    expect(renderProcessConfirmModal(null, vi.fn(), vi.fn(), vi.fn(), {}, '/api', vi.fn())).toBeNull();
    expect(renderProcessConfirmModal({}, null, vi.fn(), vi.fn(), {}, '/api', vi.fn())).toBeNull();
  });
});

describe('renderExtraActionButtons — onRefresh goes through the same forced refresh', () => {
  it('its onRefresh force-refetches data.id, invalidates and reloads the list', () => {
    const hook = { ...fullHook(), children: [] };
    let received;
    renderExtraActionButtons((args) => { received = args; return []; }, { id: 'rec-1' }, hook, '');

    received.onRefresh();

    expect(hook.invalidateEntityCache).toHaveBeenCalledTimes(1);
    expect(hook.fetchById).toHaveBeenCalledWith('rec-1', expect.objectContaining({ force: true }));
    expect(hook.refresh).toHaveBeenCalledTimes(1);
  });
});
