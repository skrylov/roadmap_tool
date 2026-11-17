import type { DateRange, sizeDays } from './calendar';

export const categories = ['Now', 'Next', 'Later'] as const;
export type Category = (typeof categories)[number];
type Size = keyof typeof sizeDays;

export type RoadmapItem = Partial<DateRange> & {
  id: string;
  content: string;
  size: Size;
  category: Category;
  order: number;
  description?: string;
  rationale?: string;
  color?: string;
  link?: string;
};
