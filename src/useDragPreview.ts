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
    const fromTop = drag.y - panel.top;
    const fromBottom = panel.bottom - drag.y;
    const speed = Math.max(-1, Math.min(1, (fromBottom < fromTop
      ? edgeZone - fromBottom
      : fromTop - edgeZone) / edgeZone));
    const nearEdge = fromTop < edgeZone || fromBottom < edgeZone;
    const inside = drag.x >= frame.left && drag.x < frame.right;
    // Project the preview onto the viewport while scrolling. Drop handlers still use the actual pointer.
    const x = Math.max(frame.left, Math.min(drag.x, frame.right - 1));
    const y = Math.max(panel.top, Math.min(drag.y, panel.bottom - 1));
    const target = drag.canScroll && (inside || nearEdge)
      ? findInsertion(element, items, drag.id, x, y, lastInsertion.current)
      : null;
    lastInsertion.current = target;
    setInsertion((previous) =>
      previous?.category === target?.category && previous?.index === target?.index &&
      previous?.top === target?.top && previous?.headerHeight === target?.headerHeight
        ? previous : target,
    );
    return drag.canScroll && nearEdge ? speed : 0;
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
    // Route through the same handler as ordinary row scrolling. Writing the sidebar's
    // scrollTop directly can be reverted by the opposite panel's pending scroll event.
    host.current?.querySelector('.vis-panel.vis-center')?.dispatchEvent(new WheelEvent('wheel', {
      deltaY: Math.sign(speed) * step,
      bubbles: true,
      cancelable: true,
    }));
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

  useEffect(() => {
    function preventPageScroll(event: WheelEvent) {
      if (event.isTrusted && point.current?.canScroll) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener('wheel', preventPageScroll, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', preventPageScroll, true);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return { ghost, ghostElement, point, insertion, scrolling, update, end, lastInsertion };
}
