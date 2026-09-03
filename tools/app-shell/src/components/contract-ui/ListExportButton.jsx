import { useCallback, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';
import { useCsvExport } from '@/hooks/useCsvExport';
import { outputFormats } from '@etendosoftware/app-shell-core/lib/import/importFormats.js';
import { buildExportColumns, buildExportValueMaps, serializeExportColumns } from '@/lib/importExportColumns.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';

/** Menu caption per export format. Keys live in both locale files (i18n policy). */
const EXPORT_FORMAT_LABEL_KEYS = { csv: 'exportCsv', xlsx: 'exportXlsx' };

/**
 * Composes and runs one list export: resolves the columns, builds the query the server will
 * serialize, and reports the outcome.
 *
 * <p>Declining is silent and deliberate: a window whose import declares no exportable field has
 * nothing to write, and a toast for it would be noise on a button the user should not have.
 */
async function runListExport({
  format, importConfig, importFieldLabel, apiBaseUrl, buildListQuery, runCsvExport, ui,
}) {
  const columns = buildExportColumns(importConfig, { headerFor: importFieldLabel });
  if (columns.length === 0) return;
  // The same ceiling the import honours, so neither direction can outgrow the other.
  const maxRows = importConfig?.limit?.maxRows ?? 5000;
  const query = buildListQuery();
  query.append('_startRow', '0');
  query.append('_endRow', String(maxRows - 1));
  query.append('columns', serializeExportColumns(columns));
  // Part of the export contract, sent for every window: "this GET feeds a file the user will
  // edit and re-import, so include the child records a list row omits". A NeoHandler that can
  // supply them does (contacts attaches its primary contact person and address); every other
  // window's handler ignores the param, exactly as it ignores `export`/`columns`.
  query.append('includeChildData', '1');
  // AD-coded columns would otherwise export as codes ("false", "6", "I"). The map is built
  // from the descriptor's own synonym tables, so every word it writes re-imports.
  const valueMaps = buildExportValueMaps(importConfig, columns);
  if (valueMaps) query.append('valueMaps', JSON.stringify(valueMaps));
  try {
    await runCsvExport({
      // `apiBaseUrl` already carries the window segment (`/sws/neo/contacts`), which is what
      // the entity path is relative to — the same base `importExistingKeys` fetches on.
      baseUrl: apiBaseUrl,
      path: `/${importConfig.entity}?${query.toString()}`,
      // No extension: the hook appends the one matching the format, so a single name serves
      // both and a workbook can never go out under a .csv name.
      filename: `${importConfig.spec}-export`,
      format,
    });
    toast.success(ui('exportDone'));
  } catch (e) {
    console.error('csv export error', e);
    toast.error(ui('exportError'));
  }
}

/**
 * The list toolbar's Export action — the mirror image of Import (ETP-4997).
 *
 * <p>It reuses the window's `import.fields` as its column set (see `importExportColumns.js`) so
 * export -> edit -> import closes the loop instead of producing a file the import cannot read
 * back. The headers come out of the template writer itself, resolved with the SAME
 * `importFieldLabel` handed to `ImportDialog`, so an export and a downloaded template are
 * byte-identical in whichever language the session is running.
 *
 * <p>The rows are re-fetched through `buildListQuery` — the grid's own sort + criteria — rather
 * than taken from the rows already in memory: the list is filtered and paginated server-side, so
 * exporting what is on screen would silently export only the pages the user scrolled. The server
 * serializes them (`export=csv|xlsx`), so a 5000-row export never has to materialize in the
 * browser.
 *
 * <p>Extracted from `ListView` (PR review): the button, its format menu and the request
 * composition are one concern, and inlining them took `ListView` past its cognitive-complexity
 * budget (SonarQube S3776). `ListView`'s own props are unchanged, so the 70-odd generated window
 * pages that import it are untouched.
 *
 * @param importConfig the window's `window.import` block — the column source and the format
 *   declaration both come from it.
 * @param importFieldLabel the same header resolver `ImportDialog` gets, so headers match.
 * @param apiBaseUrl already carries the window segment; the entity path is relative to it.
 * @param buildListQuery the grid's own query builder, so the export honours the live filters.
 */
export function ListExportButton({ importConfig, importFieldLabel, apiBaseUrl, buildListQuery }) {
  const ui = useUI();
  const runCsvExport = useCsvExport();
  const [exporting, setExporting] = useState(false);
  // Which formats this window offers. Derived from its own `window.import.formats` declaration
  // via the same helper the import dialog uses, so the export can only offer a format the
  // import can read back — and a window that declares CSV alone keeps exactly the single-click
  // button it had before xlsx existed.
  const exportFormats = useMemo(() => outputFormats(importConfig?.formats), [importConfig?.formats]);

  const handleExport = useCallback(async (format = 'csv') => {
    setExporting(true);
    try {
      await runListExport({
        format,
        importConfig,
        importFieldLabel,
        apiBaseUrl,
        buildListQuery,
        runCsvExport,
        ui,
      });
    } finally {
      // The button re-enables whether the export streamed or failed; `runListExport` owns the
      // reporting, this only owns the pending state.
      setExporting(false);
    }
  }, [importConfig, importFieldLabel, apiBaseUrl, buildListQuery, runCsvExport, ui]);

  // One button, two mount points: on its own for a single-format window (a click exports
  // straight away, as before xlsx existed) or as the DropdownMenu trigger when there is a choice.
  // Shared rather than duplicated so the icon, size and testid cannot diverge between the two.
  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={exporting}
      className="gap-1.5 text-muted-foreground font-normal h-9 px-3 rounded-lg bg-card"
      onClick={exportFormats.length > 1 ? undefined : () => handleExport(exportFormats[0] ?? 'csv')}
      aria-label={ui('export')}
      title={ui('export')}
      data-testid="ListView__exportButton"
    >
      {/* ETP-4997 (SHELL-02) — the arrow tracks the direction the DATA travels, not the file:
          export pushes records out (Upload), import pulls them in (Download). */}
      <Upload className="h-3.5 w-3.5" data-testid="Upload__ListViewExport" />
    </Button>
  );

  if (exportFormats.length <= 1) return button;

  // More than one writable format: the same button becomes a menu. Only the trigger changes —
  // the button markup is shared above so the two paths cannot drift in size, icon or testid.
  return (
    <DropdownMenu data-testid="DropdownMenu__ListViewExport">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__ListViewExport">
        {button}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="DropdownMenuContent__ListViewExport">
        {exportFormats.map((format) => (
          <DropdownMenuItem
            key={format}
            onClick={() => handleExport(format)}
            data-testid={`ListView__exportFormat_${format}`}
          >
            {ui(EXPORT_FORMAT_LABEL_KEYS[format])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ListExportButton;
