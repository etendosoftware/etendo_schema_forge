import { useState } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useUI } from '@/i18n';
import CertModal from './CertModal.jsx';
import { useDraggable } from '../fiscal-monitor/useDraggable.js';

// idField = javaQualifier of the PK column in ETGO_SF_FIELD; NeoFieldFilter renames 'id' → qualifier
const CONFIGS = [
  { key: 'sii',      labelKey: 'fiscalDebug.label.sii',      spec: 'sii-config',       entity: 'siiConfiguration',                 idField: 'configuracinSII' },
  { key: 'tbai',     labelKey: 'fiscalDebug.label.tbai',     spec: 'tbai-config',      entity: 'header',                           idField: 'tbaiConfigID' },
  { key: 'verifactu',labelKey: 'fiscalDebug.label.verifactu',spec: 'verifactu-config', entity: 'cabeceraDeConfiguraciónVerifactu', idField: 'verifactuConfig' },
  { key: 'cert',     labelKey: 'fiscalDebug.label.cert',     spec: 'certificate',      entity: null,                               idField: null },
];

// ── Mock record fixtures ──────────────────────────────────────────────────────

const MOCK_SII = {
  configuracinSII: 'debug-sii-001',
  acogidaAlSII: 'N',
  fechaAcogidaSII: '',
  entornoDeProduccin: 'N',
  plazoLmiteDeEnvoASII: '4',
  cadenciaEnvoFacturasVentaASII: 'D',
  cadenciaEnvoFacturasCompraASII: 'W',
  adjuntarArchivosXML: 'N',
  recc: 'N',
  redeme: 'N',
  monitordate: '',
  postedInvoices: 'N',
  authorizationno: '',
  navarra: 'N',
  guipuzcoa: 'N',
};

const MOCK_SII_NAVARRA = { ...MOCK_SII, navarra: 'Y' };

const MOCK_TBAI = {
  tbaiConfigID: 'debug-tbai-001',
  tbaisystemdate: '2024-01-01',
  etsgSifTerritory: 'ARABA',
  entornoDeProduccin: 'N',
  etsgInvoicedescription: '',
  etsgUseasproduct: 'N',
  etsgAutosend: 'N',
  etsgJasperreport: '',
  etsgValidateprevious: 'N',
};

const MOCK_VERIFACTU = {
  verifactuConfig: 'debug-vf-001',
  tAXType: '01',
  defaultQR: 'N',
  nif: '',
  systemstart: '',
  systemstop: '',
  incident: 'N',
  tbaisystemdate: '',
};

const MOCK_CERT_DETAILS = {
  subject: 'CN=Empresa Demo S.L.,O=Empresa Demo,C=ES',
  issuer:  'CN=FNMT Clase 2 CA,O=FNMT,C=ES',
  validFrom: '2023-01-15',
  validTo:   '2026-01-14',
  algorithm: 'SHA256withRSA',
};

const MOCK_FILE_STUB = { name: 'certificado-empresa.p12', size: 3145728 };

const MOCK_PROFILES = [
  { key: 'sii',       labelKey: 'fiscalDebug.profile.sii',      sii: MOCK_SII,        tbai: null,      verifactu: null      },
  { key: 'sii-nav',   labelKey: 'fiscalDebug.profile.siiNav',   sii: MOCK_SII_NAVARRA,tbai: null,      verifactu: null      },
  { key: 'tbai',      labelKey: 'fiscalDebug.profile.tbai',     sii: null,            tbai: MOCK_TBAI, verifactu: null      },
  { key: 'sii+tbai',  labelKey: 'fiscalDebug.profile.siiTbai',  sii: MOCK_SII,        tbai: MOCK_TBAI, verifactu: null      },
  { key: 'verifactu', labelKey: 'fiscalDebug.profile.verifactu',sii: null,            tbai: null,      verifactu: MOCK_VERIFACTU },
];

const CERT_MODAL_STATES = [
  { key: 'pick',       labelKey: 'fiscalDebug.certModal.pick',     state: { step: 'pick' } },
  { key: 'pick-file',  labelKey: 'fiscalDebug.certModal.fileSel',  state: { step: 'pick', file: MOCK_FILE_STUB } },
  { key: 'pick-err',   labelKey: 'fiscalDebug.certModal.pickErr',  state: { step: 'pick', errMsgKey: 'fiscalDebug.certModal.invalidFormat' } },
  { key: 'verify',     labelKey: 'fiscalDebug.certModal.verify',   state: { step: 'verify', file: MOCK_FILE_STUB } },
  { key: 'confirmNif', labelKey: 'fiscalDebug.certModal.nifConf',  state: { step: 'confirmNif', file: MOCK_FILE_STUB, pendingNif: 'B12345678' } },
  { key: 'done',       labelKey: 'fiscalDebug.certModal.done',     state: { step: 'done', file: MOCK_FILE_STUB, certDetails: MOCK_CERT_DETAILS } },
];

