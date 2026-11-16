import { dateInput } from './calendar';
import { serializeRoadmap, validateRoadmap, type RoadmapSnapshot } from './persistence';

export const backupLimits = { bytes: 10 * 1024 * 1024, items: 1_000, markers: 200 };

export async function readBackup(file: Pick<Blob, 'size' | 'text'>): Promise<RoadmapSnapshot> {
  if (file.size > backupLimits.bytes) throw new Error('This file is too large. Choose a backup up to 10 MB.');
  let contents: string;
  try {
    contents = await file.text();
  } catch {
    throw new Error('The backup file could not be read. Choose the file again.');
  }
  let document: unknown;
  try {
    document = JSON.parse(contents);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (document && typeof document === 'object') {
    const { items, markers } = document as Record<string, unknown>;
    if (Array.isArray(items) && items.length > backupLimits.items) {
      throw new Error(`This backup exceeds the limit of ${backupLimits.items.toLocaleString('en-US')} roadmap items.`);
    }
    if (Array.isArray(markers) && markers.length > backupLimits.markers) {
      throw new Error(`This backup exceeds the limit of ${backupLimits.markers.toLocaleString('en-US')} markers.`);
    }
  }
  try {
    return validateRoadmap(document);
  } catch {
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
