import { describe, it, expect } from 'vitest';
import { getLayout303, applyPatch, SUPPORTED_YEARS, SELECTABLE_YEARS } from '../fm303Layouts.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function sectionIds(layout) {
  return layout.sections.map(s => s.id);
}

function rowIds(layout, sectionId) {
  const sec = layout.sections.find(s => s.id === sectionId);
  return sec ? sec.rows.map(r => r.id) : null;
}

function assertSectionContains(layout, sectionId, ...ids) {
  const rows = rowIds(layout, sectionId);
  for (const id of ids) expect(rows).toContain(id);
}

function assertPreDevengadaAbsent(layout) {
  const ids = rowIds(layout, 'iva_devengado');
  for (const removed of ['150', '153', '156', '165', '168']) {
    expect(ids).not.toContain(removed);
  }
}

function assertTotalDevengadaPre2023Label(layout) {
  const sec = layout.sections.find(s => s.id === 'iva_devengado');
  const row = sec.rows.find(r => r.id === 'total_devengada');
  expect(row.labelKey).toBe('fm.box.row.total_devengada_pre2023');
}

// ── BASE layout (no patch) ────────────────────────────────────────────────────

describe('getLayout303 — BASE layout (no patch)', () => {
  const layout = getLayout303(2026, 1);

  it('returns all nine canonical sections', () => {
    expect(sectionIds(layout)).toEqual([
      'identificacion',
      'datos_bancarios',
      'iva_devengado',
      'iva_deducible',
      'resultado',
      'info_adicional',
      'resultado_final',
      'sin_actividad',
      'rectificativa',
    ]);
  });

  it('iva_devengado contains extended rows added in 2025 (150, 165, 168)', () => {
    assertSectionContains(layout, 'iva_devengado', '150', '165', '168');
  });

  it('iva_deducible contains regularizacion row (non-last period hides prorrata_definitiva)', () => {
    assertSectionContains(layout, 'iva_deducible', 'regularizacion');
    // prorrata_definitiva is only shown in T4/M12 — period 1 should not have it
    expect(rowIds(layout, 'iva_deducible')).not.toContain('prorrata_definitiva');
  });

  it('iva_deducible contains prorrata_definitiva for last period (T4)', () => {
    const lastLayout = getLayout303(2026, 'T4');
    assertSectionContains(lastLayout, 'iva_deducible', 'regularizacion', 'prorrata_definitiva');
  });

  it('resultado contains diferencia row', () => {
    assertSectionContains(layout, 'resultado', 'diferencia');
  });

  it('returns a new object on each call (no shared mutation)', () => {
    const a = getLayout303(2026, 1);
    const b = getLayout303(2026, 1);
    expect(a).not.toBe(b);
  });
});

// ── Period-specific lookup falls through to year patch ────────────────────────

describe('getLayout303 — period-specific key falls back to year key', () => {
  it('period key with no entry resolves to year-level patch', () => {
    const byYear   = getLayout303(2024, 1);
    const byPeriod = getLayout303(2024, 2);
    expect(sectionIds(byYear)).toEqual(sectionIds(byPeriod));
    expect(rowIds(byYear, 'iva_devengado')).toEqual(rowIds(byPeriod, 'iva_devengado'));
  });
});

// ── 2024 patch ────────────────────────────────────────────────────────────────

describe('getLayout303 — 2024 patch', () => {
  // period=1 has no specific key → falls back to PATCHES['2024'] (T4/M10/M11 behavior)
  const layout = getLayout303(2024, 1);

  it('still returns nine sections', () => {
    expect(layout.sections).toHaveLength(9);
  });

  it('keeps row 165 (introduced in 2024 T4, same as BASE)', () => {
    expect(rowIds(layout, 'iva_devengado')).toContain('165');
  });

  it('keeps row 168 (introduced in 2024 T4, same as BASE)', () => {
    expect(rowIds(layout, 'iva_devengado')).toContain('168');
  });

  it('keeps row 150 (present in 2024)', () => {
    expect(rowIds(layout, 'iva_devengado')).toContain('150');
  });

  it('keeps recargo_equiv rows (19, 22, recargo_equiv)', () => {
    const ids = rowIds(layout, 'iva_devengado');
    expect(ids).toContain('recargo_equiv');
    expect(ids).toContain('19');
    expect(ids).toContain('22');
  });
});

// ── 2023 patch ────────────────────────────────────────────────────────────────

