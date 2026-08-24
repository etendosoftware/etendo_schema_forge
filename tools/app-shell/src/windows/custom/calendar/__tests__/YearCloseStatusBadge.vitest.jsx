import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This test intentionally does NOT mock '@/i18n' — it renders with the real LocaleProvider
// and the real locale JSON files, same convention as *.i18n.vitest.jsx elsewhere in this repo
// (e.g. DefaultsTab.i18n.vitest.jsx), so a missing/misspelled translation key would actually
// surface here instead of being silently hidden by a mocked identity `ui()`.
import { LocaleProvider } from '@/i18n';

// Real Tag renders a plain <span> with no data-testid passthrough (it only reads
// variant/label/children/className) — mock it the same way PeriodsExpandablePanel.vitest.jsx
// does, so tests can assert on the rendered variant + label without depending on Tag internals.
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));

import YearCloseStatusBadge from '../YearCloseStatusBadge.jsx';
// ETP-4576 — the component asks the shared builder for its credential, so what a
// test may assert is "the active scheme's header", never a literal it also chose.
// The scheme is declared per test rather than inherited: src/test/setup.js resets
// to the bearer default, and an assertion that relies on that default passes by
// omission.
import { declareBearerSession, expectBearerHeader } from '@/test/sessionContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', '..', '..', '..', 'locales');
const esES = JSON.parse(readFileSync(join(localesDir, 'es_ES.json'), 'utf8'));
const enUS = JSON.parse(readFileSync(join(localesDir, 'en_US.json'), 'utf8'));
const DICTIONARIES = { es_ES: esES, en_US: enUS };

const ROW = { id: 'f1', account: '20000000', debit: '100.00', credit: '0.00', factaccttype: 'R', description: 'Year close' };

function renderWithLocale(locale, ui) {
  return render(<LocaleProvider locale={locale} dictionaries={DICTIONARIES}>{ui}</LocaleProvider>);
}

describe('YearCloseStatusBadge', () => {
  it('shows "Año cerrado" (green) when the year has at least one closing-type accounting entry', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [ROW] }) }));
    declareBearerSession('tok');
    renderWithLocale('es_ES', <YearCloseStatusBadge recordId="year1" token="tok" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(screen.getByTestId('year-close-status')).toBeInTheDocument());
    expect(global.fetch.mock.calls.at(-1)[0]).toBe('https://api.test/accounting?year=year1');
    expectBearerHeader('tok', global.fetch);
    const badge = screen.getByTestId('tag');
    expect(badge).toHaveAttribute('data-variant', 'green');
    expect(badge).toHaveTextContent('Año cerrado');
  });

  it('shows "Año no cerrado" (neutral) when the year has no closing-type accounting entries', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    declareBearerSession('tok');
    renderWithLocale('es_ES', <YearCloseStatusBadge recordId="year1" token="tok" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(screen.getByTestId('year-close-status')).toBeInTheDocument());
    const badge = screen.getByTestId('tag');
    expect(badge).toHaveAttribute('data-variant', 'neutral');
    expect(badge).toHaveTextContent('Año no cerrado');
  });

  it('shows the equivalent English labels ("Year closed" / "Year not closed") under en_US', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [ROW] }) }));
    declareBearerSession('tok');
    renderWithLocale('en_US', <YearCloseStatusBadge recordId="year1" token="tok" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(screen.getByTestId('tag')).toHaveTextContent('Year closed'));
  });

  it('falls back to `data.id` when recordId is not provided', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [ROW] }) }));
    declareBearerSession('tok');
    renderWithLocale('es_ES', <YearCloseStatusBadge data={{ id: 'year-from-data' }} token="tok" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/accounting?year=year-from-data',
      expect.anything()
    ));
  });

  it('renders nothing while the request is pending (no misleading placeholder)', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    declareBearerSession('tok');
    const { container } = renderWithLocale('es_ES', <YearCloseStatusBadge recordId="year1" token="tok" apiBaseUrl="https://api.test" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing (fails silently) when the request errors, rather than showing a wrong status', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    declareBearerSession('tok');
    const { container } = renderWithLocale('es_ES', <YearCloseStatusBadge recordId="year1" token="tok" apiBaseUrl="https://api.test" />);

    // Give the rejected fetch a tick to resolve into the `null` (errored) state.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no year id at all', () => {
    global.fetch = vi.fn();
    declareBearerSession('tok');
    const { container } = renderWithLocale('es_ES', <YearCloseStatusBadge token="tok" apiBaseUrl="https://api.test" />);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
