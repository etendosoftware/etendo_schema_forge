import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8');
const src = read('ListView.jsx');
// The button, its format menu and the request composition were extracted to their own component
// in PR review (SonarQube S3776 on ListView). The assertions below follow the text: `exportSrc`
// for anything that moved, `src` for what ListView still owns — the import button it sits beside,
// the header-scope resolver it shares with ImportDialog, and the labels it forwards.
const exportSrc = read('ListExportButton.jsx');

/**
 * Source-contract checks for the ETP-4997 export wiring.
 *
 * ListView mounts a router, an auth provider, a data hook and a dozen popovers, so there is no
 * render harness for it in this repo and standing one up for two buttons would be more fragile
 * than the code it guards. These assertions instead pin the handful of decisions that are easy
 * to undo by accident and silent when they are — the column derivation lives in
 * `importExportColumns.vitest.js`, which is behavioural.
 *
 * `ListExportButton` is now small enough to mount, so upgrading its half of this file to a real
 * render test is worth doing and is left as a follow-up.
 */
describe('ListView export wiring', () => {
  it('exports the rows the SERVER has, not the pages already scrolled into memory', () => {
    // `hook.items` holds only the fetched pages (BATCH_SIZE at a time), so exporting it would
    // silently truncate any list the user had not scrolled to the end of.
    // The composition moved to ListExportButton, so this pins both halves of the wiring
    // rather than one call site: ListView hands over the grid's OWN builder, and the export
    // invokes it. Stricter than the single `hook.buildListQuery()` it replaces.
    expect(src).toMatch(/buildListQuery=\{hook\.buildListQuery\}/);
    expect(exportSrc).toMatch(/const query = buildListQuery\(\);/);
    expect(exportSrc).not.toMatch(/buildExportColumns[\s\S]{0,400}hook\.items/);
  });

  it('streams the CSV from the backend instead of building it in the browser', () => {
    expect(exportSrc).toMatch(/useCsvExport\(\)/);
    expect(exportSrc).toMatch(/serializeExportColumns\(columns\)/);
  });

  it('derives its columns from the import template, in the session language', () => {
    // `importFieldLabel` is the same resolver handed to ImportDialog as `fieldLabelFn`, which
    // is what keeps an export and a downloaded template byte-identical in any locale.
    expect(exportSrc).toMatch(/buildExportColumns\(importConfig,\s*\{\s*headerFor:\s*importFieldLabel\s*\}\)/);
  });

  it('sends the coded-value labels, so a code never reaches the file', () => {
    // The CSV is serialized server-side, so the map has to travel with the request; it is
    // omitted entirely when the window maps nothing.
    expect(exportSrc).toMatch(/buildExportValueMaps\(importConfig, columns\)/);
    expect(exportSrc).toMatch(/if \(valueMaps\) query\.append\('valueMaps', JSON\.stringify\(valueMaps\)\)/);
  });

  it('asks the handler for the child records a list row omits', () => {
    // Contacts' person and address columns live on AD_User / C_BPartner_Location, which a
    // C_BPartner row does not carry; without this flag they export empty.
    expect(exportSrc).toMatch(/query\.append\('includeChildData', '1'\)/);
  });

  it('honours the same row ceiling the import does', () => {
    expect(exportSrc).toMatch(/importConfig\?\.limit\?\.maxRows/);
  });

  it('addresses the entity on the window-scoped base, like the rest of ListView', () => {
    // `apiBaseUrl` already carries the window segment; useCsvExport's own page-derived base
    // does not, so dropping this override would request the wrong URL — and silently, since
    // the failure is a 404 the toast reports as a generic export error.
    expect(exportSrc).toMatch(/baseUrl:\s*apiBaseUrl/);
  });

  it('shows export beside import, on the same gate', () => {
    expect(exportSrc).toMatch(/data-testid="ListView__exportButton"/);
    expect(src).toMatch(/data-testid="ListView__importButton"/);
    // Both buttons hang off `import.enabled` — a window with no import template has no columns
    // to export either.
    expect(src.match(/importConfig\?\.enabled && \(/g) ?? []).toHaveLength(2);
  });

  it('SHELL-02: the arrow follows the data, not the file', () => {
    // Import pulls records IN (Download), export pushes them OUT (Upload). The import button
    // used to carry the outward arrow, which read as an export.
    expect(src).toMatch(/<Download className="h-3\.5 w-3\.5" data-testid="Download__ListViewImport"/);
    expect(exportSrc).toMatch(/<Upload className="h-3\.5 w-3\.5" data-testid="Upload__ListViewExport"/);
  });

  // ETP-4997 — a Contacts row is split across three records, but the header qualifier had only
  // one value ("contact") for everything off the header entity, so the five address columns were
  // labelled "Dirección (Contacto)" — naming the wrong tab in an exported file.
  it('names the tab a column belongs to, not just "contact"', () => {
    expect(src).toMatch(/contact: ui\('importHeaderScopeContact'\)/);
    expect(src).toMatch(/address: ui\('importHeaderScopeAddress'\)/);
    // Driven by a lookup, so an unknown scope yields no qualifier instead of a raw key.
    expect(src).toMatch(/importHeaderScopeLabels\[field\.headerScope\]/);
    expect(src).not.toMatch(/field\.headerScope === 'contact'/);
    // The address column's own label is the scope word; qualifying it would read
    // "Dirección (Dirección)".
    expect(src).toMatch(/if \(!scope \|\| sameLabel\(base, scope\)\) return base;/);
  });

  it('localizes every string it puts on screen', () => {
    for (const key of ['export', 'exportDone', 'exportError']) {
      expect(exportSrc).toMatch(new RegExp(`ui\\('${key}'\\)`));
    }
    // ListView still owns the import button beside it.
    expect(src).toMatch(/ui\('import'\)/);
  });

  // ── format choice (ETP-4997, xlsx) ──────────────────────────────────────────

  it('derives the offered formats from the window declaration, not a local list', () => {
    // A hardcoded ['csv','xlsx'] here could offer a format the import cannot read back;
    // outputFormats is the shared helper the import dialog uses for its template buttons too.
    expect(exportSrc).toMatch(/outputFormats\(importConfig\?\.formats\)/);
    expect(exportSrc).not.toMatch(/exportFormats\s*=\s*\[/);
  });

  it('passes the chosen format through to the hook', () => {
    expect(exportSrc).toMatch(/const handleExport = useCallback\(async \(format = 'csv'\)/);
    expect(exportSrc).toMatch(/\n[ \t]+format,\n/);
  });

  it('sends a filename with no extension, so the hook owns it per format', () => {
    // A `.csv` name on a workbook gives the user a file Excel refuses to open.
    expect(exportSrc).toMatch(/filename: `\$\{importConfig\.spec\}-export`/);
    expect(exportSrc).not.toMatch(/\$\{importConfig\.spec\}-export\.csv/);
  });

  it('keeps a single-format window on a plain button and only adds a menu when there is a choice', () => {
    // An early return rather than a ternary in the JSX — same two mount points, and the
    // single-format window still renders a bare button with no menu wrapper at all.
    expect(exportSrc).toMatch(/if \(exportFormats\.length <= 1\) return button;/);
    expect(exportSrc).toMatch(/<DropdownMenuTrigger asChild/);
    // One button markup shared by both mount points, so icon/size/testid cannot diverge.
    expect(exportSrc.match(/data-testid="ListView__exportButton"/g) ?? []).toHaveLength(1);
  });

  it('localizes the format menu items instead of printing CSV/XLSX raw', () => {
    expect(exportSrc).toMatch(/EXPORT_FORMAT_LABEL_KEYS = \{ csv: 'exportCsv', xlsx: 'exportXlsx' \}/);
    expect(exportSrc).toMatch(/ui\(EXPORT_FORMAT_LABEL_KEYS\[format\]\)/);
  });

  it('tells the dialog which formats to accept and offer as templates', () => {
    expect(src).toMatch(/downloadTemplateCsv: ui\('importDownloadTemplateCsv'\)/);
    expect(src).toMatch(/downloadTemplateXlsx: ui\('importDownloadTemplateXlsx'\)/);
    // The hint must carry the {formats} placeholder key, not the old fixed-format sentence.
    expect(src).toMatch(/dropHint: ui\('importDropHintFormats'\)/);
  });
});