describe('getLayout303 — 2023 patch', () => {
  const layout = getLayout303(2023, 4);

  it('removes rows 165 and 168 (not introduced until 2024 T4)', () => {
    const ids = rowIds(layout, 'iva_devengado');
    expect(ids).not.toContain('165');
    expect(ids).not.toContain('168');
  });

  it('keeps rows containing box numbers 152, 155, 158 (introduced in 2023)', () => {
    // Boxes 152/155/158 are cells inside rows 150/153/156 respectively
    const sec = layout.sections.find(s => s.id === 'iva_devengado');
    const allCells = sec.rows.flatMap(r => r.cells ?? []);
    expect(allCells).toContain(152);
    expect(allCells).toContain(155);
    expect(allCells).toContain(158);
  });

  it('keeps rows 150, 153, 156 (inherited from BASE, still present in 2023)', () => {
    assertSectionContains(layout, 'iva_devengado', '150', '153', '156');
  });

  it('keeps recargo_equiv, total_devengada and base rows 4, 7', () => {
    assertSectionContains(layout, 'iva_devengado', 'recargo_equiv', 'total_devengada', '4', '7');
  });

  it('keeps diferencia in resultado section', () => {
    assertSectionContains(layout, 'resultado', 'diferencia');
  });

  it('iva_deducible retains full BASE deductible rows', () => {
    assertSectionContains(layout, 'iva_deducible', 'op_int_corrientes', 'regularizacion', 'prorrata_definitiva');
  });
});

// ── 2022 patch ────────────────────────────────────────────────────────────────

describe('getLayout303 — 2022 patch', () => {
  const layout = getLayout303(2022, 1);

  it('returns nine sections', () => {
    expect(layout.sections).toHaveLength(9);
  });

  it('removes rows 150, 153, 156, 165, 168 (not introduced until 2023+)', () => {
    assertPreDevengadaAbsent(layout);
  });

  it('uses total_devengada_pre2023 label for row 27', () => {
    assertTotalDevengadaPre2023Label(layout);
  });

  it('rectificativa section is replaced with complementaria', () => {
    const sec = layout.sections.find(s => s.id === 'rectificativa');
    expect(sec.titleKey).toBe('fm.section.complementaria');
    const fieldIds = sec.fields.map(f => f.id);
    expect(fieldIds).toContain('complementaria');
    expect(fieldIds).not.toContain('rectificativa');
    expect(fieldIds).not.toContain('motivo_rectificacion');
  });
});

// ── 2021 patch ────────────────────────────────────────────────────────────────

describe('getLayout303 — 2021 patch', () => {
  const layout = getLayout303(2021, 1);

  it('removes rows 150, 153, 156, 165, 168', () => {
    assertPreDevengadaAbsent(layout);
  });

  it('uses total_devengada_pre2023 label for row 27', () => {
    assertTotalDevengadaPre2023Label(layout);
  });

  it('rectificativa section is replaced with complementaria', () => {
    const sec = layout.sections.find(s => s.id === 'rectificativa');
    expect(sec.titleKey).toBe('fm.section.complementaria');
  });
});

// ── total_devengada labelKey progression ─────────────────────────────────────

describe('getLayout303 — total_devengada labelKey by year', () => {
  function totalDevengadaLabelKey(year, period) {
    const layout = getLayout303(year, period);
    const sec = layout.sections.find(s => s.id === 'iva_devengado');
    return sec.rows.find(r => r.id === 'total_devengada')?.labelKey;
  }

  it('2021 uses pre2023 label', () => {
    expect(totalDevengadaLabelKey(2021, 1)).toBe('fm.box.row.total_devengada_pre2023');
  });

  it('2022 uses pre2023 label', () => {
    expect(totalDevengadaLabelKey(2022, 1)).toBe('fm.box.row.total_devengada_pre2023');
  });

  it('2023 uses 2023 label (adds boxes 152/155/158)', () => {
    expect(totalDevengadaLabelKey(2023, 1)).toBe('fm.box.row.total_devengada_2023');
  });

  it('2024 T4 (year-level patch) uses BASE label (adds 167/170)', () => {
    // period=1 falls back to year-level (T4 behavior)
    expect(totalDevengadaLabelKey(2024, 1)).toBe('fm.box.row.total_devengada');
  });

  it('2025 uses BASE label', () => {
    expect(totalDevengadaLabelKey(2025, 1)).toBe('fm.box.row.total_devengada');
  });

  it('2026 uses BASE label', () => {
    expect(totalDevengadaLabelKey(2026, 1)).toBe('fm.box.row.total_devengada');
  });
});

