import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ItemEditor } from './ItemEditor';
import { makeDraft, type ItemDraft, type ItemValues } from './itemDraft';
import type { RoadmapItem } from './prototypeItems';
import { Board } from './Board';
import { RoadmapTimeline } from './RoadmapTimeline';
import { windowFor } from './calendarViews';
import { createPrototypeItems } from './prototypeItems';
import { reorderItem } from './reorder';
import './style.css';

type Editor = { id?: string; draft: ItemDraft; original: ItemDraft; another: boolean; session: number };
type Request = { action: 'close' | 'delete' } | { action: 'open'; id?: string };

function normalizeOrder(items: RoadmapItem[]) {
  const counts = { Now: 0, Next: 0, Later: 0 };
  return items.map((item) => {
    const order = counts[item.category]++;
    return item.order === order ? item : { ...item, order };
  });
}

function App() {
  const [view, setView] = useState<'Board' | 'Timeline'>('Timeline');
  const [items, setItems] = useState(() => createPrototypeItems(windowFor('Month', new Date()).start));
  const [includeWeekends, setIncludeWeekends] = useState(false);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Request | null>(null);

  function open(id?: string) {
    const item = items.find((entry) => entry.id === id);
    if (id && !item) return;
    const draft = makeDraft(item);
    setEditor((current) => ({ id, draft, original: draft, another: false, session: (current?.session ?? 0) + 1 }));
  }

  function apply(request: Request) {
    if (request.action === 'open') open(request.id);
    else {
      if (request.action === 'delete') {
        setItems((current) => normalizeOrder(current.filter((item) => item.id !== editor?.id)));
      }
      setEditor(null);
    }
  }

  function request(action: Request) {
    if (action.action === 'open' && editor && action.id === editor.id) return;
    if (action.action === 'delete' || (editor && JSON.stringify(editor.draft) !== JSON.stringify(editor.original))) {
      setConfirmation(action);
    } else {
      apply(action);
    }
  }

  useEffect(() => {
    if (!editor || confirmation) return;
    function escape(event: KeyboardEvent) {
      // Drag handlers use Escape too. Let them finish their gesture first.
      if (event.key === 'Escape' && !event.defaultPrevented &&
        !document.querySelector('[data-dragging], .roadmap-drag-ghost, .roadmap-body-dragging')) {
        event.preventDefault();
        request({ action: 'close' });
      }
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  });

  function save(values: ItemValues) {
    if (!editor) return;
    const id = editor.id ?? crypto.randomUUID();
    setItems((current) => {
      const previous = current.find((item) => item.id === id);
      const updated = { ...previous, ...values, id, order: previous?.order ?? 0 };
      const sameCategory = previous?.category === values.category;
      return normalizeOrder(sameCategory
        ? current.map((item) => item.id === id ? updated : item)
        : [...current.filter((item) => item.id !== id), updated]);
    });
    if (editor.id || !editor.another) setEditor(null);
    else {
      const draft = makeDraft(undefined, values.category);
      setEditor({ ...editor, draft, original: draft, session: editor.session + 1 });
    }
  }

  const selectedItemId = editor?.id;
  const editItem = (id: string) => request({ action: 'open', id });

  return (
    <main>
      <h1>Roadmap Tool</h1>
      <div role="group" aria-label="Roadmap view">
        {(['Board', 'Timeline'] as const).map((name) => (
          <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>
        ))}
      </div>
      <button type="button" onClick={() => request({ action: 'open' })}>Add item</button>
      <label>
        <input type="checkbox" checked={includeWeekends} onChange={(event) => setIncludeWeekends(event.target.checked)} />
        Count weekends toward duration
      </label>
      <RoadmapTimeline active={view === 'Timeline'} roadmapItems={items}
        setRoadmapItems={setItems} includeWeekends={includeWeekends} onEdit={editItem} selectedItemId={selectedItemId} />
      {view === 'Board' && (
        <Board items={items} onEdit={editItem} selectedItemId={selectedItemId} onReorder={(id, destination) => setItems((current) => reorderItem(current, id, destination))} />
      )}
      {editor && (
        <ItemEditor draft={editor.draft} session={editor.session} editing={Boolean(editor.id)}
          another={editor.another} includeWeekends={includeWeekends}
          onChange={(draft) => setEditor({ ...editor, draft })}
          onAnother={(another) => setEditor({ ...editor, another })}
          onSave={save} onCancel={() => request({ action: 'close' })}
          onDelete={() => request({ action: 'delete' })}
          confirmation={confirmation ? (confirmation.action === 'delete' ? 'delete' : 'discard') : null}
          onConfirm={() => {
            if (confirmation) apply(confirmation);
            setConfirmation(null);
          }}
          onKeepEditing={() => setConfirmation(null)} />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
