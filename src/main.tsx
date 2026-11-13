import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Board } from './Board';
import { RoadmapTimeline } from './RoadmapTimeline';
import { windowFor } from './calendarViews';
import { createPrototypeItems } from './prototypeItems';
import { reorderItem } from './reorder';
import './style.css';

function App() {
  const [view, setView] = useState<'Board' | 'Timeline'>('Timeline');
  const [items, setItems] = useState(() => createPrototypeItems(windowFor('Month', new Date()).start));
  const [includeWeekends, setIncludeWeekends] = useState(false);

  return (
    <main>
      <h1>Roadmap Tool</h1>
      <div role="group" aria-label="Roadmap view">
        {(['Board', 'Timeline'] as const).map((name) => (
          <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>
        ))}
      </div>
      <label>
        <input type="checkbox" checked={includeWeekends} onChange={(event) => setIncludeWeekends(event.target.checked)} />
        Count weekends toward duration
      </label>
      <RoadmapTimeline active={view === 'Timeline'} roadmapItems={items}
        setRoadmapItems={setItems} includeWeekends={includeWeekends} />
      {view === 'Board' && (
        <Board items={items} onReorder={(id, destination) => setItems((current) => reorderItem(current, id, destination))} />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
