import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileJson, Search, History, Loader2, FolderOpen } from 'lucide-react';

const ARTIFACT_FILES = [
  { key: 'schema-raw.json', label: 'Schema Raw' },
  { key: 'schema-curated.json', label: 'Schema Curated' },
  { key: 'contract.json', label: 'Contract' },
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
        '$1<span class="text-blue-600">"$3"</span>$5'
      )
      // String values
      .replace(
        /:\s*(&quot;|")([^"]*?)(&quot;|")/g,
        ': <span class="text-green-600">"$2"</span>'
      )
      // Numbers
      .replace(
        /:\s*(-?\d+\.?\d*([eE][+-]?\d+)?)/g,
        ': <span class="text-amber-600">$1</span>'
      )
      // Booleans
      .replace(
        /:\s*(true|false)/g,
        ': <span class="text-purple-600">$1</span>'
      )
      // Null
      .replace(
        /:\s*(null)/g,
        ': <span class="text-gray-400">$1</span>'
      );
  }, [data]);

  const lines = highlighted.split('\n');

  return (
    <div className="relative overflow-auto rounded-lg border border-gray-200 bg-gray-50 font-mono text-sm">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="hover:bg-gray-100/50">
              <td className="select-none border-r border-gray-200 px-3 py-0 text-right text-xs text-gray-400 align-top">
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
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileJson className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Artifacts</h2>
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {windows.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search windows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-2 text-xs placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
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
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {name}
            </button>
          ))}
          {filteredWindows.length === 0 && (
            <p className="px-3 py-4 text-xs text-gray-400">No windows found</p>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {!selectedWindow ? (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            <div className="text-center">
              <FolderOpen className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="text-sm">Select a window from the list</p>
            </div>
          </div>
        ) : (
          <>
            {/* Top bar — tabs + version selector */}
            <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-2">
              {/* File tabs */}
              <div className="flex gap-1">
                {ARTIFACT_FILES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedFile(key);
                      setSelectedRef(null);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      key === selectedFile
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Separator */}
              <div className="h-5 w-px bg-gray-200" />

              {/* Version selector */}
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-gray-400" />
                <select
                  value={selectedRef || ''}
                  onChange={(e) => setSelectedRef(e.target.value || null)}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
                >
                  <option value="">Current version</option>
                  {commits.map((c) => (
                    <option key={c.hash} value={c.hash}>
                      {c.hash} — {c.date?.substring(0, 10)} — {c.subject?.substring(0, 50)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Window name badge */}
              <span className="ml-auto rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {selectedWindow}
              </span>
            </div>

            {/* JSON viewer */}
            <div className="flex-1 overflow-auto p-4">
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">Loading...</span>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                  <p className="text-sm text-amber-700">{error}</p>
                </div>
              )}

              {jsonData && !loading && !error && <JsonView data={jsonData} />}

              {!jsonData && !loading && !error && (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <p className="text-sm">No data to display</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
