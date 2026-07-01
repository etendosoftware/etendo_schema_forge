import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KPIHeader, KanbanBoard, DataTable } from '@/components/contract-ui';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Users, Calendar, UserPlus, Clock, Bell, ArrowUp, ArrowDown } from 'lucide-react';
import { useUI } from '@/i18n';

import { sections } from '@generated/hr/generated/config';
import * as mockData from '@generated/hr/generated/mockData';

// -- Icon resolution (config stores string names) -----------------------------

const ICON_MAP = { Users, Calendar, UserPlus, Clock, Bell };

// -- Derived data from contract -----------------------------------------------

const KPIS = sections.kpis.kpis.map((k) => ({
  ...k,
  value: mockData.kpis[k.key],
  trend: mockData.kpis.trends?.[k.key],
  icon: ICON_MAP[k.icon],
}));

const TABLE_COLUMNS = sections.employeeDirectory.columns;
const TABLE_FILTERS = sections.employeeDirectory.filters;
const TABLE_DATA = mockData.employeeDirectory;

const KANBAN_COLUMNS = sections.absenceCalendar.columns;
const INITIAL_CARDS = mockData.absenceCalendar;

const HR_FEED = mockData.hrUpdates;

// -- Component -----------------------------------------------------------------

export default function HrPage() {
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
      navigate('/absence');
    },
    [navigate]
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIHeader kpis={KPIS} data-testid="KPIHeader__7ba56e" />
      {/* Two-column layout: Employee Directory (2/3) + Absences (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee Directory Table */}
        <div className="lg:col-span-2">
          <Card data-testid="Card__7ba56e">
            <CardHeader data-testid="CardHeader__7ba56e">
              <CardTitle className="flex items-center gap-2" data-testid="CardTitle__7ba56e">
                <Users className="h-5 w-5 text-muted-foreground" data-testid="Users__7ba56e" />
                {ui('employeeDirectory')}
              </CardTitle>
            </CardHeader>
            <CardContent data-testid="CardContent__7ba56e">
              <DataTable
                columns={TABLE_COLUMNS}
                filters={TABLE_FILTERS}
                data={TABLE_DATA}
                data-testid="DataTable__7ba56e" />
            </CardContent>
          </Card>
        </div>

        {/* Absence Kanban */}
        <div>
          <KanbanBoard
            columns={KANBAN_COLUMNS}
            cards={cards}
            onDragEnd={handleDragEnd}
            onCardClick={handleCardClick}
            emptyMessage="No absences"
            data-testid="KanbanBoard__7ba56e" />
        </div>
      </div>
      {/* HR Updates Feed */}
      <Card data-testid="Card__7ba56e">
        <CardHeader data-testid="CardHeader__7ba56e">
          <CardTitle
            className="flex items-center gap-2 text-base"
            data-testid="CardTitle__7ba56e">
            <Bell className="h-5 w-5 text-muted-foreground" data-testid="Bell__7ba56e" />
            {ui('hrUpdates')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" data-testid="CardContent__7ba56e">
          {HR_FEED.map((entry, idx) => (
            <div key={entry.id}>
              {idx > 0 && <Separator className="mb-3" data-testid="Separator__7ba56e" />}
              <div className="flex items-start gap-3">
                {entry.direction && (
                  <div className={`mt-0.5 rounded-full p-1 ${
                    entry.direction === 'in'
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-blue-100 text-blue-600'
                  }`}>
                    {entry.direction === 'in'
                      ? <ArrowUp className="h-3.5 w-3.5" data-testid="ArrowUp__7ba56e" />
                      : <ArrowDown className="h-3.5 w-3.5" data-testid="ArrowDown__7ba56e" />
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
  );
}
