import type { BoardMode } from './Board';
import type { Marker } from './MarkerEditor';
import { dateInput, sizeDays } from './calendar';
import { normalizeLink } from './itemDraft';
import { categories, type RoadmapItem } from './prototypeItems';

export const storageKey = 'little-roadmap';
const version = 1;
export const defaultRoadmapName = 'Roadmap';
export const roadmapNameLimit = 80;

export type RoadmapSnapshot = {
  name?: string;
  items: RoadmapItem[];
  markers: Marker[];
  includeWeekends: boolean;
  boardMode: BoardMode;
  view: 'Board' | 'Timeline';
};

const unreadable = 'Saved roadmap could not be loaded. Changes are temporary and the saved data is preserved.';
const unavailable = 'Browser storage is unavailable. Changes are temporary in this session.';
export const writeWarning = 'Changes could not be saved to browser storage. Keep this page open to retain them.';

function invalid(): never {
  throw new Error('Invalid roadmap data.');
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) invalid();
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || typeof value === 'string') return value;
  return invalid();
}

function colorValue(value: unknown): string {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) invalid();
  return value;
}

function calendarDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(+date) || dateInput(date) !== value) invalid();
  return date;
}

function readItem(value: unknown): RoadmapItem {
  const { id, content, category, order, size, description, rationale, color, link, start, end } = record(value);
  const itemCategory = categories.find((entry) => entry === category);
  if (!itemCategory || typeof order !== 'number' || !Number.isSafeInteger(order) || order < 0) invalid();
  const itemSize = (Object.keys(sizeDays) as RoadmapItem['size'][]).find((entry) => entry === size);
  if (!itemSize) invalid();

  const itemId = requiredText(id);
  if (itemId.startsWith('weekend-') || itemId.startsWith('category-') ||
    itemId === '__background__' || itemId === '__ungrouped__' || Object.hasOwn(Object.prototype, itemId)) invalid();

  const item: RoadmapItem = { id: itemId, content: requiredText(content), category: itemCategory, order, size: itemSize };
  if (description !== undefined) item.description = optionalText(description);
  if (rationale !== undefined) item.rationale = optionalText(rationale);
  if (color !== undefined) item.color = colorValue(color);
  if (link !== undefined) {
    if (typeof link !== 'string' || normalizeLink(link) !== link) invalid();
    item.link = link;
  }
  if (start !== undefined || end !== undefined) {
    item.start = calendarDate(start);
    item.end = calendarDate(end);
    if (item.end <= item.start) invalid();
  }
  return item;
}

function readMarker(value: unknown): Marker {
  const { id, name, date, color } = record(value);
  const markerId = requiredText(id);
  const markerName = requiredText(name);
  if (!/^roadmap-marker-[a-z0-9-]+$/i.test(markerId) || markerName.length > 60) invalid();
  return { id: markerId, name: markerName, date: calendarDate(date), color: colorValue(color) };
}

export function serializeRoadmap(snapshot: RoadmapSnapshot): string {
  return JSON.stringify({
    version,
    name: snapshot.name,
    items: snapshot.items.map(({ start, end, ...item }) => ({
      ...item, start: start && dateInput(start), end: end && dateInput(end),
    })),
    markers: snapshot.markers.map((marker) => ({ ...marker, date: dateInput(marker.date) })),
    includeWeekends: snapshot.includeWeekends,
    boardMode: snapshot.boardMode,
    view: snapshot.view,
  }, null, 2);
}

export function deserializeRoadmap(raw: string): RoadmapSnapshot {
  return validateRoadmap(JSON.parse(raw));
}

export function validateRoadmap(document: unknown): RoadmapSnapshot {
  const saved = record(document);
  const { includeWeekends, boardMode, view } = saved;
  if (saved.version !== version || !Array.isArray(saved.items) || !Array.isArray(saved.markers) ||
    typeof includeWeekends !== 'boolean' || (boardMode !== 'Compact' && boardMode !== 'Detailed') ||
    (view !== 'Board' && view !== 'Timeline')) invalid();

  const items = saved.items.map(readItem);
  const markers = saved.markers.map(readMarker);
  if (new Set(items.map(({ id }) => id)).size !== items.length ||
    new Set(markers.map(({ id }) => id)).size !== markers.length) invalid();
  for (const category of categories) {
    const orders = items.filter((item) => item.category === category).map((item) => item.order).sort((a, b) => a - b);
    if (orders.some((order, index) => order !== index)) invalid();
  }
  const name = saved.name === undefined ? undefined : requiredText(saved.name).trim();
  if (name && name.length > roadmapNameLimit) invalid();
  return { items, markers, includeWeekends, boardMode, view, ...(name === undefined ? {} : { name }) };
}

export function loadRoadmap(): { snapshot?: RoadmapSnapshot; warning?: string } {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return { warning: unavailable };
  }
  if (raw === null) return {};
  try {
    return { snapshot: deserializeRoadmap(raw) };
  } catch {
    return { warning: unreadable };
  }
}

export function saveRoadmap(snapshot: RoadmapSnapshot) {
  window.localStorage.setItem(storageKey, serializeRoadmap(snapshot));
}
