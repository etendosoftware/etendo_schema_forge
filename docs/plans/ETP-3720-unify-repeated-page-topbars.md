# ETP-3720: Unify Repeated Page Topbars into Shared App Shell Source

## Overview

Previously, pages inside the application shell (e.g. `FirstStepsPage`) had duplicate or nested TopBar header declarations rendered directly in their own JSX templates, while `AppLayout` simultaneously rendered the shared platform `TopBar` at the root shell level. In addition, `AppLayout` did not delegate all metadata properties (such as `onNewClick`, `onBellClick`, `onSearchClick`, `searchPlaceholder`, `className`) from `PageMetaContext` down to `TopBar`.

This task unifies repeated page-level topbars into the shared app-shell source:
1. `tools/app-shell/src/components/layout/TopBar/TopBar.jsx`: Retains the canonical, responsive TopBar implementation supporting title truncation, breadcrumbs, record count badges, dropdown menu actions (favorites, page help, custom menu actions), global search, Copilot/AI triggers, new record triggers, notification bell triggers, and custom right-slot extras.
2. `tools/app-shell/src/layout/AppLayout.jsx`: Forwards the full suite of `meta` properties provided by `usePageMeta()` (`onNewClick`, `onBellClick`, `onSearchClick`, `searchPlaceholder`, `className`, etc.) to `TopBar`.
3. `tools/app-shell/src/pages/FirstStepsPage.jsx`: Replaced the redundant `<TopBar>` component instantiation with `useSetPageMeta({ title: ui('firstStepsPageTitle') })`, eliminating duplicate header bars inside child routes.
4. Comprehensive test coverage added for all TopBar features in `tools/app-shell/src/components/layout/TopBar/__tests__/TopBar.vitest.jsx` and `tools/app-shell/src/pages/__tests__/FirstStepsPage.vitest.jsx`.

## Architectural Invariants

- **Single Shell Header**: Route components inside `<Outlet />` must not render their own `<TopBar>` or fixed page `<header>`. Page titles, breadcrumbs, and actions must be declared declaratively via `useSetPageMeta()`.
- **TopBar Metadata Delegation**: `AppLayout` provides the sole rendering point for `TopBar` when not in embedded mode, binding directly to `usePageMeta()`.
- **Zero Generated Artifact Edits**: No generated artifact code under `artifacts/*/generated/` is touched.
