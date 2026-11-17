import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
after(() => vite.close());
const { serializeRoadmap, deserializeRoadmap } = await vite.ssrLoadModule('/src/persistence.ts');
const { readBackup, backupLimits } = await vite.ssrLoadModule('/src/backup.ts');
const { createExampleRoadmap } = await vite.ssrLoadModule('/src/exampleRoadmap.ts');
const { limits } = await vite.ssrLoadModule('/src/itemDraft.ts');
const { addDays, isWeekend, sizeDays } = await vite.ssrLoadModule('/src/calendar.ts');

const empty = { items: [], markers: [], includeWeekends: false, boardMode: 'Detailed', view: 'Timeline' };
const snapshot = {
  ...empty,
  items: [
    { id: 'first', content: 'Release', size: 'M', category: 'Now', order: 0,
      start: new Date(2026, 2, 28), end: new Date(2026, 3, 2), link: 'https://example.org/path' },
    { id: 'second', content: 'Plan', size: 'L', category: 'Now', order: 1, description: '', rationale: 'Why' },
  ],
  markers: [{ id: 'roadmap-marker-new-year', date: new Date(2027, 0, 1), name: 'New year', color: '#235da9' }],
  view: 'Board',
  name: 'Release roadmap',
  boardMode: 'Compact',
  includeWeekends: true,
};

test('the example roadmap round trips with its initial view, four colors, and one marker', async () => {
  const example = createExampleRoadmap(new Date(2027, 1, 28));
  assert.equal(example.name, 'Example roadmap - rename it here');
  assert.equal(example.view, 'Timeline');
  assert.ok(example.items.every(({ size }) => size === 'M'));
  assert.equal(example.items[3].content, '4. Drag to Timeline');
  assert.deepEqual(example.items.map(({ category, order, start }) => [category, order, Boolean(start)]),
    [['Now', 0, true], ['Now', 1, false], ['Next', 0, true], ['Later', 0, false]]);
  assert.equal(new Set(example.items.map(({ color }) => color)).size, 4);
  assert.deepEqual(example.markers.map(({ name }) => name), ['Milestone']);
  assert.ok(example.items[0].description.length <= limits.description);
  assert.ok(example.items[0].rationale.length <= limits.rationale);
  assert.deepEqual(await readBackup(new Blob([serializeRoadmap(example)])), example);
});

test('example bars and marker stay inside the initial local month', () => {
  for (const year of [2027, 2028]) {
    for (let month = 0; month < 12; month++) {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 1);
      for (const today of [start, new Date(year, month + 1, 0)]) {
        const { items, markers } = createExampleRoadmap(today);
        for (const { start: first, end: last } of [items[0], items[2]]) {
          assert.ok(first >= start && last < end && first < last);
          for (const date of [first, last]) assert.ok(date.getDay() >= 1 && date.getDay() <= 5);
          let workdays = 0;
          for (let date = first; date < last; date = addDays(date, 1)) {
            if (!isWeekend(date)) workdays++;
          }
          assert.equal(workdays, sizeDays.M);
        }
        assert.ok(markers[0].date >= start && markers[0].date < end);
      }
    }
  }
});

test('round trips calendar dates, IDs, ordering, settings, and absent optional fields', () => {
  const raw = serializeRoadmap(snapshot);
  const document = JSON.parse(raw);
  assert.equal(document.version, 1);
  assert.equal(document.items[0].start, '2026-03-28');
  assert.equal(document.items[0].end, '2026-04-02');
  assert.equal(document.markers[0].date, '2027-01-01');
  assert.deepEqual(deserializeRoadmap(raw), snapshot);
});

test('preserves intentionally empty arrays', () => {
  assert.deepEqual(deserializeRoadmap(serializeRoadmap(empty)), empty);
});

test('rejects invalid JSON, unsupported versions, and malformed records', () => {
  assert.throws(() => deserializeRoadmap('{'));
  for (const corrupt of [
    (document) => { document.version = 2; },
    (document) => { document.name = '   '; },
    (document) => { document.name = 'x'.repeat(81); },
    (document) => { document.items[1].id = document.items[0].id; },
    (document) => { document.items[1].order = 0; },
    (document) => { document.items[0].start = '2026-02-31'; },
    (document) => { delete document.items[0].end; },
    (document) => { document.items[0].link = 'example.org'; },
    (document) => { document.markers[0].date = null; },
  ]) {
    const document = JSON.parse(serializeRoadmap(snapshot));
    corrupt(document);
    assert.throws(() => deserializeRoadmap(JSON.stringify(document)));
  }
});

test('a full or intentionally empty backup restores from the exported bytes', async () => {
  const colored = { ...snapshot, items: snapshot.items.map(item => ({ ...item, color: '#dfcff3' })) };
  for (const state of [colored, empty]) {
    const file = new Blob([serializeRoadmap(state)], { type: 'application/json' });
    assert.deepEqual(await readBackup(file), state);
  }
});

test('rejects invalid backup files and checks size before reading', async () => {
  await assert.rejects(readBackup(new Blob(['{'])), /not valid JSON/);
  for (const damage of [
    (document) => { document.version = 2; },
    (document) => { document.items[0].start = '2026-02-31'; },
    (document) => { delete document.markers; },
  ]) {
    const document = JSON.parse(serializeRoadmap(snapshot));
    damage(document);
    await assert.rejects(readBackup(new Blob([JSON.stringify(document)])), /not a valid last_rm backup/);
  }
  let read = false;
  await assert.rejects(readBackup({
    size: backupLimits.bytes + 1,
    async text() { read = true; return ''; },
  }), /too large/);
  assert.equal(read, false);
  await assert.rejects(readBackup({
    size: 10,
    async text() { throw new Error(); },
  }), /could not be read/);
});

test('accepts a backup with exactly 1,000 items and 200 markers', async () => {
  const state = {
    ...empty,
    items: Array.from({ length: 1_000 }, (_, order) => ({
      id: `item-${order}`, content: 'Plan', category: 'Now', size: 'S', order,
    })),
    markers: Array.from({ length: 200 }, (_, index) => ({
      ...snapshot.markers[0], id: `roadmap-marker-${index}`,
    })),
  };
  assert.deepEqual(await readBackup(new Blob([serializeRoadmap(state)])), state);
});

test('rejects 1,001 items or 201 markers before validating any records', async () => {
  const saved = JSON.parse(serializeRoadmap(empty));
  await assert.rejects(readBackup(new Blob([JSON.stringify({
    ...saved, items: Array(1_001).fill(null),
  })])), /limit of 1,000 roadmap items/);
  await assert.rejects(readBackup(new Blob([JSON.stringify({
    ...saved, items: [null], markers: Array(201).fill(null),
  })])), /limit of 200 markers/);
});
