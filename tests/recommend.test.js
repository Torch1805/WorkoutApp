import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES_BY_ID } from '../exercises.js';
import {
  buildRoutine, suggestNext, muscleRecovery, recommendToday, weekStats, newRecords, estimateMinutes,
} from '../recommend.js';

const HOUR = 3600 * 1000;
const NOW = new Date(2026, 9, 29, 18, 0).getTime(); // Thu 29 Oct 2026
const set = (w, r, done = true) => ({ w, r, done });
const workout = (start, exercises) => ({
  id: 'w' + start, routineId: null, name: 'W', start, end: start + HOUR,
  exercises: exercises.map(([exId, sets]) => ({ exId, repMin: 8, repMax: 12, rest: 90, sets })),
});
const plan = { sets: 3, repMin: 8, repMax: 12 };

test('buildRoutine covers every chosen muscle, compounds first, and respects the goal', () => {
  const r = buildRoutine({ muscles: ['chest', 'triceps'], goal: 'hypertrophy', minutes: 45 });
  const muscles = new Set(r.map(e => EXERCISES_BY_ID[e.exId].muscle));
  assert.deepEqual([...muscles].sort(), ['chest', 'triceps']);
  const compound = r.map(e => EXERCISES_BY_ID[e.exId].compound);
  assert.deepEqual(compound, [...compound].sort((a, b) => b - a));
  assert.ok(r.every(e => e.repMin === 8 && e.repMax === 12 && e.sets === 3));
  assert.ok(estimateMinutes(r) <= 50, 'fits roughly in the time budget');
});

test('buildRoutine: strength gives fewer exercises than endurance for the same time', () => {
  const s = buildRoutine({ muscles: ['quads'], goal: 'strength', minutes: 60 });
  const e = buildRoutine({ muscles: ['quads'], goal: 'endurance', minutes: 60 });
  assert.ok(s.length < e.length);
  assert.equal(s[0].repMax, 6);
});

test('buildRoutine gives at least one exercise per muscle even on a tiny time budget', () => {
  const r = buildRoutine({ muscles: ['chest', 'back', 'quads', 'core'], goal: 'strength', minutes: 15 });
  assert.equal(r.length, 4);
});

test('suggestNext: first time has no weight suggestion', () => {
  assert.deepEqual(suggestNext(null, plan, 2.5), { w: null, r: 8, kind: 'new' });
});

test('suggestNext: hitting top of range on all sets adds weight', () => {
  const s = suggestNext([set(60, 12), set(60, 12), set(60, 12)], plan, 2.5);
  assert.deepEqual(s, { w: 62.5, r: 8, kind: 'up' });
});

test('suggestNext: missing reps keeps weight and aims to beat weakest set', () => {
  const s = suggestNext([set(60, 12), set(60, 10), set(60, 9)], plan, 2.5);
  assert.deepEqual(s, { w: 60, r: 10, kind: 'same' });
});

test('suggestNext: too few sets at top weight does not add weight', () => {
  const s = suggestNext([set(60, 12), set(60, 12)], plan, 2.5);
  assert.equal(s.kind, 'same');
});

test('suggestNext: ignores unfinished sets', () => {
  const s = suggestNext([set(60, 12), set(60, 12), set(60, 12), set(100, 1, false)], plan, 2.5);
  assert.equal(s.w, 62.5);
});

test('suggestNext: bodyweight progresses reps', () => {
  assert.deepEqual(suggestNext([set(0, 12), set(0, 12), set(0, 12)], plan, 2.5), { w: 0, r: 13, kind: 'bw-up' });
  assert.deepEqual(suggestNext([set(null, 9), set(null, 8), set(null, 7)], plan, 2.5), { w: 0, r: 8, kind: 'same' });
});

test('muscleRecovery marks recently trained muscles as recovering', () => {
  const ws = [workout(NOW - 24 * HOUR - HOUR, [['bench-press', [set(60, 8)]]])];
  const r = muscleRecovery(ws, NOW);
  assert.equal(r.chest.ready, false);
  assert.equal(Math.round(r.chest.hours), 24);
  assert.equal(r.back.ready, true);
  assert.equal(r.back.hours, null);
});

test('muscleRecovery ignores exercises with no completed sets', () => {
  const ws = [workout(NOW - 2 * HOUR, [['bench-press', [set(60, 8, false)]]])];
  assert.equal(muscleRecovery(ws, NOW).chest.ready, true);
});

const routine = (id, exIds) => ({ id, name: id, goal: 'hypertrophy', exercises: exIds.map(exId => ({ exId, sets: 3, repMin: 8, repMax: 12, rest: 90 })) });

test('recommendToday suggests building a routine when there are none', () => {
  const r = recommendToday({ routines: [], workouts: [], now: NOW });
  assert.equal(r.type, 'build');
  assert.equal(r.muscles.length, 2);
});

test('recommendToday picks the routine whose muscles are rested', () => {
  const push = routine('push', ['bench-press', 'triceps-pushdown']);
  const pull = routine('pull', ['pull-up', 'barbell-curl']);
  const ws = [workout(NOW - 20 * HOUR, [['bench-press', [set(60, 8)]], ['triceps-pushdown', [set(20, 10)]]])];
  const r = recommendToday({ routines: [push, pull], workouts: ws, now: NOW });
  assert.equal(r.type, 'routine');
  assert.equal(r.routine.id, 'pull');
});

test('recommendToday prefers the routine trained longest ago when all are ready', () => {
  const push = routine('push', ['bench-press']);
  const pull = routine('pull', ['pull-up']);
  const ws = [
    workout(NOW - 100 * HOUR, [['pull-up', [set(0, 8)]]]),
    workout(NOW - 60 * HOUR, [['bench-press', [set(60, 8)]]]),
  ];
  const r = recommendToday({ routines: [push, pull], workouts: ws, now: NOW });
  assert.equal(r.routine.id, 'pull');
  assert.equal(r.daysSince, 4);
});

test('recommendToday recommends rest when everything is recovering', () => {
  const push = routine('push', ['bench-press']);
  const ws = [workout(NOW - 10 * HOUR, [['bench-press', [set(60, 8)]]])];
  const r = recommendToday({ routines: [push], workouts: ws, now: NOW });
  assert.equal(r.type, 'rest');
  assert.equal(r.hoursUntil, 39); // workout ended 9h ago
});

test('weekStats counts this week and the weekly streak', () => {
  const DAY = 24 * HOUR;
  const ws = [
    workout(NOW - 15 * DAY, [['bench-press', [set(50, 10)]]]), // 3 weeks ago
    workout(NOW - 8 * DAY, [['bench-press', [set(50, 10)]]]),  // last week
    workout(NOW - 1 * DAY, [['bench-press', [set(60, 10), set(60, 10)]]]), // this week
  ];
  const s = weekStats(ws, NOW);
  assert.equal(s.count, 1);
  assert.equal(s.volume, 1200);
  assert.equal(s.streak, 3);
  assert.equal(weekStats(ws.slice(0, 2), NOW).streak, 2, 'empty current week does not break the streak');
});

test('newRecords detects heavier weight but not first-ever attempts', () => {
  const prev = [workout(NOW - 100 * HOUR, [['bench-press', [set(60, 8)]]])];
  const now = workout(NOW, [['bench-press', [set(65, 5)]], ['back-squat', [set(100, 5)]]]);
  const prs = newRecords(now, prev);
  assert.deepEqual(prs.map(p => [p.exId, p.kind]), [['bench-press', 'weight']]);
});