// ── Delete helpers ────────────────────────────────────────────────────────────

async function deleteNeoRecord(base, spec, entity, orgId, token, idField) {
  const listUrl = `${base}/${spec}/${encodeURIComponent(entity)}?${new URLSearchParams({
    organization: orgId,
    _startRow: '0',
    _endRow: '49',
  })}`;
  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${spec} HTTP ${res.status}`);
  const json = await res.json();
  const responseBody = json?.response ?? {};
  if (responseBody.status != null && responseBody.status !== 0) {
    throw new Error(`GET ${spec} status ${responseBody.status}: ${responseBody.error?.message ?? JSON.stringify(responseBody).slice(0, 120)}`);
  }
  const records = responseBody.data ?? [];
  if (records.length === 0) return 0;
  let deleted = 0;
  await Promise.all(records.map(async (r) => {
    const rid = idField ? (r[idField] ?? r.id) : r.id;
    const delRes = await fetch(`${base}/${spec}/${encodeURIComponent(entity)}/${rid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!delRes.ok) throw new Error(`DELETE ${spec}/${rid} HTTP ${delRes.status}`);
    deleted++;
  }));
  return deleted;
}

async function deleteCertificates(base, orgId, token) {
  const res = await fetch(`${base}/certificate?${new URLSearchParams({ orgId })}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Delete certificate HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  return json?.deleted ?? 0;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle = {
  position: 'fixed',
  top: 56,
  right: 16,
  zIndex: 9999,
  background: '#1a1a2e',
  color: '#e0e0ff',
  borderRadius: 10,
  padding: '10px 14px',
  minWidth: 260,
  maxWidth: 320,
  boxShadow: '0 4px 24px rgba(0,0,0,.45)',
  fontSize: 12,
  fontFamily: 'var(--font-mono, monospace)',
};

const sectionLabel = {
  fontSize: 9,
  letterSpacing: '0.12em',
  color: '#6060aa',
  textTransform: 'uppercase',
  marginBottom: 5,
  marginTop: 8,
};

const btnBase = {
  border: '1px solid',
  borderRadius: 5,
  cursor: 'pointer',
  padding: '3px 7px',
  fontSize: 11,
  fontFamily: 'inherit',
};

// ── Component ─────────────────────────────────────────────────────────────────

const CERT_EXPIRY_OPTIONS = [
  { key: null,  labelKey: 'fiscalDebug.certExpiry.none' },
  { key: 45,    labelKey: 'fiscalDebug.certExpiry.warn' },
  { key: 20,    labelKey: 'fiscalDebug.certExpiry.crit' },
];

export default function FiscalConfigDebugPanel({ orgId, token, apiBaseUrl, onDeleted, onSetMock, activeMockKey, mockCertDays, onSetCertDays }) {
  const ui = useUI();
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState({});
  const [certDebug, setCertDebug] = useState(null);
  const { panelRef, posStyle, handleMouseDown } = useDraggable();

  async function handleDelete(cfg) {
    if (!orgId) return;
    setStatus(s => ({ ...s, [cfg.key]: { loading: true, msg: null } }));
    try {
      const base = neoBase(apiBaseUrl);
      let deleted;
      if (cfg.key === 'cert') {
        deleted = await deleteCertificates(base, orgId, token);
      } else {
        deleted = await deleteNeoRecord(base, cfg.spec, cfg.entity, orgId, token, cfg.idField);
      }
      setStatus(s => ({ ...s, [cfg.key]: { loading: false, msg: ui('fiscalDebug.status.deleted', { count: deleted }) } }));
      onDeleted?.();
    } catch (err) {
      setStatus(s => ({ ...s, [cfg.key]: { loading: false, msg: `✗ ${err.message.slice(0, 40)}` } }));
    }
  }

  async function handleDeleteAll() {
    for (const cfg of CONFIGS) {
      await handleDelete(cfg);
    }
  }

  return (
    <>
      <div ref={panelRef} style={{ ...panelStyle, ...posStyle }}>
        <div
          onMouseDown={handleMouseDown}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 4, cursor: 'grab', userSelect: 'none' }}
        >
          <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#a0a0cc', textTransform: 'uppercase' }}>
            {ui('fiscalDebug.title')}
          </span>
          <button
            onClick={() => setCollapsed(c => !c)}
            onMouseDown={e => e.stopPropagation()}
            style={{ background: 'none', border: 'none', color: '#a0a0cc', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>

        {!collapsed && (
          <>
            <div style={{ fontSize: 10, color: '#a0a0cc', marginBottom: 8 }}>
              {ui('fiscalDebug.org')}: <span style={{ color: '#e0e0ff' }}>{orgId ?? '—'}</span>
            </div>

            {/* ── Mock profiles ── */}
            <div style={sectionLabel}>{ui('fiscalDebug.section.profiles')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
              {MOCK_PROFILES.map(p => {
                const active = activeMockKey === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => onSetMock?.(active ? null : p)}
                    style={{
                      ...btnBase,
                      background: active ? '#5423E7' : '#2a2a4e',
                      borderColor: active ? '#8860ff' : '#4040aa',
                      color: active ? '#fff' : '#c0c0ff',
                    }}
                  >
                    {active ? '✓ ' : ''}{ui(p.labelKey)}
                  </button>
                );
              })}
              <button
                onClick={() => onSetMock?.(activeMockKey === 'wizard' ? null : { key: 'wizard', sii: null, tbai: null, verifactu: null })}
                style={{
                  ...btnBase,
                  background: activeMockKey === 'wizard' ? '#5423E7' : '#3d1a1a',
                  borderColor: activeMockKey === 'wizard' ? '#8860ff' : '#5c2a2a',
                  color: activeMockKey === 'wizard' ? '#fff' : '#ffb3b3',
                }}
              >
                {activeMockKey === 'wizard' ? '✓ ' : ''}{ui('fiscalDebug.profile.wizard')}
              </button>
            </div>

            {/* ── Cert expiry banner ── */}
            <div style={sectionLabel}>{ui('fiscalDebug.section.certExpiry')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {CERT_EXPIRY_OPTIONS.map(opt => {
                const active = mockCertDays === opt.key;
                return (
                  <button
                    key={String(opt.key)}
                    onClick={() => onSetCertDays?.(opt.key)}
                    style={{
                      ...btnBase,
                      background: active ? '#1a3a2a' : '#2a2a4e',
                      borderColor: active ? '#2a7a4a' : '#4040aa',
                      color: active ? '#b3ffd6' : '#c0c0ff',
                    }}
                  >
                    {active ? '✓ ' : ''}{ui(opt.labelKey)}
                  </button>
                );
              })}
            </div>

            {/* ── Cert modal debug ── */}
            <div style={sectionLabel}>{ui('fiscalDebug.section.certModal')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {CERT_MODAL_STATES.map(cs => (
                <button
                  key={cs.key}
                  onClick={() => setCertDebug({ state: cs.state, context: 'sii' })}
                  style={{ ...btnBase, background: '#1a2e2e', borderColor: '#2a5a5a', color: '#80ffee' }}
                >
                  {ui(cs.labelKey)}
                </button>
              ))}
            </div>

            {/* ── Delete ── */}
            <div style={sectionLabel}>{ui('fiscalDebug.section.deleteRecords')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CONFIGS.map(cfg => {
                const st = status[cfg.key];
                return (
                  <div key={cfg.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => handleDelete(cfg)}
                      disabled={st?.loading}
                      style={{
                        flex: 1,
                        background: '#3d1a1a',
                        border: '1px solid #5c2a2a',
                        borderRadius: 5,
                        color: '#ffb3b3',
                        cursor: st?.loading ? 'wait' : 'pointer',
                        padding: '3px 7px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontFamily: 'inherit',
                        opacity: st?.loading ? 0.6 : 1,
                      }}
                    >
                      {st?.loading ? '…' : '🗑'} {ui(cfg.labelKey)}
                    </button>
                    {st?.msg && (
                      <span style={{
                        fontSize: 10,
                        color: st.msg.startsWith('✓') ? '#6dffb3' : '#ff6d6d',
                        whiteSpace: 'nowrap',
                      }}>
                        {st.msg}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleDeleteAll}
              style={{
                marginTop: 8,
                width: '100%',
                background: '#5c1a1a',
                border: '1px solid #8b2a2a',
                borderRadius: 5,
                color: '#ffb3b3',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: 11,
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              {ui('fiscalDebug.deleteAll')}
            </button>
          </>
        )}
      </div>

      {certDebug && (
        <CertModal
          context={certDebug.context}
          orgId={orgId}
          token={token}
          apiBaseUrl={apiBaseUrl}
          debugInitialState={certDebug.state?.errMsgKey ? { ...certDebug.state, errMsg: ui(certDebug.state.errMsgKey) } : certDebug.state}
          onClose={() => setCertDebug(null)}
          onUpload={() => setCertDebug(null)}
        />
      )}
    </>
  );
}
