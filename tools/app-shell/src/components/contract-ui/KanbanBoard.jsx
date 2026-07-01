import React, { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Star, GripVertical } from 'lucide-react';

/**
 * Color accent map for column headers.
 * Maps color name strings to Tailwind border/bg classes.
 */
const COLOR_MAP = {
  blue: 'border-t-blue-500 bg-blue-500/10',
  green: 'border-t-emerald-500 bg-emerald-500/10',
  red: 'border-t-red-500 bg-red-500/10',
  yellow: 'border-t-amber-500 bg-amber-500/10',
  purple: 'border-t-purple-500 bg-purple-500/10',
  orange: 'border-t-orange-500 bg-orange-500/10',
  pink: 'border-t-pink-500 bg-pink-500/10',
  gray: 'border-t-gray-400 bg-gray-500/10',
};

const COLOR_DOT_MAP = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  gray: 'bg-gray-400',
};

/**
 * Format a numeric value as currency.
 */
function formatCurrency(value) {
  if (value == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Render priority as star icons (1-3).
 */
function PriorityStars({ priority }) {
  if (!priority || priority < 1) return null;
  const count = Math.min(Math.max(Math.round(priority), 1), 3);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Priority ${count} of 3`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < count ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
          )}
          data-testid="Star__22de88" />
      ))}
    </div>
  );
}

/**
 * Avatar circle showing the first letter of the name.
 */
function AvatarCircle({ name }) {
  if (!name) return null;
  const initial = String(name).charAt(0).toUpperCase();
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      aria-label={name}
    >
      {initial}
    </div>
  );
}

/**
 * Default card renderer used when no custom renderCard prop is provided.
 */
function DefaultCard({ card }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{card.title}</p>
          {card.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{card.subtitle}</p>
          )}
        </div>
        {card.avatar && <AvatarCircle name={card.avatar} data-testid="AvatarCircle__22de88" />}
      </div>
      {card.badges && card.badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.badges.map((badge) => (
            <Badge
              key={typeof badge === 'string' ? badge : badge.label}
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
              data-testid="Badge__22de88">
              {typeof badge === 'string' ? badge : badge.label}
            </Badge>
          ))}
        </div>
      )}
      {(card.value != null || card.priority) && (
        <div className="flex items-center justify-between gap-2 pt-1">
          {card.value != null && (
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatCurrency(card.value)}
            </span>
          )}
          {card.priority && <PriorityStars priority={card.priority} data-testid="PriorityStars__22de88" />}
        </div>
      )}
    </div>
  );
}

/**
 * Individual draggable card wrapper.
 */
function KanbanCard({ card, onCardClick, renderCard, isDragging }) {
  const handleDragStart = useCallback(
    (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ cardId: card.id, fromColumnId: card.columnId }));
      e.dataTransfer.effectAllowed = 'move';
    },
    [card.id, card.columnId]
  );

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      onClick={() => onCardClick?.(card)}
      className={cn(
        'cursor-grab active:cursor-grabbing transition-all duration-150 hover:shadow-md border',
        isDragging && 'opacity-50 scale-95'
      )}
      role="listitem"
      aria-label={card.title}
      data-testid="Card__22de88">
      <CardContent className="p-3" data-testid="CardContent__22de88">
        {renderCard ? renderCard(card) : <DefaultCard card={card} data-testid="DefaultCard__22de88" />}
      </CardContent>
    </Card>
  );
}

/**
 * Single Kanban column acting as a drop zone.
 */
function KanbanColumn({ column, cards, onDragEnd, onCardClick, renderCard, emptyMessage, dragOverColumnId, setDragOverColumnId }) {
  const isOver = dragOverColumnId === column.id;
  const colorClasses = column.color ? COLOR_MAP[column.color] : '';
  const dotColor = column.color ? COLOR_DOT_MAP[column.color] : 'bg-gray-400';

  const handleDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverColumnId(column.id);
    },
    [column.id, setDragOverColumnId]
  );

  const handleDragLeave = useCallback(
    (e) => {
      // Only clear if leaving the column container itself
      if (!e.currentTarget.contains(e.relatedTarget)) {
        setDragOverColumnId(null);
      }
    },
    [setDragOverColumnId]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOverColumnId(null);
      try {
        const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (payload.cardId && payload.fromColumnId !== column.id) {
          onDragEnd?.(payload.cardId, payload.fromColumnId, column.id);
        }
      } catch {
        // Ignore malformed drag data
      }
    },
    [column.id, onDragEnd, setDragOverColumnId]
  );

  return (
    <div
      className={cn(
        'flex flex-col min-w-[280px] max-w-[320px] w-[280px] shrink-0 rounded-lg border border-t-4 transition-colors duration-150',
        colorClasses || 'border-t-gray-300 bg-muted/30',
        isOver && 'ring-2 ring-primary/40 bg-primary/5'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="list"
      aria-label={`${column.title} column`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={cn('h-2.5 w-2.5 rounded-full', dotColor)} />
          <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
        </div>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
          {cards.length}
        </span>
      </div>
      <Separator data-testid="Separator__22de88" />
      {/* Scrollable card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-220px)]">
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground italic">
            {emptyMessage || 'No items'}
          </div>
        ) : (
          cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onCardClick={onCardClick}
              renderCard={renderCard}
              data-testid="KanbanCard__22de88" />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Reusable Kanban board component with HTML5 drag and drop.
 *
 * Designed for CRM pipelines, project task boards, sales quotation tracking,
 * and any workflow that benefits from column-based card organization.
 *
 * @param {Object} props
 * @param {Array<{id: string, title: string, color?: string}>} props.columns - Column definitions
 * @param {Array<{id: string, columnId: string, title: string, subtitle?: string, badges?: Array, avatar?: string, value?: number, priority?: number}>} props.cards - Card data
 * @param {function} props.onDragEnd - Callback: (cardId, fromColumnId, toColumnId) => void
 * @param {function} props.onCardClick - Callback: (card) => void
 * @param {function} props.renderCard - Optional custom card renderer: (card) => JSX
 * @param {string} props.emptyMessage - Message for empty columns
 */
export function KanbanBoard({
  columns = [],
  cards = [],
  onDragEnd,
  onCardClick,
  renderCard,
  emptyMessage,
}) {
  const [dragOverColumnId, setDragOverColumnId] = useState(null);

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-4 px-1 -mx-1"
      role="region"
      aria-label="Kanban board"
    >
      {columns.map((column) => {
        const columnCards = cards.filter((c) => c.columnId === column.id);
        return (
          <KanbanColumn
            key={column.id}
            column={column}
            cards={columnCards}
            onDragEnd={onDragEnd}
            onCardClick={onCardClick}
            renderCard={renderCard}
            emptyMessage={emptyMessage}
            dragOverColumnId={dragOverColumnId}
            setDragOverColumnId={setDragOverColumnId}
            data-testid="KanbanColumn__22de88" />
        );
      })}
    </div>
  );
}