// ── BASE rectificativa section — motivo_rectificacion select ─────────────────

describe('getLayout303 — BASE rectificativa section', () => {
  const layout = getLayout303(2026, 1);
  const rectSec = layout.sections.find(s => s.id === 'rectificativa');

  it('has sectionType identificacion', () => {
    expect(rectSec.sectionType).toBe('identificacion');
  });

  it('has motivo_rectificacion field as select (not two checkboxes)', () => {
    const motivo = rectSec.fields.find(f => f.id === 'motivo_rectificacion');
    expect(motivo).toBeTruthy();
    expect(motivo.type).toBe('select');
    expect(motivo.options).toHaveLength(2);
    expect(motivo.options.map(o => o.value)).toEqual(['R', 'D']);
  });

  it('does not have motivo_heading subheading or radioGroup checkboxes', () => {
    const ids = rectSec.fields.map(f => f.id);
    expect(ids).not.toContain('motivo_heading');
    expect(ids).not.toContain('motivo_rectificaciones');
    expect(ids).not.toContain('motivo_discrepancia');
  });

  it('motivo_rectificacion is only visible when rectificativa checkbox is true', () => {
    const motivo = rectSec.fields.find(f => f.id === 'motivo_rectificacion');
    expect(motivo.visibleWhen).toEqual({ field: 'rectificativa', equals: true });
  });
});

// ── 2024 T1 complementaria ops (period-specific key) ─────────────────────────

describe('getLayout303 — 2024 T1 (complementaria)', () => {
  const layout = getLayout303(2024, 'T1');

  it('removes rows 165 and 168 (not present in T1)', () => {
    const ids = rowIds(layout, 'iva_devengado');
    expect(ids).not.toContain('165');
    expect(ids).not.toContain('168');
  });

  it('uses 2023 total_devengada label (no 167/170)', () => {
    const sec = layout.sections.find(s => s.id === 'iva_devengado');
    const row = sec.rows.find(r => r.id === 'total_devengada');
    expect(row.labelKey).toBe('fm.box.row.total_devengada_2023');
  });

  it('rectificativa section is replaced with complementaria', () => {
    const sec = layout.sections.find(s => s.id === 'rectificativa');
    expect(sec.titleKey).toBe('fm.section.complementaria');
  });
});

// ── Unknown year / period falls back to BASE ──────────────────────────────────

describe('getLayout303 — unknown year uses BASE', () => {
  it('year with no patch entry returns BASE sections', () => {
    const base  = getLayout303(2026, 1);
    const other = getLayout303(2099, 1);
    expect(sectionIds(other)).toEqual(sectionIds(base));
    expect(rowIds(other, 'iva_devengado')).toEqual(rowIds(base, 'iva_devengado'));
  });

  it('returns sections array (not null / undefined)', () => {
    const layout = getLayout303(2099, 1);
    expect(Array.isArray(layout.sections)).toBe(true);
    expect(layout.sections.length).toBeGreaterThan(0);
  });
});

// ── Patch engine — opDeleteRow does not crash on unknown row ──────────────────

describe('getLayout303 — deleteRow with non-existent row is a no-op', () => {
  it('2024 layout is well-formed even though 165/168 patches target rows BASE has', () => {
    expect(() => getLayout303(2024, 1)).not.toThrow();
    expect(() => getLayout303(2023, 1)).not.toThrow();
  });
});

// ── applyPatch — opInsertRow ──────────────────────────────────────────────────

