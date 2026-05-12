import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, MapPin, ChevronDown, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import { toast } from 'sonner';
import LocationEditorModal from '@/windows/custom/contacts/LocationEditorModal.jsx';

async function fetchBp(apiBase, bpId, token) {
  const res = await fetch(`${apiBase}/businessPartner/${bpId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.response?.data?.[0] ?? json?.data?.[0] ?? null;
}

async function fetchFirstLocation(apiBase, bpId, token) {
  const res = await fetch(`${apiBase}/locationAddress?parentId=${bpId}&_startRow=0&_endRow=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.response?.data?.[0] ?? null;
}

async function fetchTaxIDKeyOptions(apiBase, token) {
  const url = `${apiBase}/businessPartner/selectors/EM_OBTIK_Tax_ID_Key?limit=50&offset=0`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const json = await res.json();
    const items = json?.items ?? json?.response?.data ?? [];
    return Array.isArray(items)
      ? items.map(i => ({ id: i.id, label: i.label || i.name || i._identifier || i.id }))
      : [];
  } catch (_) {
    return [];
  }
}

function formatAddress(loc) {
  if (!loc) return null;
  const parts = [
    loc.address ?? loc.addressLine1,
    loc.city ?? loc.cityName,
    loc['country$_identifier'] ?? loc.countryLabel,
  ].filter(Boolean);
  return parts.join(', ') || loc.name || null;
}

function TaxIDKeyPicker({ options, value, onChange, loading, ui }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef(null);
  const optionRefs = useRef([]);

  const selected = options.find(o => o.id === value);

  const close = useCallback(() => setOpen(false), []);

  // When the listbox opens, put focus on the currently-selected option (or first).
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex(o => o.id === value);
    const start = idx >= 0 ? idx : 0;
    setActiveIdx(start);
    optionRefs.current[start]?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Roving focus: move to new activeIdx when it changes while the list is open.
  useEffect(() => {
    if (open) optionRefs.current[activeIdx]?.focus();
  }, [activeIdx, open]);

  function handleListKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[activeIdx]) { onChange(options[activeIdx].id); setOpen(false); }
    } else if (e.key === 'Escape') {
      close();
    }
  }

  if (loading) {
    return (
      <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50 flex items-center gap-2">
        <Loader2 size={13} className="animate-spin" />
        {ui('loading')}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors flex items-center justify-between gap-2"
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected?.label ?? '—'}
        </span>
        <ChevronDown size={15} className={`text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onMouseDown={close} />
          <ul
            role="listbox"
            aria-label={ui('contactDetail.taxIDKey')}
            className="absolute z-[61] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-60 overflow-auto"
          >
            {options.map((opt, idx) => (
              <li key={opt.id}>
                <button
                  ref={el => { optionRefs.current[idx] = el; }}
                  type="button"
                  role="option"
                  aria-selected={opt.id === value}
                  tabIndex={activeIdx === idx ? 0 : -1}
                  onKeyDown={handleListKeyDown}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className={[
                    'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors',
                    opt.id === value
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-800 hover:bg-gray-50',
                  ].join(' ')}
                >
                  <span className="w-4 shrink-0">
                    {opt.id === value && <Check size={13} />}
                  </span>
                  {opt.label}
                </button>
              </li>
            ))}
            {options.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">{ui('noResults')}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

export default function ContactDetailModal({ open, onClose, bpId, token, contactsApiBase }) {
  const ui = useUI();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyOptsLoading, setKeyOptsLoading] = useState(false);
  const [name, setName] = useState('');
  const [taxID, setTaxID] = useState('');
  const [taxIDKey, setTaxIDKey] = useState('');
  const [taxIDKeyOptions, setTaxIDKeyOptions] = useState([]);
  const [location, setLocation] = useState(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  useEffect(() => {
    if (!open || !bpId || !contactsApiBase) return;
    let cancelled = false;
    setLoading(true);
    setKeyOptsLoading(true);
    setName(''); setTaxID(''); setTaxIDKey(''); setLocation(null); setTaxIDKeyOptions([]);

    Promise.all([
      fetchBp(contactsApiBase, bpId, token),
      fetchFirstLocation(contactsApiBase, bpId, token),
      fetchTaxIDKeyOptions(contactsApiBase, token),
    ]).then(([bp, loc, keyOpts]) => {
      if (cancelled) return;
      if (bp) {
        setName(bp.name ?? bp.etgoFirstname ?? '');
        setTaxID(bp.taxID ?? '');
        setTaxIDKey(bp.oBTIKTaxIDKey ?? '');
      }
      setLocation(loc);
      setTaxIDKeyOptions(keyOpts);
    }).finally(() => {
      if (!cancelled) { setLoading(false); setKeyOptsLoading(false); }
    });

    return () => { cancelled = true; };
  }, [open, bpId, contactsApiBase, token]);

  async function handleSave() {
    if (saving || !bpId) return;
    setSaving(true);
    try {
      const res = await fetch(`${contactsApiBase}/businessPartner/${bpId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxID: taxID || null, oBTIKTaxIDKey: taxIDKey || null }),
      });
      if (res.ok) {
        toast.success(ui('contactDetail.saved'));
        onClose();
      } else {
        toast.error(ui('contactDetail.saveError'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function reloadLocation() {
    const loc = await fetchFirstLocation(contactsApiBase, bpId, token);
    setLocation(loc);
  }

  if (!open) return null;

  const addressText = formatAddress(location);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {ui('contactDetail.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={ui('close')}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* Name — read-only */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {ui('contactDetail.name')}
              </label>
              <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50">
                {name || '—'}
              </div>
            </div>

            {/* Tax ID Key — custom styled dropdown */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {ui('contactDetail.taxIDKey')}
              </label>
              <TaxIDKeyPicker
                options={taxIDKeyOptions}
                value={taxIDKey}
                onChange={setTaxIDKey}
                loading={keyOptsLoading}
                ui={ui}
              />
            </div>

            {/* Tax ID */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {ui('contactDetail.taxID')}
              </label>
              <input
                type="text"
                value={taxID}
                onChange={e => setTaxID(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {ui('contactDetail.location')}
              </label>
              <div className="flex gap-2">
                <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 bg-gray-50 truncate min-w-0">
                  {addressText ?? '—'}
                </div>
                <button
                  type="button"
                  onClick={() => setLocationModalOpen(true)}
                  className="shrink-0 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1.5"
                >
                  <MapPin size={13} />
                  {ui('contactDetail.editLocation')}
                </button>
              </div>
            </div>

          </div>
        )}

        {!loading && (
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {ui('cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {ui('save')}
            </button>
          </div>
        )}
      </div>

      {locationModalOpen && (
        <LocationEditorModal
          open={locationModalOpen}
          onClose={() => setLocationModalOpen(false)}
          onSaved={() => {
            setLocationModalOpen(false);
            reloadLocation();
          }}
          rowId={location?.id ?? null}
          bpId={bpId}
          apiBase={contactsApiBase}
          token={token}
        />
      )}
    </div>
  );
}
