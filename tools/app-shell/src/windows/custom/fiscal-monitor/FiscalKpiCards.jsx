import { useUI } from '@/i18n';

const ArrowUpIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
  </svg>
);

const icons = {
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  xcircle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
};

const FmKpi = ({ label, num, icon, tone = 'default', sub, active, onClick }) => (
  <div className={`fm-kpi${active ? ' active' : ''}`} data-testid="fm-kpi-card" onClick={onClick} role="button" tabIndex={0}>
    <div className="row1">
      <div className="label">{label}</div>
      <div className={`ico ${tone}`}>{icon}</div>
    </div>
    <div className="num-big">{(num ?? 0).toLocaleString('de-DE')}</div>
    {sub && (
      <div className="foot">
        <span>{sub}</span>
      </div>
    )}
  </div>
);

export default function FiscalKpiCards({ variant, kpis, activeKey, onPick }) {
  const ui = useUI();

  if (variant === 'sii') {
    const sii = kpis?.sii ?? {};
    return (
      <div className="fm-kpis">
        <FmKpi
          label={ui('fiscalMonitor.kpi.sii.issued')}
          num={sii.issued}
          icon={icons.upload}
          tone="success"
          sub={ui('fiscalMonitor.kpi.sii.sub.current')}
          active={activeKey === 'issued'}
          onClick={() => onPick('issued')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={`${ui('fiscalMonitor.kpi.sii.issued')} · ${ui('fiscalMonitor.kpi.sii.sub.previous')}`}
          num={sii.issuedPrevious}
          icon={icons.upload}
          tone="info"
          sub={ui('fiscalMonitor.kpi.sii.sub.previous')}
          active={activeKey === 'issued-previous'}
          onClick={() => onPick('issued-previous')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={ui('fiscalMonitor.kpi.sii.received')}
          num={sii.received}
          icon={icons.download}
          tone="success"
          sub={ui('fiscalMonitor.kpi.sii.sub.current')}
          active={activeKey === 'received'}
          onClick={() => onPick('received')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={`${ui('fiscalMonitor.kpi.sii.received')} · ${ui('fiscalMonitor.kpi.sii.sub.previous')}`}
          num={sii.receivedPrevious}
          icon={icons.download}
          tone="info"
          sub={ui('fiscalMonitor.kpi.sii.sub.previous')}
          active={activeKey === 'received-previous'}
          onClick={() => onPick('received-previous')}
          data-testid="FmKpi__d77e5d" />
      </div>
    );
  }

  if (variant === 'tbai') {
    const tbai = kpis?.tbai ?? {};
    return (
      <div className="fm-kpis three">
        <FmKpi
          label={ui('fiscalMonitor.kpi.tbai.total')}
          num={tbai.total}
          icon={icons.check}
          tone="success"
          sub={ui('fiscalMonitor.kpi.tbai.total.sub')}
          active={activeKey === 'all'}
          onClick={() => onPick('all')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={ui('fiscalMonitor.kpi.tbai.received.label')}
          num={tbai.received}
          icon={icons.check}
          tone="success"
          sub={ui('fiscalMonitor.kpi.tbai.received.sub')}
          active={activeKey === 'Recibido'}
          onClick={() => onPick('Recibido')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={ui('fiscalMonitor.kpi.tbai.error.label')}
          num={(tbai.rejected ?? 0) + (tbai.error ?? 0)}
          icon={icons.xcircle}
          tone="danger"
          sub={ui('fiscalMonitor.kpi.tbai.error.sub')}
          active={activeKey === 'Rechazado'}
          onClick={() => onPick('Rechazado')}
          data-testid="FmKpi__d77e5d" />
      </div>
    );
  }

  if (variant === 'verifactu') {
    const vf = kpis?.verifactu ?? {};
    return (
      <div className="fm-kpis">
        <FmKpi
          label={ui('fiscalMonitor.kpi.verifactu.accepted')}
          num={vf.accepted}
          icon={icons.check}
          tone="success"
          sub={ui('fiscalMonitor.kpi.verifactu.accepted.sub')}
          active={activeKey === 'accepted'}
          onClick={() => onPick('accepted')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={ui('fiscalMonitor.kpi.verifactu.partiallyAccepted')}
          num={vf.partiallyAccepted}
          icon={icons.alert}
          tone="warn"
          sub={ui('fiscalMonitor.kpi.verifactu.partiallyAccepted.sub')}
          active={activeKey === 'partiallyAccepted'}
          onClick={() => onPick('partiallyAccepted')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={ui('fiscalMonitor.kpi.verifactu.rejected')}
          num={vf.rejected}
          icon={icons.xcircle}
          tone="danger"
          sub={ui('fiscalMonitor.kpi.verifactu.rejected.sub')}
          active={activeKey === 'rejected'}
          onClick={() => onPick('rejected')}
          data-testid="FmKpi__d77e5d" />
        <FmKpi
          label={ui('fiscalMonitor.kpi.verifactu.invalid')}
          num={vf.invalid}
          icon={icons.alert}
          tone="danger"
          sub={ui('fiscalMonitor.kpi.verifactu.invalid.sub')}
          active={activeKey === 'invalid'}
          onClick={() => onPick('invalid')}
          data-testid="FmKpi__d77e5d" />
      </div>
    );
  }

  return null;
}
