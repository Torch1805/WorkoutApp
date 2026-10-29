// Rule-based recommendations. Pure functions (no DOM, no storage) so they can
// be unit tested. All weights are in kg.

import { EXERCISES, EXERCISES_BY_ID, MUSCLES } from './exercises.js';

export const GOALS = {
  strength:    { label: 'Strength',  blurb: 'Heavy weight, low reps', sets: 4, repMin: 3,  repMax: 6,  rest: 180 },
  hypertrophy: { label: 'Muscle',    blurb: 'Moderate weight, 8–12 reps', sets: 3, repMin: 8,  repMax: 12, rest: 90 },
  endurance:   { label: 'Endurance', blurb: 'Light weight, high reps', sets: 3, repMin: 15, repMax: 20, rest: 45 },
};

export const RECOVERY_HOURS = 48;
const HOUR = 3600 * 1000;
const SET_SECONDS = 40;
const SETUP_SECONDS = 60;

export function estimateMinutes(exercises) {
  const sec = exercises.reduce((t, e) => t + e.sets * (SET_SECONDS + e.rest) + SETUP_SECONDS, 0);
  return Math.round(sec / 60);
}

export function defaultRoutineName(muscles, labels) {
  const names = muscles.map(m => labels[m]);
  if (names.length <= 1) return names[0] || 'New Routine';
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

// Builds a routine for the chosen muscles that roughly fits the time budget.
// Picks round-robin across muscles (compounds first) so every muscle gets work.
export function buildRoutine({ muscles, goal, minutes }) {
  const preset = GOALS[goal] || GOALS.hypertrophy;
  const plan = { sets: preset.sets, repMin: preset.repMin, repMax: preset.repMax, rest: preset.rest };
  const budget = minutes * 60;
  const perExercise = plan.sets * (SET_SECONDS + plan.rest) + SETUP_SECONDS;
  const target = Math.min(10, Math.max(muscles.length, Math.floor(budget / perExercise)));

  const pools = muscles.map(m =>
    EXERCISES.filter(e => e.muscle === m).sort((a, b) => b.compound - a.compound));
  const picked = [];
  for (let round = 0; picked.length < target; round++) {
    let added = false;
    for (const pool of pools) {
      if (picked.length >= target) break;
      if (pool[round]) { picked.push(pool[round]); added = true; }
    }
    if (!added) break;
  }
  picked.sort((a, b) => b.compound - a.compound);
  return picked.map(e => ({ exId: e.id, ...plan }));
}

// Hours since each muscle group was last trained (null = never).
export function muscleRecovery(workouts, now) {
  const last = {};
  for (const w of workouts) {
    const t = w.end || w.start;
    for (const we of w.exercises) {
      const info = EXERCISES_BY_ID[we.exId];
      if (!info || !we.sets.some(s => s.done)) continue;
      if (!(last[info.muscle] >= t)) last[info.muscle] = t;
    }
  }
  const out = {};
  for (const m of MUSCLES) {
    const hours = last[m] == null ? null : Math.max(0, (now - last[m]) / HOUR);
    out[m] = { hours, ready: hours == null || hours >= RECOVERY_HOURS };
  }
  return out;
}

export function routineMuscles(routine) {
  const set = new Set();
  for (const e of routine.exercises) {
    const info = EXERCISES_BY_ID[e.exId];
    if (info) set.add(info.muscle);
  }
  return [...set];
}

// Picks what to train today. Returns one of:
//   { type: 'build', muscles }         no routines yet: suggest muscles to build one for
//   { type: 'routine', routine, ready, daysSince }
//   { type: 'rest', hoursUntil }       everything is still recovering
export function recommendToday({ routines, workouts, now }) {
  const rec = muscleRecovery(workouts, now);
  const usable = routines.filter(r => r.exercises.length);
  if (!usable.length) {
    const ranked = MUSCLES
      .map(m => ({ m, h: rec[m].hours ?? Infinity }))
      .sort((a, b) => b.h - a.h);
    return { type: 'build', muscles: ranked.slice(0, 2).map(x => x.m) };
  }

  let best = null;
  for (const r of usable) {
    const ms = routineMuscles(r);
    const ready = ms.filter(m => rec[m].ready);
    const frac = ready.length / ms.length;
    const avgHours = ms.reduce((t, m) => t + Math.min(rec[m].hours ?? 168, 168), 0) / ms.length;
    if (!best || frac > best.frac || (frac === best.frac && avgHours > best.avgHours)) {
      best = { routine: r, frac, avgHours, ready, ms };
    }
  }

  if (best.frac < 0.5) {
    const pending = usable.flatMap(routineMuscles)
      .map(m => rec[m].hours)
      .filter(h => h != null && h < RECOVERY_HOURS)
      .map(h => RECOVERY_HOURS - h);
    return { type: 'rest', hoursUntil: Math.ceil(Math.min(...pending)) };
  }

  const hours = best.ms.map(m => rec[m].hours).filter(h => h != null);
  const daysSince = hours.length ? Math.floor(Math.min(...hours) / 24) : null;
  return { type: 'routine', routine: best.routine, ready: best.ready, daysSince };
}

// Most recent workout's completed sets for an exercise.
export function lastPerformance(workouts, exId) {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const we = workouts[i].exercises.find(e => e.exId === exId);
    const sets = we ? we.sets.filter(s => s.done) : [];
    if (sets.length) return { sets, date: workouts[i].start };
  }
  return null;
}

