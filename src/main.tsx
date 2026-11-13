import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { DataSet } from 'vis-data';
import { Timeline, type DataItem } from 'vis-timeline';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import './style.css';

const roadmapItems = [
  { id: 'onboarding', content: 'Improve onboarding' },
  { id: 'search', content: 'Add search filters' },
  { id: 'reporting', content: 'Update reporting' },
  { id: 'billing', content: 'Simplify billing' },
];

const week = 7 * 24 * 60 * 60 * 1000;
const dragType = 'application/x-roadmap-item';

function App() {
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<Timeline | null>(null);
  const timelineItems = useRef<DataSet<DataItem> | null>(null);
  const draggedId = useRef<string | null>(null);
  const [dates, setDates] = useState<Partial<Record<string, { start: Date; end: Date }>>>({});

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const items = new DataSet<DataItem>();
    timelineItems.current = items;
    const view = new Timeline(container.current!, items, roadmapItems, {
      start,
      end: new Date(start.getTime() + 4 * week),
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
        const start = new Date(item.start);
        const end = new Date(item.end);
        if (!(start < end)) return;

        setDates((current) => current[id] ? { ...current, [id]: { start, end } } : current);
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
    const bars = roadmapItems.flatMap(({ id, content }) => {
      const range = dates[id];
      return range ? [{ id, group: id, content, ...range }] : [];
    });
    timelineItems.current?.update(bars);
  }, [dates]);

  function getDropTime(event: DragEvent<HTMLDivElement>, id: string) {
    if (dates[id]) return;
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

    const start = getDropTime(event, id);
    if (!start) return;
    const end = new Date(start.getTime() + week);
    setDates((current) => current[id] ? current : { ...current, [id]: { start, end } });
  }

  return (
    <main>
      <h1>Roadmap Tool</h1>
      <p>Drag an unscheduled item onto its own row. Drag a bar to move it or drag either edge to resize it.</p>
      <div
        ref={container}
        aria-label="Roadmap timeline"
        onDragOverCapture={allowDrop}
        onDropCapture={scheduleItem}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
