import { useEffect, useRef, useState, type RefObject } from 'react';
import type { RoadmapItem } from './prototypeItems';
import { findInsertion, type Insertion } from './reorder';

type DragPoint = { id: string; x: number; y: number; canScroll: boolean };

const edgeZone = 50;
const maxSpeed = 900; // Pixels per second.

export function useDragPreview(host: RefObject<HTMLDivElement | null>, items: RoadmapItem[]) {
  const [ghost, setGhost] = useState<string | null>(null);
  const ghostElement = useRef<HTMLDivElement>(null);
  const point = useRef<DragPoint | null>(null);
  const lastInsertion = useRef<Insertion | null>(null);
  const [insertion, setInsertion] = useState<Insertion | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const frame = useRef<number | null>(null);
  const lastTick = useRef<number | null>(null);

  function positionGhost(x: number, y: number) {
    if (ghostElement.current) ghostElement.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function stopScroll() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    lastTick.current = null;
    setScrolling(false);
  }

  function refresh(drag: DragPoint) {
    const element = host.current;
    const panel = element?.querySelector('.vis-panel.vis-center')?.getBoundingClientRect();
    const frame = element?.getBoundingClientRect();
    if (!element || !panel || !frame) return 0;
    const inside = drag.x >= frame.left && drag.x < frame.right;
    const near = drag.y >= panel.top - edgeZone && drag.y < panel.bottom + edgeZone;
    const y = Math.max(panel.top, Math.min(drag.y, panel.bottom - 1));
    const target = inside && near && drag.canScroll
      ? findInsertion(element, items, drag.id, drag.x, y, lastInsertion.current)
      : null;
    lastInsertion.current = target;
    setInsertion((previous) =>
      previous?.category === target?.category && previous?.index === target?.index &&
      previous?.top === target?.top && previous?.headerHeight === target?.headerHeight
        ? previous : target,
    );
    if (!inside || !near || !drag.canScroll) return 0;
    const fromTop = drag.y - panel.top;
    const fromBottom = panel.bottom - drag.y;
    if (fromTop < edgeZone) return -Math.min(1, (edgeZone - fromTop) / edgeZone);
    if (fromBottom < edgeZone) return Math.min(1, (edgeZone - fromBottom) / edgeZone);
    return 0;
  }

  function tick(now: number) {
    frame.current = null;
    const drag = point.current;
    const scroller = host.current?.querySelector<HTMLElement>('.vis-panel.vis-left.vis-vertical-scroll');
    const speed = drag ? refresh(drag) : 0;
    if (!scroller || !speed) return stopScroll();

    const before = scroller.scrollTop;
    const limit = scroller.scrollHeight - scroller.clientHeight;
    if ((speed < 0 && before <= 0) || (speed > 0 && before >= limit)) return stopScroll();

    const elapsed = Math.min(32, now - (lastTick.current ?? now - 16));
    lastTick.current = now;
    const step = Math.max(1, Math.round(speed * speed * maxSpeed * elapsed / 1000));
    // The library mirrors scrolling of this sidebar panel onto the timeline rows.
    scroller.scrollTop = before + Math.sign(speed) * step;
    frame.current = requestAnimationFrame(tick);
  }

  function update(drag: DragPoint) {
    point.current = drag;
    setGhost(items.find((item) => item.id === drag.id)?.content ?? null);
    positionGhost(drag.x, drag.y);
    const speed = refresh(drag);
    if (speed && frame.current === null) {
      setScrolling(true);
      frame.current = requestAnimationFrame(tick);
    } else if (!speed && frame.current !== null) {
      stopScroll();
    }
  }

  function end() {
    point.current = null;
    lastInsertion.current = null;
    setGhost(null);
    setInsertion(null);
    stopScroll();
  }

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return { ghost, ghostElement, point, insertion, scrolling, update, end, lastInsertion };
}
