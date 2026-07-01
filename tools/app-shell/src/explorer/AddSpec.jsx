import { useState, useEffect, useRef } from 'react';
import { upsertSpec, populateSpec, fetchMenuTree } from './useDiscovery';
import { Folder, AppWindow, Cog, ChevronRight, Search, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_MODULE_ID = '94E1B433CF55451EABB764750AC5902A';

function TypeIcon({ type, className }) {
  if (type === 'folder') return (
    <Folder
      className={cn('h-3.5 w-3.5 text-yellow-500/70', className)}
      data-testid="Folder__1a98b9" />
  );
  if (type === 'process') return (
    <Cog
      className={cn('h-3.5 w-3.5 text-purple-400/70', className)}
      data-testid="Cog__1a98b9" />
  );
  return (
    <AppWindow
      className={cn('h-3.5 w-3.5 text-blue-400/70', className)}
      data-testid="AppWindow__1a98b9" />
  );
}

function TreeNode({ node, onSelect, expanded, onToggle }) {
  const isFolder = node.type === 'folder';
  const isOpen = expanded[node.id];
  const hasChildren = node.children && node.children.length > 0;

  if (isFolder) {
    return (
      <div>
        <button
          onClick={() => onToggle(node.id)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700/50 rounded transition-colors"
        >
          <ChevronRight
            className={cn('h-3 w-3 text-zinc-500 transition-transform flex-shrink-0', isOpen && 'rotate-90')}
            data-testid="ChevronRight__1a98b9" />
          <TypeIcon type="folder" data-testid="TypeIcon__1a98b9" />
          <span className="truncate">{node.name}</span>
          {hasChildren && <span className="text-[10px] text-zinc-500 ml-auto">{node.children.length}</span>}
        </button>
        {isOpen && hasChildren && (
          <div className="ml-3 border-l border-zinc-700/50">
            {node.children.map(child => (
              <TreeNode
                key={child.id}
                node={child}
                onSelect={onSelect}
                expanded={expanded}
                onToggle={onToggle}
                data-testid="TreeNode__1a98b9" />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node)}
      className="w-full flex items-center gap-1.5 px-2 py-1 ml-1 text-xs text-zinc-300 hover:bg-blue-600/20 hover:text-blue-300 rounded transition-colors"
    >
      <TypeIcon type={node.type} data-testid="TypeIcon__1a98b9" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// Flatten tree into a list of selectable (non-folder) items
function flattenTree(nodes, result = []) {
  for (const node of nodes) {
    if (node.type !== 'folder') result.push(node);
    if (node.children) flattenTree(node.children, result);
  }
  return result;
}

function MenuSelector({ onSelect, onClose }) {
  const [tree, setTree] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const flatItemsRef = useRef([]);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMenuTree()
      .then(data => {
        if (cancelled) return;
        const t = data.tree || [];
        setTree(t);
        flatItemsRef.current = flattenTree(t);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? flatItemsRef.current.filter(item => item.name.toLowerCase().includes(q))
    : null;
  const items = filtered || tree;

  let menuContent;
  if (loading) {
    menuContent = (
      <div className="flex items-center justify-center gap-2 py-4 text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__1a98b9" />
        <span className="text-xs">Loading menu...</span>
      </div>
    );
  } else if (error) {
    menuContent = <div className="px-2 py-3 text-xs text-red-400">{error}</div>;
  } else if (!items || items.length === 0) {
    menuContent = <div className="px-2 py-3 text-xs text-zinc-500">No items found</div>;
  } else if (filtered) {
    // Flat filtered results
    menuContent = items.map(item => (
      <button
        key={item.id}
        onClick={() => onSelect(item)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300 hover:bg-blue-600/20 hover:text-blue-300 rounded transition-colors"
      >
        <TypeIcon type={item.type} data-testid="TypeIcon__1a98b9" />
        <span className="truncate">{item.name}</span>
        {item.type !== 'folder' && (
          <span className="text-[10px] text-zinc-500 ml-auto">{item.type}</span>
        )}
      </button>
    ));
  } else {
    // Tree view
    menuContent = items.map(node => (
      <TreeNode
        key={node.id}
        node={node}
        onSelect={onSelect}
        expanded={expanded}
        onToggle={toggleExpand}
        data-testid="TreeNode__1a98b9" />
    ));
  }

  return (
    <div className="border border-zinc-700 rounded bg-zinc-800/90 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-700">
        <Search
          className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0"
          data-testid="Search__1a98b9" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search menu items..."
          className="flex-1 bg-transparent text-xs text-zinc-200 focus:outline-none placeholder:text-zinc-500"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-3 w-3" data-testid="X__1a98b9" />
          </button>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto p-1">
        {menuContent}
      </div>
    </div>
  );
}

export default function AddSpec({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState({
    Name: '',
    SpecType: 'W',
    WindowID: '',
    ProcessID: '',
    ModuleID: DEFAULT_MODULE_ID,
    Description: '',
  });
  const [autoPopulate, setAutoPopulate] = useState(true);
  const [includeAllMethods, setIncludeAllMethods] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleMenuSelect = (item) => {
    if (item.type === 'folder') return;
    const slug = item.name
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    const isWindow = item.type === 'window';
    setSelectedItem(item);
    setForm(f => ({
      ...f,
      Name: slug,
      SpecType: isWindow ? 'W' : 'P',
      WindowID: isWindow ? (item.windowId || '') : '',
      ProcessID: !isWindow ? (item.processId || '') : '',
    }));
    setShowPicker(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const result = await upsertSpec(form);
      const specId = result.SpecID;

      let populateMsg = '';
      if (autoPopulate && specId) {
        const popResult = await populateSpec({
          SpecID: specId,
          ModuleID: form.ModuleID,
          IncludeAllMethods: includeAllMethods ? 'Y' : 'N',
          ExcludeSystemColumns: 'Y',
        });
        populateMsg = ` — Populated ${popResult.EntitiesCreated || '?'} entities, ${popResult.FieldsCreated || '?'} fields`;
      }

      setSuccess(`Spec created: ${specId}${populateMsg}`);
      setForm({ Name: '', SpecType: 'W', WindowID: '', ProcessID: '', ModuleID: form.ModuleID, Description: '' });
      setSelectedItem(null);
      onCreated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 text-xs text-blue-400 hover:bg-blue-600/10 transition-colors text-left"
      >
        + Add Spec
      </button>
    );
  }

  return (
    <div className="border-b border-zinc-800 p-3 bg-zinc-900/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">New Spec</span>
        <button onClick={() => { setOpen(false); setShowPicker(false); }} className="text-xs text-zinc-500 hover:text-zinc-300">Close</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        {/* Menu item selector */}
        <div>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className={cn(
              'w-full flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-left transition-colors hover:border-zinc-600',
              showPicker && 'ring-1 ring-blue-500 border-blue-500'
            )}
          >
            {selectedItem ? (
              <>
                <TypeIcon type={selectedItem.type} data-testid="TypeIcon__1a98b9" />
                <span className="text-zinc-200 truncate flex-1">{selectedItem.name}</span>
                <span className="text-[10px] text-zinc-500">{selectedItem.type}</span>
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5 text-zinc-500" data-testid="Search__1a98b9" />
                <span className="text-zinc-500 flex-1">Select a window or process...</span>
              </>
            )}
          </button>
          {showPicker && (
            <div className="mt-1">
              <MenuSelector
                onSelect={handleMenuSelect}
                onClose={() => setShowPicker(false)}
                data-testid="MenuSelector__1a98b9" />
            </div>
          )}
        </div>

        {/* Name (auto-filled but editable) */}
        <input
          value={form.Name}
          onChange={e => update('Name', e.target.value)}
          placeholder="Spec name (URL slug)"
          required
          className="w-full bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {/* Show selected ID as read-only info */}
        {selectedItem && (
          <div className="text-[10px] text-zinc-500 px-1">
            {form.SpecType === 'W' ? `Window ID: ${form.WindowID}` : `Process ID: ${form.ProcessID}`}
          </div>
        )}

        <input
          value={form.ModuleID}
          onChange={e => update('ModuleID', e.target.value)}
          placeholder="Module ID"
          required
          className="w-full bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <input
          value={form.Description}
          onChange={e => update('Description', e.target.value)}
          placeholder="Description (optional)"
          className="w-full bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="flex items-center gap-4 text-[10px] text-zinc-400">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPopulate}
              onChange={e => setAutoPopulate(e.target.checked)}
              className="rounded"
            />
            Auto-populate from AD
          </label>
          {autoPopulate && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAllMethods}
                onChange={e => setIncludeAllMethods(e.target.checked)}
                className="rounded"
              />
              Enable all methods
            </label>
          )}
        </div>

        {error && <div className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1">{error}</div>}
        {success && <div className="text-xs text-green-400 bg-green-900/20 rounded px-2 py-1">{success}</div>}

        <button
          type="submit"
          disabled={saving || !form.Name}
          className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Spec'}
        </button>
      </form>
    </div>
  );
}
