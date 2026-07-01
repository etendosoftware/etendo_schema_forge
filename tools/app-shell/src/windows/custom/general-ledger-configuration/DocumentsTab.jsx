import { useUI } from '@/i18n';
import { AccountBadge } from '@/components/contract-ui';
import { StatusTag } from '@/components/ui/status-tag';
import { DOCUMENTS_SEED, accountById } from './mockCatalogs.js';

/**
 * Documentos tab — READ-ONLY table: Tipo de documento / account badge (or plain
 * journal label) / green "Mapeado" status chip. No edit controls (figma-spec.md
 * Tab 4). The tab pill carries the row count badge.
 */
export default function DocumentsTab({ documents = DOCUMENTS_SEED, documentsBacked = false, documentsNote = '' }) {
  const ui = useUI();

  return (
    <div className="px-1 py-6">
      {!documentsBacked && (
        <div className="mb-4 rounded-xl border border-dashed border-[#E8D6A8] bg-[#FFFCF5] px-4 py-3 text-sm text-[#7A7E8A]" data-testid="glc-documents-unbacked-note">
          {documentsNote || ui('glc.documents.unbackedNote')}
        </div>
      )}
      <div className="rounded-xl border border-[#E8EAEF] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8F9FB] text-left text-xs font-medium text-[#9A9DA8]">
              <th className="px-4 py-2.5">{ui('glc.col.documentType')}</th>
              <th className="px-4 py-2.5">{ui('glc.col.account')}</th>
              <th className="px-4 py-2.5">{ui('glc.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((row) => {
              const acct = row.accountId ? accountById(row.accountId) : null;
              const accountCode = row.accountCode ?? acct?.code ?? null;
              const accountName = row.accountName ?? acct?.name ?? null;
              return (
                <tr
                  key={row.id}
                  className="border-t border-[#F0F1F3]"
                  data-testid={`glc-doc-${row.id}`}
                >
                  <td className="px-4 py-3 font-medium text-[#121217]">{ui(row.typeKey)}</td>
                  <td className="px-4 py-3">
                    {(accountCode || accountName) ? (
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <AccountBadge code={accountCode} data-testid="AccountBadge__b64449" />
                        <span className="truncate text-[#121217]">{accountName ?? '—'}</span>
                      </span>
                    ) : (
                      <span className="text-[#5A5E6B]">{ui(row.journalKey)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusTag
                      tone="success"
                      label={ui('glc.status.mapped')}
                      data-testid="StatusTag__b64449" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
