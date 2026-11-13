export const sizeDays = { S: 2, M: 5, L: 10 };

export type DateRange = { start: Date; end: Date };

export function startOfDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

export function addDays(date: Date, days: number) {
  const day = new Date(date);
  day.setDate(day.getDate() + days);
  return day;
}

export function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function nextCountedDay(date: Date, includeWeekends: boolean) {
  let day = date;
  while (!includeWeekends && isWeekend(day)) day = addDays(day, 1);
  return day;
}

function countedDays({ start, end }: DateRange, includeWeekends: boolean) {
  let count = 0;
  for (let day = start; day < end; day = addDays(day, 1)) {
    if (includeWeekends || !isWeekend(day)) count++;
  }
  return count;
}

export function scheduleRange(date: Date, duration: number, includeWeekends: boolean): DateRange {
  const start = nextCountedDay(startOfDay(date), includeWeekends);
  let end = start;
  for (let day = 0; day < duration; day++) {
    end = nextCountedDay(addDays(end, 1), includeWeekends);
  }
  return { start, end };
}

function nearestDay(date: Date) {
  const midnight = startOfDay(date);
  const tomorrow = addDays(midnight, 1);
  return date.getTime() - midnight.getTime() < tomorrow.getTime() - date.getTime()
    ? midnight
    : tomorrow;
}

export function editRange(original: DateRange, proposed: DateRange, includeWeekends: boolean): DateRange {
  const startChanged = +proposed.start !== +original.start;
  const endChanged = +proposed.end !== +original.end;

  if (startChanged && endChanged) {
    const duration = Math.max(1, countedDays(original, includeWeekends));
    return scheduleRange(nearestDay(proposed.start), duration, includeWeekends);
  }

  if (startChanged) {
    // The ready date stays fixed. Find the latest start with one counted day left.
    let latestStart = addDays(original.end, -1);
    while (!includeWeekends && isWeekend(latestStart)) latestStart = addDays(latestStart, -1);
    const start = nextCountedDay(nearestDay(proposed.start), includeWeekends);
    return { start: start > latestStart ? latestStart : start, end: original.end };
  }

  if (endChanged) {
    const earliestEnd = scheduleRange(original.start, 1, includeWeekends).end;
    const end = nextCountedDay(nearestDay(proposed.end), includeWeekends);
    return { start: original.start, end: end < earliestEnd ? earliestEnd : end };
  }

  return original;
}
