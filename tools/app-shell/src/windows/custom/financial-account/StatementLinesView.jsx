import { ArrowLeft } from 'lucide-react';
import { useUI } from '@/i18n';
import { useBankStatementLines } from '@/hooks/useBankStatementLines';
import { StatementLinesTable } from './StatementLinesTable';

/**
 * Sub-view showing the lines of a single bank statement.
 * The ← button calls onBack() to return to the statements list.
 *
 * @param {{
 *   statementId: string;
 *   statementName: string;
 *   currency?: string;
 *   onBack: () => void;
 * }} props
 */
export function StatementLinesView({ statementId, statementName, currency, onBack }) {
  const ui = useUI();
  const { lines, loading } = useBankStatementLines(statementId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-[52px] items-center gap-3 border-b border-[#E8EAEF] px-4">
        <button
          type="button"
          aria-label={ui('financeAccountDetailBack')}
          data-testid="statement-lines-back"
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#D1D4DB] bg-white text-[#6c6c89] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9] hover:text-[#121217]"
        >
          <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__4e62e5" />
        </button>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#121217]">
            {statementName || ui('financeAccountStatementLinesTitle')}
          </span>
          <span className="text-xs text-[#6c6c89]">
            {ui('financeAccountStatementLinesSubtitle', { count: lines.length })}
          </span>
        </div>
      </div>
      {/* Lines table */}
      <div className="flex-1 overflow-auto">
        <StatementLinesTable
          lines={lines}
          loading={loading}
          currency={currency}
          data-testid="StatementLinesTable__4e62e5" />
      </div>
    </div>
  );
}
