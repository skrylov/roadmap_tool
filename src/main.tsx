import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Marker } from './MarkerEditor';
import { ItemEditor } from './ItemEditor';
import { makeDraft, type ItemDraft, type ItemValues } from './itemDraft';
import type { RoadmapItem } from './prototypeItems';
import { Board, type BoardMode } from './Board';
import { RoadmapTimeline } from './RoadmapTimeline';
import { createExampleRoadmap } from './exampleRoadmap';
import { reorderItem } from './reorder';
import { defaultRoadmapName, loadRoadmap, roadmapNameLimit, saveRoadmap, writeWarning, type RoadmapSnapshot } from './persistence';
import { downloadBackup } from './backup';
import { RestoreBackupDialog } from './RestoreBackupDialog';
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
    const initial: RoadmapSnapshot = snapshot ?? (warning ? {
      items: [],
      markers: [], includeWeekends: false, boardMode: 'Detailed', view: 'Timeline',
    } : createExampleRoadmap(new Date()));
    return { initial, snapshot, warning };
  });
  const [view, setView] = useState(startup.initial.view);
  const [roadmapName, setRoadmapName] = useState(startup.initial.name ?? defaultRoadmapName);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const [boardMode, setBoardMode] = useState<BoardMode>(startup.initial.boardMode);
  const [items, setItems] = useState(startup.initial.items);
  const [markers, setMarkers] = useState<Marker[]>(startup.initial.markers);
  const [includeWeekends, setIncludeWeekends] = useState(startup.initial.includeWeekends);
  const [storageWarning, setStorageWarning] = useState(startup.warning);
  const lastSaved = useRef(startup.snapshot);
  const moreOptions = useRef<HTMLDetailsElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [backupFile, setBackupFile] = useState<File>();
  const [backupStatus, setBackupStatus] = useState('');
  const [timelineRevision, setTimelineRevision] = useState(0);

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      const menu = moreOptions.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, []);

  useEffect(() => {
    const previous = lastSaved.current;
    if (!previous && startup.warning) return;
    if (previous?.items === items && previous.markers === markers && previous.includeWeekends === includeWeekends &&
      previous.boardMode === boardMode && previous.view === view && (previous.name ?? defaultRoadmapName) === roadmapName) return;

    const snapshot = { name: roadmapName, items, markers, includeWeekends, boardMode, view };
    try {
      saveRoadmap(snapshot);
      lastSaved.current = snapshot;
      setStorageWarning(undefined);
    } catch {
      setStorageWarning(writeWarning);
    }
  }, [items, markers, includeWeekends, boardMode, view, roadmapName, startup.warning]);

  function finishRename(saveName: boolean, restoreFocus = false) {
    const name = nameDraft?.trim();
    if (saveName && name) setRoadmapName(name);
    setNameDraft(null);
    if (restoreFocus) requestAnimationFrame(() => renameButton.current?.focus());
  }

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

  function closeMoreOptions() {
    if (!moreOptions.current) return;
    moreOptions.current.open = false;
    moreOptions.current.querySelector('summary')?.focus();
  }

  function exportBackup() {
    downloadBackup({ name: roadmapName, items, markers, includeWeekends, boardMode, view });
  }

  function closeRestore() {
    setBackupFile(undefined);
    requestAnimationFrame(closeMoreOptions);
  }

  function restoreBackup(snapshot: RoadmapSnapshot) {
    try {
      saveRoadmap(snapshot);
    } catch {
      return false;
    }
    lastSaved.current = snapshot;
    setRoadmapName(snapshot.name ?? defaultRoadmapName);
    setItems(snapshot.items);
    setMarkers(snapshot.markers);
    setIncludeWeekends(snapshot.includeWeekends);
    setBoardMode(snapshot.boardMode);
    setView(snapshot.view);
    setNameDraft(null);
    setConfirmation(null);
    setEditor(null);
    // Drop any transient Timeline state associated with the previous roadmap.
    setTimelineRevision((revision) => revision + 1);
    setStorageWarning(undefined);
    setBackupStatus('Backup restored.');
    closeRestore();
    return true;
  }

  return (
    <main className="roadmap-app" data-view={view}>
      <header className="app-header">
        <div className="app-identity">
          <span className="app-brand">last_rm</span>
          <span className="app-breadcrumb-divider" aria-hidden="true">/</span>
          <h1 className="roadmap-name">
            {nameDraft === null ? (
              <button ref={renameButton} type="button" title={roadmapName} aria-label={`Rename roadmap: ${roadmapName}`}
                onClick={() => setNameDraft(roadmapName)}>{roadmapName}</button>
            ) : (
              <input aria-label="Roadmap name" value={nameDraft} maxLength={roadmapNameLimit}
                autoFocus onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setNameDraft(event.currentTarget.value)}
                onBlur={() => finishRename(true)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
                  event.preventDefault();
                  event.stopPropagation();
                  finishRename(event.key === 'Enter', true);
                }} />
            )}
          </h1>
        </div>
        <details ref={moreOptions} className="workspace-disclosure" onKeyDown={(event) => {
          if (event.key !== 'Escape' || !event.currentTarget.open) return;
          event.preventDefault();
          closeMoreOptions();
        }}>
          <summary className="header-more-options" aria-label="More options" title="More options">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="3" cy="8" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="13" cy="8" r="1.3" />
            </svg>
          </summary>
          <div className="workspace-popover">
            <button className="workspace-menu-toggle" type="button" aria-pressed={includeWeekends}
              onClick={() => setIncludeWeekends((enabled) => !enabled)}>
              Count weekends toward duration
              {includeWeekends && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              )}
            </button>
            <button className="workspace-menu-toggle" type="button" onClick={() => {
              closeMoreOptions();
              exportBackup();
            }}>Export backup</button>
            <button className="workspace-menu-toggle" type="button" onClick={() => {
              closeMoreOptions();
              backupInput.current?.click();
            }}>Restore backup</button>
          </div>
        </details>
        <button className="button-primary header-add-item" type="button" onClick={() => request({ action: 'open' })}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 8h10M8 3v10" />
          </svg>
          Add item
        </button>
      </header>
      <input type="file" ref={backupInput} accept=".json,application/json" hidden onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) {
          setBackupStatus('');
          setBackupFile(file);
        }
      }} />
      <div className="backup-status" role="status">{backupStatus}</div>
      {storageWarning && <p className="editor-error" role="alert">{storageWarning}</p>}
      <div className="view-tabs" role="group" aria-label="Roadmap view">
        {(['Timeline', 'Board'] as const).map((name) => (
          <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>{name}</button>
        ))}
      </div>
      <RoadmapTimeline key={timelineRevision} active={view === 'Timeline'} roadmapItems={items}
        setRoadmapItems={setItems} includeWeekends={includeWeekends} onEdit={editItem} selectedItemId={selectedItemId}
        markers={markers} onSaveMarker={(marker) => setMarkers((current) => current.some(({ id }) => id === marker.id)
          ? current.map((entry) => entry.id === marker.id ? marker : entry) : [...current, marker])}
        onDeleteMarker={(id) => setMarkers((current) => current.filter((marker) => marker.id !== id))} />
      {view === 'Board' && (
        <div className="board-view">
          <Board mode={boardMode} onModeChange={setBoardMode} items={items} onEdit={editItem} selectedItemId={selectedItemId} onReorder={(id, destination) => setItems((current) => reorderItem(current, id, destination))} />
        </div>
      )}
      <footer className="app-footer">
        <span>© 2026 Sergey Krylov</span>
        <a href="https://github.com/skrylov/roadmap_tool" aria-label="Roadmap Tool on GitHub">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.39v-1.49c-2.23.48-2.7-.95-2.7-.95-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.82 1.23.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.65-.89-3.65-3.96 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.22 2.2.82A7.7 7.7 0 0 1 8 3.82c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.82 1.28.82 2.15 0 3.08-1.88 3.75-3.67 3.95.29.25.54.74.54 1.49v2.21c0 .22.15.47.55.39A8 8 0 0 0 8 0Z" />
          </svg>
          GitHub
        </a>
      </footer>
      {backupFile && <RestoreBackupDialog file={backupFile} onCancel={closeRestore}
        onExport={exportBackup} onRestore={restoreBackup} />}
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
