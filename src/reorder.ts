import { categories, type Category, type RoadmapItem } from './prototypeItems';

export type Destination = {
  category: Category;
  index: number;
};

export function reorderItem(items: RoadmapItem[], id: string, destination: Destination) {
  const source = items.find((item) => item.id === id);
  if (!source) return items;

  return categories.flatMap((category) => {
    const members = items.filter((item) => item.id !== id && item.category === category);
    members.sort((a, b) => a.order - b.order);
    if (destination.category === category) members.splice(destination.index, 0, source);
    return members.map((item, order) =>
      item.order === order && item.category === category ? item : { ...item, category, order },
    );
  });
}

export type Insertion = Destination & { top: number; headerHeight?: number; rowId?: string; before?: boolean };

export function findInsertion(host: HTMLElement, items: RoadmapItem[], id: string, x: number, y: number, previous?: Insertion | null): Insertion | null {
  const frame = host.getBoundingClientRect();
  const panel = host.querySelector('.vis-panel.vis-center')?.getBoundingClientRect();
  if (!panel || x < frame.left || x >= frame.right || y < panel.top || y >= panel.bottom) return null;

  const label = Array.from(host.querySelectorAll('.vis-labelset .vis-label')).find((row) => {
    const rect = row.getBoundingClientRect();
    return y >= rect.top && y < rect.bottom;
  });
  if (!label) return null;

  const bounds = label.getBoundingClientRect();
  const header = label.querySelector<HTMLButtonElement>('.roadmap-category');
  if (header) {
    const category = categories.find((value) => header.dataset.category === `category-${value}`);
    if (!category) return null;
    const end = items.filter((item) => item.category === category && item.id !== id).length;
    const collapsed = header.getAttribute('aria-expanded') === 'false';
    const index = collapsed ? end : 0;
    const source = items.find((item) => item.id === id);
    if (source?.category === category && source.order === index) return null;
    const top = Math.max(bounds.top, panel.top);
    const bottom = Math.min(bounds.bottom, panel.bottom);
    return collapsed
      ? { category, index, top, headerHeight: bottom - top }
      : { category, index, top: bottom };
  }

  const rowId = label.querySelector<HTMLElement>('.roadmap-label')?.dataset.itemId;
  const target = items.find((item) => item.id === rowId);
  if (!target || target.id === id) return null;
  const midpoint = bounds.top + bounds.height / 2;
  const before = previous && previous.rowId === rowId && Math.abs(y - midpoint) <= 3
    ? Boolean(previous.before)
    : y < midpoint;

  const source = items.find((item) => item.id === id);
  const index = target.order + Number(!before)
    - Number(source?.category === target.category && source.order < target.order);
  if (source?.category === target.category && source.order === index) return null;
  const top = before ? bounds.top : bounds.bottom;
  return { category: target.category, index, rowId, before, top: Math.max(panel.top, Math.min(top, panel.bottom)) };
}
