import React, { useState, useMemo } from 'react';
import { useUI } from '@/i18n';
import { KPIHeader } from '@/components/contract-ui/KPIHeader';
import { KanbanBoard } from '@/components/contract-ui/KanbanBoard';
import { Chatter } from '@/components/contract-ui/Chatter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Users, Mail, Phone, MapPin, X } from 'lucide-react';

import { kpisConfig, sections } from '@generated/contacts/generated/config';
import * as mockData from '@generated/contacts/generated/mockData';

// -- Icon map (string name -> component) --------------------------------------

const ICON_MAP = { Users };

// -- Derived data from aggregate contract -------------------------------------

// kpisConfig is empty for contacts; KPIs live in sections.kpis.kpis
const kpisDef = (kpisConfig.length > 0 ? kpisConfig : sections.kpis?.kpis) || [];

const KPIS = kpisDef.map((k) => ({
  ...k,
  value: mockData.kpis[k.key],
  trend: mockData.kpis.trends?.[k.key],
  icon: ICON_MAP[k.icon],
}));

const COLUMNS = sections.directory.columns;
const ALL_CONTACTS = mockData.directory;
const CHATTER_MESSAGES = mockData.notes;
const CATEGORY_LABEL = Object.fromEntries(COLUMNS.map((c) => [c.id, c.title]));

// Build email/phone maps by matching directory entries to contactList rows by name
const contactByName = Object.fromEntries(mockData.contactList.map((c) => [c.name, c]));
const MOCK_EMAILS = Object.fromEntries(
  mockData.directory.map((d) => [d.id, contactByName[d.title]?.email || ''])
);
const MOCK_PHONES = Object.fromEntries(
  mockData.directory.map((d) => [d.id, contactByName[d.title]?.phone || ''])
);

function formatCurrency(value) {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function DetailPanel({ contact, onClose }) {
  const ui = useUI();
  if (!contact) return null;

  const tags = [CATEGORY_LABEL[contact.columnId]];
  if (contact.badges) {
    tags.push(...contact.badges);
  }

  return (
    <div className="w-[380px] shrink-0 border-l bg-background overflow-y-auto">
      <div className="p-4">
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={ui("closeDetailPanel")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Avatar and name */}
        <div className="flex flex-col items-center text-center mb-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold mb-3">
            {contact.avatar}
          </div>
          <h2 className="text-lg font-semibold">{contact.title}</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-3.5 w-3.5" />
            {contact.subtitle}
          </p>
        </div>

        <Separator className="my-4" />

        {/* Contact info */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{MOCK_EMAILS[contact.id] || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{MOCK_PHONES[contact.id] || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{contact.subtitle}</span>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Activity summary */}
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-medium">{ui("activitySummary")}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{ui("lastSale")}</span>
              {/* i18n-allowlist: ["Mar 2, 2026"] */}
              <span className="font-medium">Mar 2, 2026</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{ui("totalInvoiced12m")}</span>
              <span className="font-medium">{contact.value ? formatCurrency(contact.value) : '-'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{ui("pendingBalanceLabel")}</span>
              <span className="font-medium">{contact.value ? formatCurrency(Math.round(contact.value * 0.12)) : '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>

        {/* Chatter */}
        <Chatter
          entityType="contact"
          entityId={contact.id}
          messages={CHATTER_MESSAGES}
          collapsed={false}
        />
      </div>
    </div>
  );
}

function ListView({ contacts, onRowClick }) {
  const ui = useUI();
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">{ui("name")}</th>
            <th className="text-left p-3 font-medium">{ui("category")}</th>
            <th className="text-left p-3 font-medium">{ui("location")}</th>
            <th className="text-left p-3 font-medium">{ui("email")}</th>
            <th className="text-right p-3 font-medium">{ui("totalInvoicedHeader")}</th>
            <th className="text-right p-3 font-medium">{ui("pendingBalanceHeader")}</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr
              key={c.id}
              className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => onRowClick(c)}
            >
              <td className="p-3 font-medium">{c.title}</td>
              <td className="p-3">
                <Badge variant="outline" className="text-xs">
                  {CATEGORY_LABEL[c.columnId]}
                </Badge>
              </td>
              <td className="p-3 text-muted-foreground">{c.subtitle}</td>
              <td className="p-3 text-muted-foreground">{MOCK_EMAILS[c.id] || '-'}</td>
              <td className="p-3 text-right tabular-nums">{c.value ? formatCurrency(c.value) : '-'}</td>
              <td className="p-3 text-right tabular-nums">{c.value ? formatCurrency(Math.round(c.value * 0.12)) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ContactsPage() {
  const ui = useUI();
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState('kanban');
  const [selectedContact, setSelectedContact] = useState(null);
  const [cards, setCards] = useState(ALL_CONTACTS);

  const filteredCards = useMemo(() => {
    if (!search.trim()) return cards;
    const q = search.toLowerCase();
    return cards.filter(
      (c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );
  }, [cards, search]);

  function handleDragEnd(cardId, fromColumnId, toColumnId) {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, columnId: toColumnId } : c))
    );
  }

  function handleCardClick(card) {
    setSelectedContact(card);
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 p-6 overflow-y-auto">
        {/* KPIs */}
        <KPIHeader kpis={KPIS} />

        {/* Tab switcher */}
        <div className="flex gap-1 mb-4">
          <Button
            variant={activeView === 'kanban' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('kanban')}
          >
            {ui('viewKanban')}
          </Button>
          <Button
            variant={activeView === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('list')}
          >
            {ui('viewList')}
          </Button>
        </div>

        {/* Content */}
        {activeView === 'kanban' ? (
          <KanbanBoard
            columns={COLUMNS}
            cards={filteredCards}
            onDragEnd={handleDragEnd}
            onCardClick={handleCardClick}
          />
        ) : (
          <ListView contacts={filteredCards} onRowClick={handleCardClick} />
        )}
      </div>

      {/* Detail side panel */}
      {selectedContact && (
        <DetailPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
        />
      )}
    </div>
  );
}
