import { Fragment, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { categories, type Category, type RoadmapItem } from './prototypeItems';
import { defaultColor } from './itemDraft';
import { showTruncatedText } from './truncatedText';
import type { Destination } from './reorder';

export type BoardMode = 'Compact' | 'Detailed';

const dateLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: '2-digit' });

function CardContents({ item, mode }: { item: RoadmapItem; mode: BoardMode }) {
  return (
    <>
      <span className="board-card-heading">
        <span className="board-card-title" data-truncated-text>{item.content}</span>
        <span>{item.size}</span>
      </span>
      {mode === 'Detailed' && (
        <>
          <span className="board-card-description" data-truncated-text>{item.description}</span>
          {item.start && item.end && (
            <span className="board-card-dates" aria-label="Start to Ready">
              {dateLabel.format(item.start)} → {dateLabel.format(item.end)}
            </span>
          )}
        </>
      )}
    </>
  );
}

function LinkLabel() {
  return (
    <>Link<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M9 3h4v4m0-4L7 9m6 0v4H3V3h4" />
    </svg></>
  );
}

type Slot = { category: Category; index: number };
const slotId = ({ category, index }: Slot) => `slot-${category}-${index}`;

function Card({ item, offset, onEdit, selected, mode }: {
  item: RoadmapItem; offset: number; onEdit: (id: string) => void; selected: boolean; mode: BoardMode;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({ id: item.id, data: { item } });
  return (
    <div ref={setNodeRef} className="board-card" data-mode={mode}
      style={{ borderInlineStartColor: item.color ?? defaultColor, transform: offset ? `translateY(${offset}px)` : undefined }}
      data-item-id={item.id} data-editor-selected={selected || undefined} data-dragging={isDragging || undefined}>
      <button ref={setActivatorNodeRef} type="button" className="board-card-action"
        {...attributes} {...listeners} onClick={() => onEdit(item.id)}>
        <CardContents item={item} mode={mode} />
      </button>
      {mode === 'Detailed' && item.link && (
        <a className="board-card-link" href={item.link} title={item.link} target="_blank" rel="noopener noreferrer">
          <LinkLabel />
        </a>
      )}
    </div>
  );
}

function InsertionSlot({ category, index, disabled, offset }: Slot & { disabled: boolean; offset: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId({ category, index }), data: { category, index }, disabled });
  return (
    <div ref={setNodeRef} className="board-slot" data-over={isOver || undefined} aria-hidden="true">
      {isOver && <div className="board-gap" style={{ top: offset }} />}
    </div>
  );
}

function Column({ category, items, source, target, step, onEdit, selectedItemId, mode }: {
  category: Category;
  items: RoadmapItem[];
  source: RoadmapItem | undefined;
  target: Slot | null;
  step: number;
  mode: BoardMode;
  onEdit: (id: string) => void;
  selectedItemId?: string;
}) {
  const { setNodeRef } = useDroppable({ id: category, data: { category } });
  const sourceIndex = source?.category === category ? source.order : -1;
  const targetIndex = target?.category === category ? target.index : -1;
  const afterSource = (index: number) => sourceIndex >= 0 && index > sourceIndex;
  const cardOffset = (index: number) => step * (
    Number(targetIndex >= 0 && index >= targetIndex) - Number(afterSource(index))
  );
  return (
    <section className="board-column" ref={setNodeRef} aria-label={category}>
      <h2>{category}</h2>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <InsertionSlot category={category} index={index}
            disabled={index === sourceIndex + 1 && sourceIndex >= 0} offset={afterSource(index) ? -step : 0} />
          <Card mode={mode} item={item} onEdit={onEdit} selected={item.id === selectedItemId} offset={item.id === source?.id ? 0 : cardOffset(index)} />
        </Fragment>
      ))}
      <InsertionSlot category={category} index={items.length}
        disabled={items.length === sourceIndex + 1 && sourceIndex >= 0}
        offset={afterSource(items.length) ? -step : 0} />
      {!items.length && <p className="board-empty">Drop an item here</p>}
    </section>
  );
}

