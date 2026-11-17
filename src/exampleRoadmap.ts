import { addDays, scheduleRange, sizeDays } from './calendar';
import { windowFor } from './calendarViews';
import { defaultColor, itemColors } from './itemDraft';
import { markerColors } from './MarkerEditor';
import type { RoadmapSnapshot } from './persistence';

export function createExampleRoadmap(today: Date): RoadmapSnapshot {
  const { start: monthStart } = windowFor('Month', today);
  // Keep the example near today while leaving room for both bars in the current month.
  const firstDay = addDays(monthStart, Math.min(12, Math.max(5, today.getDate())) - 1);
  const [, green, yellow, , purple] = itemColors;

  return {
    name: 'Example roadmap - rename it here',
    view: 'Timeline',
    boardMode: 'Detailed',
    includeWeekends: false,
    items: [
      {
        id: 'example-readme', content: '1. Hi. READ.ME first', category: 'Now', order: 0, size: 'M', color: purple,
        ...scheduleRange(firstDay, sizeDays.M, false),
        description: "Last Roadmap is a small, local tool for quickly putting together and visualizing product roadmaps. A simple Now / Next / Later board and a Timeline. Minimal and simple.\n\n"
          + "No accounts, no backend, no setup. Your roadmap is stored in your browser and survives a page refresh. It won't survive clearing site data, though. That's why you can export a JSON backup using the three-dot menu and restore it whenever you need to, including in another browser.\n\n"
          + "Your roadmap data stays in your browser. No accounts, cookies or app analytics. You can inspect the code on GitHub.",
        rationale: "Two reasons.\n\n"
          + "1. The more complex a roadmap is, the less likely it is to survive reality. Hence Now / Next / Later and a simple Timeline.\n"
          + "2. Throughout my PM career, I've struggled to find a tool I could just open and start using without introducing it to the entire company, setting things up, or reading instructions.\n\n"
          + "So I made one. And the best price is free, right?\n\nHope you enjoy.",
      },
      {
        id: 'example-reorder', content: '2. Drag to reorder', category: 'Now', order: 1, size: 'M', color: defaultColor,
        description: 'Drag this item up or down, or move it between Now, Next and Later. Works in both Board and Timeline.',
      },
      {
        id: 'example-move', content: '3. ← Try dragging →', category: 'Next', order: 0, size: 'M', color: green,
        ...scheduleRange(addDays(firstDay, 7), sizeDays.M, false),
        description: 'This item is already scheduled. Drag its bar left or right to move it, or grab either edge to change its duration.',
      },
      {
        id: 'example-schedule', content: '4. Drag to Timeline', category: 'Later', order: 0, size: 'M', color: yellow,
        description: "Drag this item from the left-hand list onto its row. That's how you schedule an item without opening the editor.",
      },
    ],
    markers: [{ id: 'roadmap-marker-example', name: 'Milestone', date: addDays(monthStart, 15), color: markerColors[0].value }],
  };
}
