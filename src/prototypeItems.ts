import { addDays, scheduleRange, sizeDays, type DateRange } from './calendar';

export const categories = ['Now', 'Next', 'Later'] as const;
type Category = (typeof categories)[number];
type Size = keyof typeof sizeDays;

export type RoadmapItem = Partial<DateRange> & {
  id: string;
  content: string;
  size: Size;
  category: Category;
};

type Fixture = [id: string, content: string, size: Size, schedule?: [offset: number, duration: number]];

const fixtures: Record<Category, Fixture[]> = {
  Now: [
    ['onboarding', 'Improve onboarding', 'S'],
    ['search', 'Add search filters', 'M'],
    ['signup', 'Simplify sign-up', 'M', [2, 4]],
    ['empty-states', 'Improve empty states', 'S', [6, 2]],
    ['search-speed', 'Speed up search', 'L', [8, 8]],
    ['welcome-email', 'Update welcome email', 'S'],
    ['mobile-nav', 'Fix mobile navigation', 'M'],
    ['accessibility', 'Improve keyboard access', 'M', [12, 5]],
  ],
  Next: [
    ['reporting', 'Update reporting', 'L'],
    ['billing', 'Simplify billing', 'S'],
    ['exports', 'Add report exports', 'M', [3, 3]],
    ['saved-filters', 'Add saved filters', 'M', [7, 5]],
    ['notifications', 'Add notification settings', 'L', [10, 7]],
    ['activity', 'Show recent activity', 'M'],
    ['invoice-history', 'Show invoice history', 'S'],
    ['dashboard', 'Refresh the dashboard', 'L', [12, 6]],
  ],
  Later: [
    ['roles', 'Add team roles', 'L', [4, 9]],
    ['templates', 'Add project templates', 'M', [7, 4]],
    ['audit-log', 'Add an audit log', 'L', [11, 8]],
    ['profile', 'Update profile settings', 'S', [14, 2]],
    ['bulk-actions', 'Add bulk actions', 'M'],
    ['integrations', 'Explore integrations', 'L'],
    ['preferences', 'Add display preferences', 'S'],
    ['feedback', 'Collect in-app feedback', 'M'],
  ],
};

export function createPrototypeItems(monthStart: Date): RoadmapItem[] {
  return categories.flatMap((category) =>
    fixtures[category].map(([id, content, size, schedule]) => ({
      id, content, size, category,
      ...(schedule && scheduleRange(addDays(monthStart, schedule[0]), schedule[1], false)),
    })),
  );
}
