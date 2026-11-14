import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Timeline } from 'vis-timeline';
import { dateInput, nearestDay } from './calendar';
import { MarkerEditor, type Marker, type MarkerDraft } from './MarkerEditor';
import { showTruncatedText } from './truncatedText';

type Geometry = { left: number; width: number; start: number; end: number };
type Drag = { id: string; pointer: number; x: number; day: Date; moved: boolean; cancelled: boolean };
type Preview = { id: string; time: number; date: Date; dragging: boolean };
type Editor = { marker?: Marker; anchor: HTMLElement; revision: number };

export function TimelineMarkers({ active, timeline, container, toolbar, markers, onSave, onDelete }: {
  active: boolean;
  timeline: Timeline | null;
  container: RefObject<HTMLDivElement | null>;
  toolbar: HTMLElement | null;
  markers: Marker[];
  onSave: (marker: Marker) => void;
  onDelete: (id: string) => void;
}) {
  const addButton = useRef<HTMLButtonElement>(null);
  const [geometry, setGeometry] = useState<Geometry>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [preview, setPreview] = useState<Preview>();
  const settleFrame = useRef(0);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const lines = useRef(new Map<string, Marker>());
  const replaceEditor = useRef<((editor: Editor) => void) | null>(null);

  useLayoutEffect(() => {
    const root = container.current;
    const center = root?.querySelector<HTMLElement>('.vis-panel.vis-center');
    const background = root?.querySelector<HTMLElement>('.vis-panel.vis-background.vis-vertical');
    if (!timeline || !root || !center || !background || !active) return;
    function measure() {
      const rect = center!.getBoundingClientRect();
      if (!rect.width) return;
      const { start, end } = timeline!.getWindow();
      const left = rect.left - root!.getBoundingClientRect().left;
      const width = center!.offsetWidth;
      setGeometry((previous) => previous?.left === left && previous.width === width &&
        previous.start === +start && previous.end === +end
        ? previous : { left, width, start: +start, end: +end });
      const backgroundRect = background!.getBoundingClientRect();
      background!.style.setProperty('--marker-axis-height', `${rect.top - backgroundRect.top}px`);
      background!.style.setProperty('--marker-line-offset', `${rect.left - backgroundRect.left}px`);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(center);
    timeline.on('changed', measure);
    timeline.on('rangechange', measure);
    return () => {
      observer.disconnect();
      timeline.off('changed', measure);
      timeline.off('rangechange', measure);
    };
  }, [active, container, timeline]);

  useLayoutEffect(() => {
    if (!timeline || !active) return;
    const next = new Map(markers.map((marker) => [marker.id, marker]));
    for (const id of lines.current.keys()) {
      if (!next.has(id)) timeline.removeCustomTime(id);
    }
    for (const marker of markers) {
      const previous = lines.current.get(marker.id);
      const date = preview?.id === marker.id ? new Date(preview.time) : marker.date;
      if (!previous) {
        timeline.addCustomTime(date, marker.id);
        timeline.setCustomTimeTitle('', marker.id);
      } else if (+previous.date !== +date) {
        timeline.setCustomTime(date, marker.id);
      }
      next.set(marker.id, { ...marker, date });
    }
    lines.current = next;
  }, [active, markers, preview, timeline]);

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !drag.current?.moved) return;
      event.preventDefault();
      drag.current.cancelled = true;
      setPreview(undefined);
    }
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('keydown', escape, true);
      cancelAnimationFrame(settleFrame.current);
    };
  }, []);

  useEffect(() => {
    if (active) return;
    drag.current = null;
    cancelAnimationFrame(settleFrame.current);
    setPreview(undefined);
  }, [active]);

  function open(anchor: HTMLElement, marker?: Marker) {
    if (editor && editor.marker?.id === marker?.id) return;
    const next = { marker, anchor, revision: (editor?.revision ?? 0) + 1 };
    if (editor) replaceEditor.current?.(next);
    else setEditor(next);
  }

  function close(restoreFocus = true) {
    setEditor(null);
    if (restoreFocus) {
      const anchor = editor?.anchor;
      (anchor?.isConnected ? anchor : addButton.current)?.focus({ preventScroll: true });
    }
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, marker: Marker) {
    if (!event.isPrimary || event.button !== 0) return;
    cancelAnimationFrame(settleFrame.current);
    setPreview(undefined);
    suppressClick.current = false;
    drag.current = { id: marker.id, pointer: event.pointerId, x: event.clientX, day: marker.date, moved: false, cancelled: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function timeAtPointer(current: Drag, x: number) {
    // Preserve the original grab offset, including for labels pushed inward at the right edge.
    const { start, end } = timeline!.getWindow();
    const time = +current.day + (x - current.x) / geometry!.width * (+end - +start);
    return Math.max(+start, Math.min(+end, time));
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!geometry || !current || current.pointer !== event.pointerId || current.cancelled || !timeline) return;
    if (!current.moved && Math.abs(event.clientX - current.x) < 5) return;
    current.moved = true;
    suppressClick.current = true;
    const time = timeAtPointer(current, event.clientX);
    setPreview({ id: current.id, time, date: nearestDay(new Date(time)), dragging: true });
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>, marker: Marker) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.type !== 'pointerup' || !current.moved || current.cancelled || !geometry || !timeline) {
      setPreview(undefined);
      return;
    }

    const time = timeAtPointer(current, event.clientX);
    const date = nearestDay(new Date(time));
    onSave({ ...marker, date });
    if (+date === time || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPreview(undefined);
      return;
    }

    const started = performance.now();
    function settle(now: number) {
      const progress = Math.min(1, (now - started) / 125);
      if (progress === 1) {
        setPreview(undefined);
        return;
      }
      const eased = 1 - (1 - progress) ** 3;
      setPreview({ id: marker.id, time: time + (+date - time) * eased, date, dragging: false });
      settleFrame.current = requestAnimationFrame(settle);
    }
    settle(started);
  }

  function save(draft: MarkerDraft) {
    if (!timeline) return;
    const { start, end } = timeline.getWindow();
    const date = draft.date
      ? new Date(`${draft.date}T00:00:00`)
      : nearestDay(new Date(+start + (+end - +start) * 0.4));
    onSave({ id: editor?.marker?.id ?? `roadmap-marker-${crypto.randomUUID()}`, name: draft.name.trim(), date, color: draft.color });
    close();
  }

  return (
    <>
      {/* Style guides before vis-timeline attaches them on its next draw. */}
      <style>{markers.map(({ id, color }) =>
        `#timeline-view .vis-custom-time.${CSS.escape(id)} { --marker-color: ${color}; }`,
      ).join('\n')}</style>
      {toolbar && createPortal(
        <button type="button" ref={addButton} onClick={(event) => open(event.currentTarget)}>Add marker</button>,
        toolbar,
      )}
      <div className="marker-strip" role="group" aria-label="Timeline markers"
        style={{ marginLeft: geometry?.left, width: geometry?.width ?? 0 }} onPointerOver={showTruncatedText}>
        {geometry && markers.map((marker) => {
          const date = preview?.id === marker.id ? preview.date : marker.date;
          const position = ((preview?.id === marker.id ? preview.time : +date) - geometry.start) /
            (geometry.end - geometry.start) * geometry.width;
          const dragging = preview?.id === marker.id && preview.dragging;
          const visible = position >= 0 && position <= geometry.width;
          return (
            <button type="button" key={marker.id} className="marker-label"
              hidden={!visible && preview?.id !== marker.id}
              aria-label={`${marker.name}, ${dateInput(date)}`}
              data-marker-dragging={dragging || undefined}
              style={{ left: `${position}px`, '--marker-color': marker.color,
                '--marker-right-space': `${geometry.width - position}px` } as CSSProperties}
              onPointerDown={(event) => startDrag(event, marker)}
              onPointerMove={moveDrag}
              onPointerUp={(event) => finishDrag(event, marker)}
              onPointerCancel={(event) => finishDrag(event, marker)}
              onLostPointerCapture={(event) => finishDrag(event, marker)}
              onClick={(event) => {
                if (event.detail === 0 || !suppressClick.current) open(event.currentTarget, marker);
              }}>
              <span aria-hidden="true">⠿</span>
              <span className="marker-name" data-truncated-text>{marker.name}</span>
              {dragging && <span className="marker-live-date" aria-hidden="true">{dateInput(date)}</span>}
            </button>
          );
        })}
      </div>
      {editor && (
        <MarkerEditor key={editor.revision} marker={editor.marker} active={active} anchor={editor.anchor}
          onClose={close} onSave={save}
          onDelete={() => { if (editor.marker) onDelete(editor.marker.id); close(false); addButton.current?.focus(); }}
          registerReplacement={(request) => {
            replaceEditor.current = (next) => request(() => setEditor(next));
          }} />
      )}
    </>
  );
}
