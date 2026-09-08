import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectInteractiveDom } from '../useAiCopilotChat.js';

/**
 * ETP-5184 — `inspect_page_dom` now also indexes `[data-testid^="field-"]`.
 *
 * Read-only fields are neither focusable nor clickable, so the interactive
 * selector never saw them and the model could not name them at all. Indexing
 * them is what lets `highlight_element` point at one.
 *
 * The load-bearing constraint is that this addition is PURELY ADDITIVE: the
 * positional `dom-N` ids of the interactive elements must not shift, because
 * `interact_with_page` addresses elements by exactly those ids and a shift
 * would silently make the Copilot click the wrong control.
 */

/** jsdom never lays out; isVisibleElement() rejects a node without a box. */
function layoutEverything(root = document.body) {
  for (const element of root.querySelectorAll('*')) {
    element.getBoundingClientRect = () => ({ width: 100, height: 20, top: 0, left: 0 });
  }
}

describe('inspectInteractiveDom — field indexing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports a read-only field the interactive selector cannot see', () => {
    document.body.innerHTML = `
      <label for="doc">Document No.</label>
      <div id="doc" data-testid="field-documentNo">SO-0001</div>
    `;
    layoutEverything();
    const registry = new Map();
    const { elements } = inspectInteractiveDom(document, registry);
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      elementId: 'dom-1',
      fieldKey: 'documentNo',
      kind: 'field',
      label: 'Document No.',
    });
    expect(registry.get('dom-1')).toBe(document.getElementById('doc'));
  });

  it('falls back to the accessible name when the field has no label', () => {
    document.body.innerHTML = '<div data-testid="field-orderDate" aria-label="Order Date">2026-09-07</div>';
    layoutEverything();
    const { elements } = inspectInteractiveDom(document, new Map());
    expect(elements[0].label).toBe('Order Date');
  });

  it('marks only field entries with fieldKey and kind', () => {
    document.body.innerHTML = `
      <button aria-label="Complete">Complete</button>
      <div data-testid="field-documentNo">SO-0001</div>
    `;
    layoutEverything();
    const { elements } = inspectInteractiveDom(document, new Map());
    const [button, field] = elements;
    expect(button).not.toHaveProperty('fieldKey');
    expect(button).not.toHaveProperty('kind');
    expect(field.kind).toBe('field');
    expect(field.fieldKey).toBe('documentNo');
  });

  it('lists a node that is both interactive and a field exactly once', () => {
    // Editable fields match BOTH selectors. Emitting them twice would give the
    // model two ids for one control and inflate the 200-element budget.
    document.body.innerHTML = '<input data-testid="field-businessPartner" aria-label="Business Partner" />';
    layoutEverything();
    const registry = new Map();
    const { elements } = inspectInteractiveDom(document, registry);
    expect(elements).toHaveLength(1);
    expect(registry.size).toBe(1);
    // It keeps its interactive slot AND gains the field metadata.
    expect(elements[0]).toMatchObject({ elementId: 'dom-1', fieldKey: 'businessPartner', kind: 'field' });
  });

  it('keeps the dom-N ids of interactive elements unchanged by the field pass', () => {
    // The regression that matters: fields are APPENDED, so every interactive
    // element keeps the id interact_with_page already knows it by.
    document.body.innerHTML = `
      <button aria-label="First">First</button>
      <div data-testid="field-documentNo">SO-0001</div>
      <button aria-label="Second">Second</button>
      <div data-testid="field-orderDate">2026-09-07</div>
    `;
    layoutEverything();
    const registry = new Map();
    const { elements } = inspectInteractiveDom(document, registry);
    expect(elements.map(element => [element.elementId, element.name])).toEqual([
      ['dom-1', 'First'],
      ['dom-2', 'Second'],
      ['dom-3', 'SO-0001'],
      ['dom-4', '2026-09-07'],
    ]);
    expect(registry.get('dom-1')).toBe(document.querySelector('[aria-label="First"]'));
    expect(registry.get('dom-2')).toBe(document.querySelector('[aria-label="Second"]'));
  });

  it('skips a field that is not painted', () => {
    document.body.innerHTML = '<div data-testid="field-hidden" style="display:none">x</div>';
    layoutEverything();
    expect(inspectInteractiveDom(document, new Map()).elements).toHaveLength(0);
  });

  it('still caps the snapshot at 200 elements', () => {
    document.body.innerHTML = Array.from({ length: 150 }, (unused, index) => (
      `<button aria-label="B${index}">B${index}</button><div data-testid="field-f${index}">F${index}</div>`
    )).join('');
    layoutEverything();
    const registry = new Map();
    const { elements } = inspectInteractiveDom(document, registry);
    expect(elements).toHaveLength(200);
    expect(registry.size).toBe(200);
    // The 150 buttons come first, so the cap trims the tail of the field pass.
    expect(elements[149]).toMatchObject({ elementId: 'dom-150', name: 'B149' });
    expect(elements[150]).toMatchObject({ elementId: 'dom-151', fieldKey: 'f0' });
  });

  it('empties the registry it is handed before refilling it', () => {
    document.body.innerHTML = '<button aria-label="Only">Only</button>';
    layoutEverything();
    const registry = new Map();
    registry.set('dom-9', document.createElement('span'));
    inspectInteractiveDom(document, registry);
    expect([...registry.keys()]).toEqual(['dom-1']);
  });
});
