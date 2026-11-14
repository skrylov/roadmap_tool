import { scheduleEndingOn, scheduleRange, sizeDays } from './calendar';
import type { Category, RoadmapItem } from './prototypeItems';

export const defaultColor = '#d5ddf6';
export const itemColors = [defaultColor, '#c1e8d1', '#ffe1ab', '#fac6cb', '#dfcff3'];
export const limits = { content: 120, description: 600, rationale: 600, link: 2048 };

export type ItemDraft = {
  content: string;
  description: string;
  rationale: string;
  category: Category;
  size: RoadmapItem['size'];
  color: string;
  link: string;
  start: string;
  end: string;
};
export type DraftErrors = Partial<Record<keyof typeof limits | 'schedule', string>>;
export type ItemValues = Omit<RoadmapItem, 'id' | 'order'>;

function dateInput(date?: Date) {
  if (!date) return '';
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

export function makeDraft(item?: RoadmapItem, category: Category = 'Now'): ItemDraft {
  return {
    content: item?.content ?? '', description: item?.description ?? '', rationale: item?.rationale ?? '',
    category: item?.category ?? category, size: item?.size ?? 'M', color: item?.color ?? defaultColor,
    link: item?.link ?? '', start: dateInput(item?.start), end: dateInput(item?.end),
  };
}

export function validateDraft(draft: ItemDraft, includeWeekends: boolean) {
  const errors: DraftErrors = {};
  for (const field of Object.keys(limits) as (keyof typeof limits)[]) {
    if (draft[field].length > limits[field]) errors[field] = `Use ${limits[field].toLocaleString()} characters or fewer.`;
  }
  if (!draft.content.trim()) errors.content = 'Enter a title.';
  const link = draft.link.trim();
  if (link && !errors.link) {
    try {
      const url = new URL(link);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      errors.link = 'Enter a full http:// or https:// URL.';
    }
  }

  let start = draft.start ? new Date(`${draft.start}T00:00:00`) : undefined;
  let end = draft.end ? new Date(`${draft.end}T00:00:00`) : undefined;
  if ((start && !Number.isFinite(+start)) || (end && !Number.isFinite(+end))) {
    errors.schedule = 'Enter valid dates.';
  } else if (start && end) {
    if (end <= start) errors.schedule = 'Ready must be after Start.';
  } else if (start) {
    ({ start, end } = scheduleRange(start, sizeDays[draft.size], includeWeekends));
  } else if (end) {
    ({ start, end } = scheduleEndingOn(end, sizeDays[draft.size], includeWeekends));
  }

  const values: ItemValues = { ...draft, content: draft.content.trim(), link, start, end };
  return { errors, values };
}
