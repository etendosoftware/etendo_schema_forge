import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import ConversionRateDownloaderLogTable from './ConversionRateDownloaderLogTable';
import ConversionRateDownloaderLogForm from './ConversionRateDownloaderLogForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Settings / Conversion Rate Downloader Log';


// @sf-generated-start summary:conversionRateDownloaderLog
const summary = [
  { key: 'active', column: 'Isactive', type: 'boolean' },
  { key: 'syncDate', column: 'sync_date', type: 'string' },
  { key: 'pairsUpdated', column: 'pairs_updated', type: 'number' },
  { key: 'pairsFailed', column: 'pairs_failed', type: 'number' },
  { key: 'errorDetail', column: 'error_detail', type: 'string' },
  { key: 'durationms', column: 'duration_ms', type: 'number' },
];

const statusField = 'status';
// @sf-generated-end summary:conversionRateDownloaderLog

// @sf-generated-start extraBadges:conversionRateDownloaderLog
const extraBadges = [

];
// @sf-generated-end extraBadges:conversionRateDownloaderLog

// @sf-generated-start processes:conversionRateDownloaderLog
const processes = [

];
// @sf-generated-end processes:conversionRateDownloaderLog

// @sf-generated-start draftMode:conversionRateDownloaderLog
const draftMode = null;
// @sf-generated-end draftMode:conversionRateDownloaderLog

// @sf-generated-start requiredHeaderFields:conversionRateDownloaderLog
const requiredHeaderFields = ['active'];
// @sf-generated-end requiredHeaderFields:conversionRateDownloaderLog



export const api = {
  "specName": "conversion-rate-downloader-log",
  "baseUrl": "/sws/neo/conversion-rate-downloader-log",
  "crud": {
    "conversionRateDownloaderLog": {
      "get": true,
      "getById": true,
      "post": false,
      "put": false,
      "patch": false,
      "delete": false,
      "listUrl": "/sws/neo/conversion-rate-downloader-log/conversionRateDownloaderLog",
      "detailUrl": "/sws/neo/conversion-rate-downloader-log/conversionRateDownloaderLog/{id}",
      "supportedFilters": [
        "syncDate",
        "status"
      ]
    }
  },
  "selectors": [],
  "actions": [],
  "queryParams": {
    "pagination": {
      "startRow": "_startRow",
      "endRow": "_endRow",
      "default": "0-100"
    },
    "sorting": {
      "param": "_sortBy",
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "settings",
    "readOnly": true
  }
};

// @sf-generated-start component:ConversionRateDownloaderLogPage
export default function ConversionRateDownloaderLogPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('6FEBA130CDE24CC09041FFA6117ADFA9');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="6FEBA130CDE24CC09041FFA6117ADFA9" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="conversionRateDownloaderLog"
        Form={ConversionRateDownloaderLogForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Conversion Rate Downloader Log"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "SMFCR_Sync_Log", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="conversionRateDownloaderLog"
      Table={ConversionRateDownloaderLogTable}
      entityLabel="Conversion Rate Downloader Log"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hideCreate
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:ConversionRateDownloaderLogPage
