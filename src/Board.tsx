import { Fragment, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { categories, type Category, type RoadmapItem } from './prototypeItems';
import type { Destination } from './reorder';

type Slot = { category: Category; index: number };
const slotId = ({ category, index }: Slot) => `slot-${category}-${index}`;

function Card({ item }: { item: RoadmapItem }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: item.id, data: { item } });
  return (
    <button ref={setNodeRef} type="button" className="board-card"
      data-item-id={item.id} data-dragging={isDragging || undefined} {...attributes} {...listeners}>
      <span>{item.content}</span><span>{item.size}</span>
    </button>
  );
}

function InsertionSlot({ category, index, disabled }: Slot & { disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId({ category, index }), data: { category, index }, disabled });
  return <div ref={setNodeRef} className="board-slot" data-over={isOver || undefined} aria-hidden="true" />;
}

function Column({ category, items, activeId }: { category: Category; items: RoadmapItem[]; activeId: string | null }) {
  const { setNodeRef } = useDroppable({ id: category, data: { category } });
  return (
    <section className="board-column" ref={setNodeRef} aria-label={category}>
      <h2>{category}</h2>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <InsertionSlot category={category} index={index} disabled={items[index - 1]?.id === activeId} />
          <Card item={item} />
        </Fragment>
      ))}
      <InsertionSlot category={category} index={items.length} disabled={items.at(-1)?.id === activeId} />
      {!items.length && <p className="board-empty">Drop an item here</p>}
    </section>
  );
}

const collision: CollisionDetection = ({ pointerCoordinates, collisionRect, droppableContainers, droppableRects }) => {
  const point = pointerCoordinates ?? {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  const column = categories.find((category) => {
    const rect = droppableRects.get(category);
    return rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  });
  if (!column) return [];

  let nearest: { id: string | number; distance: number } | undefined;
  for (const { id, data } of droppableContainers) {
    if (data.current?.category !== column || typeof data.current.index !== 'number') continue;
    const rect = droppableRects.get(id);
    if (!rect) continue;
    const distance = Math.abs(point.y - (rect.top + rect.height / 2));
    if (!nearest || distance < nearest.distance) nearest = { id, distance };
  }
  return nearest ? [{ id: nearest.id }] : [];
};

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

export function Board({ items, onReorder }: {
  items: RoadmapItem[];
  onReorder: (id: string, destination: Destination) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );
  const dragged = items.find((item) => item.id === activeId);

  return (
    <DndContext sensors={sensors} collisionDetection={collision}
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
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over, activatorEvent }) => {
        setActiveId(null);
        const item = active.data.current?.item as RoadmapItem | undefined;
        const slot = over?.data.current as Slot | undefined;
        if (!item || !slot) return;
        onReorder(item.id, destinationFor(item, slot));
        if (activatorEvent.type === 'keydown') {
          requestAnimationFrame(() => board.current
            ?.querySelector<HTMLButtonElement>(`[data-item-id="${CSS.escape(item.id)}"]`)?.focus());
        }
      }}
    >
      <div className="roadmap-board" ref={board}>
        {categories.map((category) => (
          <Column key={category} category={category}
            items={items.filter((item) => item.category === category).sort((a, b) => a.order - b.order)}
            activeId={activeId} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && <div className="board-card board-card-preview"><span>{dragged.content}</span><span>{dragged.size}</span></div>}
      </DragOverlay>
    </DndContext>
  );
}
