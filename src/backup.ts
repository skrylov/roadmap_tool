import { dateInput } from './calendar';
import { deserializeRoadmap, serializeRoadmap, type RoadmapSnapshot } from './persistence';

export const maxBackupBytes = 10 * 1024 * 1024;

export async function readBackup(file: Pick<Blob, 'size' | 'text'>): Promise<RoadmapSnapshot> {
  if (file.size > maxBackupBytes) throw new Error('This file is too large. Choose a backup up to 10 MB.');
  let contents: string;
  try {
    contents = await file.text();
  } catch {
    throw new Error('The backup file could not be read. Choose the file again.');
  }
  try {
    return deserializeRoadmap(contents);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('This file is not valid JSON.');
    throw new Error('This file is not a valid last_rm backup or uses an unsupported version.');
  }
}

export function downloadBackup(snapshot: RoadmapSnapshot) {
  const url = URL.createObjectURL(new Blob([serializeRoadmap(snapshot)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `last_rm-backup-${dateInput(new Date())}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
