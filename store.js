// Persistence. Data lives only in this device's localStorage and is never sent
// anywhere. Everything read back (from storage or an imported backup) is
// rebuilt field by field from a strict schema, so a tampered file cannot inject
// unexpected properties, markup or oversized data.

import { EXERCISES_BY_ID } from './exercises.js';
import { GOALS } from './recommend.js';

const KEY = 'workoutapp.v1';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const LIMITS = { routines: 200, workouts: 10000, exercises: 30, sets: 20 };

export function emptyState() {
  return { version: 1, settings: { unit: 'kg' }, routines: [], workouts: [], active: null };
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
  return { w: num(s.w, 0, 2000), r: s.r == null ? null : int(s.r, 0, 1000, null), done: s.done === true };
}

function cleanWorkout(w) {
  if (!isObj(w)) return null;
  const start = time(w.start);
  if (start == null) return null;
  return {
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
}

export function sanitizeState(raw) {
  const s = emptyState();
  if (!isObj(raw)) return s;
  if (isObj(raw.settings) && (raw.settings.unit === 'kg' || raw.settings.unit === 'lb')) {
    s.settings.unit = raw.settings.unit;
  }
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
