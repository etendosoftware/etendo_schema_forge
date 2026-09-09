import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, MapPin, ChevronDown, Check } from 'lucide-react';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { toast } from 'sonner';
import LocationEditorModal from '@/windows/custom/shared/LocationEditorModal.jsx';

const SII_TIPO_OPTIONS_SALES = [
  { id: 'F1',  label: 'F1 — Factura' },
  { id: 'F2',  label: 'F2 — Factura simplificada' },
  { id: 'F4',  label: 'F4 — Asiento resumen facturas simplificadas' },
  { id: 'R',   label: 'R — Factura rectificativa' },
  { id: 'F5',  label: 'F5 — Importaciones (DUA)' },
  { id: 'F6',  label: 'F6 — Justificantes contables' },
  { id: 'LC',  label: 'LC — Aduanas - Liquidación complementaria' },
];

const SII_TIPO_OPTIONS_PURCHASE = [
  { id: 'F1',  label: 'F1 — Factura' },
  { id: 'F5',  label: 'F5 — Importaciones (DUA)' },
  { id: 'F6',  label: 'F6 — Justificantes contables' },
  { id: 'LC',  label: 'LC — Aduanas - Liquidación complementaria' },
];

const INPUT_ST = {
  width: '100%', fontSize: 14, padding: '8px 12px',
  border: '1px solid hsl(var(--border-control))', borderRadius: 8, height: 40,
  boxSizing: 'border-box', color: 'hsl(var(--foreground))', outline: 'none',
  background: 'hsl(var(--card))',
};

const INPUT_ERR_ST = { ...INPUT_ST, border: '1px solid hsl(var(--destructive))', background: 'var(--status-destructive-bg)' };

function CfgField({ label, children, required }) {
  return (
    <div>
      <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: 'hsl(var(--destructive))', marginLeft: 2 }}>*</span>}
      </div>
      {children}
    </div>
  );
}

async function fetchBp(apiFetch, bpId) {
  const res = await apiFetch(`/businessPartner/${bpId}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.response?.data?.[0] ?? json?.data?.[0] ?? null;
}

async function fetchFirstLocation(apiFetch, bpId) {
  const res = await apiFetch(`/locationAddress?parentId=${bpId}&_startRow=0&_endRow=1`);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.response?.data?.[0] ?? null;
}

async function fetchTaxIDKeyOptions(apiFetch) {
  try {
    const res = await apiFetch(`/businessPartner/selectors/EM_OBTIK_Tax_ID_Key?limit=50&offset=0`);
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

async function fetchInvoice(apiFetch, invoiceSpec, invoiceId) {
  try {
    const res = await apiFetch(`/${invoiceSpec}/header/${invoiceId}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.response?.data?.[0] ?? json?.data?.[0] ?? null;
  } catch (_) {
    return null;
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

// Dropdown with position:fixed so it escapes overflow:hidden parents
function OptionPicker({ options, value, onChange, loading, ariaLabel, ui, error }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const [activeIdx, setActiveIdx] = useState(0);
  const btnRef = useRef(null);
  const optionRefs = useRef([]);

  const selected = options.find(o => o.id === value);
  const close = useCallback(() => setOpen(false), []);

  function handleOpen() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(v => !v);
  }

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex(o => o.id === value);
    const start = idx >= 0 ? idx : 0;
    setActiveIdx(start);
    optionRefs.current[start]?.focus();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) optionRefs.current[activeIdx]?.focus();
  }, [activeIdx, open]);

  function handleListKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[activeIdx]) { onChange(options[activeIdx].id); setOpen(false); }
    } else if (e.key === 'Escape') { close(); }
  }

  if (loading) {
    return (
      <div style={{ ...INPUT_ST, display: 'flex', alignItems: 'center', gap: 8, color: 'hsl(var(--text-disabled))', background: 'hsl(var(--muted))' }}>
        <Loader2
          size={13}
          style={{ animation: 'spin 1s linear infinite' }}
          data-testid="Loader2__3fe37d" />
        {ui('loading')}
      </div>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...INPUT_ST,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', gap: 8,
          border: error ? '1px solid hsl(var(--destructive))' : '1px solid hsl(var(--border-control))',
          background: error ? 'var(--status-destructive-bg)' : 'hsl(var(--card))',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'hsl(var(--foreground))' : 'hsl(var(--text-disabled))' }}>
          {selected?.label ?? '—'}
        </span>
        <ChevronDown
          size={15}
          style={{ color: 'hsl(var(--text-disabled))', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
          data-testid="ChevronDown__3fe37d" />
      </button>
      {open && (
        <>
          <div data-testid="taxid-picker-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 200 }} onMouseDown={close} />
          <ul
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: dropPos.top,
              left: dropPos.left,
              width: dropPos.width,
              zIndex: 201,
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border-subtle))',
              borderRadius: 12,
              boxShadow: '0 8px 24px hsl(var(--foreground) / .15)',
              padding: '4px 0',
              maxHeight: 240,
              overflowY: 'auto',
            }}
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
                  onMouseDown={e => { e.preventDefault(); onChange(opt.id); setOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', fontSize: 14, textAlign: 'left',
                    border: 'none', cursor: 'pointer',
                    background: opt.id === value ? 'hsl(var(--muted))' : 'hsl(var(--card))',
                    color: opt.id === value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                    fontWeight: opt.id === value ? 600 : 400,
                  }}
                >
                  <span style={{ width: 16, flexShrink: 0 }}>
                    {opt.id === value && <Check size={13} data-testid="Check__3fe37d" />}
                  </span>
                  {opt.label}
                </button>
              </li>
            ))}
            {options.length === 0 && (
              <li style={{ padding: '12px 16px', fontSize: 14, color: 'hsl(var(--text-disabled))', textAlign: 'center' }}>{ui('noResults')}</li>
            )}
          </ul>
        </>
      )}
    </>
  );
}

