// @covers tools/app-shell/src/components/contract-ui/toolbarClasses.js
//
// The record-toolbar class strings (ETP-5601), shared by DetailView and custom windows'
// top bars (ETP-5736, General Ledger Configuration).
import { describe, it, expect } from 'vitest';
import { getLinesToolbarClassName, getSaveBtnCls } from '../toolbarClasses.js';

describe('toolbarClasses', () => {
  it('uses one constant record-toolbar class: p-2 plus the inset bottom rule, no border-b', () => {
    const cls = getLinesToolbarClassName();
    expect(cls).toContain('p-2');
    expect(cls).toContain('shadow-[inset_0_-1px_0_var(--status-neutral-border)]');
    expect(cls).not.toContain('border-b');
    expect(getLinesToolbarClassName('table', 'px-4', true)).toBe(cls);
  });

  it('sizes the save button at 40px with the Figma line height and 20px icons', () => {
    expect(getSaveBtnCls()).toBe('h-10 gap-2 leading-6 [&_svg]:size-5');
    expect(getSaveBtnCls('sm')).toBe(getSaveBtnCls());
  });
});
