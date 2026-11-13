import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { DataSet } from 'vis-data';
import { Timeline, type DataItem } from 'vis-timeline';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import './style.css';
import { addDays, editRange, isWeekend, scheduleRange, sizeDays, startOfDay, type DateRange } from './calendar';

type RoadmapItem = {
  id: string;
  content: string;
  size: keyof typeof sizeDays;
  start?: Date;
  end?: Date;
};

const initialItems: RoadmapItem[] = [
  { id: 'onboarding', content: 'Improve onboarding', size: 'S' },
  { id: 'search', content: 'Add search filters', size: 'M' },
  { id: 'reporting', content: 'Update reporting', size: 'L' },
  { id: 'billing', content: 'Simplify billing', size: 'S' },
];

const dateLabel = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const dragType = 'application/x-roadmap-item';

function App() {
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<Timeline | null>(null);
  const timelineItems = useRef<DataSet<DataItem> | null>(null);
  const draggedId = useRef<string | null>(null);
  const [roadmapItems, setRoadmapItems] = useState(initialItems);
  const [includeWeekends, setIncludeWeekends] = useState(false);

  useEffect(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 28);
    const items = new DataSet<DataItem>();
    for (let day = start; day < end; day = addDays(day, 1)) {
      if (isWeekend(day)) {
        items.add({
          type: 'background', content: '', start: day, end: addDays(day, 1),
          className: 'roadmap-weekend', editable: false,
        });
      }
    }
    timelineItems.current = items;
    const groups = initialItems.map(({ id, content, size }) => ({ id, content: `${content} (${size})` }));
    const view = new Timeline(container.current!, items, groups, {
      start,
      end,
      orientation: 'top',
      margin: { axis: 4, item: 4 },
      editable: { updateTime: true, updateGroup: false, add: false, remove: false },
      selectable: true,
      itemsAlwaysDraggable: { item: true, range: true },
      snap: null,
      onMove(item, complete) {
        // Commit through React so the dataset only mirrors accepted date ranges.
        complete(null);
        if (typeof item.id !== 'string' || item.group !== item.id || item.end == null) return;

        const { id } = item;
        const range: DateRange = { start: new Date(item.start), end: new Date(item.end) };
        if (!(range.start < range.end)) return;

        setRoadmapItems((current) => current.map((entry) =>
          entry.id === id ? { ...entry, ...range } : entry,
        ));
      },
      moveable: false,
      zoomable: false,
      showCurrentTime: false,
      groupTemplate(group) {
        const label = document.createElement('div');
        label.className = 'roadmap-label';
        label.textContent = group.content;
        label.draggable = true;
        // Keep the timeline's gesture handler from capturing the drag source.
        label.addEventListener('pointerdown', (event) => event.stopPropagation());
        label.addEventListener('dragstart', (event) => {
          if (!event.dataTransfer) return;
          draggedId.current = String(group.id);
          event.dataTransfer.setData(dragType, draggedId.current);
          event.dataTransfer.effectAllowed = 'copy';
          // The drop timestamp is under the cursor, so anchor the preview's left edge there.
          event.dataTransfer.setDragImage(label, 0, Math.round(label.offsetHeight / 2));
        });
        label.addEventListener('dragend', () => {
          draggedId.current = null;
        });
        return label;
      },
    });
    timeline.current = view;

    return () => {
      view.destroy();
      timeline.current = null;
      timelineItems.current = null;
    };
  }, []);

  useEffect(() => {
    timeline.current?.setOptions({
      onMoving(item, preview) {
        const original = timelineItems.current?.get(item.id);
        if (!original || original.end == null || item.end == null) return preview(null);

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
    const bars = roadmapItems.flatMap(({ id, content, start, end }) =>
      start && end ? [{ id, group: id, content, start, end }] : [],
    );
    timelineItems.current?.update(bars);
  }, [roadmapItems]);

  function getDropTime(event: DragEvent<HTMLDivElement>, id: string) {
    if (roadmapItems.some((item) => item.id === id && item.start)) return;
    const point = timeline.current?.getEventProperties(event.nativeEvent);
    if (point && String(point.group) === id && point.what === 'background') return point.time;
  }

  function allowDrop(event: DragEvent<HTMLDivElement>) {
    const id = draggedId.current;
    if (!id) return;
    event.stopPropagation();
    if (!getDropTime(event, id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function scheduleItem(event: DragEvent<HTMLDivElement>) {
    const id = event.dataTransfer.getData(dragType);
    if (!id || id !== draggedId.current) return;
    event.preventDefault();
    event.stopPropagation();

    const dropTime = getDropTime(event, id);
    if (!dropTime) return;
    setRoadmapItems((current) => current.map((item) =>
      item.id === id && !item.start
        ? { ...item, ...scheduleRange(dropTime, sizeDays[item.size], includeWeekends) }
        : item,
    ));
  }

  return (
    <main>
      <h1>Roadmap Tool</h1>
      <p>Drag an unscheduled item onto its own row. Drag a bar to move it or drag either edge to resize it.</p>
      <label>
        <input type="checkbox" checked={includeWeekends} onChange={(event) => setIncludeWeekends(event.target.checked)} />
        Count weekends toward duration
      </label>
      <div
        ref={container}
        aria-label="Roadmap timeline"
        onDragOverCapture={allowDrop}
        onDropCapture={scheduleItem}
      />
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