// Progressive overload: if every planned set at the top weight hit the top of
// the rep range, add weight. Otherwise keep the weight and beat the weakest set.
// Returns { w, r, kind } where kind is 'new' | 'up' | 'same' | 'bw-up'.
export function suggestNext(prevSets, plan, incrementKg) {
  const done = (prevSets || []).filter(s => s.done && s.r > 0);
  if (!done.length) return { w: null, r: plan.repMin, kind: 'new' };

  const topW = Math.max(...done.map(s => s.w || 0));
  const top = done.filter(s => (s.w || 0) === topW);
  const allHit = top.length >= plan.sets && top.every(s => s.r >= plan.repMax);
  const minReps = Math.min(...top.map(s => s.r));
  const maxReps = Math.max(...top.map(s => s.r));

  if (topW === 0) {
    return allHit
      ? { w: 0, r: maxReps + 1, kind: 'bw-up' }
      : { w: 0, r: Math.min(Math.max(minReps + 1, plan.repMin), plan.repMax), kind: 'same' };
  }
  if (allHit) return { w: topW + incrementKg, r: plan.repMin, kind: 'up' };
  return { w: topW, r: Math.min(Math.max(minReps + 1, plan.repMin), plan.repMax), kind: 'same' };
}

// Epley estimated one-rep max.
export function estimate1RM(w, r) {
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

// Per-exercise records and per-session history of the best estimated 1RM.
export function exerciseStats(workouts) {
  const stats = {};
  for (const w of workouts) {
    for (const we of w.exercises) {
      const sets = we.sets.filter(s => s.done && s.r > 0);
      if (!sets.length) continue;
      const st = stats[we.exId] ||= { bestW: 0, bestWReps: 0, best1RM: 0, maxReps: 0, sessions: [] };
      let session1RM = 0;
      for (const s of sets) {
        const w1 = s.w || 0;
        if (w1 > st.bestW || (w1 === st.bestW && s.r > st.bestWReps)) { st.bestW = w1; st.bestWReps = s.r; }
        st.maxReps = Math.max(st.maxReps, s.r);
        session1RM = Math.max(session1RM, estimate1RM(w1, s.r));
      }
      st.best1RM = Math.max(st.best1RM, session1RM);
      st.sessions.push({ t: w.start, e1rm: session1RM, sets });
    }
  }
  return stats;
}

// New personal records set in `workout` compared to `previous` workouts.
export function newRecords(workout, previous) {
  const before = exerciseStats(previous);
  const prs = [];
  for (const we of workout.exercises) {
    const sets = we.sets.filter(s => s.done && s.r > 0);
    if (!sets.length) continue;
    const old = before[we.exId];
    if (!old) continue; // first time doing it is not a "record"
    const topW = Math.max(...sets.map(s => s.w || 0));
    if (topW > old.bestW) { prs.push({ exId: we.exId, kind: 'weight', value: topW }); continue; }
    const best1RM = Math.max(...sets.map(s => estimate1RM(s.w || 0, s.r)));
    if (best1RM > old.best1RM + 0.01) prs.push({ exId: we.exId, kind: '1rm', value: best1RM });
  }
  return prs;
}

export function workoutVolume(workout) {
  let v = 0;
  for (const we of workout.exercises) for (const s of we.sets) if (s.done) v += (s.w || 0) * (s.r || 0);
  return v;
}

function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

// Workouts and volume this week (Mon–Sun) plus the weekly streak: consecutive
// weeks with at least one workout, counting this week only once it has one.
export function weekStats(workouts, now) {
  const thisWeek = weekStart(now);
  const inWeek = workouts.filter(w => w.start >= thisWeek);
  const weeks = new Set(workouts.map(w => weekStart(w.start)));

  let streak = 0;
  const cursor = new Date(thisWeek);
  if (!weeks.has(thisWeek)) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return {
    count: inWeek.length,
    volume: inWeek.reduce((t, w) => t + workoutVolume(w), 0),
    streak,
  };
}