describe('applyPatch — opInsertRow', () => {
  it('inserts after an existing row', () => {
    const result = applyPatch([
      { op: 'insertRow', section: 'resultado', after: 'diferencia', row: { id: 'new', cells: [99] } },
    ]);
    const ids = result.sections.find(s => s.id === 'resultado').rows.map(r => r.id);
    expect(ids).toEqual(['diferencia', 'new']);
  });

  it('appends at end when `after` target does not exist (defensive branch)', () => {
    const result = applyPatch([
      { op: 'insertRow', section: 'resultado', after: 'nonexistent', row: { id: 'appended', cells: [99] } },
    ]);
    const ids = result.sections.find(s => s.id === 'resultado').rows.map(r => r.id);
    expect(ids.at(-1)).toBe('appended');
  });

  it('inserts before an existing row', () => {
    const result = applyPatch([
      { op: 'insertRow', section: 'resultado', before: 'diferencia', row: { id: 'pre', cells: [0] } },
    ]);
    const ids = result.sections.find(s => s.id === 'resultado').rows.map(r => r.id);
    expect(ids).toEqual(['pre', 'diferencia']);
  });

  it('appends at end when `before` target does not exist (defensive branch)', () => {
    const result = applyPatch([
      { op: 'insertRow', section: 'resultado', before: 'ghost', row: { id: 'fallback', cells: [0] } },
    ]);
    const ids = result.sections.find(s => s.id === 'resultado').rows.map(r => r.id);
    expect(ids.at(-1)).toBe('fallback');
  });

  it('appends at end when neither after nor before is specified', () => {
    const result = applyPatch([
      { op: 'insertRow', section: 'resultado', row: { id: 'tail', cells: [0] } },
    ]);
    const ids = result.sections.find(s => s.id === 'resultado').rows.map(r => r.id);
    expect(ids.at(-1)).toBe('tail');
  });

  it('is a no-op when the section does not exist', () => {
    const result = applyPatch([
      { op: 'insertRow', section: 'phantom', row: { id: 'x', cells: [] } },
    ]);
    expect(result.sections.find(s => s.id === 'phantom')).toBeUndefined();
  });
});

// ── applyPatch — opPatchRow ───────────────────────────────────────────────────

describe('applyPatch — opPatchRow', () => {
  it('merges patch fields onto an existing row', () => {
    const result = applyPatch([
      { op: 'patchRow', section: 'resultado', row: 'diferencia', patch: { total: false } },
    ]);
    const row = result.sections.find(s => s.id === 'resultado').rows.find(r => r.id === 'diferencia');
    expect(row.total).toBe(false);
    expect(row.cells).toEqual([46]);
  });

  it('is a no-op when the row does not exist', () => {
    expect(() => applyPatch([
      { op: 'patchRow', section: 'resultado', row: 'ghost', patch: { total: true } },
    ])).not.toThrow();
  });

  it('is a no-op when the section does not exist', () => {
    expect(() => applyPatch([
      { op: 'patchRow', section: 'phantom', row: 'diferencia', patch: {} },
    ])).not.toThrow();
  });
});

// ── applyPatch — opReorderRows ────────────────────────────────────────────────

describe('applyPatch — opReorderRows', () => {
  it('reorders rows to the specified sequence', () => {
    const result = applyPatch([
      {
        op: 'reorderRows',
        section: 'iva_deducible',
        order: ['total_deducir', 'op_int_corrientes'],
      },
    ]);
    const ids = result.sections.find(s => s.id === 'iva_deducible').rows.map(r => r.id);
    expect(ids[0]).toBe('total_deducir');
    expect(ids[1]).toBe('op_int_corrientes');
  });

  it('drops rows not listed in order', () => {
    const result = applyPatch([
      { op: 'reorderRows', section: 'resultado', order: ['diferencia'] },
    ]);
    const ids = result.sections.find(s => s.id === 'resultado').rows.map(r => r.id);
    expect(ids).toEqual(['diferencia']);
  });

  it('is a no-op when section does not exist', () => {
    expect(() => applyPatch([
      { op: 'reorderRows', section: 'phantom', order: [] },
    ])).not.toThrow();
  });
});

// ── applyPatch — opDeleteSection ──────────────────────────────────────────────

describe('applyPatch — opDeleteSection', () => {
  it('removes the specified section from the output', () => {
    const result = applyPatch([
      { op: 'deleteSection', section: 'info_adicional' },
    ]);
    expect(result.sections.find(s => s.id === 'info_adicional')).toBeUndefined();
  });

  it('is a no-op when section does not exist (defensive idx !== -1 guard)', () => {
    expect(() => applyPatch([
      { op: 'deleteSection', section: 'phantom' },
    ])).not.toThrow();
  });
});

// ── applyPatch — opInsertSection ──────────────────────────────────────────────

describe('applyPatch — opInsertSection', () => {
  const newSec = {
    titleKey: 'fm.test.section',
    colHeaderKeys: [],
    rows: [{ id: 'r1', cells: [200] }],
  };

  it('inserts a new section after an existing one', () => {
    const result = applyPatch([
      { op: 'insertSection', after: 'resultado', section: 'extra', section_def: newSec },
    ]);
    const ids = sectionIds(result);
    const resultIdx = ids.indexOf('resultado');
    expect(ids[resultIdx + 1]).toBe('extra');
  });

  it('inserts a new section before an existing one', () => {
    const result = applyPatch([
      { op: 'insertSection', before: 'resultado', section: 'extra', section_def: newSec },
    ]);
    const ids = sectionIds(result);
    const extraIdx = ids.indexOf('extra');
    expect(ids[extraIdx + 1]).toBe('resultado');
  });

  it('appends section at end when neither after nor before is given', () => {
    const result = applyPatch([
      { op: 'insertSection', section: 'tail_section', section_def: newSec },
    ]);
    expect(sectionIds(result).at(-1)).toBe('tail_section');
  });
});

