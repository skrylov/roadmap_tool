import { dateInput, scheduleEndingOn, scheduleRange, sizeDays } from './calendar';
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

export function makeDraft(item?: RoadmapItem, category: Category = 'Now'): ItemDraft {
  return {
    content: item?.content ?? '', description: item?.description ?? '', rationale: item?.rationale ?? '',
    category: item?.category ?? category, size: item?.size ?? 'M', color: item?.color ?? defaultColor,
    link: item?.link ?? '', start: dateInput(item?.start), end: dateInput(item?.end),
  };
}

export function normalizeLink(input: string) {
  const link = input.trim();
  if (!link) return '';
  if (/[\s\\\u0000-\u001f\u007f]/u.test(link)) throw new Error('Invalid URL characters');

  const explicit = /^https?:\/\/[^/?#]/i.test(link);
  const url = new URL(explicit ? link : `https://${link}`);
  if (!explicit) {
    // A bare link must start with a domain, with an optional port.
    const authority = link.split(/[/?#]/, 1)[0];
    const domain = url.hostname.replace(/\.$/, '');
    const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    if (!/^[^:@]+(?::\d+)?$/.test(authority) || !domain.includes('.') ||
      !domain.split('.').every((part) => label.test(part))) {
      throw new Error('Invalid bare domain');
    }
  }
  return explicit ? link : `https://${link}`;
}

export function validateDraft(draft: ItemDraft, includeWeekends: boolean) {
  const errors: DraftErrors = {};
  for (const field of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = field === 'link' ? draft.link.trim() : draft[field];
    if (value.length > limits[field]) errors[field] = `Use ${limits[field].toLocaleString()} characters or fewer.`;
  }
  if (!draft.content.trim()) errors.content = 'Enter a title.';
  let link = '';
  if (!errors.link) {
    try {
      link = normalizeLink(draft.link);
      if (link.length > limits.link) errors.link = `Use ${limits.link.toLocaleString()} characters or fewer.`;
    } catch {
      errors.link = 'Enter a valid domain or an http:// or https:// URL.';
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
