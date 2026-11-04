import { vi } from 'vitest';

// jsdom has no layout: a fake one (36px rows, 400px panel) so centring really can succeed or fail.
export const ROW_H = 36;
export const PANEL_H = 400;
export function mockGeometry() {
  const P = HTMLElement.prototype;
  const scroll = new WeakMap();
  const isPanel = (el) => el.getAttribute('role') === 'listbox';
  const count = (el) => el.querySelectorAll('[data-option-index]').length;
  const defs = {
    clientHeight: { get() { return isPanel(this) ? Math.min(PANEL_H, count(this) * ROW_H) : 0; } },
    scrollHeight: { get() { return isPanel(this) ? count(this) * ROW_H : 0; } },
    scrollTop: {
      get() { return scroll.get(this) ?? 0; },
      set(v) { scroll.set(this, Math.min(v, Math.max(0, this.scrollHeight - this.clientHeight))); },
    },
  };
  const saved = Object.keys(defs).map((k) => [k, Object.getOwnPropertyDescriptor(P, k) ?? Object.getOwnPropertyDescriptor(Element.prototype, k)]);
  Object.entries(defs).forEach(([k, d]) => Object.defineProperty(P, k, { configurable: true, ...d }));
  const rect = vi.spyOn(P, 'getBoundingClientRect').mockImplementation(function rectOf() {
    const idx = this.getAttribute('data-option-index');
    if (idx == null) return { top: 0, height: PANEL_H, bottom: PANEL_H, left: 0, right: 100, width: 100 };
    return { top: Number(idx) * ROW_H - (this.closest('[role=listbox]')?.scrollTop ?? 0), height: ROW_H, bottom: 0, left: 0, right: 0, width: 100 };
  });
  return () => {
    rect.mockRestore();
    saved.forEach(([k, d]) => (d ? Object.defineProperty(P, k, d) : delete P[k]));
  };
}