// ── applyPatch — opPatchSection ───────────────────────────────────────────────

describe('applyPatch — opPatchSection', () => {
  it('merges patch fields onto an existing section (excluding rows)', () => {
    const result = applyPatch([
      { op: 'patchSection', section: 'resultado', patch: { titleKey: 'fm.test.override', rows: ['ignored'] } },
    ]);
    const sec = result.sections.find(s => s.id === 'resultado');
    expect(sec.titleKey).toBe('fm.test.override');
    expect(sec.rows.map(r => r.id)).toContain('diferencia');
  });

  it('is a no-op when section does not exist', () => {
    expect(() => applyPatch([
      { op: 'patchSection', section: 'phantom', patch: { titleKey: 'x' } },
    ])).not.toThrow();
  });
});

// ── SUPPORTED_YEARS export ────────────────────────────────────────────────────

describe('SUPPORTED_YEARS', () => {
  it('is a sorted array of numbers', () => {
    expect(Array.isArray(SUPPORTED_YEARS)).toBe(true);
    for (let i = 1; i < SUPPORTED_YEARS.length; i++) {
      expect(SUPPORTED_YEARS[i]).toBeGreaterThan(SUPPORTED_YEARS[i - 1]);
    }
  });

  it('includes all years that have patches (2021, 2022, 2023, 2024, 2025)', () => {
    for (const year of [2021, 2022, 2023, 2024, 2025]) {
      expect(SUPPORTED_YEARS).toContain(year);
    }
  });

  it('includes BASE_YEAR 2026', () => {
    expect(SUPPORTED_YEARS).toContain(2026);
  });

  it('does not include NaN entries (period-suffix keys like 2024_T1 are excluded)', () => {
    for (const y of SUPPORTED_YEARS) {
      expect(typeof y).toBe('number');
      expect(Number.isNaN(y)).toBe(false);
    }
  });

  it('does not contain duplicates', () => {
    expect(SUPPORTED_YEARS.length).toBe(new Set(SUPPORTED_YEARS).size);
  });

  it('has exactly 6 entries: 2021 through 2026', () => {
    expect(SUPPORTED_YEARS).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
  });
});

// ── datos_bancarios section (EDID065 fix — AEAT rejects IBAN for tipos other
// than U/D/X — AND the ETP-4456 follow-up fix that widens visibility to an
// anyOf so a rectificativa under any tipo_declaracion can still enter the
// AEAT-mandatory bank fields) ─────────────────────────────────────────────

