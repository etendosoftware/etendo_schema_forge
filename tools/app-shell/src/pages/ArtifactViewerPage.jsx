import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUI } from '@/i18n';
import { useParams, useNavigate } from 'react-router-dom';
import { FileJson, Search, History, Loader2, FolderOpen } from 'lucide-react';

const ARTIFACT_FILES = [
  { key: 'schema-raw.json', labelKey: 'artifactSchemaRaw' },
  { key: 'schema-curated.json', labelKey: 'artifactSchemaCurated' },
  { key: 'contract.json', labelKey: 'artifactContract' },
];

/**
 * Syntax-highlighted JSON viewer.
 * Colorizes keys, strings, numbers, booleans, and nulls with Tailwind classes.
 */
function JsonView({ data }) {
  const highlighted = useMemo(() => {
    if (!data) return '';
    const raw = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    // Escape HTML first
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Apply syntax coloring via regex replacements
    return escaped
      // Keys (quoted strings followed by colon)
      .replace(
        /^(\s*)(&quot;|")([^"]+)(&quot;|")(\s*:)/gm,
        '$1<span class="text-status-info-foreground">"$3"</span>$5'
      )
      // String values
      .replace(
        /:\s*(&quot;|")([^"]*?)(&quot;|")/g,
        ': <span class="text-status-success-foreground">"$2"</span>'
      )
      // Numbers
      .replace(
        /:\s*(-?\d+\.?\d*([eE][+-]?\d+)?)/g,
        ': <span class="text-status-warning-foreground">$1</span>'
      )
      // Booleans
      .replace(
        /:\s*(true|false)/g,
        ': <span class="text-primary">$1</span>'
      )
      // Null
      .replace(
        /:\s*(null)/g,
        ': <span class="text-muted-foreground">$1</span>'
      );
  }, [data]);

  const lines = highlighted.split('\n');

  return (
    <div className="relative overflow-auto rounded-lg border border-border-subtle bg-muted font-mono text-sm">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={`${i}-${line.slice(0, 20)}`} className="hover:bg-muted/50">
              <td className="select-none border-r border-border-subtle px-3 py-0 text-right text-xs text-muted-foreground align-top">
                {i + 1}
              </td>
              <td
                className="px-4 py-0 whitespace-pre"
                dangerouslySetInnerHTML={{ __html: line || ' ' }}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ArtifactViewerPage() {
  const ui = useUI();
  const { windowName: paramWindow } = useParams();
  const navigate = useNavigate();

  const [windows, setWindows] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedWindow, setSelectedWindow] = useState(paramWindow || null);
  const [selectedFile, setSelectedFile] = useState('schema-curated.json');
  const [selectedRef, setSelectedRef] = useState(null);
  const [commits, setCommits] = useState([]);
  const [jsonData, setJsonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync URL param to state
  useEffect(() => {
    if (paramWindow && paramWindow !== selectedWindow) {
      setSelectedWindow(paramWindow);
    }
  }, [paramWindow]);

  // Fetch window list on mount
  useEffect(() => {
    fetch('/api/artifacts')
      .then((r) => r.json())
      .then((data) => setWindows(data.windows || []))
      .catch(() => setWindows([]));
  }, []);

  // Fetch history when window changes
  useEffect(() => {
    if (!selectedWindow) {
      setCommits([]);
      return;
    }
    fetch(`/api/artifacts/${selectedWindow}/history`)
      .then((r) => r.json())
      .then((data) => setCommits(data.commits || []))
      .catch(() => setCommits([]));
  }, [selectedWindow]);

  // Fetch JSON data when window/file/ref changes
  useEffect(() => {
    if (!selectedWindow) {
      setJsonData(null);
      return;
    }
    setLoading(true);
    setError(null);

    const refParam = selectedRef ? `?ref=${selectedRef}` : '';
    fetch(`/api/artifacts/${selectedWindow}/${selectedFile}${refParam}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'File not found at this version' : 'Failed to load');
        return r.text();
      })
      .then((text) => {
        // Try to parse for pretty printing
        try {
          setJsonData(JSON.parse(text));
        } catch {
          setJsonData(text);
        }
        setError(null);
      })
      .catch((err) => {
        setJsonData(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [selectedWindow, selectedFile, selectedRef]);

  const handleSelectWindow = useCallback(
    (name) => {
      setSelectedWindow(name);
      setSelectedRef(null);
      navigate(`/artifacts/${name}`, { replace: true });
    },
    [navigate]
  );

  const filteredWindows = useMemo(() => {
    if (!search) return windows;
    const q = search.toLowerCase();
    return windows.filter((w) => w.includes(q));
  }, [windows, search]);

  return (
    <div className="flex h-full">
      {/* Left sidebar — window list */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-border-subtle bg-card">
        <div className="border-b border-border-subtle p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileJson className="h-4 w-4 text-muted-foreground" data-testid="FileJson__8fb485" />
            <h2 className="text-sm font-semibold text-foreground">{ui("artifactsTitle")}</h2>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {windows.length}
            </span>
          </div>
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              data-testid="Search__8fb485" />
            <input
              type="text"
              placeholder={ui("searchWindows")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-muted py-1.5 pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-1">
          {filteredWindows.map((name) => (
            <button
              key={name}
              onClick={() => handleSelectWindow(name)}
              className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                name === selectedWindow
                  ? 'bg-status-info font-medium text-status-info-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {name}
            </button>
          ))}
          {filteredWindows.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">{ui("noWindowsFound")}</p>
          )}
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {!selectedWindow ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FolderOpen
                className="mx-auto mb-3 h-12 w-12 text-muted-foreground"
                data-testid="FolderOpen__8fb485" />
              <p className="text-sm">{ui("selectWindowFromList")}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Top bar — tabs + version selector */}
            <div className="flex items-center gap-4 border-b border-border-subtle bg-card px-4 py-2">
              {/* File tabs */}
              <div className="flex gap-1">
                {ARTIFACT_FILES.map(({ key, labelKey }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedFile(key);
                      setSelectedRef(null);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      key === selectedFile
                        ? 'bg-foreground text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {ui(labelKey)}
                  </button>
                ))}
              </div>

              {/* Separator */}
              <div className="h-5 w-px bg-muted" />

              {/* Version selector */}
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" data-testid="History__8fb485" />
                <select
                  value={selectedRef || ''}
                  onChange={(e) => setSelectedRef(e.target.value || null)}
                  className="rounded-md border border-border-subtle bg-card px-2 py-1 text-xs text-foreground focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
                >
                  <option value="">{ui("currentVersion")}</option>
                  {commits.map((c) => (
                    <option key={c.hash} value={c.hash}>
                      {c.hash} — {c.date?.substring(0, 10)} — {c.subject?.substring(0, 50)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Window name badge */}
              <span className="ml-auto rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {selectedWindow}
              </span>
            </div>

            {/* JSON viewer */}
            <div className="flex-1 overflow-auto p-4">
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2
                    className="h-6 w-6 animate-spin text-muted-foreground"
                    data-testid="Loader2__8fb485" />
                  <span className="ml-2 text-sm text-muted-foreground">{ui("loading")}</span>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-lg border border-status-warning-border bg-status-warning p-6 text-center">
                  <p className="text-sm text-status-warning-foreground">{error}</p>
                </div>
              )}

              {jsonData && !loading && !error && <JsonView data={jsonData} data-testid="JsonView__8fb485" />}

              {!jsonData && !loading && !error && (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <p className="text-sm">{ui("noDataToDisplay")}</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
