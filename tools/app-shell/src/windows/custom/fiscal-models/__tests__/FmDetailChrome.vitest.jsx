// @covers tools/app-shell/src/windows/custom/fiscal-models/FmDetailChrome.jsx
// Vitest component tests for the presentational helpers of FmDetailChrome.jsx (the detail-page
// chrome shared by the 303/349 pages and the list's status column): tab counters and the status
// chip. Split out of FmCommon.vitest.jsx, which keeps FmCommon's own components (including the
// `EmptyState` re-export of FmEmptyState).
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import {
  FmStatusChip, fiscalStatusTone, statusLabelKey, tabCount, incidentsTabBadge,
} from '../FmDetailChrome.jsx';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

// ── FmDetailChrome — tab counters ─────────────────────────────────────────────

describe('tabCount', () => {
  it('keeps 0 as a real count and maps null/undefined to null (counter hidden)', () => {
    expect(tabCount(0)).toBe(0);
    expect(tabCount(7)).toBe(7);
    expect(tabCount(null)).toBeNull();
    expect(tabCount(undefined)).toBeNull();
  });
});

describe('incidentsTabBadge', () => {
  it('is danger when there is any blocking incident, even with warnings', () => {
    expect(incidentsTabBadge(2, 3)).toEqual({ badge: 5, badgeTone: 'danger' });
  });

  it('is warn when there are only warnings', () => {
    expect(incidentsTabBadge(0, 4)).toEqual({ badge: 4, badgeTone: 'warn' });
  });

  it('has no tone and a 0 count when there are no incidents', () => {
    expect(incidentsTabBadge(0, 0)).toEqual({ badge: 0, badgeTone: null });
  });

  it('treats missing or non-numeric counts as 0', () => {
    expect(incidentsTabBadge(undefined, null)).toEqual({ badge: 0, badgeTone: null });
    expect(incidentsTabBadge('x', '2')).toEqual({ badge: 2, badgeTone: 'warn' });
  });
});

// ── FmDetailChrome — status chip ──────────────────────────────────────────────

describe('statusLabelKey', () => {
  it('collapses submitted_ack onto the submitted label key', () => {
    expect(statusLabelKey('submitted_ack')).toBe('submitted');
  });

  it('leaves every other status unchanged', () => {
    ['draft', 'pending', 'ready', 'submitted', 'submitted_ext'].forEach((s) => {
      expect(statusLabelKey(s)).toBe(s);
    });
  });
});

describe('fiscalStatusTone', () => {
  it.each(['ready', 'submitted', 'submitted_ack', 'submitted_ext'])('%s is green (success)', (s) => {
    expect(fiscalStatusTone(s)).toBe('success');
  });

  it.each(['draft', 'pending', 'skipped', undefined])('%s is grey (neutral)', (s) => {
    expect(fiscalStatusTone(s)).toBe('neutral');
  });
});

describe('FmStatusChip', () => {
  const t = (key) => key;
  const chipOf = (container) => container.querySelector('.fm-status-chip');

  it('list variant (default) renders the core StatusTag with the method label below it', () => {
    const { container } = render(
      <FmStatusChip status="submitted" submissionMethod="manual_ack" t={t} />,
    );
    const chip = chipOf(container);
    expect(chip.getAttribute('data-variant')).toBe('list');
    expect(chip.style.flexDirection).toBe('column');
    const badge = screen.getByTestId('FmStatusChip__badge');
    const tag = badge.querySelector('.status-tag');
    expect(tag).toBeTruthy();
    expect(tag.classList.contains('status-tag--success')).toBe(true);
    expect(tag.textContent).toBe('fm.status.submitted');
    // Method label is the badge's next sibling, stacked under it by the column layout.
    expect(badge.nextElementSibling.textContent).toBe('fm.present.method.manual_ack');
  });

  it('detail variant renders the method label inline, to the right of the pill', () => {
    const { container } = render(
      <FmStatusChip status="submitted_ack" submissionMethod="aeat_telematic" t={t} variant="detail" />,
    );
    const chip = chipOf(container);
    expect(chip.getAttribute('data-variant')).toBe('detail');
    expect(chip.style.flexDirection).toBe('row');
    const badge = screen.getByTestId('FmStatusChip__badge');
    expect(badge.querySelector('.status-tag')).toBeNull();
    expect(badge.nextElementSibling.textContent).toBe('fm.present.method.aeat_telematic');
  });

  // ETP-5584 — `submitted_ext` used to be a hardcoded Spanish string in the chip, so it never
  // translated. It now goes through `fm.status.submitted_ext` like every other status.
  it.each([
    ['es_ES', 'Presentado · otra plataforma'],
    ['en_US', 'Submitted · other platform'],
  ])('translates submitted_ext through fm.status.submitted_ext (%s)', (locale, expected) => {
    const realT = makeRealUI(loadLocaleDictionary(locale));
    const { unmount } = render(<FmStatusChip status="submitted_ext" t={realT} />);
    expect(screen.getByTestId('FmStatusChip__badge').textContent).toBe(expected);
    unmount();
    render(<FmStatusChip status="submitted_ext" t={realT} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__badge').textContent).toBe(expected);
  });

  it('submitted_ack reads as the submitted label', () => {
    render(<FmStatusChip status="submitted_ack" t={t} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__badge').textContent).toBe('fm.status.submitted');
  });

  it.each(['submitted', 'submitted_ack'])('shows the method label for %s', (status) => {
    const { container } = render(<FmStatusChip status={status} submissionMethod="no_receipt" t={t} />);
    expect(chipOf(container).textContent).toContain('fm.present.method.no_receipt');
  });

  it.each(['draft', 'pending', 'ready', 'submitted_ext'])('hides the method label for %s', (status) => {
    const { container } = render(<FmStatusChip status={status} submissionMethod="no_receipt" t={t} />);
    expect(chipOf(container).textContent).not.toContain('fm.present.method');
    expect(screen.getByTestId('FmStatusChip__badge').nextElementSibling).toBeNull();
  });

  it('shows no method label when the status allows one but none is given', () => {
    render(<FmStatusChip status="submitted" t={t} />);
    expect(screen.getByTestId('FmStatusChip__badge').nextElementSibling).toBeNull();
  });

  it.each([
    ['ready', 'success'], ['submitted', 'success'], ['submitted_ack', 'success'],
    ['draft', 'neutral'], ['pending', 'neutral'],
  ])('%s gets the %s tone on both variants', (status, tone) => {
    const { unmount } = render(<FmStatusChip status={status} t={t} />);
    expect(screen.getByTestId('FmStatusChip__badge').getAttribute('data-tone')).toBe(tone);
    unmount();
    render(<FmStatusChip status={status} t={t} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__badge').getAttribute('data-tone')).toBe(tone);
  });

  it('shows the success Check icon on the detail variant only', () => {
    const { unmount } = render(<FmStatusChip status="ready" t={t} variant="detail" />);
    expect(screen.getByTestId('FmStatusChip__icon')).toBeTruthy();
    unmount();
    render(<FmStatusChip status="ready" t={t} />);
    expect(screen.queryByTestId('FmStatusChip__icon')).toBeNull();
  });

  it('shows no icon for a neutral status on the detail variant', () => {
    render(<FmStatusChip status="draft" t={t} variant="detail" />);
    expect(screen.queryByTestId('FmStatusChip__icon')).toBeNull();
  });
});
