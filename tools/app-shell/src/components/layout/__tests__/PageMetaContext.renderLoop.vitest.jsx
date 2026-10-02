// ETP-5504 — useSetPageMeta must not re-publish when an array breadcrumb is only a new reference.
//
// setMeta always stores a fresh object, so every publish re-renders every usePageMeta consumer.
// The Probe below counts those renders: it is a sibling of the publisher and is only re-rendered
// by the provider, so its render count is a direct measure of how many times setMeta ran.
import { useState } from 'react';
import { act, render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { PageMetaProvider, usePageMeta, useSetPageMeta } from '../PageMetaContext.jsx';

const LOOP_CAP = 50;

function setup() {
  const probe = { renders: 0, meta: null };
  const publisher = { setLabel: null, bump: null, renders: 0, frozen: null };

  function Probe() {
    const meta = usePageMeta();
    probe.renders += 1;
    probe.meta = meta;
    return null;
  }

  function Publisher() {
    const [label, setLabel] = useState('FAC-1');
    const [, setTick] = useState(0);
    publisher.setLabel = setLabel;
    publisher.bump = () => setTick((t) => t + 1);
    publisher.renders += 1;
    // A new array (and new objects) on EVERY render, as DetailView produces it. Without the guard
    // this is an unbounded effect -> setMeta -> render cycle that React never interrupts (passive
    // effects only warn), so past a cap the array is frozen to let the test end and FAIL on the
    // render counts instead of hanging the worker.
    if (publisher.renders <= LOOP_CAP || !publisher.frozen) {
      publisher.frozen = [{ label: 'Ventas' }, { label: 'Factura', href: '/sales-invoice' }, { label }];
    }
    useSetPageMeta({ title: 'Factura', breadcrumb: publisher.frozen });
    return null;
  }

  const utils = render(
    <PageMetaProvider>
      <Publisher />
      <Probe />
    </PageMetaProvider>,
  );
  return { probe, publisher, ...utils };
}

describe('useSetPageMeta — array breadcrumb render-loop guard', () => {
  it('publishes the array breadcrumb on mount', () => {
    const { probe } = setup();
    expect(probe.meta.breadcrumb.map((i) => i.label)).toEqual(['Ventas', 'Factura', 'FAC-1']);
  });

  it('settles after mount instead of re-rendering in a loop', () => {
    const { publisher } = setup();
    expect(publisher.renders).toBeLessThan(5);
  });

  it('does not call setMeta again when an equal-but-new array is published on re-render', () => {
    const { probe, publisher } = setup();
    const before = probe.renders;
    act(() => publisher.bump());
    act(() => publisher.bump());
    expect(probe.renders).toBe(before);
  });

  it('re-publishes when a breadcrumb label changes', () => {
    const { probe, publisher } = setup();
    const before = probe.renders;
    act(() => publisher.setLabel('FAC-2'));
    expect(probe.renders).toBeGreaterThan(before);
  });

  it('exposes the changed label after re-publishing', () => {
    const { probe, publisher } = setup();
    act(() => publisher.setLabel('FAC-2'));
    expect(probe.meta.breadcrumb.at(-1).label).toBe('FAC-2');
  });

  it('clears the meta on unmount', () => {
    const probe = { meta: null };
    function Probe() { probe.meta = usePageMeta(); return null; }
    const crumbs = [{ label: 'A' }]; // stable: this test is about cleanup, not the loop guard
    function Publisher() {
      useSetPageMeta({ title: 'X', breadcrumb: crumbs });
      return null;
    }
    function Host({ show }) {
      return (
        <PageMetaProvider>
          {show && <Publisher />}
          <Probe />
        </PageMetaProvider>
      );
    }
    const { rerender } = render(<Host show />);
    rerender(<Host show={false} />);
    expect(probe.meta.breadcrumb).toBeUndefined();
  });
});