function applyBpData({ cancelled, bp, loc, keyOpts, inv, invoiceSpec, setName, setTaxID, setTaxIDKey, setLocation, setTaxIDKeyOptions, setInvClaveTipo, setInvDescripcionSii }) {
  if (cancelled) return;
  if (bp) {
    setName(bp.name ?? bp.etgoFirstname ?? '');
    setTaxID(bp.taxID ?? '');
    setTaxIDKey(bp.oBTIKTaxIDKey ?? '');
  }
  setLocation(loc);
  setTaxIDKeyOptions(keyOpts);
  if (inv) {
    const claveTipoKey = invoiceSpec === 'purchase-invoice' ? 'aeatsiiClaveTipoFc' : 'aeatsiiClaveTipo';
    setInvClaveTipo(inv[claveTipoKey] ?? '');
    setInvDescripcionSii(inv.aeatsiiDescripcionSii ?? '');
  }
}

async function saveContactData({
  saving, bpId, hasInvoice, invDescripcionSii,
  setDescError, setActiveTab, setSaving,
  apiFetch, invoiceApiFetch, invoiceSpec, invoiceId,
  invClaveTipo, name, taxID, taxIDKey, ui, onClose,
}) {
  if (saving || !bpId) return;
  if (hasInvoice && !invDescripcionSii?.trim()) {
    setDescError(true);
    setActiveTab('invoice');
    return;
  }
  setSaving(true);
  try {
    // Thunks, not promises, and awaited one at a time (ETP-5112). Both are PUTs carrying their
    // record's `updated` token, and core parses that token through a non-thread-safe static
    // `SimpleDateFormat` (`JsonToDataConverter` line 129) — two writes arriving together corrupt
    // each other's parse and one is refused as a conflict against a record nobody touched. This is
    // the same two-write shape that reproduced it on the Organization screen.
    //
    // The request must NOT be started while building this list: calling `apiFetch` here would put
    // both in flight immediately and awaiting them in order afterwards would serialise only the
    // reading of the results, not the requests themselves — leaving the race exactly as it was.
    const saves = [
      () => apiFetch(`/businessPartner/${bpId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || null, taxID: taxID || null, oBTIKTaxIDKey: taxIDKey || null }),
      }),
    ];
    if (hasInvoice) {
      saves.push(() => invoiceApiFetch(`/${invoiceSpec}/header/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [invoiceSpec === 'purchase-invoice' ? 'aeatsiiClaveTipoFc' : 'aeatsiiClaveTipo']: invClaveTipo || null,
          aeatsiiDescripcionSii: invDescripcionSii || null,
        }),
      }));
    }
    const results = [];
    for (const save of saves) {
      results.push(await save());
    }
    if (results.every(r => r.ok)) {
      toast.success(ui('contactDetail.saved'));
      onClose();
    } else {
      toast.error(ui('contactDetail.saveError'));
    }
  } finally {
    setSaving(false);
  }
}