function getCollisions(
  { pointerCoordinates, collisionRect, droppableContainers, droppableRects, active }: Parameters<CollisionDetection>[0],
  target: Slot | null,
  step: number,
): ReturnType<CollisionDetection> {
  const point = pointerCoordinates ?? {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  const column = categories.find((category) => {
    const rect = droppableRects.get(category);
    return rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  });
  if (!column) return [];

  const source = active.data.current?.item as RoadmapItem | undefined;
  const sourceIndex = source?.category === column ? source.order : -1;
  const openSlot = pointerCoordinates && target?.category === column ? target : null;
  const openRect = openSlot && droppableRects.get(slotId(openSlot));
  const gapTop = openRect && openSlot
    ? openRect.top - (sourceIndex >= 0 && openSlot.index > sourceIndex ? step : 0)
    : null;
  // Translate the pointer back to the compacted layout. Inside the open gap,
  // keep the same insertion point so the preview does not move itself away.
  const y = gapTop === null ? point.y : point.y - Math.max(0, Math.min(step, point.y - gapTop));

  let nearest: { id: string | number; distance: number } | undefined;
  for (const { id, data } of droppableContainers) {
    if (data.current?.category !== column || typeof data.current.index !== 'number') continue;
    const rect = droppableRects.get(id);
    if (!rect) continue;
    const offset = pointerCoordinates && sourceIndex >= 0 && data.current.index > sourceIndex ? step : 0;
    const distance = Math.abs(y - (rect.top + rect.height / 2 - offset));
    if (!nearest || distance < nearest.distance) nearest = { id, distance };
  }
  return nearest ? [{ id: nearest.id }] : [];
}

const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const { active, over, collisionRect, droppableRects, droppableContainers } = context;
  const item = active?.data.current?.item as RoadmapItem | undefined;
  if (!item || !collisionRect || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return;
  event.preventDefault();

  const current = (over?.data.current as Slot | undefined) ?? { category: item.category, index: item.order };
  const horizontal = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
  const category = horizontal
    ? categories[categories.indexOf(current.category) + (event.code === 'ArrowLeft' ? -1 : 1)]
    : current.category;
  if (!category) return;

  const slots = droppableContainers.getEnabled().flatMap(({ id, data }) => {
    const slot = data.current as Slot | undefined;
    return slot?.category === category && typeof slot.index === 'number' ? [{ id, index: slot.index }] : [];
  }).sort((a, b) => a.index - b.index);
  const next = horizontal
    ? slots.find((slot) => slot.index >= current.index) ?? slots.at(-1)
    : event.code === 'ArrowUp'
      ? [...slots].reverse().find((slot) => slot.index < current.index)
      : slots.find((slot) => slot.index > current.index);
  const rect = next && droppableRects.get(next.id);
  if (!rect) return;
  return {
    x: currentCoordinates.x + rect.left + rect.width / 2 - collisionRect.left - collisionRect.width / 2,
    y: currentCoordinates.y + rect.top + rect.height / 2 - collisionRect.top - collisionRect.height / 2,
  };
};

function destinationFor(item: RoadmapItem, slot: Slot): Destination {
  return {
    category: slot.category,
    index: slot.index - Number(slot.category === item.category && slot.index > item.order),
  };
}

export function Board({ items, onReorder, onEdit, selectedItemId, mode, onModeChange }: {
  items: RoadmapItem[];
  mode: BoardMode;
  onModeChange: (mode: BoardMode) => void;
  onEdit: (id: string) => void;
  selectedItemId?: string;
  onReorder: (id: string, destination: Destination) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; step: number } | null>(null);
  const [target, setTarget] = useState<Slot | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  const dragged = items.find((item) => item.id === drag?.id);

  return (
    <>
      <div role="group" aria-label="Board display">
        {(['Compact', 'Detailed'] as const).map((option) => (
          <button key={option} type="button" aria-pressed={mode === option} onClick={() => onModeChange(option)}>{option}</button>
        ))}
      </div>
      <DndContext sensors={sensors} collisionDetection={(args) => getCollisions(args, target, drag?.step ?? 0)}
      accessibility={{
        screenReaderInstructions: { draggable: 'Press Space to pick up a card. Use up and down to reorder, or left and right to change columns. Press Space to drop or Escape to cancel.' },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${active.data.current?.item.content}.`,
          onDragOver: ({ active, over }) => {
            if (!over?.data.current) return 'Outside a drop target.';
            const target = destinationFor(active.data.current?.item, over.data.current as Slot);
            return `${target.category}, position ${target.index + 1}.`;
          },
          onDragEnd: ({ active, over }) => {
            if (!over?.data.current) return 'Card returned to its position.';
            const target = destinationFor(active.data.current?.item, over.data.current as Slot);
            return `Dropped in ${target.category}, position ${target.index + 1}.`;
          },
          onDragCancel: () => 'Drag cancelled.',
        },
      }}
      onDragStart={({ active }) => {
        const card = board.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(String(active.id))}"]`);
        const slot = card?.previousElementSibling;
        if (!card || !slot) return;
        setDrag({ id: String(active.id), step: card.offsetHeight + slot.clientHeight });
      }}
      onDragOver={({ over }) => setTarget((over?.data.current as Slot | undefined) ?? null)}
      onDragCancel={() => {
        setTarget(null);
        setDrag(null);
      }}
      onDragEnd={({ active, over, activatorEvent }) => {
        setDrag(null);
        setTarget(null);
        const item = active.data.current?.item as RoadmapItem | undefined;
        const slot = over?.data.current as Slot | undefined;
        if (!item || !slot) return;
        onReorder(item.id, destinationFor(item, slot));
        if (activatorEvent.type === 'keydown') {
          requestAnimationFrame(() => board.current
            ?.querySelector<HTMLButtonElement>(`[data-item-id="${CSS.escape(item.id)}"] .board-card-action`)?.focus());
        }
      }}
    >
      <div className="roadmap-board" ref={board} onPointerOver={showTruncatedText}
        data-dragging={Boolean(drag) || undefined}
        style={{ '--board-drag-step': `${drag?.step ?? 0}px` } as CSSProperties}>
        {categories.map((category) => (
          <Column mode={mode} key={category} category={category} onEdit={onEdit} selectedItemId={selectedItemId}
            items={items.filter((item) => item.category === category).sort((a, b) => a.order - b.order)}
            source={dragged} target={target} step={drag?.step ?? 0} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="board-card board-card-preview" data-mode={mode}
            data-editor-selected={dragged.id === selectedItemId || undefined}
            style={{ borderInlineStartColor: dragged.color ?? defaultColor }} aria-hidden="true">
            <div className="board-card-action"><CardContents item={dragged} mode={mode} /></div>
            {mode === 'Detailed' && dragged.link && <span className="board-card-link"><LinkLabel /></span>}
          </div>
        )}
      </DragOverlay>
      </DndContext>
    </>
  );
}
