// Shared test helpers for the fiscal-models pages that publish their title, breadcrumb and
// kebab to the app TopBar through `useSetPageMeta` (FmListPage, FmModel303Page, FmModel349Page).
//
// 1. A probe that reads the published meta back:
//      renderWithMeta(<Page … />);  expect(lastMeta.title).toBe(…);
//    `lastMeta` is a live ES-module binding, so it always holds the latest published meta.
//
// 2. A stand-in for the two contexts the TopBar kebab is wired to — FavoritesContext and
//    SupportChatContext — exposing their spies as `kebabSpies`. Mock BOTH modules with this file:
//      vi.mock('@/components/layout/FavoritesContext', () => import('<rel>/topBarMetaTestUtils.jsx'));
//      vi.mock('@/components/support/SupportChatContext.jsx', () => import('<rel>/topBarMetaTestUtils.jsx'));
//    (a factory returning the import keeps `vi.mock`'s hoisting happy, same pattern as
//    nativeSelectMock.jsx).
//
// 3. `describeTopBarKebab(name, { renderPage, beforeEachRender })` registers the three kebab
//    assertions every page shares: favourite toggle, page help, and `isFavorite` following the
//    context.
import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PageMetaProvider, usePageMeta } from '@/components/layout/PageMetaContext';

// ── Page-meta probe ──────────────────────────────────────────────────────────
export let lastMeta = null;

export function MetaProbe() {
  lastMeta = usePageMeta();
  return null;
}

export function renderWithMeta(ui) {
  lastMeta = null;
  return render(<PageMetaProvider>{ui}<MetaProbe /></PageMetaProvider>);
}

// ── FavoritesContext / SupportChatContext stand-in ───────────────────────────
export const kebabSpies = {
  toggleFavorite: vi.fn(),
  isFavorite: vi.fn(() => false),
  setTab: vi.fn(),
  open: vi.fn(),
};

export function useFavorites() {
  return { toggleFavorite: kebabSpies.toggleFavorite, isFavorite: kebabSpies.isFavorite };
}

export function useSupportChatSafe() {
  return { actions: { setTab: kebabSpies.setTab, open: kebabSpies.open } };
}

// ── Shared kebab assertions ──────────────────────────────────────────────────
// `renderPage()` renders the page through `renderWithMeta`; `beforeEachRender()` sets whatever
// the file needs first (e.g. the active locale). The favourite is always the window's
// ("fiscal-models"), labelled with the window name.
export function describeTopBarKebab(name, { renderPage, beforeEachRender = () => {}, windowLabel = 'Modelos Fiscales' }) {
  describe(`${name} — TopBar kebab: favourites and help (ETP-5584)`, () => {
    beforeEach(() => {
      kebabSpies.toggleFavorite.mockClear();
      kebabSpies.setTab.mockClear();
      kebabSpies.open.mockClear();
      kebabSpies.isFavorite.mockImplementation(() => false);
      beforeEachRender();
    });

    it('onAddToFavorites toggles the window favourite, labelled with the window name', () => {
      renderPage();
      lastMeta.onAddToFavorites();
      expect(kebabSpies.toggleFavorite).toHaveBeenCalledWith('fiscal-models', windowLabel);
    });

    it('onPageHelp opens the support chat on its "Ayuda" tab', () => {
      renderPage();
      lastMeta.onPageHelp();
      expect(kebabSpies.setTab).toHaveBeenCalledWith('ayuda');
      expect(kebabSpies.open).toHaveBeenCalledTimes(1);
    });

    it('isFavorite follows the favourites context for the "fiscal-models" key', () => {
      kebabSpies.isFavorite.mockImplementation((key) => key === 'fiscal-models');
      renderPage();
      expect(lastMeta.isFavorite).toBe(true);
      expect(kebabSpies.isFavorite).toHaveBeenCalledWith('fiscal-models');
    });
  });
}
