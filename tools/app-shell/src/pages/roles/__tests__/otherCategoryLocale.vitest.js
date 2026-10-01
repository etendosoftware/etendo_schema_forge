// ETP-5485 review (W1) — both role matrices ("Configuración > Roles" and the User window's
// "Roles del usuario" tab) render category headers through `useMenuLabel()`. A window with no
// top-level AD_Menu folder lands in the backend's last-resort category, whose literal key is
// `RoleAccessMatrix.OTHER_CATEGORY = "Other"` (com.etendoerp.go). Without a `menus.Other` entry
// that header shows up in English in the Spanish UI, so every shipped locale must carry it.
import { describe, it, expect } from 'vitest';
import enUS from '../../../locales/en_US.json' with { type: 'json' };
import esES from '../../../locales/es_ES.json' with { type: 'json' };
import esAR from '../../../locales/es_AR.json' with { type: 'json' };

// Must stay equal to RoleAccessMatrix.OTHER_CATEGORY on the backend.
const BACKEND_OTHER_CATEGORY = 'Other';

describe('backend "Other" matrix category translation', () => {
  it.each([
    ['en_US', enUS, 'Other'],
    ['es_ES', esES, 'Otros'],
    ['es_AR', esAR, 'Otros'],
  ])('%s carries a menus.Other label', (_locale, dictionary, expected) => {
    expect(dictionary.menus?.[BACKEND_OTHER_CATEGORY]?.label).toBe(expected);
  });
});
