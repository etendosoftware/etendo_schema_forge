import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertInternalPath,
  inferWindowPath,
  formatDomForAgent,
  inspectInteractiveDom,
  interactWithDom,
  resolveWindowPath,
} from '../useAiCopilotChat.js';

describe('useAiCopilotChat client tool path policy', () => {
  it('allows internal application paths', () => {
    expect(assertInternalPath('/sales-order/new')).toBe('/sales-order/new');
  });

  it('rejects external and protocol-relative paths', () => {
    expect(() => assertInternalPath('https://example.com')).toThrow();
    expect(() => assertInternalPath('//example.com')).toThrow();
    expect(() => assertInternalPath('sales-order/new')).toThrow();
  });

  it('resolves goods document names to browser routes', () => {
    expect(resolveWindowPath('Albaranes de Venta')).toBe('/goods-shipment');
    expect(resolveWindowPath('Goods Receipt')).toBe('/goods-receipt');
    expect(resolveWindowPath('/goods-shipment')).toBe('/goods-shipment');
  });

  it('rejects unknown window names', () => {
    expect(() => resolveWindowPath('External Window')).toThrow();
  });

  it('infers the selected goods window when the model sends empty tool input', () => {
    expect(inferWindowPath([{ role: 'user', content: 'venta' }])).toBe('/goods-shipment');
    expect(inferWindowPath([{ role: 'user', content: 'compra' }])).toBe('/goods-receipt');
  });
});

describe('browser DOM tools', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button aria-label="Open form">Open</button><input placeholder="Search" />';
    for (const element of document.body.children) {
      element.getBoundingClientRect = () => ({ width: 100, height: 20 });
    }
  });

  it('returns temporary IDs for visible interactive elements without field values', () => {
    const registry = new Map();
    const snapshot = inspectInteractiveDom(document, registry);
    expect(snapshot.elements.map(element => element.elementId)).toEqual(['dom-1', 'dom-2']);
    expect(snapshot.elements[0].name).toBe('Open form');
    expect(snapshot.elements[1]).not.toHaveProperty('value');
    expect(registry.size).toBe(2);
  });

  it('interacts with a previously inspected text field', () => {
    const registry = new Map();
    inspectInteractiveDom(document, registry);
    const input = document.querySelector('input');
    interactWithDom(registry, { elementId: 'dom-2', action: 'fill', value: 'albaranes' });
    expect(input.value).toBe('albaranes');
  });

  it('formats the DOM snapshot as direct model context', () => {
    expect(formatDomForAgent({
      url: '/sales-invoice/1',
      title: 'Sales Invoice',
      elements: [{ elementId: 'dom-1', role: 'button', name: 'Send reminder' }],
    })).toContain('Send reminder');
  });
});
