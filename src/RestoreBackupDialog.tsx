import { useEffect, useRef, useState } from 'react';
import { readBackup } from './backup';
import { defaultRoadmapName, type RoadmapSnapshot } from './persistence';

export function RestoreBackupDialog({ file, onCancel, onExport, onRestore }: {
  file: File;
  onCancel: () => void;
  onExport: () => void;
  onRestore: (snapshot: RoadmapSnapshot) => boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [backup, setBackup] = useState<RoadmapSnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    let cancelled = false;
    void readBackup(file).then(
      (validated) => { if (!cancelled) setBackup(validated); },
      (failure: Error) => { if (!cancelled) setError(failure.message); },
    );
    return () => {
      cancelled = true;
      node?.close();
    };
  }, [file]);

  return (
    <dialog ref={dialog} className="backup-dialog" aria-labelledby="restore-backup-title"
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id="restore-backup-title">Restore backup</h2>
      {backup && <>
        <p><strong>{backup.name ?? defaultRoadmapName}</strong></p>
        <p>{backup.items.length} {backup.items.length === 1 ? 'item' : 'items'} · {backup.markers.length} {backup.markers.length === 1 ? 'marker' : 'markers'}</p>
        <p>Restoring will replace your current roadmap. You can export it first to keep a copy.</p>
      </>}
      {!backup && !error && <p role="status">Checking backup…</p>}
      {error && <p className="editor-error" role="alert">{error}</p>}
      <div className="backup-dialog-actions">
        <button type="button" autoFocus onClick={onCancel}>{backup ? 'Cancel' : 'Close'}</button>
        {backup && <>
          <button type="button" onClick={onExport}>Export current roadmap</button>
          <button className="button-primary" type="button" onClick={() => {
            if (!onRestore(backup)) setError('Could not save the backup to browser storage. Your current roadmap was kept.');
          }}>Replace roadmap</button>
        </>}
      </div>
    </dialog>
  );
}
