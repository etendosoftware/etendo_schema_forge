import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { positionHighlightNote, resolveHighlightTarget } from '../highlightTarget.js';

/**
 * ETP-5184 — the resolver half of the Copilot's `highlight_element` tool.
 *
 * Every message thrown here is read by the MODEL, not by a human, so the tests
 * pin the actionable wording ("inspect the page again" / "call inspect_page_dom")
 * as part of the contract: a message that does not tell the model what to do
 * next turns a recoverable miss into the agent giving up.
 */

/** jsdom never lays out, so a node is invisible until it is given a box. */
function makeVisible(element, box = { width: 120, height: 24, top: 0, left: 0 }) {
  element.getBoundingClientRect = () => ({ ...box });
  return element;
}

describe('resolveHighlightTarget', () => {
  let registry;

  beforeEach(() => {
    registry = new Map();
    document.body.innerHTML = `
      <label for="bp">Business Partner</label>
      <input id="bp" data-testid="field-businessPartner" />
      <div data-testid="field-documentNo">DOC-1</div>
      <button id="send">Send</button>
      <input id="pw" type="password" data-testid="field-password" />
      <div data-testid="field-collapsed">hidden</div>
    `;
    for (const element of document.querySelectorAll('input, button, div, label')) {
      makeVisible(element);
    }
    // The collapsed field has a node but no box: painted-ness is what decides.
    document.querySelector('[data-testid="field-collapsed"]').getBoundingClientRect =
      () => ({ width: 0, height: 0, top: 0, left: 0 });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves a field by its contract key', () => {
    const element = resolveHighlightTarget({ fieldKey: 'businessPartner' }, registry);
    expect(element).toBe(document.getElementById('bp'));
  });

  it('resolves a non-field element by its dom-N handle', () => {
    const button = document.getElementById('send');
    registry.set('dom-1', button);
    expect(resolveHighlightTarget({ elementId: 'dom-1' }, registry)).toBe(button);
  });

  it('prefers fieldKey when the model sends both', () => {
    // A dom-N is positional and goes stale on re-render; the fieldKey does not.
    registry.set('dom-1', document.getElementById('send'));
    const element = resolveHighlightTarget(
      { fieldKey: 'documentNo', elementId: 'dom-1' },
      registry
    );
    expect(element).toBe(document.querySelector('[data-testid="field-documentNo"]'));
  });

  it('refuses a call that names no target at all', () => {
    expect(() => resolveHighlightTarget({}, registry))
      .toThrow('highlight_element requires elementId or fieldKey');
    expect(() => resolveHighlightTarget(undefined, registry))
      .toThrow('highlight_element requires elementId or fieldKey');
  });

  it('tells the model to re-inspect when the fieldKey is not on this page', () => {
    expect(() => resolveHighlightTarget({ fieldKey: 'notARealField' }, registry))
      .toThrow(/No field named "notARealField" is rendered on this page/);
    expect(() => resolveHighlightTarget({ fieldKey: 'notARealField' }, registry))
      .toThrow(/call inspect_page_dom/);
  });

  it('tells the model to re-inspect when the field exists but is not painted', () => {
    expect(() => resolveHighlightTarget({ fieldKey: 'collapsed' }, registry))
      .toThrow('That element is no longer visible; inspect the page again');
  });

  it('tells the model to re-inspect for an unknown elementId', () => {
    expect(() => resolveHighlightTarget({ elementId: 'dom-99' }, registry))
      .toThrow('The elementId is unknown or the element is no longer visible; inspect the page again');
  });

  it('tells the model to re-inspect when the registered node left the document', () => {
    const button = document.getElementById('send');
    registry.set('dom-1', button);
    button.remove();
    expect(() => resolveHighlightTarget({ elementId: 'dom-1' }, registry))
      .toThrow(/inspect the page again/);
  });

  it('tells the model to re-inspect when the registered node stopped being painted', () => {
    const button = document.getElementById('send');
    button.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0 });
    registry.set('dom-1', button);
    expect(() => resolveHighlightTarget({ elementId: 'dom-1' }, registry))
      .toThrow(/inspect the page again/);
  });

  it('refuses to point at a password field, whichever way it is addressed', () => {
    // Same exclusion setInputValue enforces for writes: a ring around a
    // password box aims a bystander's eye at the credential being typed.
    const password = document.getElementById('pw');
    registry.set('dom-1', password);
    expect(() => resolveHighlightTarget({ fieldKey: 'password' }, registry))
      .toThrow('Password fields cannot be highlighted by the Copilot');
    expect(() => resolveHighlightTarget({ elementId: 'dom-1' }, registry))
      .toThrow('Password fields cannot be highlighted by the Copilot');
  });

  describe('selector injection', () => {
    // The fieldKey is model-supplied text interpolated into an attribute
    // selector. It must be escaped (or rejected) — never allowed to close the
    // quoted string and match a DIFFERENT element than the one it names.
    const HOSTILE = [
      'businessPartner"], [data-testid="field-documentNo',
      'businessPartner"]',
      '* ',
      'businessPartner, #send',
      ':not([data-testid])',
    ];

    it.each(HOSTILE)('never resolves a hostile fieldKey to another element: %s', hostile => {
      let resolved;
      try {
        resolved = resolveHighlightTarget({ fieldKey: hostile }, registry);
      } catch (error) {
        // Rejecting is an acceptable outcome; silently matching is not.
        expect(error.message).toMatch(/No field named|not a valid field key/);
        return;
      }
      expect.unreachable(`hostile fieldKey resolved to <${resolved.tagName}>`);
    });

    it('still resolves a key whose escaped form is the literal key', () => {
      // Escaping must not break the ordinary case: the escape is only about
      // how the value is written into the selector, not about which node wins.
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div data-testid="field-lines.0.product">P</div>'
      );
      makeVisible(document.querySelector('[data-testid="field-lines.0.product"]'));
      expect(resolveHighlightTarget({ fieldKey: 'lines.0.product' }, registry))
        .toBe(document.querySelector('[data-testid="field-lines.0.product"]'));
    });
  });
});

