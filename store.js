// Persistence. Data lives only in this device's localStorage and is never sent
// anywhere. Everything read back (from storage or an imported backup) is
// rebuilt field by field from a strict schema, so a tampered file cannot inject
// unexpected properties, markup or oversized data.

import { EXERCISES_BY_ID } from './exercises.js';
import { GOALS } from './recommend.js';

const KEY = 'workoutapp.v1';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const LIMITS = { routines: 200, workouts: 10000, exercises: 30, sets: 20, hrBuckets: 2000 };
export const MAX_HR_TEXT = 1024 * 1024;
export const HR_STEP = 15; // seconds per stored heart-rate value
export const DEFAULT_MAX_HR = 190;

export function emptyState() {
  return { version: 1, settings: { unit: 'kg', maxHR: DEFAULT_MAX_HR }, routines: [], workouts: [], active: null };
}

export function newId() {
  return crypto.randomUUID();
}

const str = (v, max, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, max) : '') || fallback;
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);
const int = (v, min, max, fallback) => { const n = num(v, min, max); return n == null ? fallback : Math.round(n); };
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const id = v => (typeof v === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(v) ? v : newId());
const time = v => num(v, 0, 8.64e15);

function repRange(e) {
  const repMin = int(e.repMin, 1, 100, 8);
  return {
    repMin,
    repMax: int(e.repMax, repMin, 100, Math.max(repMin, 12)),
    rest: int(e.rest, 0, 600, 90),
  };
}

function cleanRoutine(r) {
  if (!isObj(r)) return null;
  return {
    id: id(r.id),
    name: str(r.name, 60, 'Routine'),
    goal: Object.hasOwn(GOALS, r.goal) ? r.goal : 'hypertrophy',
    exercises: list(r.exercises, LIMITS.exercises)
      .filter(e => isObj(e) && Object.hasOwn(EXERCISES_BY_ID, e.exId))
      .map(e => ({ exId: e.exId, sets: int(e.sets, 1, LIMITS.sets, 3), ...repRange(e) })),
    createdAt: time(r.createdAt) ?? Date.now(),
  };
}

function cleanSet(s) {
  if (!isObj(s)) return null;
  const set = { w: num(s.w, 0, 2000), r: s.r == null ? null : int(s.r, 0, 1000, null), done: s.done === true };
  const t = time(s.t);
  if (t != null) set.t = t;
  const rpe = num(s.rpe, 1, 10);
  if (rpe != null) set.rpe = Math.round(rpe * 2) / 2;
  return set;
}

// Heart rate is stored as one average value per HR_STEP seconds from t0.
function cleanHeartRate(hr) {
  if (!isObj(hr)) return null;
  const t0 = time(hr.t0);
  const bpm = list(hr.bpm, LIMITS.hrBuckets).map(v => (typeof v === 'number' && v >= 25 && v <= 250 ? Math.round(v) : null));
  if (t0 == null || !bpm.some(v => v != null)) return null;
  return { t0, step: int(hr.step, 5, 60, HR_STEP), bpm };
}

function cleanWorkout(w) {
  if (!isObj(w)) return null;
  const start = time(w.start);
  if (start == null) return null;
  const out = {
    id: id(w.id),
    routineId: typeof w.routineId === 'string' ? id(w.routineId) : null,
    name: str(w.name, 60, 'Workout'),
    start,
    end: time(w.end),
    exercises: list(w.exercises, LIMITS.exercises)
      .filter(e => isObj(e) && Object.hasOwn(EXERCISES_BY_ID, e.exId))
      .map(e => ({
        exId: e.exId,
        ...repRange(e),
        sets: list(e.sets, LIMITS.sets).map(cleanSet).filter(Boolean),
      })),
  };
  const hr = cleanHeartRate(w.hr);
  if (hr) out.hr = hr;
  return out;
}

export function sanitizeState(raw) {
  const s = emptyState();
  if (!isObj(raw)) return s;
  if (isObj(raw.settings) && (raw.settings.unit === 'kg' || raw.settings.unit === 'lb')) {
    s.settings.unit = raw.settings.unit;
  }
  if (isObj(raw.settings)) s.settings.maxHR = int(raw.settings.maxHR, 120, 230, DEFAULT_MAX_HR);
  s.routines = list(raw.routines, LIMITS.routines).map(cleanRoutine).filter(Boolean);
  s.workouts = list(raw.workouts, LIMITS.workouts).map(cleanWorkout).filter(Boolean)
    .sort((a, b) => a.start - b.start);
  s.active = cleanWorkout(raw.active);
  return s;
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear(storage = globalThis.localStorage) {
  storage.removeItem(KEY);
}

// Parses an imported backup. Throws an Error with a user-facing message.
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) throw new Error('File is too large.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('That file is not a valid backup.'); }
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.workouts) || !Array.isArray(raw.routines)) {
    throw new Error('That file is not a valid backup.');
  }
  return sanitizeState(raw);
}

// Parses the text the "Lift Heart Rate" shortcut copies to the clipboard:
//   LIFT-HR
//   <one heart rate value per line>
//   ---
//   <one ISO 8601 date per line, same order>
// Values and dates are matched by position. Throws an Error with a user-facing message.
export function parseHeartRate(text) {
  const notOurs = 'The clipboard doesn’t contain heart rate from the “Lift Heart Rate” shortcut.';
  if (typeof text !== 'string' || !text.trim()) throw new Error(notOurs);
  if (text.length > MAX_HR_TEXT) throw new Error('That’s too much data. Check the shortcut’s date filter.');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines[0] !== 'LIFT-HR') throw new Error(notOurs);

  const values = [];
  const dates = [];
  for (const line of lines.slice(1)) {
    if (line === '---') continue;
    const d = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/);
    if (d) {
      const zone = d[2] ? d[2].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : '';
      dates.push(Date.parse(d[1] + zone));
      continue;
    }
    const v = line.match(/^(\d{1,3}(?:[.,]\d+)?)\s*(?:bpm|count\/min|\/min|BPM)?$/);
    if (v) { values.push(parseFloat(v[1].replace(',', '.'))); continue; }
    throw new Error('Some heart rate data couldn’t be read. Check that the shortcut formats dates as ISO 8601.');
  }
  if (!values.length) throw new Error('No heart rate was found. Did you allow the shortcut to read Health data?');
  if (values.length !== dates.length) throw new Error('The heart rate data looks incomplete. Please run the shortcut again.');

  return values
    .map((bpm, i) => ({ t: dates[i], bpm }))
    .filter(s => Number.isFinite(s.t) && s.bpm >= 25 && s.bpm <= 250)
    .sort((a, b) => a.t - b.t);
}

// Averages samples into HR_STEP-second buckets covering the workout (plus a
// minute either side). Returns null if the Watch recorded too little in that window.
export function compactHeartRate(samples, start, end) {
  const t0 = start - 60000;
  const t1 = end + 60000;
  const n = Math.min(LIMITS.hrBuckets, Math.ceil((t1 - t0) / (HR_STEP * 1000)));
  const sum = new Array(n).fill(0);
  const count = new Array(n).fill(0);
  let used = 0;
  for (const s of samples) {
    const i = Math.floor((s.t - t0) / (HR_STEP * 1000));
    if (i < 0 || i >= n) continue;
    sum[i] += s.bpm;
    count[i]++;
    used++;
  }
  if (used < 3) return null;
  return { t0, step: HR_STEP, bpm: sum.map((v, i) => (count[i] ? Math.round(v / count[i]) : null)) };
}
