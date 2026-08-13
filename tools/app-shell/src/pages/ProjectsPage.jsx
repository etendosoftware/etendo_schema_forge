import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KPIHeader, KanbanBoard, DataTable } from '@/components/contract-ui';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FolderKanban, Clock, PieChart, FileText } from 'lucide-react';
import { useUI } from '@/i18n';

import { sections } from '@generated/projects/generated/config';
import * as mockData from '@generated/projects/generated/mockData';

// -- Icon resolution (config stores string names) -----------------------------

const ICON_MAP = { FolderKanban, Clock, PieChart, FileText };

// -- Derived data from contract -----------------------------------------------

const KPIS = sections.kpis.kpis.map((k) => ({
  ...k,
  value: mockData.kpis[k.key],
  trend: mockData.kpis.trends?.[k.key],
  icon: ICON_MAP[k.icon],
}));

const KANBAN_COLUMNS = sections.projectBoard.columns;
const INITIAL_CARDS = mockData.projectBoard;

const TIME_COLUMNS = sections.recentTimeEntries.columns;
const TIME_FILTERS = sections.recentTimeEntries.filters;
const TIME_DATA = mockData.recentTimeEntries;

const DOC_COLUMNS = sections.recentDocuments.columns;
const DOC_FILTERS = sections.recentDocuments.filters;
const DOC_DATA = mockData.recentDocuments;

// -- Component -----------------------------------------------------------------

export default function ProjectsPage() {
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
      navigate('/project');
    },
    [navigate]
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIHeader kpis={KPIS} data-testid="KPIHeader__84c7bf" />
      {/* Project Board Kanban */}
      <KanbanBoard
        columns={KANBAN_COLUMNS}
        cards={cards}
        onDragEnd={handleDragEnd}
        onCardClick={handleCardClick}
        emptyMessage="No projects"
        data-testid="KanbanBoard__84c7bf" />
      {/* Two-column layout: Time Entries (1/2) + Documents (1/2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Time Entries */}
        <Card data-testid="Card__84c7bf">
          <CardHeader data-testid="CardHeader__84c7bf">
            <CardTitle className="flex items-center gap-2" data-testid="CardTitle__84c7bf">
              <Clock className="h-5 w-5 text-muted-foreground" data-testid="Clock__84c7bf" />
              {ui('recentTimeEntries')}
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="CardContent__84c7bf">
            <DataTable
              columns={TIME_COLUMNS}
              filters={TIME_FILTERS}
              data={TIME_DATA}
              data-testid="DataTable__84c7bf" />
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card data-testid="Card__84c7bf">
          <CardHeader data-testid="CardHeader__84c7bf">
            <CardTitle className="flex items-center gap-2" data-testid="CardTitle__84c7bf">
              <FileText className="h-5 w-5 text-muted-foreground" data-testid="FileText__84c7bf" />
              {ui('recentDocuments')}
            </CardTitle>
          </CardHeader>
          <CardContent data-testid="CardContent__84c7bf">
            <DataTable
              columns={DOC_COLUMNS}
              filters={DOC_FILTERS}
              data={DOC_DATA}
              data-testid="DataTable__84c7bf" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
