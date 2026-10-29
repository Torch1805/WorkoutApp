import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeState, parseBackup, load, save, emptyState, MAX_IMPORT_BYTES, parseHeartRate, compactHeartRate, MAX_HR_TEXT } from '../store.js';

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

test('sanitizeState keeps valid set times, effort and heart rate; drops bad ones', () => {
  const s = sanitizeState({
    settings: { unit: 'kg', maxHR: 999 },
    routines: [],
    workouts: [{ id: 'w', start: 1000, end: 2000, exercises: [{ exId: 'deadlift', sets: [
      { w: 100, r: 5, done: true, t: 1500, rpe: 8.3 },
      { w: 100, r: 5, done: true, t: 'soon', rpe: '<b>' },
    ] }], hr: { t0: 900, step: 15, bpm: [120, 'x', 300, 24.9, 141.6], extra: 1 } }],
  });
  assert.equal(s.settings.maxHR, 230);
  const [a, b] = s.workouts[0].exercises[0].sets;
  assert.deepEqual(a, { w: 100, r: 5, done: true, t: 1500, rpe: 8.5 });
  assert.deepEqual(b, { w: 100, r: 5, done: true });
  assert.deepEqual(s.workouts[0].hr, { t0: 900, step: 15, bpm: [120, null, null, null, 142] });
  assert.equal(sanitizeState({ workouts: [{ start: 1, exercises: [], hr: { t0: 1, bpm: ['a'] } }] }).workouts[0].hr, undefined);
});

const hrText = lines => ['LIFT-HR', ...lines].join('\n');

test('parseHeartRate reads the shortcut format', () => {
  const samples = parseHeartRate(hrText([
    '72', '130 count/min', '141,5', '---',
    '2026-10-29T18:00:00+01:00', '2026-10-29T18:00:05+0100', '2026-10-29T17:00:10Z',
  ]));
  assert.deepEqual(samples, [
    { t: Date.parse('2026-10-29T17:00:00Z'), bpm: 72 },
    { t: Date.parse('2026-10-29T17:00:05Z'), bpm: 130 },
    { t: Date.parse('2026-10-29T17:00:10Z'), bpm: 141.5 },
  ]);
});

test('parseHeartRate drops implausible values', () => {
  const s = parseHeartRate(hrText(['10', '90', '400', '---', '2026-10-29T18:00:00Z', '2026-10-29T18:00:05Z', '2026-10-29T18:00:10Z']));
  assert.deepEqual(s.map(x => x.bpm), [90]);
});

test('parseHeartRate rejects other clipboard content and malformed data', () => {
  assert.throws(() => parseHeartRate(''), /doesn’t contain heart rate/);
  assert.throws(() => parseHeartRate('my bank password is hunter2'), /doesn’t contain heart rate/);
  assert.throws(() => parseHeartRate(hrText(['72', '<script>alert(1)</script>'])), /couldn’t be read/);
  assert.throws(() => parseHeartRate(hrText(['72', '80', '---', '2026-10-29T18:00:00Z'])), /incomplete/);
  assert.throws(() => parseHeartRate(hrText(['---'])), /No heart rate/);
  assert.throws(() => parseHeartRate('LIFT-HR\n' + '1'.repeat(MAX_HR_TEXT)), /too much data/);
  assert.throws(() => parseHeartRate(hrText(['72', '---', '29.10.2026 18:00'])), /ISO 8601/);
});

test('compactHeartRate averages into 15 s buckets around the workout only', () => {
  const start = 1_000_000_000, end = start + 120000;
  const samples = [
    { t: start - 3600000, bpm: 60 },          // an hour before: ignored
    { t: start, bpm: 100 }, { t: start + 5000, bpm: 110 },
    { t: start + 60000, bpm: 150 },
    { t: end + 3600000, bpm: 60 },            // an hour after: ignored
  ];
  const hr = compactHeartRate(samples, start, end);
  assert.equal(hr.t0, start - 60000);
  assert.equal(hr.step, 15);
  assert.equal(hr.bpm.length, 16);
  assert.equal(hr.bpm[4], 105);
  assert.equal(hr.bpm[8], 150);
  assert.equal(hr.bpm.filter(v => v != null).length, 2);
  assert.equal(compactHeartRate(samples.slice(0, 1), start, end), null, 'too little data');
});
