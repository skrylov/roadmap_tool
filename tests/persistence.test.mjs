import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
after(() => vite.close());
const { serializeRoadmap, deserializeRoadmap } = await vite.ssrLoadModule('/src/persistence.ts');

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
