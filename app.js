import { EXERCISES, EXERCISES_BY_ID, MUSCLES, MUSCLE_LABELS } from './exercises.js';
import {
  GOALS, RECOVERY_HOURS, buildRoutine, defaultRoutineName, estimateMinutes, muscleRecovery,
  recommendToday, routineMuscles, lastPerformance, suggestNext, exerciseStats, newRecords,
  workoutVolume, weekStats,
} from './recommend.js';
import { load, save, clear, newId, parseBackup, MAX_IMPORT_BYTES } from './store.js';

// Refuse to run inside a frame on another site (clickjacking).
if (window.top !== window.self) throw new Error('Lift cannot be embedded.');

let state = load();
function persist() {
  if (!save(state)) toast('Could not save — your device storage is full.');
}

/* ---------- units & formatting ---------- */

const LB = 2.20462262;
const MAX_KG = 2000;
const unit = () => state.settings.unit;
const incrementKg = () => (unit() === 'kg' ? 2.5 : 5 / LB);

function toDisplay(kg) {
  if (kg == null) return null;
  const v = unit() === 'kg' ? kg : kg * LB;
  const step = unit() === 'kg' ? 0.25 : 0.5;
  return Math.round(v / step) * step;
}
const fromDisplay = v => Math.min(MAX_KG, unit() === 'kg' ? v : v / LB);
const fmtW = kg => (kg == null ? '' : String(toDisplay(kg)));
function fmtVolume(kg) {
  const v = unit() === 'kg' ? kg : kg * LB;
  return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toLocaleString();
}
function parseNum(text) {
  const v = parseFloat(String(text).replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : null;
}
const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(v)));
const fmtDate = (t, opts) => new Date(t).toLocaleDateString(undefined, opts);
function fmtDuration(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}
function relDays(hours) {
  if (hours < 24) return 'today';
  const d = Math.floor(hours / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
function joinNames(names) {
  return names.length <= 1 ? (names[0] || '') : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- DOM helpers (text only — user data is never parsed as HTML) ---------- */

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

const ICONS = {
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7l1-8z'],
  dumbbell: ['M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11'],
  chart: ['M3 3v18h18', 'm7 15 4-4 3 3 5-6'],
  sliders: ['M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1', 'M15 4v4M9 10v4M17 16v4'],
  plus: ['M12 5v14M5 12h14'],
  back: ['m15 18-6-6 6-6'],
  chevron: ['m9 18 6-6-6-6'],
  down: ['m6 9 6 6 6-6'],
  check: ['m5 12.5 4.5 4.5L19 7'],
  x: ['M6 6l12 12M18 6 6 18'],
  up: ['M12 19V5M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14M6 13l6 6 6-6'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  play: ['M7 4.5v15l12.5-7.5z'],
  timer: ['M12 9v4l2.5 2', 'M9 2h6', 'M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16z'],
  trophy: ['M8 21h8M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0z', 'M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3'],
  flame: ['M12 2.5c.5 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.5-4.4 2.6-5.4.1 1.7.8 2.9 1.9 3.3.3-3.6.9-6.4 1-8.9z'],
  moon: ['M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4'],
  shield: ['M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z', 'm9 12 2 2 4-4'],
  share: ['M12 15V3M8 7l4-4 4 4', 'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'],
  upload: ['M12 3v12M8 11l4 4 4-4', 'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'],
  stack: ['M12 3 3 8l9 5 9-5z', 'm3 13 9 5 9-5'],
  clock: ['M12 7v5l3 2', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
};
const FILLED = new Set(['play', 'bolt']);

function icon(name, cls = '') {
  return svg('svg', {
    viewBox: '0 0 24 24', class: 'icon ' + cls, 'aria-hidden': 'true',
    fill: FILLED.has(name) ? 'currentColor' : 'none',
    stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, ...ICONS[name].map(d => svg('path', { d })));
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- navigation ---------- */

let nav = { tab: 'today', stack: [] };
let historyTab = 'workouts';
const current = () => nav.stack[nav.stack.length - 1] || { view: nav.tab };
function go(view, params = {}) { nav.stack.push({ view, ...params }); render(true); }
function replace(view, params = {}) { nav.stack[nav.stack.length - 1] = { view, ...params }; render(true); }
function back() { nav.stack.pop(); render(true); }
function setTab(tab) { nav = { tab, stack: [] }; render(true); }

const VIEWS = {
  today: viewToday, routines: viewRoutines, history: viewHistory, settings: viewSettings,
  builder: viewBuilder, editor: viewEditor, picker: viewPicker, workout: viewWorkout,
  summary: viewSummary, workoutDetail: viewWorkoutDetail, exerciseDetail: viewExerciseDetail,
};

function render(resetScroll = false) {
  const y = window.scrollY;
  const route = current();
  const root = document.getElementById('app');
  const isRoot = nav.stack.length === 0;
  root.replaceChildren(...[
    h('main', { class: 'screen' + (isRoot ? ' has-tabbar' : '') }, VIEWS[route.view](route)),
    state.active && route.view !== 'workout' && route.view !== 'picker' ? activeBar(isRoot) : null,
    isRoot ? tabBar() : null,
  ].filter(Boolean));
  window.scrollTo(0, resetScroll ? 0 : y);
  tick();
}

function tabBar() {
  const tabs = [['today', 'Today', 'bolt'], ['routines', 'Routines', 'dumbbell'], ['history', 'History', 'chart'], ['settings', 'Settings', 'sliders']];
  return h('nav', { class: 'tabbar' }, tabs.map(([id, label, ic]) =>
    h('button', { class: 'tab' + (nav.tab === id ? ' active' : ''), onclick: () => setTab(id), 'aria-label': label },
      icon(ic), h('span', null, label))));
}

function activeBar(aboveTabbar) {
  return h('button', { class: 'active-bar' + (aboveTabbar ? ' above-tabbar' : ''), onclick: () => go('workout') },
    h('span', { class: 'pulse' }),
    h('span', { class: 'grow' }, h('strong', null, state.active.name), h('small', { class: 'js-elapsed' })),
    h('span', { class: 'pill' }, 'Resume'));
}

function largeTitle(title, subtitle, action) {
  return h('header', { class: 'large-title' },
    h('div', null, subtitle ? h('p', { class: 'eyebrow' }, subtitle) : null, h('h1', null, title)),
    action || null);
}

function navBar(title, { backLabel = 'Back', onBack = back, action } = {}) {
  return h('header', { class: 'nav-bar' },
    h('button', { class: 'nav-back', onclick: onBack }, icon('back'), backLabel),
    h('h2', null, title),
    h('div', { class: 'nav-action' }, action || null));
}

const section = (title, ...kids) => h('section', { class: 'section' }, title ? h('h3', { class: 'section-title' }, title) : null, kids);
const chip = (text, cls = '') => h('span', { class: 'chip ' + cls }, text);
const emptyState = (ic, title, text, button) =>
  h('div', { class: 'card empty' }, h('div', { class: 'empty-icon' }, icon(ic)), h('h3', null, title), h('p', null, text), button || null);

/* ---------- workouts ---------- */

function startWorkout(routine) {
  if (state.active) {
    if (!confirm('You already have a workout in progress. Discard it and start a new one?')) return;
  }
  state.active = {
    id: newId(),
    routineId: routine ? routine.id : null,
    name: routine ? routine.name : 'Quick Workout',
    start: Date.now(),
    end: null,
    exercises: routine
      ? routine.exercises.map(e => ({
        exId: e.exId, repMin: e.repMin, repMax: e.repMax, rest: e.rest,
        sets: Array.from({ length: e.sets }, () => ({ w: null, r: null, done: false })),
      }))
      : [],
  };
  rest = null;
  persist();
  go('workout');
}

/* ---------- Today ---------- */

function viewToday() {
  const now = Date.now();
  const rec = recommendToday({ routines: state.routines, workouts: state.workouts, now });
  const stats = weekStats(state.workouts, now);
  const recovery = muscleRecovery(state.workouts, now);

  return [
    largeTitle('Today', fmtDate(now, { weekday: 'long', month: 'long', day: 'numeric' })),
    heroCard(rec),
    h('div', { class: 'stats' },
      stat('dumbbell', stats.count, stats.count === 1 ? 'Workout this week' : 'Workouts this week'),
      stat('stack', fmtVolume(stats.volume), `${unit()} lifted`),
      stat('flame', stats.streak, 'Week streak'),
    ),
    section('Muscle recovery',
      h('div', { class: 'recovery-grid' }, MUSCLES.map(m => recoveryTile(m, recovery[m])))),
    section(null,
      h('button', { class: 'btn secondary block', onclick: () => startWorkout(null) }, icon('plus'), 'Start empty workout')),
  ];
}

function stat(ic, value, label) {
  return h('div', { class: 'card stat' }, icon(ic), h('strong', null, value), h('span', null, label));
}

function recoveryTile(m, r) {
  const pct = r.hours == null ? 1 : Math.min(1, r.hours / RECOVERY_HOURS);
  const sub = r.hours == null ? 'Fresh' : r.ready ? `Ready · ${relDays(r.hours)}` : `${Math.ceil(RECOVERY_HOURS - r.hours)}h to go`;
  const bar = h('span', { class: 'bar-fill' });
  bar.style.transform = `scaleX(${pct})`;
  return h('div', { class: 'recovery ' + (r.ready ? 'ready' : 'recovering') },
    h('div', { class: 'recovery-head' }, h('span', { class: 'dot' }), h('strong', null, MUSCLE_LABELS[m])),
    h('small', null, sub),
    h('span', { class: 'bar' }, bar));
}

function heroCard(rec) {
  if (state.active) {
    return h('div', { class: 'card hero' },
      h('p', { class: 'eyebrow accent' }, icon('timer'), 'In progress'),
      h('h2', null, state.active.name),
      h('p', { class: 'muted' }, 'Started ', h('span', { class: 'js-elapsed' }), ' ago'),
      h('button', { class: 'btn primary block', onclick: () => go('workout') }, icon('play'), 'Resume workout'));
  }
  if (rec.type === 'build') {
    const names = rec.muscles.map(m => MUSCLE_LABELS[m]);
    return h('div', { class: 'card hero' },
      h('p', { class: 'eyebrow accent' }, icon('sparkle'), 'Recommended'),
      h('h2', null, `Train ${joinNames(names)}`),
      h('p', { class: 'muted' }, state.workouts.length
        ? 'These are your most rested muscles. Build a routine and Lift will plan it for you.'
        : 'Pick what you want to train and Lift will build a routine for you.'),
      h('button', { class: 'btn primary block', onclick: () => go('builder', { muscles: [...rec.muscles], goal: 'hypertrophy', minutes: 45 }) },
        icon('sparkle'), 'Build a routine'));
  }
  if (rec.type === 'rest') {
    return h('div', { class: 'card hero rest' },
      h('p', { class: 'eyebrow' }, icon('moon'), 'Recovery'),
      h('h2', null, 'Rest day'),
      h('p', { class: 'muted' }, `Your routines' muscles are still recovering. The next one is ready in about ${rec.hoursUntil}h. Light cardio or stretching is a great idea today.`),
      h('button', { class: 'btn secondary block', onclick: () => setTab('routines') }, 'Train anyway'));
  }
  const r = rec.routine;
  const ms = routineMuscles(r).map(m => MUSCLE_LABELS[m]);
  const readyNames = rec.ready.map(m => MUSCLE_LABELS[m]);
  let reason = readyNames.length === ms.length
    ? `${joinNames(readyNames)} ${readyNames.length === 1 ? 'is' : 'are'} fully recovered`
    : `Most of these muscles are recovered`;
  if (rec.daysSince == null) reason += '.';
  else if (rec.daysSince >= 3) reason += ` — last trained ${rec.daysSince} days ago.`;
  else reason += '.';
  return h('div', { class: 'card hero' },
    h('p', { class: 'eyebrow accent' }, icon('sparkle'), 'Recommended for today'),
    h('h2', null, r.name),
    h('p', { class: 'muted' }, reason),
    h('div', { class: 'chips' }, ms.map(m => chip(m))),
    h('p', { class: 'meta' }, `${plural(r.exercises.length, 'exercise')} · ~${estimateMinutes(r.exercises)} min · ${GOALS[r.goal].label}`),
    h('button', { class: 'btn primary block', onclick: () => startWorkout(r) }, icon('play'), 'Start workout'));
}

/* ---------- Routines ---------- */

function viewRoutines() {
  const add = h('button', { class: 'icon-btn accent', 'aria-label': 'New routine', onclick: () => go('builder', { muscles: [], goal: 'hypertrophy', minutes: 45 }) }, icon('plus'));
  if (!state.routines.length) {
    return [largeTitle('Routines', null, add),
      emptyState('dumbbell', 'No routines yet', 'Tell Lift what you want to train and it builds a routine around your goal and time.',
        h('button', { class: 'btn primary', onclick: () => go('builder', { muscles: [], goal: 'hypertrophy', minutes: 45 }) }, icon('sparkle'), 'Create routine'))];
  }
  return [
    largeTitle('Routines', `${plural(state.routines.length, 'routine')}`, add),
    h('div', { class: 'list' }, state.routines.map(r =>
      h('div', { class: 'card routine', role: 'button', tabIndex: 0, onclick: () => go('editor', { draft: structuredClone(r), isNew: false }) },
        h('div', { class: 'grow' },
          h('h3', null, r.name),
          h('p', { class: 'meta' }, `${plural(r.exercises.length, 'exercise')} · ~${estimateMinutes(r.exercises)} min · ${GOALS[r.goal].label}`),
          h('div', { class: 'chips' }, routineMuscles(r).map(m => chip(MUSCLE_LABELS[m])))),
        h('button', {
          class: 'play-btn', 'aria-label': `Start ${r.name}`,
          onclick: e => { e.stopPropagation(); startWorkout(r); },
        }, icon('play'))))),
  ];
}

const PRESETS = {
  Push: ['chest', 'shoulders', 'triceps'],
  Pull: ['back', 'biceps'],
  Legs: ['quads', 'hamstrings', 'glutes', 'calves'],
  Upper: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
  'Full body': ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'core'],
};

function viewBuilder(p) {
  const toggle = m => {
    p.muscles = p.muscles.includes(m) ? p.muscles.filter(x => x !== m) : [...p.muscles, m];
    render();
  };
  const build = () => {
    const muscles = MUSCLES.filter(m => p.muscles.includes(m));
    replace('editor', {
      isNew: true,
      draft: {
        id: newId(), name: defaultRoutineName(muscles, MUSCLE_LABELS), goal: p.goal, createdAt: Date.now(),
        exercises: buildRoutine({ muscles, goal: p.goal, minutes: p.minutes }),
      },
    });
  };
  return [
    navBar('New Routine', { backLabel: 'Cancel' }),
    section('What do you want to train?',
      h('div', { class: 'scroll-row' }, Object.entries(PRESETS).map(([name, ms]) =>
        h('button', {
          class: 'pill-btn' + (ms.length === p.muscles.length && ms.every(m => p.muscles.includes(m)) ? ' on' : ''),
          onclick: () => { p.muscles = [...ms]; render(); },
        }, name))),
      h('div', { class: 'muscle-grid' }, MUSCLES.map(m =>
        h('button', { class: 'toggle' + (p.muscles.includes(m) ? ' on' : ''), onclick: () => toggle(m), 'aria-pressed': String(p.muscles.includes(m)) },
          h('span', null, MUSCLE_LABELS[m]), h('span', { class: 'tick' }, icon('check')))))),
    section('Goal',
      h('div', { class: 'options' }, Object.entries(GOALS).map(([id, g]) =>
        h('button', { class: 'option' + (p.goal === id ? ' on' : ''), onclick: () => { p.goal = id; render(); } },
          h('span', { class: 'grow' }, h('strong', null, g.label), h('small', null, g.blurb)),
          h('span', { class: 'option-meta' }, `${g.sets}×${g.repMin}–${g.repMax}`))))),
    section('Time available',
      h('div', { class: 'segmented' }, [30, 45, 60, 90].map(min =>
        h('button', { class: p.minutes === min ? 'on' : '', onclick: () => { p.minutes = min; render(); } }, `${min} min`)))),
    h('div', { class: 'footer-bar' },
      h('button', { class: 'btn primary block', disabled: !p.muscles.length, onclick: build }, icon('sparkle'),
        p.muscles.length ? 'Build my routine' : 'Pick at least one muscle')),
  ];
}

function viewEditor(p) {
  const d = p.draft;
  const goal = GOALS[d.goal];
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= d.exercises.length) return;
    [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]];
    render();
  };
  const saveRoutine = () => {
    if (!d.exercises.length) return toast('Add at least one exercise.');
    d.name = d.name.trim().slice(0, 60) || 'Routine';
    const i = state.routines.findIndex(r => r.id === d.id);
    if (i >= 0) state.routines[i] = d; else state.routines.push(d);
    persist();
    toast('Routine saved');
    setTab('routines');
  };
  const del = () => {
    if (!confirm(`Delete "${d.name}"? Your workout history is kept.`)) return;
    state.routines = state.routines.filter(r => r.id !== d.id);
    persist();
    setTab('routines');
  };

  return [
    navBar(p.isNew ? 'Review Routine' : 'Edit Routine', { backLabel: 'Cancel' }),
    h('input', {
      class: 'title-input', value: d.name, maxLength: 60, 'aria-label': 'Routine name', enterKeyHint: 'done',
      oninput: e => { d.name = e.target.value; },
    }),
    h('p', { class: 'meta' }, `${goal.label} · ${plural(d.exercises.length, 'exercise')} · ~${estimateMinutes(d.exercises)} min`),
    h('div', { class: 'list' }, d.exercises.map((e, i) => {
      const info = EXERCISES_BY_ID[e.exId];
      return h('div', { class: 'card ex-edit' },
        h('div', { class: 'ex-edit-head' },
          h('span', { class: 'index' }, i + 1),
          h('div', { class: 'grow' }, h('strong', null, info.name), h('small', null, `${MUSCLE_LABELS[info.muscle]} · ${info.equipment}`)),
          h('button', { class: 'icon-btn small', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, icon('up')),
          h('button', { class: 'icon-btn small', 'aria-label': 'Move down', disabled: i === d.exercises.length - 1, onclick: () => move(i, 1) }, icon('arrowDown')),
          h('button', { class: 'icon-btn small danger', 'aria-label': 'Remove', onclick: () => { d.exercises.splice(i, 1); render(); } }, icon('x'))),
        h('div', { class: 'ex-edit-controls' },
          h('div', { class: 'stepper' },
            h('span', { class: 'label' }, 'Sets'),
            h('button', { 'aria-label': 'Fewer sets', disabled: e.sets <= 1, onclick: () => { e.sets--; render(); } }, '−'),
            h('strong', null, e.sets),
            h('button', { 'aria-label': 'More sets', disabled: e.sets >= 10, onclick: () => { e.sets++; render(); } }, '+')),
          h('div', { class: 'reps' },
            h('span', { class: 'label' }, 'Reps'),
            repInput(e.repMin, v => { e.repMin = clampInt(v, 1, 100); if (e.repMax < e.repMin) e.repMax = e.repMin; }),
            h('span', null, '–'),
            repInput(e.repMax, v => { e.repMax = clampInt(v, e.repMin, 100); }))));
    })),
    h('button', {
      class: 'btn dashed block', onclick: () => go('picker', {
        onPick: exId => d.exercises.push({ exId, sets: goal.sets, repMin: goal.repMin, repMax: goal.repMax, rest: goal.rest }),
        added: new Set(d.exercises.map(e => e.exId)),
      }),
    }, icon('plus'), 'Add exercise'),
    p.isNew ? null : h('button', { class: 'btn text danger block', onclick: del }, icon('trash'), 'Delete routine'),
    h('div', { class: 'footer-bar' },
      h('button', { class: 'btn primary block', onclick: saveRoutine }, icon('check'), 'Save routine')),
  ];
}

function repInput(value, onSet) {
  return h('input', {
    class: 'num small', value: String(value), inputMode: 'numeric', 'aria-label': 'Reps',
    onchange: e => { const v = parseNum(e.target.value); if (v != null && v >= 1) onSet(v); render(); },
  });
}

/* ---------- Exercise picker ---------- */

function viewPicker(p) {
  p.filter ||= 'all';
  p.query ||= '';
  const listEl = h('div', { class: 'picker-list' });
  const fill = () => {
    const q = p.query.toLowerCase();
    const matches = EXERCISES.filter(e =>
      (p.filter === 'all' || e.muscle === p.filter) && (!q || e.name.toLowerCase().includes(q)));
    const groups = MUSCLES.map(m => [m, matches.filter(e => e.muscle === m)]).filter(([, l]) => l.length);
    listEl.replaceChildren(...(groups.length ? groups.map(([m, list]) => h('div', { class: 'picker-group' },
      h('h3', { class: 'section-title' }, MUSCLE_LABELS[m]),
      h('div', { class: 'card rows' }, list.map(e =>
        h('button', { class: 'row', onclick: () => { p.onPick(e.id); back(); } },
          h('span', { class: 'grow' }, h('strong', null, e.name), h('small', null, e.equipment)),
          p.added?.has(e.id) ? chip('Added', 'subtle') : icon('plus', 'accent')))))) : [h('p', { class: 'muted center' }, 'No exercises found.')]));
  };
  fill();
  return [
    navBar('Add Exercise'),
    h('label', { class: 'search' }, icon('search'),
      h('input', { type: 'search', placeholder: 'Search exercises', value: p.query, 'aria-label': 'Search exercises',
        oninput: e => { p.query = e.target.value; fill(); } })),
    h('div', { class: 'scroll-row' }, ['all', ...MUSCLES].map(m =>
      h('button', { class: 'pill-btn' + (p.filter === m ? ' on' : ''), onclick: () => { p.filter = m; render(); } },
        m === 'all' ? 'All' : MUSCLE_LABELS[m]))),
    listEl,
  ];
}

/* ---------- Active workout ---------- */

let rest = null; // { end, total }

function startRest(seconds) {
  rest = seconds > 0 ? { end: Date.now() + seconds * 1000, total: seconds } : null;
}

function suggestionText(s, info) {
  const u = unit();
  if (s.kind === 'new') return ['First time', `Pick a weight you can lift for ${s.r}+ reps`];
  if (s.kind === 'bw-up') return ['Level up', `You hit every rep — go for ${s.r} reps or add weight`];
  if (s.kind === 'up') return ['Add weight', `You hit every rep last time — try ${fmtW(s.w)} ${u} × ${s.r}`];
  if (info.equipment === 'bodyweight' || !s.w) return ['Target', `Aim for ${s.r} reps per set`];
  return ['Target', `Stay at ${fmtW(s.w)} ${u} and aim for ${s.r} reps`];
}

function viewWorkout() {
  const w = state.active;
  if (!w) { nav.stack = []; return viewToday(); }
  const u = unit();

  const finish = () => {
    const done = w.exercises.reduce((t, e) => t + e.sets.filter(s => s.done).length, 0);
    const total = w.exercises.reduce((t, e) => t + e.sets.length, 0);
    if (!done) {
      if (confirm('You haven\'t completed any sets. Discard this workout?')) discard();
      return;
    }
    if (done < total && !confirm(`${plural(total - done, 'unchecked set')} will be removed. Finish workout?`)) return;
    const finished = {
      ...w, end: Date.now(),
      exercises: w.exercises.map(e => ({ ...e, sets: e.sets.filter(s => s.done) })).filter(e => e.sets.length),
    };
    const prs = newRecords(finished, state.workouts);
    state.workouts.push(finished);
    state.active = null;
    rest = null;
    persist();
    nav = { tab: 'today', stack: [{ view: 'summary', id: finished.id, prs }] };
    render(true);
  };
  const discard = () => {
    state.active = null;
    rest = null;
    persist();
    setTab('today');
  };

  return [
    h('header', { class: 'workout-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Minimize', onclick: back }, icon('down')),
      h('div', { class: 'grow center' }, h('strong', null, w.name), h('small', { class: 'js-elapsed mono' })),
      h('button', { class: 'btn primary small', onclick: finish }, 'Finish')),
    w.exercises.length ? null : emptyState('dumbbell', 'Empty workout', 'Add your first exercise to get going.'),
    w.exercises.map((we, i) => exerciseCard(we, i, w, u)),
    h('button', {
      class: 'btn dashed block', onclick: () => go('picker', {
        added: new Set(w.exercises.map(e => e.exId)),
        onPick: exId => {
          const g = GOALS.hypertrophy;
          w.exercises.push({ exId, repMin: g.repMin, repMax: g.repMax, rest: g.rest,
            sets: Array.from({ length: g.sets }, () => ({ w: null, r: null, done: false })) });
          persist();
        },
      }),
    }, icon('plus'), 'Add exercise'),
    h('button', { class: 'btn text danger block', onclick: () => { if (confirm('Discard this workout? Nothing will be saved.')) discard(); } },
      icon('trash'), 'Discard workout'),
    restBar(),
  ];
}

function exerciseCard(we, i, w, u) {
  const info = EXERCISES_BY_ID[we.exId];
  const last = lastPerformance(state.workouts, we.exId);
  const sugg = suggestNext(last?.sets, { sets: we.sets.length, repMin: we.repMin, repMax: we.repMax }, incrementKg());
  const [tag, text] = suggestionText(sugg, info);
  const bodyweight = info.equipment === 'bodyweight';

  const toggleSet = (s, j) => {
    if (s.done) { s.done = false; persist(); render(); return; }
    const prev = we.sets[j - 1];
    if (s.w == null) s.w = prev?.w ?? sugg.w ?? (bodyweight ? 0 : null);
    if (s.r == null) s.r = prev?.r ?? sugg.r;
    if (s.w == null) return toast('Enter the weight first.');
    if (!s.r) return toast('Enter your reps first.');
    s.done = true;
    startRest(we.rest);
    persist();
    render();
  };

  return h('div', { class: 'card exercise' },
    h('div', { class: 'exercise-head' },
      h('div', { class: 'grow' }, h('h3', null, info.name),
        h('small', null, `${MUSCLE_LABELS[info.muscle]} · ${we.repMin}–${we.repMax} reps · ${fmtClock(we.rest)} rest`)),
      h('button', {
        class: 'icon-btn small', 'aria-label': `Remove ${info.name}`,
        onclick: () => { if (confirm(`Remove ${info.name} from this workout?`)) { w.exercises.splice(i, 1); persist(); render(); } },
      }, icon('x'))),
    h('div', { class: 'suggestion ' + sugg.kind },
      icon(sugg.kind === 'up' || sugg.kind === 'bw-up' ? 'up' : 'sparkle'),
      h('span', null, h('strong', null, tag + ' '), text)),
    h('div', { class: 'sets' },
      h('div', { class: 'set-row head' },
        h('span', null, 'Set'), h('span', null, 'Previous'),
        h('span', null, bodyweight ? `+${u}` : u), h('span', null, 'Reps'), h('span', null, '')),
      we.sets.map((s, j) => {
        const p = last?.sets[j];
        const placeholderW = we.sets[j - 1]?.w ?? sugg.w;
        return h('div', { class: 'set-row' + (s.done ? ' done' : '') },
          h('span', { class: 'set-num' }, j + 1),
          h('span', { class: 'prev' }, p ? `${p.w ? fmtW(p.w) : 'BW'} × ${p.r}` : '—'),
          h('input', {
            class: 'num', inputMode: 'decimal', value: fmtW(s.w), placeholder: placeholderW != null ? fmtW(placeholderW) || '0' : (bodyweight ? '0' : '–'),
            'aria-label': `Set ${j + 1} weight`, enterKeyHint: 'next',
            oninput: e => { const v = parseNum(e.target.value); s.w = v == null ? null : fromDisplay(v); persist(); },
          }),
          h('input', {
            class: 'num', inputMode: 'numeric', value: s.r == null ? '' : String(s.r), placeholder: String(we.sets[j - 1]?.r ?? sugg.r),
            'aria-label': `Set ${j + 1} reps`, enterKeyHint: 'done',
            oninput: e => { const v = parseNum(e.target.value); s.r = v == null ? null : clampInt(v, 0, 1000); persist(); },
          }),
          h('button', { class: 'check', 'aria-label': `Complete set ${j + 1}`, 'aria-pressed': String(s.done), onclick: () => toggleSet(s, j) }, icon('check')));
      })),
    h('div', { class: 'exercise-foot' },
      h('button', {
        class: 'btn text small', disabled: we.sets.length >= 20,
        onclick: () => { const p = we.sets[we.sets.length - 1]; we.sets.push({ w: p?.w ?? null, r: null, done: false }); persist(); render(); },
      }, icon('plus'), 'Add set'),
      we.sets.length > 1 ? h('button', { class: 'btn text small muted', onclick: () => { we.sets.pop(); persist(); render(); } }, 'Remove set') : null));
}

function restBar() {
  if (!rest) return null;
  const adjust = d => { rest.end += d * 1000; rest.total = Math.max(1, rest.total + d); tick(); };
  return h('div', { class: 'rest-bar' },
    h('span', { class: 'rest-progress' }, h('span', { class: 'bar-fill js-rest-bar' })),
    h('div', { class: 'rest-inner' },
      h('div', { class: 'grow' }, h('small', { class: 'js-rest-label' }, 'Rest'), h('strong', { class: 'js-rest mono' })),
      h('button', { class: 'btn secondary small', onclick: () => adjust(-15) }, '−15'),
      h('button', { class: 'btn secondary small', onclick: () => adjust(15) }, '+15'),
      h('button', { class: 'btn primary small', onclick: () => { rest = null; render(); } }, 'Skip')));
}

// Updates timers in place once a second without re-rendering the screen.
function tick() {
  if (state.active) {
    const text = fmtClock((Date.now() - state.active.start) / 1000);
    for (const el of document.querySelectorAll('.js-elapsed')) el.textContent = text;
  }
  if (!rest) return;
  const left = (rest.end - Date.now()) / 1000;
  const label = document.querySelector('.js-rest');
  if (left <= -3) { rest = null; document.querySelector('.rest-bar')?.remove(); return; }
  if (label) label.textContent = left > 0 ? fmtClock(Math.ceil(left)) : 'Go!';
  const lbl = document.querySelector('.js-rest-label');
  if (lbl) lbl.textContent = left > 0 ? 'Rest' : 'Rest over';
  const bar = document.querySelector('.js-rest-bar');
  if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / rest.total))})`;
}
setInterval(tick, 1000);

/* ---------- Summary ---------- */

function viewSummary(p) {
  const w = state.workouts.find(x => x.id === p.id);
  if (!w) { nav.stack = []; return viewToday(); }
  const sets = w.exercises.reduce((t, e) => t + e.sets.length, 0);
  return [
    h('div', { class: 'summary-hero' },
      h('div', { class: 'big-check' }, icon('check')),
      h('h1', null, 'Workout complete'),
      h('p', { class: 'muted' }, w.name)),
    h('div', { class: 'stats' },
      stat('clock', fmtDuration(w.end - w.start), 'Duration'),
      stat('dumbbell', sets, 'Sets'),
      stat('stack', fmtVolume(workoutVolume(w)), `${unit()} volume`)),
    p.prs.length ? section('New personal records',
      h('div', { class: 'card rows' }, p.prs.map(pr =>
        h('div', { class: 'row' }, icon('trophy', 'gold'),
          h('span', { class: 'grow' }, h('strong', null, EXERCISES_BY_ID[pr.exId].name),
            h('small', null, pr.kind === 'weight' ? `Heaviest weight: ${fmtW(pr.value)} ${unit()}` : `Best estimated 1RM: ${fmtW(pr.value)} ${unit()}`)))))) : null,
    section(null, h('button', { class: 'btn primary block', onclick: () => setTab('today') }, 'Done')),
  ];
}

/* ---------- History ---------- */

function viewHistory() {
  const seg = h('div', { class: 'segmented' },
    [['workouts', 'Workouts'], ['exercises', 'Exercises']].map(([id, label]) =>
      h('button', { class: historyTab === id ? 'on' : '', onclick: () => { historyTab = id; render(); } }, label)));
  if (!state.workouts.length) {
    return [largeTitle('History'), emptyState('chart', 'No workouts yet', 'Finish a workout and your progress shows up here.')];
  }
  return [largeTitle('History', plural(state.workouts.length, 'workout')), seg,
    historyTab === 'workouts' ? workoutList() : exerciseList()];
}

function workoutList() {
  const groups = new Map();
  for (const w of [...state.workouts].reverse()) {
    const key = fmtDate(w.start, { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  return [...groups].map(([month, list]) => section(month,
    h('div', { class: 'list' }, list.map(w =>
      h('button', { class: 'card workout-row', onclick: () => go('workoutDetail', { id: w.id }) },
        h('div', { class: 'date-block' },
          h('strong', null, new Date(w.start).getDate()),
          h('small', null, fmtDate(w.start, { weekday: 'short' }))),
        h('div', { class: 'grow' }, h('strong', null, w.name),
          h('small', null, `${fmtDuration((w.end || w.start) - w.start)} · ${plural(w.exercises.reduce((t, e) => t + e.sets.length, 0), 'set')} · ${fmtVolume(workoutVolume(w))} ${unit()}`)),
        icon('chevron', 'muted'))))));
}

function exerciseList() {
  const stats = exerciseStats(state.workouts);
  const ids = Object.keys(stats).sort((a, b) =>
    stats[b].sessions[stats[b].sessions.length - 1].t - stats[a].sessions[stats[a].sessions.length - 1].t);
  return section(null, h('div', { class: 'card rows' }, ids.map(id => {
    const s = stats[id];
    const best = s.bestW ? `Best ${fmtW(s.bestW)} ${unit()} × ${s.bestWReps}` : `Best ${s.maxReps} reps`;
    return h('button', { class: 'row', onclick: () => go('exerciseDetail', { exId: id }) },
      h('span', { class: 'grow' }, h('strong', null, EXERCISES_BY_ID[id].name), h('small', null, `${best} · ${plural(s.sessions.length, 'session')}`)),
      icon('chevron', 'muted'));
  })));
}

function viewWorkoutDetail(p) {
  const w = state.workouts.find(x => x.id === p.id);
  if (!w) { nav.stack = []; return viewHistory(); }
  const del = () => {
    if (!confirm('Delete this workout from your history?')) return;
    state.workouts = state.workouts.filter(x => x.id !== w.id);
    persist();
    back();
  };
  return [
    navBar(fmtDate(w.start, { month: 'short', day: 'numeric' })),
    h('div', { class: 'detail-head' },
      h('h1', null, w.name),
      h('p', { class: 'muted' }, fmtDate(w.start, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))),
    h('div', { class: 'stats' },
      stat('clock', fmtDuration((w.end || w.start) - w.start), 'Duration'),
      stat('dumbbell', w.exercises.reduce((t, e) => t + e.sets.length, 0), 'Sets'),
      stat('stack', fmtVolume(workoutVolume(w)), `${unit()} volume`)),
    w.exercises.map(e => section(EXERCISES_BY_ID[e.exId].name,
      h('div', { class: 'card rows' }, e.sets.map((s, i) =>
        h('div', { class: 'row compact' }, h('span', { class: 'set-num' }, i + 1),
          h('span', { class: 'grow' }, s.w ? `${fmtW(s.w)} ${unit()} × ${s.r}` : `${s.r} reps`)))))),
    h('button', { class: 'btn text danger block', onclick: del }, icon('trash'), 'Delete workout'),
  ];
}

function viewExerciseDetail(p) {
  const info = EXERCISES_BY_ID[p.exId];
  const s = exerciseStats(state.workouts)[p.exId];
  if (!s) { nav.stack = []; return viewHistory(); }
  const weighted = s.bestW > 0;
  return [
    navBar('Exercise'),
    h('div', { class: 'detail-head' }, h('h1', null, info.name), h('p', { class: 'muted' }, `${MUSCLE_LABELS[info.muscle]} · ${info.equipment}`)),
    h('div', { class: 'stats' },
      weighted ? stat('trophy', `${fmtW(s.bestW)}`, `Best ${unit()} (×${s.bestWReps})`) : stat('trophy', s.maxReps, 'Best reps'),
      weighted ? stat('bolt', fmtW(s.best1RM), `Est. 1RM ${unit()}`) : null,
      stat('stack', s.sessions.length, 'Sessions')),
    section(weighted ? 'Estimated 1-rep max' : 'Best reps per session',
      h('div', { class: 'card chart-card' }, chart(s.sessions.map(x => ({
        t: x.t, v: weighted ? toDisplay(x.e1rm) : Math.max(...x.sets.map(st => st.r)),
      }))))),
    section('Recent sessions',
      h('div', { class: 'card rows' }, [...s.sessions].reverse().slice(0, 15).map(x =>
        h('div', { class: 'row' },
          h('span', { class: 'grow' }, h('strong', null, fmtDate(x.t, { weekday: 'short', month: 'short', day: 'numeric' })),
            h('small', null, x.sets.map(st => st.w ? `${fmtW(st.w)}×${st.r}` : `${st.r}`).join('  ·  '))))))),
  ];
}

function chart(points) {
  if (points.length < 2) return h('p', { class: 'muted center' }, 'Log another session to see your progress chart.');
  const W = 320, H = 150, P = 14;
  const vs = points.map(p => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (min === max) { min -= 1; max += 1; }
  const x = i => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = v => P + (1 - (v - min) / (max - min)) * (H - 2 * P - 10);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)},${H}L${x(0).toFixed(1)},${H}Z`;
  const last = points[points.length - 1];
  return h('div', { class: 'chart' },
    h('div', { class: 'chart-labels' },
      h('strong', null, String(Math.round(last.v * 10) / 10)),
      h('small', { class: (last.v >= points[0].v ? 'up' : 'down') },
        `${last.v >= points[0].v ? '+' : ''}${Math.round((last.v - points[0].v) * 10) / 10} since ${fmtDate(points[0].t, { month: 'short', day: 'numeric' })}`)),
    svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': 'Progress chart' },
      svg('defs', null, svg('linearGradient', { id: 'chartFill', x1: '0', y1: '0', x2: '0', y2: '1' },
        svg('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '0.35' }),
        svg('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }))),
      svg('path', { d: area, fill: 'url(#chartFill)' }),
      svg('path', { d: line, fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      ...points.map((p, i) => svg('circle', { cx: x(i).toFixed(1), cy: y(p.v).toFixed(1), r: i === points.length - 1 ? '4.5' : '2.5', fill: 'currentColor' }))));
}

/* ---------- Settings ---------- */

function viewSettings() {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: importBackup });
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return [
    largeTitle('Settings'),
    section('Units',
      h('div', { class: 'segmented' }, [['kg', 'Kilograms'], ['lb', 'Pounds']].map(([id, label]) =>
        h('button', { class: unit() === id ? 'on' : '', onclick: () => { state.settings.unit = id; persist(); render(); } }, label)))),
    section('Privacy',
      h('div', { class: 'card privacy' }, icon('shield', 'accent'),
        h('div', null, h('strong', null, 'Your data stays on this device'),
          h('p', { class: 'muted' }, 'Lift has no accounts, no servers and no tracking. Nothing you log is ever uploaded — it is stored only on this iPhone.')))),
    standalone ? null : section('Install',
      h('div', { class: 'card privacy' }, icon('share', 'accent'),
        h('div', null, h('strong', null, 'Add Lift to your Home Screen'),
          h('p', { class: 'muted' }, 'In Safari, tap the Share button, then “Add to Home Screen”. It opens full-screen and iOS keeps your data safe.')))),
    section('Backup',
      h('div', { class: 'card rows' },
        h('button', { class: 'row', onclick: exportBackup }, icon('share', 'accent'),
          h('span', { class: 'grow' }, h('strong', null, 'Export backup'), h('small', null, `${plural(state.workouts.length, 'workout')} · ${plural(state.routines.length, 'routine')}`))),
        h('button', { class: 'row', onclick: () => fileInput.click() }, icon('upload', 'accent'),
          h('span', { class: 'grow' }, h('strong', null, 'Restore from backup'), h('small', null, 'Replaces the data on this device'))),
        fileInput)),
    section(null,
      h('button', { class: 'btn text danger block', onclick: eraseAll }, icon('trash'), 'Erase all data')),
    h('p', { class: 'muted center small' }, 'Lift 1.0'),
  ];
}

async function exportBackup() {
  const name = `lift-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(state)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Lift backup' }); } catch { /* cancelled */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) return toast('That file is too large to be a Lift backup.');
  try {
    const next = parseBackup(await file.text());
    if (!confirm(`Restore ${plural(next.workouts.length, 'workout')} and ${plural(next.routines.length, 'routine')}? This replaces everything currently on this device.`)) return;
    state = next;
    rest = null;
    persist();
    toast('Backup restored');
    setTab('today');
  } catch (err) {
    toast(err.message);
  }
}

function eraseAll() {
  if (!confirm('Erase all routines and workout history from this device? This cannot be undone.')) return;
  clear();
  state = load();
  rest = null;
  setTab('today');
  toast('All data erased');
}

/* ---------- boot ---------- */

render(true);
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
