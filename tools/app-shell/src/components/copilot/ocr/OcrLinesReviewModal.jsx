import { useState } from 'react';
import { X } from 'lucide-react';
import { useUI } from '@/i18n';
import KindRenderer from './kinds/KindRenderer.jsx';

/* eslint-disable react/prop-types */

function normaliseRow(line, columns) {
  const base = {};
  for (const column of columns) {
    base[column.extractFrom] = line?.[column.extractFrom] ?? '';
  }
  base.tax_id = line?.tax_id ?? null;
  base.tax_rate = line?.tax_rate ?? null;
  return base;
}

export default function OcrLinesReviewModal({ columns = [], lines = [], apiBaseUrl, onSubmit, onCancel }) {
  const ui = useUI();
  const [rows, setRows] = useState(() => lines.map((line) => ({
    ...normaliseRow(line, columns),
    _rowId: crypto.randomUUID(),
  })));

  const update = (idx, patch) => {
    setRows((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, ...patch } : row)));
  };

  const handleSubmit = () => {
    onSubmit(rows.map((row) => ({ ...row })));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{ui('ocrLinesReviewTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ui('ocrLinesReviewSubtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={ui('ocrReviewCancel')}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            <X size={18} data-testid="X__cdff87" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-3">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-control px-4 py-8 text-center text-sm text-muted-foreground">
              {ui('ocrLinesEmpty')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  {columns.map((column) => (
                    <th key={column.key} className={`px-2 py-2 text-left font-medium ${column.width || ''}`}>
                      {ui(column.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row._rowId} className="border-t border-border-subtle align-middle">
                    {columns.map((column) => (
                      <td key={column.key} className="px-2 py-2">
                        <KindRenderer
                          mode="cell"
                          kind={column.kind}
                          column={column}
                          value={column.kind === 'entity' && row.tax_id
                            ? { id: row.tax_id, label: row[column.extractFrom] }
                            : row[column.extractFrom]}
                          apiBaseUrl={apiBaseUrl}
                          onChange={(value) => update(idx, column.kind === 'entity'
                            ? { tax_id: value?.id || null, [column.extractFrom]: value?.label || row[column.extractFrom] }
                            : { [column.extractFrom]: value })}
                          data-testid="KindRenderer__cdff87" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border-control bg-card px-5 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {ui('ocrReviewCancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-foreground"
          >
            {ui('ocrReviewSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
}
