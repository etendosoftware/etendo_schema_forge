import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DocChip,
  RelatedDocumentsShell,
  fetchById,
  fetchChild,
} from '@/components/related-documents';
import { useUI } from '@/i18n';

const ASSET_ICON = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7l9-4 9 4M3 7v10l9 4 9-4V7M3 7l9 4 9-4M12 11v10" />
  </svg>
);

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const ui = useUI();

  useEffect(() => {
    if (!recordId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    fetchChild('amortization', 'lines', recordId, token, apiBaseUrl)
      .then((lines) => {
        const ids = [];
        const seen = new Set();
        for (const line of lines || []) {
          const id = line.asset;
          if (id && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        if (ids.length === 0) {
          setAssets([]);
          setLoading(false);
          return;
        }
        return Promise.all(
          ids.map((id) => fetchById('assets', 'assets', id, token, apiBaseUrl)),
        ).then((results) => {
          setAssets(results.filter(Boolean));
          setLoading(false);
        });
      })
      .catch(() => setLoading(false));
  }, [recordId, token, apiBaseUrl, refreshKey]);

  return (
    <RelatedDocumentsShell loading={loading} onRefresh={() => setRefreshKey((k) => k + 1)}>
      {assets.length === 0 && !loading ? (
        <div className="text-sm text-muted-foreground px-2 py-3">{ui('noLinkedAssets')}</div>
      ) : (
        assets.map((asset) => (
          <DocChip
            key={asset.id}
            icon={ASSET_ICON}
            iconColor="text-primary-foreground"
            title={asset['name'] || asset['searchKey'] || asset.id}
            statusLabel={asset['assetCategory$_identifier']}
            onClick={() => navigate(`/assets/${asset.id}`)}
          />
        ))
      )}
    </RelatedDocumentsShell>
  );
}