describe('getLayout303 — datos_bancarios section visibility (EDID065 + rectificativa anyOf fix)', () => {
  const layout = getLayout303(2026, 1);
  const sec = layout.sections.find(s => s.id === 'datos_bancarios');

  // ETP-5393 manual-QA fix — the rectificativa branch now also requires `_box111NonZero`,
  // matching `_BANK_FULL_BLOCK_REQUIRED_WHEN` exactly, so the section hides again as soon
  // as either rectificativa is unchecked or box 111 goes back to 0 (previously it stayed
  // visible on rectificativa alone — see fm303Layouts.bankVisibilityReactivity.vitest.js).
  it('sectionVisibleWhen is an anyOf of tipo_declaracion U/D/X OR (rectificativa checked AND box 111 non-zero)', () => {
    expect(sec.sectionVisibleWhen).toEqual({ anyOf: [
      { field: 'tipo_declaracion', in: ['U', 'D', 'X'] },
      { allOf: [
        { field: 'rectificativa', equals: true },
        { field: '_box111NonZero', equals: true },
      ] },
    ] });
  });

  // ETP-5393 Bug E — bank_iban is no longer a static `required: true`. It's now conditional
  // via `requiredWhen`: always required for tipo U/D/X (unchanged, AEAT EDID065), and for a
  // rectificativa filed under any other tipo ONLY when box 111 is non-zero — see
  // fm303Layouts.bankIbanRequiredWhen.vitest.js for full requiredWhen coverage.
  it('bank_iban has no static `required` flag — required is conditional via requiredWhen', () => {
    const iban = sec.fields.find(f => f.id === 'bank_iban');
    expect(iban.required).toBeUndefined();
    expect(iban.requiredWhen).toEqual({ anyOf: [
      { field: 'tipo_declaracion', in: ['U', 'D', 'X'] },
      { allOf: [
        { field: 'rectificativa', equals: true },
        { field: '_box111NonZero', equals: true },
      ] },
    ] });
  });

  // ETP-5393 follow-up (manual-QA fix) — AEAT303Report requires the FULL bank block (not just
  // IBAN) ONLY under condition B (rectificativa + non-zero box 111) — NOT under condition A
  // (a plain tipo U/D/X devolución/domiciliación, which requires IBAN alone per AEAT EDID065).
  // The other 6 bank fields therefore carry a NARROWER requiredWhen than bank_iban — no
  // `tipo_declaracion in [U,D,X]` branch.
  it('the other 6 bank fields require ONLY condition B (rectificativa + non-zero box 111), narrower than bank_iban', () => {
    const expectedRequiredWhen = { allOf: [
      { field: 'rectificativa', equals: true },
      { field: '_box111NonZero', equals: true },
    ] };
    ['bank_swift_bic', 'bank_nombre', 'bank_direccion', 'bank_ciudad', 'bank_pais', 'bank_sepa']
      .forEach((id) => {
        const field = sec.fields.find(f => f.id === id);
        expect(field.required).toBeUndefined();
        expect(field.requiredWhen).toEqual(expectedRequiredWhen);
      });
  });

  it('titleKeyMap only maps D, X (devolucion) and U (domiciliacion) — no G, I, V entries', () => {
    expect(sec.titleKeyMap).toEqual({
      D: 'fm.section.devolucion',
      X: 'fm.section.devolucion',
      U: 'fm.section.domiciliacion',
    });
    expect(sec.titleKeyMap).not.toHaveProperty('G');
    expect(sec.titleKeyMap).not.toHaveProperty('I');
    expect(sec.titleKeyMap).not.toHaveProperty('V');
  });

  it('is still returned by getLayout303 (titleKeyMap alone satisfies the titleKey||titleKeyMap filter)', () => {
    expect(sec).toBeTruthy();
    expect(sec.titleKeyFrom).toBe('tipo_declaracion');
  });
});

// ── sin_actividad section ─────────────────────────────────────────────────────

describe('getLayout303 — sin_actividad section', () => {
  it('BASE (2026) has a single checkbox field with id sin_actividad', () => {
    const layout = getLayout303(2026, 1);
    const sec = layout.sections.find(s => s.id === 'sin_actividad');
    expect(sec).toBeTruthy();
    expect(sec.fields).toHaveLength(1);
    const field = sec.fields[0];
    expect(field.id).toBe('sin_actividad');
    expect(field.type).toBe('checkbox');
    expect(field.readOnly).toBe(false);
  });

  it('BASE sin_actividad has sectionType identificacion', () => {
    const layout = getLayout303(2026, 1);
    const sec = layout.sections.find(s => s.id === 'sin_actividad');
    expect(sec.sectionType).toBe('identificacion');
    expect(sec.titleKey).toBe('fm.section.sin_actividad');
  });

  it('2022 patch does not remove the sin_actividad section', () => {
    const layout = getLayout303(2022, 1);
    const sec = layout.sections.find(s => s.id === 'sin_actividad');
    expect(sec).toBeTruthy();
    expect(sec.fields).toHaveLength(1);
    expect(sec.fields[0].id).toBe('sin_actividad');
  });

  it('2023 patch does not remove the sin_actividad section', () => {
    const layout = getLayout303(2023, 1);
    const sec = layout.sections.find(s => s.id === 'sin_actividad');
    expect(sec).toBeTruthy();
    expect(sec.fields).toHaveLength(1);
    expect(sec.fields[0].id).toBe('sin_actividad');
  });

  it('sin_actividad field has labelKey fm.ident.sin_actividad', () => {
    const layout = getLayout303(2026, 1);
    const sec = layout.sections.find(s => s.id === 'sin_actividad');
    expect(sec.fields[0].labelKey).toBe('fm.ident.sin_actividad');
  });
});

