import { useRef, useEffect, useState, useCallback } from 'react';
import { X, Printer, FileDown, FileSpreadsheet, FileText, Loader2, Eye } from 'lucide-react';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { statusLabel } from '@/lib/statusBadge.js';
import { useAnimatedOpen } from '@/lib/useAnimatedOpen.js';
import { useUI } from '@/i18n';

// ---------------------------------------------------------------------------
// jsreport recipe ↔ format mapping
// Labels are resolved at render time via useUI() (see FORMATS usage below).
// ---------------------------------------------------------------------------
const FORMATS = [
  { id: 'preview', labelKey: 'preview', icon: Eye, recipe: 'html' },
  { id: 'pdf', labelKey: 'pdf', icon: FileDown, recipe: 'chrome-pdf', ext: 'pdf', mime: 'application/pdf' },
  { id: 'xlsx', labelKey: 'excel', icon: FileSpreadsheet, recipe: 'html-to-xlsx', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'csv', labelKey: 'csv', icon: FileText, recipe: 'text', ext: 'csv', mime: 'text/csv' },
];

// ---------------------------------------------------------------------------
// CSS for the report (embedded in the template)
// ---------------------------------------------------------------------------
const REPORT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.4; }
  .report-container { padding: 20mm 15mm; }
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4mm; padding-bottom: 4mm; border-bottom: 2px solid #1a1a2e; }
  .report-title { font-size: 16pt; font-weight: 700; color: #1a1a2e; }
  .report-meta { text-align: right; font-size: 8pt; color: #64748b; }
  .report-filters { margin-bottom: 4mm; padding: 2mm 3mm; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 2mm; font-size: 8pt; color: #475569; }
  .report-filters strong { color: #1e293b; }
  .report-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .report-table thead th { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 2mm 3mm; text-align: left; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; white-space: nowrap; }
  .report-table tbody td { padding: 1.5mm 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .report-table tbody tr:nth-child(even) { background: #f1f5f9; }
  .cell-boolean { text-align: center; }
  .cell-boolean .yes { color: #16a34a; font-weight: 600; }
  .cell-boolean .no { color: #64748b; }
  .cell-amount { text-align: right; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 8.5pt; }
  .report-footer { margin-top: 6mm; padding-top: 3mm; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b; }
  .report-summary { font-weight: 600; color: #1e293b; }
  @page { margin: 15mm; size: A4 landscape; }
  @media print { .report-container { padding: 0; } }
`;

// Handlebars helpers (CommonJS for jsreport)
const HELPERS_CODE = `
function formatDate(value) {
  if (value == null || value === '') return '';
  var d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function formatCurrency(value) {
  if (value == null) return '';
  var num = Number(value);
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
function formatBoolean(value) { return value ? 'Yes' : 'No'; }
function ifCond(v1, operator, v2, options) {
  switch (operator) {
    case '===': return v1 === v2 ? options.fn(this) : options.inverse(this);
    case '!==': return v1 !== v2 ? options.fn(this) : options.inverse(this);
    default: return options.inverse(this);
  }
}
function eq(a, b) { return a === b; }
`;

// Handlebars template for listing reports
const LISTING_TEMPLATE = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>{{{css}}}</style></head>
<body><div class="report-container">
  <div class="report-header">
    <div><div class="report-title">{{meta.title}}</div></div>
    <div class="report-meta"><div>{{formatDate meta.generatedAt}}</div><div>{{meta.recordCount}} records</div></div>
  </div>
  {{#if meta.filters.length}}
  <div class="report-filters"><strong>Filters:</strong>
    {{#each meta.filters}}<span> {{this.label}}: {{this.value}} &nbsp;</span>{{/each}}
  </div>
  {{/if}}
  <table class="report-table">
    <thead><tr>{{#each columns}}<th style="width: {{this.width}}">{{this.label}}</th>{{/each}}</tr></thead>
    <tbody>
      {{#each rows}}<tr>
        {{#each ../columns}}
          {{#ifCond this.type '===' 'boolean'}}
            <td class="cell-boolean">{{#if (lookup ../this this.key)}}<span class="yes">Yes</span>{{else}}<span class="no">No</span>{{/if}}</td>
          {{else}}{{#ifCond this.type '===' 'amount'}}
            <td class="cell-amount">{{formatCurrency (lookup ../this this.key)}}</td>
          {{else}}{{#ifCond this.type '===' 'date'}}
            <td>{{formatDate (lookup ../this this.key)}}</td>
          {{else}}
            <td>{{lookup ../this this.key}}</td>
          {{/ifCond}}{{/ifCond}}{{/ifCond}}
        {{/each}}
      </tr>{{/each}}
    </tbody>
  </table>
  <div class="report-footer">
    <div class="report-summary">Total: {{meta.recordCount}} records</div>
    <div>Generated by Etendo Go</div>
  </div>
</div></body></html>`;

// CSV template (text recipe)
const CSV_TEMPLATE = `{{#each columns}}{{this.label}}{{#unless @last}},{{/unless}}{{/each}}
{{#each rows}}{{#each ../columns}}{{lookup ../this this.key}}{{#unless @last}},{{/unless}}{{/each}}
{{/each}}`;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
const MAX_REPORT_ROWS = 10000;
const BATCH = 200;

async function fetchAllRecords(apiBaseUrl, entity, token, sortColumn, sortDirection) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  let allRows = [];
  let start = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${apiBaseUrl}/${entity}?_sortBy=${sortColumn} ${sortDirection}&_startRow=${start}&_endRow=${start + BATCH - 1}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    const rows = data?.response?.data ?? (Array.isArray(data) ? data : []);
    allRows = allRows.concat(rows);
    start += rows.length;
    if (rows.length < BATCH || allRows.length >= MAX_REPORT_ROWS) hasMore = false;
  }

  return allRows;
}

// ---------------------------------------------------------------------------
// Resolve raw API data to display values
// ---------------------------------------------------------------------------
function resolveRows(rawRows, columns) {
  return rawRows.map(row => {
    const resolved = {};
    for (const col of columns) {
      const key = col.key;
      let val = resolveIdentifier(row, key);
      if (col.type === 'status') val = statusLabel(val);
      resolved[key] = val ?? '';
    }
    return resolved;
  });
}

// ---------------------------------------------------------------------------
// jsreport rendering
// ---------------------------------------------------------------------------
async function renderViaJsreport(recipe, title, columns, rows, filters) {
  const isCSV = recipe === 'text';
  const payload = {
    template: {
      content: isCSV ? CSV_TEMPLATE : LISTING_TEMPLATE,
      engine: 'handlebars',
      recipe,
      helpers: HELPERS_CODE,
    },
    data: {
      css: REPORT_CSS,
      meta: {
        title,
        generatedAt: new Date().toISOString(),
        recordCount: rows.length,
        filters: filters || [],
      },
      columns: columns.map(c => ({ key: c.key, label: c.label || c.key, type: c.type || 'string', width: c.width || 'auto' })),
      rows,
    },
  };

  if (recipe === 'chrome-pdf') {
    payload.template.chrome = { landscape: true, format: 'A4', marginTop: '10mm', marginBottom: '10mm', marginLeft: '10mm', marginRight: '10mm' };
  }
  if (recipe === 'html-to-xlsx') {
    // Uses Chrome by default (same as chrome-pdf) — no htmlEngine override needed
  }

  const res = await fetch('/jsreport/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`jsreport ${res.status}: ${text.slice(0, 200)}`);
  }

  return res;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ReportDrawer({
  open, onClose, windowName, columns, title,
  apiBaseUrl, entity, token, sortColumn, sortDirection,
  activeFilters,
}) {
  const ui = useUI();
  const { shouldRender, isClosing } = useAnimatedOpen(open, 250);
  const iframeRef = useRef(null);
  const [activeFormat, setActiveFormat] = useState('preview');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [reportRows, setReportRows] = useState(null);
  const [error, setError] = useState(null);
  const [jsreportAvailable, setJsreportAvailable] = useState(null);

  // Check jsreport availability on mount
  useEffect(() => {
    fetch('/jsreport/api/ping').then(r => setJsreportAvailable(r.ok)).catch(() => setJsreportAvailable(false));
  }, []);

  // Fetch all records when drawer opens
  useEffect(() => {
    if (!open || !apiBaseUrl || !entity || !token) {
      setReportRows(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setFetchingData(true);
    setError(null);

    fetchAllRecords(apiBaseUrl, entity, token, sortColumn || 'creationDate', sortDirection || 'desc')
      .then(rows => {
        if (cancelled) return;
        const resolved = resolveRows(rows, columns || []);
        setReportRows(resolved);
        setFetchingData(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setFetchingData(false);
      });

    return () => { cancelled = true; };
  }, [open, apiBaseUrl, entity, token, sortColumn, sortDirection, columns]);

  // Store preview HTML so we can re-render and print reliably
  const previewHtmlRef = useRef('');

  // Render preview into iframe when data is ready
  useEffect(() => {
    if (!open || fetchingData || !reportRows || !iframeRef.current || activeFormat !== 'preview') return;

    const writeToIframe = (html) => {
      previewHtmlRef.current = html;
      const iframe = iframeRef.current;
      // Reset src to about:blank first (clears any blob URL from PDF view)
      iframe.src = 'about:blank';
      // Wait for blank page to load, then write HTML
      iframe.onload = () => {
        try {
          const doc = iframe.contentDocument;
          doc.open();
          doc.write(html);
          doc.close();
        } catch { /* cross-origin safety */ }
        iframe.onload = null;
      };
    };

    const renderPreview = async () => {
      setLoading(true);
      try {
        if (jsreportAvailable) {
          const res = await renderViaJsreport('html', title || 'Report', columns || [], reportRows, activeFilters);
          writeToIframe(await res.text());
        } else {
          const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
          const cols = columns || [];
          const filtersHtml = activeFilters?.length
            ? `<div class="report-filters"><strong>Filters:</strong> ${activeFilters.map(f => `${f.label}: ${f.value}`).join(' | ')}</div>`
            : '';
          const headerCells = cols.map(c => `<th>${c.label || c.key}</th>`).join('');
          const bodyRows = reportRows.map(r => `<tr>${cols.map(c => `<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`).join('');
          const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${REPORT_CSS}</style></head><body><div class="report-container"><div class="report-header"><div><div class="report-title">${title || 'Report'}</div></div><div class="report-meta"><div>${now}</div><div>${reportRows.length} records</div></div></div>${filtersHtml}<table class="report-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table><div class="report-footer"><div class="report-summary">Total: ${reportRows.length} records</div><div>Generated by Etendo Go</div></div></div></body></html>`;
          writeToIframe(html);
        }
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    renderPreview();
  }, [open, fetchingData, reportRows, activeFormat, jsreportAvailable, columns, title, activeFilters]);

  const handlePrint = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // If we're in preview mode and iframe has content, print directly
    if (activeFormat === 'preview' && iframe.contentDocument?.body?.innerHTML) {
      iframe.contentWindow.print();
      return;
    }

    // Otherwise open a new window with the preview HTML for printing
    if (previewHtmlRef.current) {
      const printWin = window.open('', '_blank', 'width=1200,height=800');
      printWin.document.open();
      printWin.document.write(previewHtmlRef.current);
      printWin.document.close();
      printWin.onload = () => { printWin.print(); printWin.close(); };
    }
  }, [activeFormat]);

  const handleExport = useCallback(async (format) => {
    if (!reportRows || loading) return;
    const fmt = FORMATS.find(f => f.id === format);
    if (!fmt || !fmt.recipe || format === 'preview') return;

    setLoading(true);
    setError(null);
    try {
      const res = await renderViaJsreport(fmt.recipe, title || 'Report', columns || [], reportRows, activeFilters);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (format === 'pdf') {
        // Show PDF in iframe
        iframeRef.current.src = url;
        setActiveFormat('pdf');
      } else {
        // Download file
        const a = document.createElement('a');
        a.href = url;
        a.download = `${windowName || 'report'}.${fmt.ext}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [reportRows, loading, columns, title, windowName, activeFilters]);

  const handleFormatClick = useCallback((formatId) => {
    if (formatId === 'preview') {
      setActiveFormat('preview');
      // Clear iframe src if it was showing a PDF blob
      if (iframeRef.current) iframeRef.current.removeAttribute('src');
    } else {
      handleExport(formatId);
    }
  }, [handleExport]);

  if (!shouldRender) return null;

  const dataReady = !fetchingData && reportRows && reportRows.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div className={`fixed inset-0 bg-black/30 z-50 ${isClosing ? 'scrim-fade-out' : 'scrim-fade-in'}`} onClick={onClose} />
      {/* Drawer */}
      <div className={`fixed right-0 top-0 bottom-0 w-[70%] max-w-5xl bg-white shadow-2xl z-50 flex flex-col ${isClosing ? 'sidebar-slide-out' : 'sidebar-slide-in'}`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">{title || windowName || ui('report')}</h2>
            {fetchingData ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" data-testid="Loader2__3ba698" /> {ui('loadingAllRecords')}
              </span>
            ) : reportRows ? (
              <span className="text-xs text-muted-foreground">{reportRows.length} {ui('records')}</span>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {/* Format buttons */}
            {FORMATS.map(fmt => {
              const Icon = fmt.icon;
              const isActive = activeFormat === fmt.id;
              const disabled = !dataReady || loading || (fmt.id !== 'preview' && !jsreportAvailable);
              const label = ui(fmt.labelKey);
              return (
                <button
                  key={fmt.id}
                  onClick={() => handleFormatClick(fmt.id)}
                  disabled={disabled}
                  title={!jsreportAvailable && fmt.id !== 'preview' ? ui('jsreportNotAvailable') : label}
                  className={[
                    'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white border border-border text-foreground hover:bg-muted/50',
                    disabled ? 'opacity-40 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5" data-testid="Icon__3ba698" />
                  {label}
                </button>
              );
            })}

            <div className="w-px h-6 bg-border/50 mx-1" />

            {/* Print button */}
            <button
              onClick={handlePrint}
              disabled={!dataReady || loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" data-testid="Printer__3ba698" />
              {ui('print')}
            </button>

            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ml-1"
            >
              <X className="h-4 w-4" data-testid="X__3ba698" />
            </button>
          </div>
        </div>

        {/* jsreport status bar */}
        {jsreportAvailable === false && (
          <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
            {ui('jsreportNotAvailableBanner')} <code className="bg-amber-100 px-1 rounded">docker compose -f docker/jsreport/docker-compose.yml up -d</code>
          </div>
        )}

        {/* Preview area */}
        <div className="flex-1 overflow-hidden bg-slate-100 p-4">
          <div className="bg-white rounded-lg shadow-lg h-full overflow-hidden relative">
            {(fetchingData || loading) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__3ba698" />
                <span>{fetchingData ? ui('fetchingAllRecords') : ui('renderingReport')}</span>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10 text-destructive text-sm px-8 text-center">
                {error}
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="Report Preview"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </div>
    </>
  );
}
