import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useUI, useMenuLabel } from '@/i18n';
import LocaleSwitcher from '@/components/LocaleSwitcher.jsx';
import { UserAvatarButton, UserContextSwitcher } from '@/components/UserContextSwitcher.jsx';
import {
  ScanLine,
  Upload,
  FileCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Activity,
  Search,
  Mic,
  MoreVertical,
  Sparkles,
  Bell,
  Plus
} from 'lucide-react';

const STATUS_VARIANT = {
  Matched: 'default',
  Review: 'secondary',
  Exception: 'destructive',
};

// -- Component -----------------------------------------------------------------

export default function SmartScanPage() {
  const [showUserContext, setShowUserContext] = useState(false);
  const ui = useUI();
  const tMenu = useMenuLabel();

  const KPIS = React.useMemo(() => ([
    { label: ui('smartScanDocumentsScanned'), value: '1,284', icon: FileCheck, trend: '+12%' },
    { label: ui('smartScanPendingReview'), value: '23', icon: Clock, trend: '-3' },
    { label: ui('smartScanAutoMatched'), value: '94%', icon: CheckCircle2, trend: '+2%' },
    { label: ui('smartScanExceptions'), value: '7', icon: AlertTriangle, trend: '-1' },
  ]), [ui]);

  const RECENT_SCANS = React.useMemo(() => ([
    { id: 1, name: 'INV-2026-0891.pdf', type: ui('smartScanInvoiceType'), status: ui('smartScanMatchedStatus'), statusKey: 'Matched', date: '2026-03-09', confidence: '98%' },
    { id: 2, name: 'PO-2026-0445.pdf', type: ui('smartScanPurchaseOrderType'), status: ui('smartScanMatchedStatus'), statusKey: 'Matched', date: '2026-03-09', confidence: '96%' },
    { id: 3, name: 'REC-2026-0112.jpg', type: ui('smartScanReceiptType'), status: ui('smartScanReviewStatus'), statusKey: 'Review', date: '2026-03-08', confidence: '72%' },
    { id: 4, name: 'INV-2026-0890.pdf', type: ui('smartScanInvoiceType'), status: ui('smartScanMatchedStatus'), statusKey: 'Matched', date: '2026-03-08', confidence: '99%' },
    { id: 5, name: 'STMT-2026-03.pdf', type: ui('smartScanStatementType'), status: ui('smartScanExceptionStatus'), statusKey: 'Exception', date: '2026-03-07', confidence: '45%' },
    { id: 6, name: 'INV-2026-0889.pdf', type: ui('smartScanInvoiceType'), status: ui('smartScanMatchedStatus'), statusKey: 'Matched', date: '2026-03-07', confidence: '97%' },
  ]), [ui]);

  const ACTIVITY_FEED = React.useMemo(() => ([
    { id: 1, label: ui('smartScanActivity1'), time: ui('smartScanTime2Min') },
    { id: 2, label: ui('smartScanActivity2'), time: ui('smartScanTime15Min') },
    { id: 3, label: ui('smartScanActivity3'), time: ui('smartScanTime1Hr') },
    { id: 4, label: ui('smartScanActivity4'), time: ui('smartScanTime3Hr') },
    { id: 5, label: ui('smartScanActivity5'), time: ui('smartScanTime5Hr') },
  ]), [ui]);

  const translatedActivityTitle = ui('smartScanActivity');
  const translatedBrowseFiles = ui('smartScanBrowseFiles');
  const translatedUploadHint = ui('smartScanUploadHint');
  const translatedUploadTitle = ui('smartScanUploadTitle');
  const translatedRecentScans = ui('smartScanRecentScans');
  const translatedDocument = ui('smartScanDocument');
  const translatedType = ui('smartScanType');
  const translatedStatus = ui('smartScanStatus');
  const translatedDate = ui('smartScanDate');
  const translatedConfidence = ui('smartScanConfidence');
  const translatedTitle = tMenu('Smart Scan');

  return (
    <div className="h-full flex flex-col" data-testid="smartscan-page">
      {/* Top bar area (gray background, inherited from parent) */}
      <div className="px-6 pt-3 pb-3 shrink-0">
        {/* Row 1: Title + Global search + action icons */}
        <div className="flex items-center gap-4">
          {/* Left: title */}
          <div className="shrink-0 flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{translatedTitle}</h1>
            <button className="text-muted-foreground hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>

          {/* Center: global search */}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={ui('searchPlaceholder')}
                readOnly
                tabIndex={-1}
                className="w-full h-9 rounded-lg border border-border/50 bg-white/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors cursor-default"
              />
              <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            </div>
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-1 shrink-0">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <LocaleSwitcher />
            <UserAvatarButton isOpen={showUserContext} onClick={() => setShowUserContext(v => !v)} />
            {showUserContext && <UserContextSwitcher onClose={() => setShowUserContext(false)} />}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-muted/10 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{ui('smartScanSubtitle')}</p>
            </div>
            <Button>
              <ScanLine className="h-4 w-4 mr-2" />
              {ui('newScan')}
            </Button>
          </div>

          {/* Upload area */}
          <Card>
            <CardContent className="p-8">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 text-center space-y-3">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">{translatedUploadTitle}</p>
                <p className="text-xs text-muted-foreground">{translatedUploadHint}</p>
                <Button variant="outline" size="sm">
                  {translatedBrowseFiles}
                </Button>
              </div>
            </CardContent>
          </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="rounded-md bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.trend}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two-column layout: Recent Scans (2/3) + Activity Feed (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Scans Table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                {translatedRecentScans}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">{translatedDocument}</th>
                      <th className="pb-2 font-medium">{translatedType}</th>
                      <th className="pb-2 font-medium">{translatedStatus}</th>
                      <th className="pb-2 font-medium">{translatedDate}</th>
                      <th className="pb-2 font-medium text-right">{translatedConfidence}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RECENT_SCANS.map((scan) => (
                      <tr key={scan.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{scan.name}</td>
                        <td className="py-2">{scan.type}</td>
                        <td className="py-2">
                          <Badge variant={STATUS_VARIANT[scan.statusKey] || 'outline'}>
                            {scan.status}
                          </Badge>
                        </td>
                        <td className="py-2">{scan.date}</td>
                        <td className="py-2 text-right">{scan.confidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 text-muted-foreground" />
                {translatedActivityTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ACTIVITY_FEED.map((entry, idx) => (
                <div key={entry.id}>
                  {idx > 0 && <Separator className="mb-3" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{entry.label}</p>
                    <span className="text-xs text-muted-foreground">{entry.time}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