export default function ContactDetailModal({ open, onClose, bpId, contactsApiBase, errorCode, errorMessage, invoiceId, invoiceSpec, neoApiBase }) {
  const ui = useUI();
  const apiFetch = useApiFetch(contactsApiBase);
  const invoiceApiFetch = useApiFetch(neoApiBase);

  const hasInvoice = !!(invoiceId && invoiceSpec);
  const TABS = hasInvoice
    ? [{ id: 'contact', label: ui('contactDetail.section.contact') }, { id: 'invoice', label: ui('contactDetail.section.invoice') }]
    : null;

  const [activeTab, setActiveTab] = useState('contact');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyOptsLoading, setKeyOptsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [name, setName] = useState('');
  const [taxID, setTaxID] = useState('');
  const [taxIDKey, setTaxIDKey] = useState('');
  const [taxIDKeyOptions, setTaxIDKeyOptions] = useState([]);
  const [location, setLocation] = useState(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const [invClaveTipo, setInvClaveTipo] = useState('');
  const [invDescripcionSii, setInvDescripcionSii] = useState('');
  const [descError, setDescError] = useState(false);

  useEffect(() => {
    if (!open || !bpId || !contactsApiBase) return;
    let cancelled = false;
    setLoading(true);
    setKeyOptsLoading(true);
    setActiveTab('contact');
    setIsDirty(false);
    setName(''); setTaxID(''); setTaxIDKey(''); setLocation(null); setTaxIDKeyOptions([]);
    setInvClaveTipo(''); setInvDescripcionSii(''); setDescError(false);

    Promise.all([
      fetchBp(apiFetch, bpId),
      fetchFirstLocation(apiFetch, bpId),
      fetchTaxIDKeyOptions(apiFetch),
      hasInvoice ? fetchInvoice(invoiceApiFetch, invoiceSpec, invoiceId) : Promise.resolve(null),
    ]).then(([bp, loc, keyOpts, inv]) => {
      applyBpData({ cancelled, bp, loc, keyOpts, inv, invoiceSpec, setName, setTaxID, setTaxIDKey, setLocation, setTaxIDKeyOptions, setInvClaveTipo, setInvDescripcionSii });
    }).finally(() => { if (!cancelled) { setLoading(false); setKeyOptsLoading(false); } });

    return () => { cancelled = true; };
  }, [open, bpId, invoiceId, invoiceSpec, contactsApiBase, neoApiBase, apiFetch, invoiceApiFetch, hasInvoice]);

  async function handleSave() {
    await saveContactData({
      saving, bpId, hasInvoice, invDescripcionSii,
      setDescError, setActiveTab, setSaving,
      apiFetch, invoiceApiFetch, invoiceSpec, invoiceId,
      invClaveTipo, name, taxID, taxIDKey, ui, onClose,
    });
  }

  async function reloadLocation() {
    const loc = await fetchFirstLocation(apiFetch, bpId);
    setLocation(loc);
  }

  if (!open) return null;

  const addressText = formatAddress(location);
  const siiTipoOptions = invoiceSpec === 'purchase-invoice' ? SII_TIPO_OPTIONS_PURCHASE : SII_TIPO_OPTIONS_SALES;

  const tabStyle = (id) => ({
    flex: 1, textAlign: 'center', padding: '5px 16px', fontSize: 14,
    fontWeight: activeTab === id ? 500 : 400, color: 'hsl(var(--foreground))',
    background: activeTab === id ? 'hsl(var(--card))' : 'transparent',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    boxShadow: activeTab === id ? '0px 1px 3px hsl(var(--foreground) / 0.1), 0px 1px 2px hsl(var(--foreground) / 0.06)' : 'none',
    transition: 'all 0.1s', whiteSpace: 'nowrap',
  });

  return (
    <>
      <div
        className="fm-modal-overlay"
        role="dialog"
        aria-modal="true"
        data-testid="contact-detail-backdrop"
        onClick={onClose}
      >
        <div
          className="fm-config-modal"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="fm-config-modal__header">
            <div className="fm-config-modal__titles">
              <div className="fm-config-modal__title">
                {(errorCode || errorMessage) ? ui('solveError.title') : ui('contactDetail.title')}
              </div>
              {bpId && name && (
                <div className="fm-config-modal__sub">{name}</div>
              )}
            </div>
            <button className="fm-config-modal__close" onClick={onClose} aria-label={ui('close')}>✕</button>
          </div>

          {/* Error banner */}
          {(errorCode || errorMessage) && (
            <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: 'var(--status-destructive-bg)', borderRadius: 10, border: '1px solid hsl(var(--destructive) / 0.3)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--destructive))', marginBottom: 2 }}>{ui('solveError.errorDetail')}</div>
              {errorCode && <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'hsl(var(--destructive))' }}>[{errorCode}]</div>}
              {errorMessage && <div style={{ fontSize: 13, color: 'hsl(var(--destructive))', marginTop: 2 }}>{errorMessage}</div>}
            </div>
          )}

          {/* Tabs */}
          {TABS && (
            <div style={{ padding: '12px 20px 0' }}>
              <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'hsl(var(--muted))' }}>
                {TABS.map(tab => (
                  <button key={tab.id} style={tabStyle(tab.id)} onClick={() => setActiveTab(tab.id)}>
                    {tab.label}
                    {tab.id === 'invoice' && descError && (
                      <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--destructive))', display: 'inline-block', verticalAlign: 'middle' }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Body — overflow visible so dropdown escapes (content is short) */}
          <div className="fm-config-modal__body" style={{ minHeight: loading ? 200 : 'auto', overflow: 'visible' }}>

            {bpId && loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                <Loader2
                  size={20}
                  style={{ animation: 'spin 1s linear infinite', color: 'hsl(var(--text-disabled))' }}
                  data-testid="Loader2__3fe37d" />
              </div>
            )}
            {bpId && !loading && (
              <>
                {/* ── Contacto ── */}
                {(!TABS || activeTab === 'contact') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    <CfgField label={ui('contactDetail.name')} required data-testid="CfgField__3fe37d">
                      <input
                        type="text"
                        value={name}
                        onChange={e => { setName(e.target.value); setIsDirty(true); }}
                        style={INPUT_ST}
                      />
                    </CfgField>

                    {/* NIF/CIF full width */}
                    <CfgField label={ui('contactDetail.taxID')} data-testid="CfgField__3fe37d">
                      <input
                        type="text"
                        value={taxID}
                        onChange={e => { setTaxID(e.target.value); setIsDirty(true); }}
                        style={INPUT_ST}
                      />
                    </CfgField>

                    {/* Clave Nif País Residencia — full width so label no se parte */}
                    <CfgField label={ui('contactDetail.taxIDKey')} data-testid="CfgField__3fe37d">
                      <OptionPicker
                        options={taxIDKeyOptions}
                        value={taxIDKey}
                        onChange={v => { setTaxIDKey(v); setIsDirty(true); }}
                        loading={keyOptsLoading}
                        ariaLabel={ui('contactDetail.taxIDKey')}
                        ui={ui}
                        data-testid="OptionPicker__3fe37d" />
                    </CfgField>

                    {/* Dirección */}
                    <CfgField label={ui('contactDetail.location')} data-testid="CfgField__3fe37d">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ ...INPUT_ST, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: addressText ? 'hsl(var(--foreground))' : 'hsl(var(--text-disabled))', background: 'hsl(var(--muted))', display: 'flex', alignItems: 'center' }}>
                          {addressText ?? '—'}
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocationModalOpen(true)}
                          style={{
                            flexShrink: 0, height: 40, padding: '0 14px',
                            fontSize: 14, fontWeight: 500, color: 'hsl(var(--foreground))',
                            border: '1px solid hsl(var(--border-control))', borderRadius: 8,
                            background: 'hsl(var(--card))', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            whiteSpace: 'nowrap',
                            boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
                          }}
                        >
                          <MapPin size={13} data-testid="MapPin__3fe37d" />
                          {ui('contactDetail.editLocation')}
                        </button>
                      </div>
                    </CfgField>

                  </div>
                )}

                {/* ── Factura (SII) ── */}
                {TABS && activeTab === 'invoice' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  <CfgField label={ui('contactDetail.siiInvoiceType')} data-testid="CfgField__3fe37d">
                    <OptionPicker
                      options={siiTipoOptions}
                      value={invClaveTipo}
                      onChange={v => { setInvClaveTipo(v); setIsDirty(true); }}
                      ariaLabel={ui('contactDetail.siiInvoiceType')}
                      ui={ui}
                      data-testid="OptionPicker__3fe37d" />
                  </CfgField>

                    <CfgField
                      label={ui('contactDetail.siiDescription')}
                      required
                      data-testid="CfgField__3fe37d">
                      <input
                        type="text"
                        value={invDescripcionSii}
                        onChange={e => { setInvDescripcionSii(e.target.value); setIsDirty(true); if (descError) setDescError(false); }}
                        style={descError ? INPUT_ERR_ST : INPUT_ST}
                      />
                      {descError && (
                        <div style={{ fontSize: 12, color: 'hsl(var(--destructive))', marginTop: 4 }}>
                          {ui('contactDetail.siiDescriptionRequired')}
                        </div>
                      )}
                    </CfgField>

                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {(!bpId || !loading) && (
            <div className="fm-config-modal__footer">
              <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>
                {ui('cancel')}
              </button>
              {bpId && (
                <button
                  className={`fm-btn fm-btn--save-pill${isDirty ? ' fm-btn--save-pill--active' : ''}`}
                  disabled={saving}
                  onClick={handleSave}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {saving && <Loader2
                    size={13}
                    style={{ animation: 'spin 1s linear infinite' }}
                    data-testid="Loader2__3fe37d" />}
                  {!saving && isDirty && <Check size={14} strokeWidth={2} data-testid="Check__3fe37d" />}
                  {ui('save')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* LocationEditorModal fuera del overlay para no quedar tapado */}
      {locationModalOpen && (
        <LocationEditorModal
          open={locationModalOpen}
          onClose={() => setLocationModalOpen(false)}
          onSaved={() => { setLocationModalOpen(false); reloadLocation(); }}
          rowId={location?.id ?? null}
          bpId={bpId}
          apiBase={contactsApiBase}
          data-testid="LocationEditorModal__3fe37d" />
      )}
    </>
  );
}
