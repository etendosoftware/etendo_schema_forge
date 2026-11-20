// @covers tools/app-shell/src/components/contract-ui/DataTable.cellRenderers.jsx
// @covers tools/app-shell/src/components/contract-ui/CompactHeader.jsx
// ETP-4561 — characterization: untrusted record text shown in a grid cell, a form field and
// a record title is rendered as TEXT (React default escaping). Regression coverage only; no
// production change. Payloads: script, event handler, attribute breakout, quotes.
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { renderDefaultCell } from '../DataTable.cellRenderers.jsx';
import { CompactHeader } from '../CompactHeader.jsx';
import { Input } from '@/components/ui/input.jsx';

afterEach(() => {
  cleanup();
  delete window.__xss;
});

const PAYLOADS = [
  '<script>window.__xss=1</script>',
  '<img src=x onerror="window.__xss=1">',
  '"><svg onload=window.__xss=1>',
  `O'Brien & "Sons" <b>bold</b>`,
];

const NO_INJECTED = 'script, img, svg[onload], b';

describe('untrusted record text renders as text (ETP-4561)', () => {
  for (const payload of PAYLOADS) {
    describe(JSON.stringify(payload), () => {
      it('grid cell (first string column)', () => {
        const col = { key: 'name', type: 'string' };
        const { container } = render(<div>{renderDefaultCell({
          row: { id: '1', name: payload }, col, display: payload, visibleColumns: [col],
        })}</div>);
        expect(container.textContent).toContain(payload);
        expect(container.querySelector(NO_INJECTED)).toBeNull();
        expect(window.__xss).toBeUndefined();
      });

      it('grid cell (non-first string column)', () => {
        const first = { key: 'a', type: 'string' };
        const col = { key: 'note', type: 'string' };
        const { container } = render(<div>{renderDefaultCell({
          row: { id: '1', note: payload }, col, display: payload, visibleColumns: [first, col],
        })}</div>);
        expect(container.textContent).toContain(payload);
        expect(container.querySelector(NO_INJECTED)).toBeNull();
      });

      it('form field value stays in the value property, never in markup', () => {
        const { container } = render(<Input defaultValue={payload} placeholder={payload} aria-label={payload} />);
        const input = container.querySelector('input');
        expect(input.value).toBe(payload);
        expect(input.getAttribute('placeholder')).toBe(payload);
        expect(input.hasAttribute('onerror')).toBe(false);
        expect(input.hasAttribute('onload')).toBe(false);
        expect(container.querySelector(NO_INJECTED)).toBeNull();
      });

      it('record title and subtitle', () => {
        const { container } = render(<CompactHeader title={payload} subtitle={payload} Form={() => null} />);
        expect(container.querySelector('h2').textContent).toBe(payload);
        expect(container.textContent).toContain(payload);
        expect(container.querySelector(NO_INJECTED)).toBeNull();
        expect(window.__xss).toBeUndefined();
      });
    });
  }
});
