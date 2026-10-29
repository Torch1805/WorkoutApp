import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeState, parseBackup, load, save, emptyState, MAX_IMPORT_BYTES } from '../store.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
};

test('save/load round-trips data', () => {
  const st = memoryStorage();
  const s = emptyState();
  s.settings.unit = 'lb';
  s.routines.push({ id: 'r1', name: 'Push', goal: 'strength', createdAt: 1,
    exercises: [{ exId: 'bench-press', sets: 4, repMin: 3, repMax: 6, rest: 180 }] });
  s.workouts.push({ id: 'w1', routineId: 'r1', name: 'Push', start: 10, end: 20,
    exercises: [{ exId: 'bench-press', repMin: 3, repMax: 6, rest: 180, sets: [{ w: 100, r: 5, done: true }] }] });
  assert.ok(save(s, st));
  assert.deepEqual(load(st), s);
});

test('load survives corrupted storage', () => {
  const st = memoryStorage();
  st.setItem('workoutapp.v1', '{not json');
  assert.deepEqual(load(st), emptyState());
});

test('parseBackup rejects non-backups and oversized files', () => {
  assert.throws(() => parseBackup('hello'), /not a valid backup/);
  assert.throws(() => parseBackup('[]'), /not a valid backup/);
  assert.throws(() => parseBackup('{"version":2,"routines":[],"workouts":[]}'), /not a valid backup/);
  assert.throws(() => parseBackup(' '.repeat(MAX_IMPORT_BYTES + 1)), /too large/);
});

test('sanitizeState strips unknown fields, bad exercises and bad values', () => {
  const evil = JSON.parse(`{
    "version": 1,
    "settings": { "unit": "<img src=x onerror=alert(1)>", "__proto__": { "polluted": true } },
    "__proto__": { "polluted": true },
    "routines": [
      { "id": "../../etc", "name": "<script>alert(1)</script>${'x'.repeat(500)}", "goal": "constructor",
        "extra": "drop me",
        "exercises": [
          { "exId": "bench-press", "sets": 1e9, "repMin": -5, "repMax": "12", "rest": 99999, "onclick": "x" },
          { "exId": "__proto__", "sets": 3 },
          { "exId": "toString", "sets": 3 },
          "garbage"
        ] },
      null, 42
    ],
    "workouts": [
      { "id": "ok-id", "start": "yesterday", "exercises": [] },
      { "id": "w2", "start": 1000, "end": 2000, "name": 7,
        "exercises": [{ "exId": "deadlift", "repMin": 5, "repMax": 5, "rest": 120,
          "sets": [{ "w": "NaN", "r": 5.6, "done": "true" }, { "w": 1e300, "r": 5, "done": true }] }] }
    ],
    "active": "nope"
  }`);
  const s = sanitizeState(evil);

  assert.equal(({}).polluted, undefined, 'no prototype pollution');
  assert.equal(s.settings.unit, 'kg');
  assert.equal(s.active, null);

  assert.equal(s.routines.length, 1);
  const r = s.routines[0];
  assert.deepEqual(Object.keys(r).sort(), ['createdAt', 'exercises', 'goal', 'id', 'name']);
  assert.notEqual(r.id, '../../etc');
  assert.equal(r.name.length, 60, 'name is length-capped (rendered as text, never HTML)');
  assert.equal(r.goal, 'hypertrophy');
  assert.deepEqual(r.exercises, [{ exId: 'bench-press', sets: 20, repMin: 1, repMax: 12, rest: 600 }]);

  assert.equal(s.workouts.length, 1, 'workout without a valid start time is dropped');
  const w = s.workouts[0];
  assert.equal(w.name, 'Workout');
  assert.deepEqual(w.exercises[0].sets, [{ w: null, r: 6, done: false }, { w: 2000, r: 5, done: true }]);
});

test('sanitizeState caps list sizes', () => {
  const routines = Array.from({ length: 1000 }, (_, i) => ({ id: 'r' + i, name: 'R', exercises: [] }));
  assert.equal(sanitizeState({ routines }).routines.length, 200);
});