// ── identificacion — dep_aduanero/dep_foral removal (ETP-5272 pt.7) ──────────
// Both checkboxes were non-functional (no backend field ever read them) and
// were removed from BASE's `identificacion` fields and from
// `_2024_IDENTIFICACION_FIELDS` (shared by the 2021/2022/2024 patches) along
// with their i18n keys. Regression guard: neither id may resurface in any
// year's resolved identificacion field list.
describe('getLayout303 — identificacion no longer carries dep_aduanero/dep_foral (ETP-5272 pt.7)', () => {
  function identificacionFieldIds(year, period = 1) {
    const layout = getLayout303(year, period);
    const sec = layout.sections.find(s => s.id === 'identificacion');
    return sec.fields.map(f => f.id);
  }

  it('BASE (2026) identificacion has neither dep_aduanero nor dep_foral', () => {
    const ids = identificacionFieldIds(2026);
    expect(ids).not.toContain('dep_aduanero');
    expect(ids).not.toContain('dep_foral');
  });

  it('the 2021 patch (_2024_IDENTIFICACION_FIELDS) has neither field', () => {
    const ids = identificacionFieldIds(2021);
    expect(ids).not.toContain('dep_aduanero');
    expect(ids).not.toContain('dep_foral');
  });

  it('the 2022 patch (_2024_IDENTIFICACION_FIELDS) has neither field', () => {
    const ids = identificacionFieldIds(2022);
    expect(ids).not.toContain('dep_aduanero');
    expect(ids).not.toContain('dep_foral');
  });

  it('the 2024 patch (_2024_IDENTIFICACION_FIELDS) has neither field', () => {
    const ids = identificacionFieldIds(2024);
    expect(ids).not.toContain('dep_aduanero');
    expect(ids).not.toContain('dep_foral');
  });

  it('nif and nombre remain present (removal did not collaterally drop sibling read-only fields)', () => {
    const ids = identificacionFieldIds(2026);
    expect(ids).toContain('nif');
    expect(ids).toContain('nombre');
  });
});

// ── Last-period-only sections (ETP-5391): tributacion_territorial,
// info_adicional_ultimo_periodo (the latter also carries the merged
// declaracion_terceros checkbox as a leading field) ─────────────────────────
// Only meaningful/populated by Classic's AEAT303Report when the declared
// period is the last one of the fiscal year (quarterly T4 / monthly 12) —
// getLayout303 must strip both out entirely for any other period.

const LAST_PERIOD_SECTION_IDS = ['tributacion_territorial', 'info_adicional_ultimo_periodo'];

describe('getLayout303 — last-period-only sections are present for T4/12 and absent otherwise', () => {
  it.each([
    ['T1', 1], ['T2', 2], ['T3', 3],
  ])('absent for quarterly period %s', (period) => {
    const ids = sectionIds(getLayout303(2026, period));
    for (const id of LAST_PERIOD_SECTION_IDS) expect(ids).not.toContain(id);
  });

  it.each([
    ['1', '1'], ['2', '2'], ['3', '3'],
    ['11 (monthly, not last)', '11'],
  ])('absent for period %s', (_label, period) => {
    const ids = sectionIds(getLayout303(2026, period));
    for (const id of LAST_PERIOD_SECTION_IDS) expect(ids).not.toContain(id);
  });

  it.each([
    ['T4 (quarterly last)', 'T4'],
    ["'12' (monthly last, string)", '12'],
    ['12 (monthly last, number)', 12],
    ["'4' (last, string)", '4'],
    ['4 (last, number)', 4],
  ])('present for %s', (_label, period) => {
    const ids = sectionIds(getLayout303(2026, period));
    for (const id of LAST_PERIOD_SECTION_IDS) expect(ids).toContain(id);
  });

  it('sectionOrder still places the two sections between resultado_final and sin_actividad for T4', () => {
    const ids = sectionIds(getLayout303(2026, 'T4'));
    const rfIdx = ids.indexOf('resultado_final');
    const saIdx = ids.indexOf('sin_actividad');
    expect(rfIdx).toBeGreaterThan(-1);
    expect(saIdx).toBeGreaterThan(rfIdx);
    for (const id of LAST_PERIOD_SECTION_IDS) {
      const idx = ids.indexOf(id);
      expect(idx).toBeGreaterThan(rfIdx);
      expect(idx).toBeLessThan(saIdx);
    }
  });
});

