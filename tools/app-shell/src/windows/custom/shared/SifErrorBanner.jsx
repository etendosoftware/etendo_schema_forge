import { useUI } from '@/i18n';

// SII states that indicate a sending error worth surfacing
const SII_ERROR_STATES = new Set(['AE', 'EE']);

// Verifactu states that indicate a problem (accepted-with-errors, invalid, rejected)
const VERIFACTU_ERROR_STATES = new Set(['AE', 'IN', 'ER']);

function siiStatusLabel(ui, estado) {
  const MAP = {
    AE: ui('sifDataTabs.status.sii.acceptedWithErrors'),
    EE: ui('sifDataTabs.status.sii.sendError'),
  };
  return MAP[estado] ?? estado;
}

function verifactuStatusLabel(ui, status) {
  const MAP = {
    AE: ui('sifDataTabs.status.verifactu.acceptedWithErrors'),
    IN: ui('sifDataTabs.status.verifactu.invalid'),
    ER: ui('sifDataTabs.status.verifactu.rejected'),
  };
  return MAP[status] ?? status;
}

function ErrorRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="font-medium text-destructive/80 shrink-0">{label}:</span>
      <span className="text-destructive break-all">{value}</span>
    </div>
  );
}

function ErrorBlock({ title, children }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1.5">
      <p className="text-sm font-semibold text-destructive">{title}</p>
      {children}
    </div>
  );
}

export default function SifErrorBanner({ data }) {
  const ui = useUI();

  const hasSiiError = SII_ERROR_STATES.has(data?.aeatsiiEstado);
  const hasVerifactuError = VERIFACTU_ERROR_STATES.has(data?.etvfacInvoiceStatus);

  if (!hasSiiError && !hasVerifactuError) return null;

  return (
    <div className="mt-4 space-y-3">
      {hasSiiError && (
        <ErrorBlock title={`SII — ${siiStatusLabel(ui, data.aeatsiiEstado)}`}>
          <ErrorRow label={ui('sifErrorBanner.errorCode')} value={data.aeatsiiErrorCode} />
          <ErrorRow label={ui('sifErrorBanner.errorDetail')} value={data.aeatsiiErrorMsg} />
        </ErrorBlock>
      )}
      {hasVerifactuError && (
        <ErrorBlock title={`VERI*FACTU — ${verifactuStatusLabel(ui, data.etvfacInvoiceStatus)}`}>
          <ErrorRow label={ui('sifErrorBanner.errorDetail')} value={data.etvfacIssueDescription} />
        </ErrorBlock>
      )}
    </div>
  );
}