describe('positionHighlightNote', () => {
  const NOTE = { width: 250, height: 100 };
  const VIEWPORT = { width: 1000, height: 800 };

  it('places the note below the element when it fits', () => {
    const rect = { top: 100, left: 50, width: 200, height: 20 };
    expect(positionHighlightNote(rect, NOTE, VIEWPORT))
      .toEqual({ top: 128, left: 50, placement: 'below' });
  });

  it('flips above when the note would fall off the bottom', () => {
    const rect = { top: 700, left: 50, width: 200, height: 20 };
    expect(positionHighlightNote(rect, NOTE, VIEWPORT))
      .toEqual({ top: 592, left: 50, placement: 'above' });
  });

  it('stays below when it fits in neither direction', () => {
    // A tall element in a short viewport: below is the lesser evil, because
    // above would place the note at a negative top and clip it entirely.
    const rect = { top: 20, left: 50, width: 200, height: 600 };
    const result = positionHighlightNote(rect, NOTE, { width: 1000, height: 640 });
    expect(result.placement).toBe('below');
    expect(result.top).toBe(628);
  });

  it('clamps a right-edge element back into the viewport', () => {
    const rect = { top: 100, left: 950, width: 40, height: 20 };
    expect(positionHighlightNote(rect, NOTE, VIEWPORT).left).toBe(742);
  });

  it('clamps a negative left back to the margin', () => {
    const rect = { top: 100, left: -30, width: 200, height: 20 };
    expect(positionHighlightNote(rect, NOTE, VIEWPORT).left).toBe(8);
  });

  it('falls back to the margin when the note is wider than the viewport', () => {
    const rect = { top: 100, left: 40, width: 200, height: 20 };
    expect(positionHighlightNote(rect, NOTE, { width: 200, height: 800 }).left).toBe(8);
  });

  it('honours a custom gap', () => {
    const rect = { top: 100, left: 50, width: 200, height: 20 };
    expect(positionHighlightNote(rect, NOTE, VIEWPORT, 24).top).toBe(144);
  });
});