describe('getLayout303 — tributacion_territorial section content (T4)', () => {
  const layout = getLayout303(2026, 'T4');
  const sec = layout.sections.find(s => s.id === 'tributacion_territorial');

  it('exists and has 5 rows (89/90/91/92 + 107 territorio_comun)', () => {
    expect(sec).toBeTruthy();
    expect(sec.rows).toHaveLength(5);
  });

  it('all 4 territorial percentage rows (Álava/Gipuzkoa/Bizkaia/Navarra) are editable percent cells', () => {
    const editableRows = ['territorio_alava', 'territorio_guipuzcoa', 'territorio_vizcaya', 'territorio_navarra'];
    const expectedCells = { territorio_alava: 89, territorio_guipuzcoa: 90, territorio_vizcaya: 91, territorio_navarra: 92 };
    for (const id of editableRows) {
      const row = sec.rows.find(r => r.id === id);
      expect(row).toBeTruthy();
      expect(row.editable).toBe(true);
      expect(row.cells).toEqual([expectedCells[id]]);
      expect(row.cellTypes).toEqual(['percent']);
      expect(row.cellUnits).toEqual(['%']);
      expect(row.derivedValue).toBeUndefined();
    }
  });

  it('territorio_comun (box 107) is a NOT-editable derivedValue mirroring box 65, defaulting to 100', () => {
    const row = sec.rows.find(r => r.id === 'territorio_comun');
    expect(row).toBeTruthy();
    expect(row.cells).toEqual([107]);
    expect(row.cellTypes).toEqual(['percent']);
    expect(row.cellUnits).toEqual(['%']);
    expect(row.editable).toBeUndefined();
    expect(row.derivedValue).toEqual({ box: 65, defaultValue: 100 });
  });
});

describe('getLayout303 — info_adicional_ultimo_periodo section content (T4)', () => {
  const layout = getLayout303(2026, 'T4');
  const sec = layout.sections.find(s => s.id === 'info_adicional_ultimo_periodo');

  // ETP-5391 follow-up: declaracion_terceros (Modelo 347 filing-exemption checkbox) no longer
  // has its own section — it is merged in as this section's leading field, matching Classic's
  // own popup layout (grouped with these 5 boxes under one heading, no separate title of its own).
  it('carries the merged declaracion_terceros checkbox as its leading field', () => {
    expect(sec.fields).toHaveLength(1);
    const field = sec.fields[0];
    expect(field.id).toBe('declaracion_terceros');
    expect(field.type).toBe('checkbox');
    expect(field.readOnly).toBe(false);
    expect(field.labelKey).toBe('fm.ident.declaracion_terceros');
  });

  it('is not sectionType identificacion (row-based section carrying a leading fields checkbox)', () => {
    expect(sec.sectionType).toBeUndefined();
  });

  it('exists and has exactly 5 editable rows for casillas 95/97/98/127/128', () => {
    expect(sec).toBeTruthy();
    expect(sec.rows).toHaveLength(5);
    const expected = {
      info_reagyp: 95, info_bienes_usados: 97, info_agencias_viaje: 98,
      info_oss: 127, info_intragrupo: 128,
    };
    for (const [id, box] of Object.entries(expected)) {
      const row = sec.rows.find(r => r.id === id);
      expect(row).toBeTruthy();
      expect(row.editable).toBe(true);
      expect(row.cells).toEqual([box]);
    }
  });

  it('does NOT include box 96 (always zero-filled) or box 99 (DB-computed) as manual rows', () => {
    const allCells = sec.rows.flatMap(r => r.cells ?? []);
    expect(allCells).not.toContain(96);
    expect(allCells).not.toContain(99);
  });
});

// ── SELECTABLE_YEARS export (ETP-5391) ───────────────────────────────────────
// Narrower than SUPPORTED_YEARS — only the current filing year is offered when
// CREATING a new declaration; SUPPORTED_YEARS keeps resolving layouts for
// existing declarations back to 2021.

describe('SELECTABLE_YEARS', () => {
  it('is an array containing only the current filing year (2026)', () => {
    expect(SELECTABLE_YEARS).toEqual([2026]);
  });

  it('is a strict subset of SUPPORTED_YEARS', () => {
    for (const y of SELECTABLE_YEARS) expect(SUPPORTED_YEARS).toContain(y);
  });

  it('does not include any prior filing year present in SUPPORTED_YEARS (2021-2025)', () => {
    for (const y of [2021, 2022, 2023, 2024, 2025]) {
      expect(SELECTABLE_YEARS).not.toContain(y);
    }
  });

  it('SUPPORTED_YEARS still spans 2021-2026 regardless of the SELECTABLE_YEARS restriction (existing declarations still resolve)', () => {
    expect(SUPPORTED_YEARS).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
  });
});
