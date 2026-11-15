import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Marker } from './MarkerEditor';
import { ItemEditor } from './ItemEditor';
import { makeDraft, type ItemDraft, type ItemValues } from './itemDraft';
import type { RoadmapItem } from './prototypeItems';
import { Board, type BoardMode } from './Board';
import { RoadmapTimeline } from './RoadmapTimeline';
import { windowFor } from './calendarViews';
import { createPrototypeItems } from './prototypeItems';
import { reorderItem } from './reorder';
import { loadRoadmap, saveRoadmap, writeWarning, type RoadmapSnapshot } from './persistence';
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
  const [startup] = useState(() => {
    const { snapshot, warning } = loadRoadmap();
    const initial: RoadmapSnapshot = snapshot ?? {
      items: createPrototypeItems(windowFor('Month', new Date()).start),
      markers: [], includeWeekends: false, boardMode: 'Detailed', view: 'Timeline',
    };
    return { initial, warning };
  });
  const [view, setView] = useState(startup.initial.view);
  const [boardMode, setBoardMode] = useState<BoardMode>(startup.initial.boardMode);
  const [items, setItems] = useState(startup.initial.items);
  const [markers, setMarkers] = useState<Marker[]>(startup.initial.markers);
  const [includeWeekends, setIncludeWeekends] = useState(startup.initial.includeWeekends);
  const [storageWarning, setStorageWarning] = useState(startup.warning);
  const lastSaved = useRef(startup.initial);

  useEffect(() => {
    if (startup.warning) return;
    const previous = lastSaved.current;
    if (previous.items === items && previous.markers === markers && previous.includeWeekends === includeWeekends &&
      previous.boardMode === boardMode && previous.view === view) return;

    const snapshot = { items, markers, includeWeekends, boardMode, view };
    try {
      saveRoadmap(snapshot);
      lastSaved.current = snapshot;
      setStorageWarning(undefined);
    } catch {
      setStorageWarning(writeWarning);
    }
  }, [startup.warning, items, markers, includeWeekends, boardMode, view]);

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
      <header className="app-header">
        <div className="app-identity">
          <span className="app-brand">last_rm</span>
          <span className="app-breadcrumb-divider" aria-hidden="true">/</span>
          <h1>Roadmap</h1>
        </div>
        <details className="workspace-disclosure" onKeyDown={(event) => {
          if (event.key !== 'Escape' || !event.currentTarget.open) return;
          event.preventDefault();
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }}>
          <summary className="header-more-options" aria-label="More options" title="More options">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="8" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="13" cy="8" r="1.3" />
            </svg>
          </summary>
          <div className="workspace-popover">
            <label>
              <input type="checkbox" checked={includeWeekends} onChange={(event) => setIncludeWeekends(event.target.checked)} />
              Count weekends toward duration
            </label>
          </div>
        </details>
        <button className="button-primary header-add-item" type="button" onClick={() => request({ action: 'open' })}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 8h10M8 3v10" />
          </svg>
          Add item
        </button>
      </header>
      {storageWarning && <p className="editor-error" role="alert">{storageWarning}</p>}
      <div className="view-tabs" role="group" aria-label="Roadmap view">
        {(['Timeline', 'Board'] as const).map((name) => (
          <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>
        ))}
      </div>
      <RoadmapTimeline active={view === 'Timeline'} roadmapItems={items}
        setRoadmapItems={setItems} includeWeekends={includeWeekends} onEdit={editItem} selectedItemId={selectedItemId}
        markers={markers} onSaveMarker={(marker) => setMarkers((current) => current.some(({ id }) => id === marker.id)
          ? current.map((entry) => entry.id === marker.id ? marker : entry) : [...current, marker])}
        onDeleteMarker={(id) => setMarkers((current) => current.filter((marker) => marker.id !== id))} />
      {view === 'Board' && (
        <Board mode={boardMode} onModeChange={setBoardMode} items={items} onEdit={editItem} selectedItemId={selectedItemId} onReorder={(id, destination) => setItems((current) => reorderItem(current, id, destination))} />
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
