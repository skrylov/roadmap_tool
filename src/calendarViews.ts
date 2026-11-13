import type { TimelineOptions } from 'vis-timeline';
import { addDays, startOfDay } from './calendar';

export const calendarViews = ['Year', 'Quarter', 'Month', 'Week'] as const;
export type CalendarView = (typeof calendarViews)[number];

const dayMs = 24 * 60 * 60 * 1000;
// Allow a full leap year and a week shortened by a daylight-saving change.
export const zoomMin = 6 * dayMs + 22 * 60 * 60 * 1000;
export const zoomMax = 367 * dayMs;

export function windowFor(view: CalendarView, date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (view === 'Year') return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
  if (view === 'Quarter') {
    const firstMonth = month - month % 3;
    return { start: new Date(year, firstMonth, 1), end: new Date(year, firstMonth + 3, 1) };
  }
  if (view === 'Month') return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };

  const start = addDays(startOfDay(date), -((date.getDay() + 6) % 7));
  return { start, end: addDays(start, 7) };
}

export function axisFor(view: CalendarView): TimelineOptions {
  const monthly = view === 'Year' || view === 'Quarter';
  return {
    timeAxis: { scale: monthly ? 'month' : 'day', step: view === 'Year' ? 3 : 1 },
    format: {
      minorLabels: { month: view === 'Year' ? '[Q]Q' : 'MMM', day: view === 'Week' ? 'ddd D' : 'D' },
      majorLabels: { month: 'YYYY', day: 'MMMM YYYY' },
    },
  };
}

export function axisForSpan(span: number): CalendarView {
  if (span > 150 * dayMs) return 'Year';
  if (span > 48 * dayMs) return 'Quarter';
  if (span > 12 * dayMs) return 'Month';
  return 'Week';
}
