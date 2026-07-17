import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Check, ChevronDown, FileText, UploadCloud, X } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useStatementImport } from '@/hooks/useStatementImport';
import { useStatementPreview } from '@/hooks/useStatementPreview';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(iso, bcpLocale) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(bcpLocale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

function formatMoney(amount, currency, bcpLocale) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(bcpLocale, {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Cheap client-side line count for the "N líneas" hint shown on step 1, before
// the authoritative server parse runs on Continue. Blank lines are ignored.
async function countFileLines(file) {
  try {
    const text = await file.text();
    return text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '').length;
  } catch {
    return 0;
  }
}

/**
 * Local keyframes for the import-modal animations. Scoped via prefixed class
 * names so they don't collide with anything else in the bundle.
 */
const ANIMATIONS_CSS = `
@keyframes imp-pop { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes imp-pop-in { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
.imp-modal-enter { animation: imp-pop .22s cubic-bezier(.16,1,.3,1); }
.imp-pop-in { animation: imp-pop-in .35s cubic-bezier(.16,1,.3,1); }
`;

/**
 * Auto-animating circular progress. Active-driven ramp (8 → 46 → 75 → 92 while
 * active, snaps to 100 when done). SVG ring, dark stroke over a light track,
 * percentage in the center.
 */
function ProgressRing({ active, size = 160, stroke = 12 }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!active) { setPct(100); return undefined; }
    setPct(8);
    const t1 = setTimeout(() => setPct(46), 180);
    const t2 = setTimeout(() => setPct(75), 520);
    const t3 = setTimeout(() => setPct(92), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active]);

  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8EAEF" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#121217"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .4s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xl leading-8 text-[#121217]">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/** Centered processing view: circular progress ring + title + subtitle. */
function ProcessingBody({ active = true, titleKey, subtitleKey, ui }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-3">
      <ProgressRing active={active} data-testid="ProgressRing__de9647" />
      <div className="flex flex-col items-center gap-0.5">
        <div className="text-xl font-semibold leading-7 text-[#121217]">{ui(titleKey)}</div>
        <div className="max-w-[323px] text-center text-sm leading-5 text-[#6C6C89]">
          {ui(subtitleKey)}
        </div>
      </div>
    </div>
  );
}

// view → stepper index (0=upload, 1=review, 2=done)
const VIEW_TO_STEP = {
  empty:     0,
  analyzing: 1,
  selected:  0,
  error:     0,
  preview:   1,
  importing: 2,
  success:   2,
};

// view → subtitle i18n key. Values are i18n KEYS resolved via ui(...) at render;
// the `error` view name collides with a scanned property name, so allowlist it.
// i18n-allowlist: ["financeAccountStatementsImportSubtitleUpload"]
const VIEW_TO_SUBTITLE_KEY = {
  empty:     'financeAccountStatementsImportSubtitleUpload',
  analyzing: 'financeAccountStatementsImportSubtitleUpload',
  selected:  'financeAccountStatementsImportSubtitleUpload',
  error:     'financeAccountStatementsImportSubtitleUpload',
  preview:   'financeAccountStatementsImportSubtitleReview',
  importing: 'financeAccountStatementsImportSubtitleReview',
  success:   'financeAccountStatementsImportSubtitleDone',
};

function formatPeriod(from, to, bcpLocale) {
  if (from === to) return formatDate(from, bcpLocale);
  return `${formatDate(from, bcpLocale)} – ${formatDate(to, bcpLocale)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────────────────────────────────────

function Stepper({ step, ui }) {
  const items = [
    ui('financeAccountStatementsImportStep1'),
    ui('financeAccountStatementsImportStep2'),
    ui('financeAccountStatementsImportStep3'),
  ];
  return (
    <div className="flex items-center gap-2.5 px-6 pb-1 pt-4">
      {items.map((label, i) => {
        const isActive = step === i;
        const isDone = step > i;
        return (
          <div key={label} className="flex items-center gap-2.5">
            <StepperItem
              label={label}
              isActive={isActive}
              isDone={isDone}
              index={i}
              data-testid="StepperItem__de9647" />
            {i < items.length - 1 ? (
              <span
                className={cn(
                  'h-[1.5px] w-16 rounded-sm',
                  isDone ? 'bg-[#C5F0D8]' : 'bg-[#E8EAEF]',
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StepperItem({ label, isActive, isDone, index }) {
  let textClass = 'text-[#555B6D] font-normal';
  if (isActive) textClass = 'text-[#121217] font-semibold';
  else if (isDone) textClass = 'text-[#555B6D] font-normal line-through';

  let badgeClass = 'border-[#D1D4DB] bg-[#F5F7F9] text-[#3F3F50]';
  if (isActive) badgeClass = 'border-transparent bg-[#121217] text-white';
  else if (isDone) badgeClass = 'border-transparent bg-[#EEFBF4] text-[#1E874C]';

  return (
    <div className={cn('flex items-center gap-1.5 text-sm leading-5', textClass)}>
      <span
        className={cn(
          'flex h-6 min-w-[26px] items-center justify-center rounded-lg border px-2 text-xs font-semibold',
          badgeClass,
        )}
      >
        {isDone ? <Check className="h-3 w-3" data-testid="Check__de9647" /> : index + 1}
      </span>
      <span>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropzone (Step 1)
// ─────────────────────────────────────────────────────────────────────────────

function Dropzone({ onPick, dragging, onDragOver, onDragLeave, onDrop, ui }) {
  return (
    <div
      tabIndex={0}
      onClick={onPick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'cursor-pointer rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
        dragging
          ? 'border-[#A8AAB8] bg-[#F5F7F9]'
          : 'border-[#D1D4DB] bg-white hover:border-[#A8AAB8] hover:bg-[#F5F7F9]',
      )}
    >
      <div
        className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-[#D1D4DB] bg-white text-[#828FA3] shadow-[0_1px_2px_rgba(18,18,23,0.05)]"
        aria-hidden="true"
      >
        <UploadCloud className="h-5 w-5" data-testid="UploadCloud__de9647" />
      </div>
      <div className="text-sm font-medium text-[#121217]">
        {dragging
          ? ui('financeAccountStatementsImportDropDrop')
          : ui('financeAccountStatementsImportDropTitlePrefix')}
      </div>
      <div className="mt-1 text-xs text-[#6C6C89]">
        {ui('financeAccountStatementsImportDropHint')}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File dropzone (Step 1 — selected): filled variant, click/drag to replace
// ─────────────────────────────────────────────────────────────────────────────

function SelectedFile({
  file, lineCount, dragging, onPick, onDragOver, onDragLeave, onDrop, ui,
}) {
  return (
    <div
      tabIndex={0}
      onClick={onPick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'cursor-pointer rounded-lg border-2 border-[#121217] px-6 py-8 text-center transition-colors',
        dragging ? 'bg-[rgba(18,18,23,0.08)]' : 'bg-[rgba(18,18,23,0.05)]',
      )}
    >
      <div
        className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-[#121217] text-white/90"
        aria-hidden="true"
      >
        <FileText className="h-5 w-5" data-testid="FileText__de9647" />
      </div>
      <div className="truncate text-sm font-semibold text-[#121217]">{file.name}</div>
      <div className="mt-1 text-xs text-[#6C6C89]">
        <div>
          {formatBytes(file.size)} · {ui('financeAccountStatementsImportLines', { count: lineCount })}
        </div>
        <div>{ui('financeAccountStatementsImportReplace')}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI tiles (Step 2)
// ─────────────────────────────────────────────────────────────────────────────

function WidgetKpi({ label, value, tone }) {
  let valueClass = 'text-[#121217]';
  if (tone === 'pos') valueClass = 'text-[#17663A]';
  else if (tone === 'neg') valueClass = 'text-[#AF0932]';
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs leading-4 text-[#3F3F50]">{label}</span>
      <span className={cn('truncate text-base font-medium leading-6 tabular-nums', valueClass)}>
        {value}
      </span>
    </div>
  );
}

/** Step 2 summary strip: inline Líneas / Abonos / Cargos / Periodo. */
function SummaryWidget({ count, totalIn, totalOut, period, currency, bcpLocale, ui }) {
  return (
    <div className="flex items-center gap-5 rounded-lg border border-[#E8EAEF] px-3 py-2">
      <WidgetKpi label={ui('financeAccountStatementsImportKpiLines')} value={count} data-testid="WidgetKpi__de9647" />
      <WidgetKpi
        label={ui('financeAccountStatementsImportKpiCredits')}
        value={`+${formatMoney(totalIn, currency, bcpLocale)}`}
        tone="pos"
        data-testid="WidgetKpi__de9647" />
      <WidgetKpi
        label={ui('financeAccountStatementsImportKpiDebits')}
        value={`−${formatMoney(totalOut, currency, bcpLocale)}`}
        tone="neg"
        data-testid="WidgetKpi__de9647" />
      <WidgetKpi
        label={ui('financeAccountStatementsImportKpiPeriod')}
        value={period}
        data-testid="WidgetKpi__de9647" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview lines (Step 2)
// ─────────────────────────────────────────────────────────────────────────────

const PREV_GRID = 'grid grid-cols-[88px_minmax(160px,1fr)_104px_104px] items-center gap-2 px-3';

function AmountCell({ value, sign, toneClass, currency, bcpLocale }) {
  if (value > 0) {
    return <span className={toneClass}>{sign}{formatMoney(value, currency, bcpLocale)}</span>;
  }
  return <span className="text-[#C1C3CC]">—</span>;
}

function lineKeyOf(l) {
  return l.lineNo ?? `${l.date}-${l.description}`;
}

function PreviewLines({ lines, max = 5, currency, bcpLocale, ui }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? lines : lines.slice(0, max);
  const hasMore = lines.length > max;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-[#E8EAEF] bg-white shadow-[0_1px_2px_rgba(18,18,23,0.05)]">
        <div
          className={cn(
            PREV_GRID,
            'h-10 border-b border-[#E8EAEF] text-xs font-semibold text-[#121217]',
          )}
        >
          <span>{ui('financeAccountStatementLinesColDate')}</span>
          <span>{ui('financeAccountStatementsImportColConcept')}</span>
          <span>{ui('financeAccountStatementsImportColCharge')}</span>
          <span>{ui('financeAccountStatementsImportColCredit')}</span>
        </div>
        {shown.map((l) => {
          const cr = Number(l.cramount) || 0;
          const dr = Number(l.dramount) || 0;
          return (
            <div
              key={lineKeyOf(l)}
              className={cn(PREV_GRID, 'border-b border-[#E8EAEF] py-2 last:border-0')}
            >
              <span className="text-sm text-[#121217]">{formatDate(l.date, bcpLocale)}</span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-[#121217]">{l.description || '—'}</span>
                {l.bpartnerName ? (
                  <span className="truncate text-xs font-medium text-[#6C6C89]">{l.bpartnerName}</span>
                ) : null}
              </div>
              <span className="text-right text-sm font-semibold tabular-nums">
                <AmountCell
                  value={dr}
                  sign="−"
                  toneClass="text-[#AF0932]"
                  currency={currency}
                  bcpLocale={bcpLocale}
                  data-testid="AmountCell__de9647" />
              </span>
              <span className="text-right text-sm font-semibold tabular-nums">
                <AmountCell
                  value={cr}
                  sign="+"
                  toneClass="text-[#17663A]"
                  currency={currency}
                  bcpLocale={bcpLocale}
                  data-testid="AmountCell__de9647" />
              </span>
            </div>
          );
        })}
      </div>
      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#121217] underline"
          >
            {showAll
              ? ui('financeAccountStatementsImportShowLess')
              : ui('financeAccountStatementsImportShowAll')}
            <ChevronDown
              className={cn('h-4 w-4 text-[#828FA3] transition-transform', showAll && 'rotate-180')}
              data-testid="ChevronDown__de9647" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Body subcomponents (one per view) — extracted to keep the main render's
// cognitive complexity below Sonar's threshold.
// ─────────────────────────────────────────────────────────────────────────────

function EmptyOrErrorBody({ view, ui, inputRef, dragging, setDragging, handlePickFile, reset }) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".c43,.43,.txt,.nor,.csv,text/csv,text/plain"
        className="sr-only"
        onChange={(e) => handlePickFile(e.target.files?.[0])}
      />
      <Dropzone
        ui={ui}
        dragging={dragging}
        onPick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer?.files?.[0];
          if (dropped) handlePickFile(dropped);
        }}
        data-testid="Dropzone__de9647" />
      {view === 'error' ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#FEF0F4] py-3 pl-1.5 pr-2">
          <AlertTriangle className="h-6 w-6 shrink-0 text-[#D50B3E]" data-testid="AlertTriangle__de9647" />
          <span className="flex-1 px-1 text-sm font-medium leading-6 text-[#D50B3E]">
            {ui('financeAccountStatementsImportErrorBody')}
          </span>
          <button
            type="button"
            onClick={reset}
            aria-label={ui('financeAccountStatementsImportCloseBtn')}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[#828FA3] transition-colors hover:bg-[#FBD9E2]"
          >
            <X className="h-5 w-5" data-testid="X__de9647" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function SelectedFileBody({
  file, localLineCount, ui, inputRef, dragging, setDragging, handlePickFile,
}) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".c43,.43,.txt,.nor,.csv,text/csv,text/plain"
        className="sr-only"
        onChange={(e) => handlePickFile(e.target.files?.[0])}
      />
      <SelectedFile
        file={file}
        lineCount={localLineCount}
        dragging={dragging}
        onPick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer?.files?.[0];
          if (dropped) handlePickFile(dropped);
        }}
        ui={ui}
        data-testid="SelectedFile__de9647" />
    </>
  );
}

function PreviewBody({ previewData, accountCurrency, bcpLocale, ui }) {
  const lines = previewData.lines ?? [];
  const totalIn = lines.reduce((sum, l) => sum + (Number(l.cramount) || 0), 0);
  const totalOut = lines.reduce((sum, l) => sum + (Number(l.dramount) || 0), 0);
  return (
    <div className="flex flex-col gap-3">
      <SummaryWidget
        count={previewData.lineCount ?? lines.length}
        totalIn={totalIn}
        totalOut={totalOut}
        period={formatPeriod(previewData.periodFrom, previewData.periodTo, bcpLocale)}
        currency={accountCurrency}
        bcpLocale={bcpLocale}
        ui={ui}
        data-testid="SummaryWidget__de9647" />
      <PreviewLines
        lines={lines}
        currency={accountCurrency}
        bcpLocale={bcpLocale}
        ui={ui}
        data-testid="PreviewLines__de9647" />
    </div>
  );
}

/**
 * Renders the body slot based on the current view. Keeps the main modal's
 * cognitive complexity below Sonar's S3776 threshold by encapsulating each
 * branch behind a small helper.
 */
function ModalBody({
  view, file, previewData, previewing, localLineCount,
  accountCurrency, bcpLocale, ui, inputRef, dragging, setDragging, handlePickFile, reset,
}) {
  if (view === 'empty' || view === 'error') {
    return (
      <EmptyOrErrorBody
        view={view}
        ui={ui}
        inputRef={inputRef}
        dragging={dragging}
        setDragging={setDragging}
        handlePickFile={handlePickFile}
        reset={reset}
        data-testid="EmptyOrErrorBody__de9647" />
    );
  }
  if (view === 'selected' && file) {
    return (
      <SelectedFileBody
        file={file}
        localLineCount={localLineCount}
        ui={ui}
        inputRef={inputRef}
        dragging={dragging}
        setDragging={setDragging}
        handlePickFile={handlePickFile}
        data-testid="SelectedFileBody__de9647" />
    );
  }
  if (view === 'analyzing') {
    return (
      <ProcessingBody
        active
        titleKey="financeAccountStatementsImportProcessingTitle"
        subtitleKey="financeAccountStatementsImportAnalyzing"
        ui={ui}
        data-testid="ProcessingBody__de9647" />
    );
  }
  if (view === 'preview' && previewData) {
    return (
      <PreviewBody
        previewData={previewData}
        accountCurrency={accountCurrency}
        bcpLocale={bcpLocale}
        ui={ui}
        data-testid="PreviewBody__de9647" />
    );
  }
  if (view === 'importing') {
    return (
      <ProcessingBody
        active
        titleKey="financeAccountStatementsImportImportingTitle"
        subtitleKey="financeAccountStatementsImportImporting"
        ui={ui}
        data-testid="ProcessingBody__de9647" />
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer per view
// ─────────────────────────────────────────────────────────────────────────────

function PreviewFooterButton({ ui, importing, previewData, handleConfirmImport }) {
  return (
    <button
      type="button"
      onClick={handleConfirmImport}
      disabled={importing}
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#121217] px-4 text-sm font-medium text-white transition-colors hover:bg-[#2A2A30] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Check className="h-5 w-5" data-testid="Check__de9647" />
      {ui('financeAccountStatementsImportConfirm', {
        count: previewData?.lineCount ?? 0,
      })}
    </button>
  );
}

function DefaultFooterButtons({ ui, view, previewing, handleContinue }) {
  const disabled = view !== 'selected' || previewing;
  return (
    <button
      type="button"
      onClick={handleContinue}
      disabled={disabled}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-white transition-colors',
        disabled ? 'cursor-not-allowed bg-[#D1D4DB]' : 'bg-[#121217] hover:bg-[#2A2A30]',
      )}
    >
      <ArrowRight className="h-5 w-5" data-testid="ArrowRight__de9647" />
      {ui('financeAccountStatementsImportContinue')}
    </button>
  );
}

function ModalFooter({
  view, ui, importing, previewing, previewData,
  setView, handleConfirmImport, handleContinue,
}) {
  let rightButtons;
  if (view === 'preview') {
    rightButtons = (
      <PreviewFooterButton
        ui={ui}
        importing={importing}
        previewData={previewData}
        handleConfirmImport={handleConfirmImport}
        data-testid="PreviewFooterButton__de9647" />
    );
  } else {
    rightButtons = (
      <DefaultFooterButtons
        ui={ui}
        view={view}
        previewing={previewing}
        handleContinue={handleContinue}
        data-testid="DefaultFooterButtons__de9647" />
    );
  }

  return (
    <div className="flex items-center justify-between px-6 py-4">
      {view === 'preview' ? (
        <button
          type="button"
          onClick={() => setView('selected')}
          className="inline-flex h-10 items-center justify-center rounded-full border border-[#D1D4DB] bg-white px-4 text-sm font-medium text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9]"
        >
          {ui('financeAccountStatementsImportChangeFile')}
        </button>
      ) : <span />}
      <div className="ml-auto flex items-center gap-2">
        {rightButtons}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main modal — orchestrates Upload → Preview → Done
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multi-step "Importar extracto bancario" dialog. Flow:
 *   1. User picks a file → POST ?action=preview (parses in-memory, returns
 *      lines + totals + detected format).
 *   2. Show the preview (KPIs + lines table); user confirms.
 *   3. POST ?action=import which actually persists the statement.
 *
 * Props:
 *   open, accountId, accountCurrency, onClose, onSuccess
 */
export function ImportStatementModal({
  open,
  accountId,
  accountCurrency = 'EUR',
  onClose,
  onSuccess,
}) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const inputRef = useRef(null);

  const { previewStatement, previewing } = useStatementPreview();
  const { importStatement, importing } = useStatementImport();

  // view: empty | analyzing | selected | preview | importing | error
  const [view, setView] = useState('empty');
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [localLineCount, setLocalLineCount] = useState(0);

  const reset = () => {
    setFile(null);
    setPreviewData(null);
    setLocalLineCount(0);
    setView('empty');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const stepIndex = VIEW_TO_STEP[view] ?? 0;

  // Step 1: just register the file (no backend yet). Line count is read locally
  // for the "N líneas" hint; the authoritative parse runs on Continue (step 2).
  const handlePickFile = async (selected) => {
    if (!selected) return;
    setFile(selected);
    setPreviewData(null);
    setLocalLineCount(await countFileLines(selected));
    setView('selected');
  };

  // Step 2: parse the statement while the progress ring is shown (real parse
  // time only — no artificial delay).
  const handleContinue = async () => {
    if (!file) return;
    setView('analyzing');
    try {
      const contentBase64 = await fileToBase64(file);
      const data = await previewStatement({ accountId, fileName: file.name, contentBase64 });
      setPreviewData(data);
      setView('preview');
    } catch {
      setView('error');
    }
  };

  const handleConfirmImport = async () => {
    if (!file || !previewData) return;
    setView('importing');
    try {
      const contentBase64 = await fileToBase64(file);
      const res = await importStatement({ accountId, fileName: file.name, contentBase64 });
      const name = file.name.replace(/\.[^./\\]+$/, '');
      const count = res?.lineCount ?? previewData?.lineCount ?? 0;
      onSuccess?.();
      toast.success(ui('financeAccountStatementsImportSuccessToast', { name, count }));
      handleClose();
    } catch {
      setView('error');
      toast.error(ui('financeAccountStatementsImportError'));
    }
  };

  const wide = view === 'preview';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) handleClose(); }}
      data-testid="Dialog__de9647">
      <DialogContent
        className={cn(
          'imp-modal-enter overflow-hidden p-0',
          wide ? 'max-w-[720px]' : 'max-w-[600px]',
        )}
        style={{ background: 'var(--surface-overlay, #FFFFFF)' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        data-testid="DialogContent__de9647">
        <style>{ANIMATIONS_CSS}</style>

        {/* Header */}
        <div className="flex items-start gap-4 px-6 pt-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold leading-6 text-[#121217]">
              {ui('financeAccountStatementsImportTitle')}
            </h2>
            <p className="mt-1 text-[13px] leading-[19px] text-[#6C6C89]">
              {ui(VIEW_TO_SUBTITLE_KEY[view] ?? VIEW_TO_SUBTITLE_KEY.empty)}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <Stepper step={stepIndex} ui={ui} data-testid="Stepper__de9647" />

        {/* Body */}
        <div className="px-6 py-4">
          <ModalBody
            view={view}
            file={file}
            previewData={previewData}
            previewing={previewing}
            localLineCount={localLineCount}
            accountCurrency={accountCurrency}
            bcpLocale={bcpLocale}
            ui={ui}
            inputRef={inputRef}
            dragging={dragging}
            setDragging={setDragging}
            handlePickFile={handlePickFile}
            reset={reset}
            data-testid="ModalBody__de9647" />
        </div>

        {/* Footer — hidden while the statement is being processed */}
        {view !== 'analyzing' && view !== 'importing' ? (
          <ModalFooter
            view={view}
            ui={ui}
            importing={importing}
            previewing={previewing}
            previewData={previewData}
            setView={setView}
            handleConfirmImport={handleConfirmImport}
            handleContinue={handleContinue}
            data-testid="ModalFooter__de9647" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
