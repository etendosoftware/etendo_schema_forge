import React, { useState, useCallback } from 'react';
import { useUI } from '@/i18n';
import { useNavigate } from 'react-router-dom';
import { KPIHeader, KanbanBoard, DataTable } from '@/components/contract-ui';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Target, DollarSign, Trophy, TrendingUp, Users, Activity, ArrowUp, ArrowDown } from 'lucide-react';

import { sections } from '@generated/crm/generated/config';
import * as mockData from '@generated/crm/generated/mockData';

// -- Icon resolution (config stores string names) -----------------------------

const ICON_MAP = { Target, DollarSign, Trophy, TrendingUp, Users, Activity };

// -- Derived data from contract -----------------------------------------------

const KPIS = sections.kpis.kpis.map((k) => ({
  ...k,
  value: mockData.kpis[k.key],
  trend: mockData.kpis.trends?.[k.key],
  icon: ICON_MAP[k.icon],
}));

const COLUMNS = sections.dealPipeline.columns;
const INITIAL_CARDS = mockData.dealPipeline;

const TABLE_COLUMNS = sections.recentActivities.columns;
const TABLE_FILTERS = sections.recentActivities.filters;
const TABLE_DATA = mockData.recentActivities;

const TEAM_FEED = mockData.teamFeed;

const STATUS_VARIANT = {
  Completed: 'default',
  Pending: 'secondary',
  Scheduled: 'outline',
  'In Progress': 'default',
  Overdue: 'destructive',
};

// -- Component -----------------------------------------------------------------

export default function CrmPage() {
  const navigate = useNavigate();
  const ui = useUI();
  const [cards, setCards] = useState(INITIAL_CARDS);

  const handleDragEnd = useCallback((cardId, _fromColumnId, toColumnId) => {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, columnId: toColumnId } : c))
    );
  }, []);

  const handleCardClick = useCallback(
    () => {
      navigate('/deal');
    },
    [navigate]
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIHeader kpis={KPIS} />

      {/* Deal Pipeline Kanban */}
      <KanbanBoard
        columns={COLUMNS}
        cards={cards}
        onDragEnd={handleDragEnd}
        onCardClick={handleCardClick}
        emptyMessage="No deals in pipeline"
      />

      {/* Two-column layout: Activities (2/3) + Team Feed (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activities Table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
                {ui('recentActivities')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={TABLE_COLUMNS}
                filters={TABLE_FILTERS}
                data={TABLE_DATA}
              />
            </CardContent>
          </Card>
        </div>

        {/* Team Activity Feed */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-muted-foreground" />
                {ui('teamActivity')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {TEAM_FEED.map((entry, idx) => (
                <div key={entry.id}>
                  {idx > 0 && <Separator className="mb-3" />}
                  <div className="flex items-start gap-3">
                    {entry.direction && (
                      <div className={`mt-0.5 rounded-full p-1 ${
                        entry.direction === 'in'
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        {entry.direction === 'in'
                          ? <ArrowUp className="h-3.5 w-3.5" />
                          : <ArrowDown className="h-3.5 w-3.5" />
                        }
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.label}</p>
                      {entry.detail && (
                        <p className="text-xs text-muted-foreground">{entry.detail}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {entry.time}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
