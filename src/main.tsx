import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { DataSet } from 'vis-data';
import { Timeline, type DataGroup, type DataItem } from 'vis-timeline';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import './style.css';
import { addDays, editRange, scheduleRange, sizeDays, startOfDay, type DateRange } from './calendar';
import { axisFor, axisForSpan, calendarViews, windowFor, zoomMax, zoomMin, type CalendarView } from './calendarViews';
import { categories, createPrototypeItems } from './prototypeItems';
import { findInsertion, reorderItem, type Destination, type Insertion } from './reorder';

type TimelineGroup = DataGroup & { order: number; nestedInGroup?: string };
type BarDrag = { id: string; x: number; y: number; pointerId: number; mode?: 'time' | 'reorder' };

function groupId(category: string) {
  return `category-${category}`;
}

const dateLabel = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const dragType = 'application/x-roadmap-item';

function App() {
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<Timeline | null>(null);
  const timelineItems = useRef<DataSet<DataItem> | null>(null);
  const timelineGroups = useRef<DataSet<TimelineGroup> | null>(null);
  const barDrag = useRef<BarDrag | null>(null);
  const [insertion, setInsertion] = useState<Insertion | null>(null);
  const draggedId = useRef<string | null>(null);
  const contextDate = useRef(new Date());
  const [initialItems] = useState(() => createPrototypeItems(windowFor('Month', contextDate.current).start));
  const [roadmapItems, setRoadmapItems] = useState(initialItems);
  const axisView = useRef<CalendarView>('Month');
  const [selectedView, setSelectedView] = useState<CalendarView | null>('Month');
  const [includeWeekends, setIncludeWeekends] = useState(false);

  useEffect(() => {
    const initialWindow = windowFor('Month', contextDate.current);
    const items = new DataSet<DataItem>();
    timelineItems.current = items;
    const groups = new DataSet<TimelineGroup>(categories.flatMap((category, order) => {
      const children = initialItems.filter((item) => item.category === category);
      return [
        {
          id: groupId(category),
          order,
          content: category,
          nestedGroups: children.map(({ id }) => id),
          showNested: true,
        },
        ...children.map(({ id, content, size, order }) => ({ id, content: `${content} (${size})`, order })),
      ];
    }));
    timelineGroups.current = groups;
    const view = new Timeline(container.current!, items, groups, {
      ...axisFor('Month'),
      onInitialDrawComplete() {
        // Let vis-timeline finish its first draw before applying the preset window.
        if (timeline.current === view) {
          view.setWindow(initialWindow.start, initialWindow.end, { animation: false });
        }
      },
      orientation: 'top',
      groupOrder: 'order',
      dataAttributes: ['id'],
      margin: { axis: 4, item: 4 },
      editable: { updateTime: true, updateGroup: false, add: false, remove: false },
      selectable: true,
      itemsAlwaysDraggable: { item: true, range: true },
      snap: null,
      onMove(item, complete) {
        // Commit through React so the dataset only mirrors accepted date ranges.
        complete(null);
        if (barDrag.current?.mode === 'reorder' && barDrag.current.id === item.id) return;
        if (typeof item.id !== 'string' || item.group !== item.id || item.end == null) return;

        const { id } = item;
        const range: DateRange = { start: new Date(item.start), end: new Date(item.end) };
        if (!(range.start < range.end)) return;

        setRoadmapItems((current) => current.map((entry) =>
          entry.id === id ? { ...entry, ...range } : entry,
        ));
      },
      moveable: true,
      zoomable: true,
      zoomKey: 'ctrlKey',
      zoomMin,
      zoomMax,
      verticalScroll: true,
      horizontalScroll: true,
      maxHeight: 420,
      showCurrentTime: false,
      groupTemplate(group: DataGroup) {
        const children = group.nestedGroups;
        if (children) {
          const expanded = group.showNested !== false;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'roadmap-category';
          button.textContent = String(group.content);
          button.setAttribute('aria-label', String(group.content));
          button.setAttribute('aria-expanded', String(expanded));
          // Let the button handle activation instead of the timeline's label tap handler.
          button.addEventListener('pointerdown', (event) => event.stopPropagation());
          button.addEventListener('click', () => {
            groups.update([
              { id: group.id, showNested: !expanded },
              ...children.map((id) => ({ id, visible: !expanded })),
            ]);
            const replacement = container.current?.querySelector<HTMLButtonElement>(
              `button.roadmap-category[data-category="${group.id}"]`,
            );
            replacement?.focus({ preventScroll: true });
          });
          button.dataset.category = String(group.id);
          return button;
        }

        const label = document.createElement('div');
        label.className = 'roadmap-label';
        label.textContent = String(group.content);
        label.draggable = true;
        label.dataset.itemId = String(group.id);
        // Keep the timeline's gesture handler from capturing the drag source.
        label.addEventListener('pointerdown', (event) => event.stopPropagation());
        label.addEventListener('dragstart', (event) => {
          if (!event.dataTransfer) return;
          draggedId.current = String(group.id);
          event.dataTransfer.setData(dragType, draggedId.current);
          event.dataTransfer.effectAllowed = 'copyMove';
          // The drop timestamp is under the cursor, so anchor the preview's left edge there.
          event.dataTransfer.setDragImage(label, 0, Math.round(label.offsetHeight / 2));
        });
        label.addEventListener('dragend', () => {
          draggedId.current = null;
          setInsertion(null);
        });
        return label;
      },
    });
    timeline.current = view;

    let shaded = new Set<string>();
    function shadeWeekends(start: Date, end: Date) {
      let saturday = startOfDay(addDays(start, -15));
      saturday = addDays(saturday, (6 - saturday.getDay() + 7) % 7);
      const bufferEnd = addDays(end, 14);
      const next = new Set<string>();
      const additions: DataItem[] = [];
      for (; saturday < bufferEnd; saturday = addDays(saturday, 7)) {
        const id = `weekend-${saturday.getTime()}`;
        next.add(id);
        if (!shaded.has(id)) {
          additions.push({
            id, type: 'background', content: '', start: saturday, end: addDays(saturday, 2),
            className: 'roadmap-weekend', editable: false,
          });
        }
      }
      items.remove([...shaded].filter((id) => !next.has(id)));
      items.add(additions);
      shaded = next;
    }

    shadeWeekends(initialWindow.start, initialWindow.end);
    view.on('rangechanged', ({ start, end, byUser }: DateRange & { byUser: boolean }) => {
      shadeWeekends(start, end);
      if (!byUser) return;

      contextDate.current = new Date((start.getTime() + end.getTime()) / 2);
      setSelectedView(null);
      const viewForSpan = axisForSpan(end.getTime() - start.getTime());
      if (viewForSpan !== axisView.current) {
        axisView.current = viewForSpan;
        view.setOptions(axisFor(viewForSpan));
      }
    });

    return () => {
      view.destroy();
      timeline.current = null;
      timelineItems.current = null;
      timelineGroups.current = null;
    };
  }, [initialItems]);

  useEffect(() => {
    timeline.current?.setOptions({
      onMoving(item, preview) {
        const original = timelineItems.current?.get(item.id);
        if (!original || original.end == null || item.end == null) return preview(null);

        if (barDrag.current?.mode === 'reorder') {
          // Keep the bar on its original dates while showing the row insertion.
          return preview({ ...item, start: original.start, end: original.end });
        }

        // vis-timeline changes both endpoints for a move, and one for a resize.
        const range = editRange(
          { start: new Date(original.start), end: new Date(original.end) },
          { start: new Date(item.start), end: new Date(item.end) },
          includeWeekends,
        );
        preview({ ...item, ...range });
      },
    });
  }, [includeWeekends]);

  useEffect(() => {
    const groups = timelineGroups.current;
    if (groups) {
      const updates = categories.flatMap((category) => {
        const parent = groups.get(groupId(category));
        const children = roadmapItems.filter((item) => item.category === category);
        const nestedGroups = children.map(({ id }) => id);
        const expanded = parent?.showNested !== false;
        const changed: Partial<TimelineGroup>[] = children.flatMap(({ id, order }) => {
          const row = groups.get(id);
          const visible = expanded;
          return row && row.order === order && row.nestedInGroup === groupId(category)
            && (row.visible !== false) === visible
            ? [] : [{ id, order, visible, nestedInGroup: groupId(category) }];
        });
        if (parent?.nestedGroups?.join() !== nestedGroups.join()) {
          changed.push({ id: groupId(category), nestedGroups });
        }
        return changed;
      });
      if (updates.length) groups.update(updates);
    }
    const bars = roadmapItems.flatMap(({ id, content, start, end }) =>
      start && end ? [{ id, group: id, content, start, end }] : [],
    );
    timelineItems.current?.update(bars);
  }, [roadmapItems]);

  function selectView(preset: CalendarView) {
    const view = timeline.current;
    if (!view) return;
    const { start, end } = windowFor(preset, contextDate.current);
    axisView.current = preset;
    view.setOptions(axisFor(preset));
    view.setWindow(start, end, { animation: false });
    setSelectedView(preset);
  }

  function getDropTime(event: DragEvent<HTMLDivElement>, id: string) {
    if (roadmapItems.some((item) => item.id === id && item.start)) return;
    const point = timeline.current?.getEventProperties(event.nativeEvent);
    if (point && String(point.group) === id && point.what === 'background') return point.time;
  }

  function commitReorder(id: string, destination: Destination) {
    setRoadmapItems((items) => reorderItem(items, id, destination));
  }

  function previewInsertion(id: string, x: number, y: number) {
    return container.current && findInsertion(container.current, roadmapItems, id, x, y);
  }

  function allowDrop(event: DragEvent<HTMLDivElement>) {
    const id = draggedId.current;
    if (!id) return;
    event.stopPropagation();
    const scheduling = getDropTime(event, id);
    const target = scheduling ? null : previewInsertion(id, event.clientX, event.clientY);
    setInsertion(target);
    if (!scheduling && !target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = scheduling ? 'copy' : 'move';
  }

  function scheduleItem(event: DragEvent<HTMLDivElement>) {
    const id = event.dataTransfer.getData(dragType);
    if (!id || id !== draggedId.current) return;
    event.preventDefault();
    event.stopPropagation();

    const dropTime = getDropTime(event, id);
    setInsertion(null);
    if (!dropTime) {
      const target = previewInsertion(id, event.clientX, event.clientY);
      if (target) commitReorder(id, target);
      return;
    }
    setRoadmapItems((current) => current.map((item) =>
      item.id === id && !item.start
        ? { ...item, ...scheduleRange(dropTime, sizeDays[item.size], includeWeekends) }
        : item,
    ));
  }

  function startBarDrag(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>('.vis-item.vis-range[data-id]');
    if (!item?.dataset.id || event.button !== 0 || !event.isPrimary) return;
    // Edges always resize. Only a bar body can switch to row insertion.
    if (target.closest('.vis-drag-left, .vis-drag-right')) return;
    barDrag.current = { id: item.dataset.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  }

  function trackBarDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = barDrag.current;
    if (!drag || event.pointerId !== drag.pointerId || !(event.buttons & 1)) return;
    const dx = Math.abs(event.clientX - drag.x);
    const dy = Math.abs(event.clientY - drag.y);
    if (!drag.mode && Math.max(dx, dy) >= 14) {
      drag.mode = dy > dx * 1.25 ? 'reorder' : 'time';
    }
    if (drag.mode === 'reorder') {
      setInsertion(previewInsertion(drag.id, event.clientX, event.clientY));
    }
  }

  useEffect(() => {
    function finishBarDrag(event: PointerEvent) {
      const drag = barDrag.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const target = event.type === 'pointerup' && drag.mode === 'reorder' && container.current
        ? findInsertion(container.current, roadmapItems, drag.id, event.clientX, event.clientY)
        : null;
      setInsertion(null);
      // Wait for the library's pointer-up listener to finish its native item edit.
      setTimeout(() => {
        if (barDrag.current !== drag) return;
        barDrag.current = null;
        if (target) setRoadmapItems((items) => reorderItem(items, drag.id, target));
      }, 0);
    }

    window.addEventListener('pointerup', finishBarDrag, true);
    window.addEventListener('pointercancel', finishBarDrag, true);
    return () => {
      window.removeEventListener('pointerup', finishBarDrag, true);
      window.removeEventListener('pointercancel', finishBarDrag, true);
    };
  }, [roadmapItems]);

  return (
    <main>
      <h1>Roadmap Tool</h1>
      <p>Drag between rows to reorder. Drop an unscheduled item onto its own timeline row to schedule it. Drag bars sideways to change dates or drag their edges to resize.</p>
      <div role="group" aria-label="Calendar view">
        {calendarViews.map((preset) => (
          <button key={preset} type="button" aria-pressed={selectedView === preset} onClick={() => selectView(preset)}>
            {preset}
          </button>
        ))}
      </div>
      <label>
        <input type="checkbox" checked={includeWeekends} onChange={(event) => setIncludeWeekends(event.target.checked)} />
        Count weekends toward duration
      </label>
      <div
        ref={container}
        aria-label="Roadmap timeline"
        onDragOverCapture={allowDrop}
        onDropCapture={scheduleItem}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInsertion(null);
        }}
        onPointerDownCapture={startBarDrag}
        onPointerMoveCapture={trackBarDrag}
        onPointerLeave={() => setInsertion(null)}
      />
      {insertion && (
        <div
          className={insertion.headerHeight ? 'roadmap-insertion roadmap-insertion-collapsed' : 'roadmap-insertion'}
          style={{ top: insertion.top, left: container.current?.getBoundingClientRect().left, width: container.current?.clientWidth, height: insertion.headerHeight }}
        >
          <span>{insertion.category} · Position {insertion.index + 1}{insertion.headerHeight ? ' (end)' : ''}</span>
        </div>
      )}
      <ul aria-label="Scheduled dates">
        {roadmapItems.map(({ id, content, start, end }) => (
          <li key={id}>
            {content} · {start && end ? `${dateLabel.format(start)} → ${dateLabel.format(end)} ready` : 'Unscheduled'}
          </li>
        ))}
      </ul>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
