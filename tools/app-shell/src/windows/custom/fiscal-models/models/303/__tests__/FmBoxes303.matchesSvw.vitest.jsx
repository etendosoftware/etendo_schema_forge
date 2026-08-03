// Vitest tests for FmBoxes303.jsx's internal matchesSvw() helper — specifically
// the `anyOf` (OR-of-conditions) shape added for ETP-4456 (datos_bancarios must
// stay visible for a rectificativa filed under any tipo_declaracion, not just
// U/D/X). matchesSvw is a closure inside the component, not exported, so it is
// exercised indirectly by mocking fm303Layouts.js's getLayout303 to return a
// controlled section whose sectionVisibleWhen carries the shapes under test,
// then asserting whether FmBoxes303 renders that section.
//
// NOTE: mocking '../fm303Layouts.js' here is scoped to this file only — the
// sibling FmBoxes303.vitest.jsx keeps using the real layout module for its
// broader rendering suite.

import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('lucide-react', () => ({
  TrendingUp: () => null,
  TrendingDown: () => null,
  Pencil: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) =>
    React.createElement('input', {
      type: 'checkbox', checked: !!checked,
      onChange: onChange ?? (() => {}),
    }),
}));

// One controlled section per shape under test — each gets its own id so a
// single mocked layout can serve every test via sectionIds filtering.
vi.mock('../fm303Layouts.js', () => ({
  getLayout303: () => ({
    sections: [
      {
        id: 'anyof_basic',
        sectionType: 'identificacion',
        titleKey: 'test.anyof.basic',
        colHeaderKeys: [],
        fields: [],
        rows: [],
        sectionVisibleWhen: { anyOf: [
          { field: 'x', equals: true },
          { field: 'y', equals: true },
        ] },
      },
      {
        id: 'anyof_nested',
        sectionType: 'identificacion',
        titleKey: 'test.anyof.nested',
        colHeaderKeys: [],
        fields: [],
        rows: [],
        // A realistic-looking nested shape: an anyOf entry that is itself an
        // anyOf. Not currently produced by fm303Layouts.js (only a single flat
        // anyOf is used for datos_bancarios today), but matchesSvw's recursive
        // `.some(matchesSvw)` call handles it "for free" — this locks that in.
        sectionVisibleWhen: { anyOf: [
          { anyOf: [
            { field: 'p', equals: true },
            { field: 'q', equals: true },
          ] },
          { field: 'r', equals: true },
        ] },
      },
    ],
  }),
}));

import FmBoxes303 from '../FmBoxes303.jsx';

const BASE_PROPS = { year: 2026, period: 'T2', boxes: {} };

function isSectionVisible(container) {
  return !!container.querySelector('.fm-aeat-section');
}

describe('FmBoxes303 — matchesSvw anyOf evaluation', () => {
  it('resolves true when one anyOf branch is true and the other is false', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} sectionIds={['anyof_basic']} identification={{ x: true, y: false }} />
    );
    expect(isSectionVisible(container)).toBe(true);
  });

  it('resolves true when the other anyOf branch is the true one', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} sectionIds={['anyof_basic']} identification={{ x: false, y: true }} />
    );
    expect(isSectionVisible(container)).toBe(true);
  });

  it('resolves false when every anyOf branch is false', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} sectionIds={['anyof_basic']} identification={{ x: false, y: false }} />
    );
    expect(isSectionVisible(container)).toBe(false);
  });

  it('resolves false when identification is undefined (all branches evaluate against undefined)', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} sectionIds={['anyof_basic']} />
    );
    expect(isSectionVisible(container)).toBe(false);
  });
});

describe('FmBoxes303 — matchesSvw nested anyOf (recursive .some(matchesSvw))', () => {
  it('resolves true via the nested anyOf inner branch even when the outer flat branch is false', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} sectionIds={['anyof_nested']} identification={{ p: false, q: true, r: false }} />
    );
    expect(isSectionVisible(container)).toBe(true);
  });

  it('resolves true via the outer flat branch even when the nested anyOf is entirely false', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} sectionIds={['anyof_nested']} identification={{ p: false, q: false, r: true }} />
    );
    expect(isSectionVisible(container)).toBe(true);
  });

  it('resolves false when both the nested anyOf and the outer flat branch are false', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} sectionIds={['anyof_nested']} identification={{ p: false, q: false, r: false }} />
    );
    expect(isSectionVisible(container)).toBe(false);
  });
});
