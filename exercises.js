// Exercise library. `muscle` is the primary muscle group used for recovery
// tracking; `compound` exercises are placed first when building routines.

export const MUSCLES = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
];

export const MUSCLE_LABELS = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps',
  triceps: 'Triceps', quads: 'Quads', hamstrings: 'Hamstrings',
  glutes: 'Glutes', calves: 'Calves', core: 'Core',
};

const ex = (id, name, muscle, equipment, compound = false) =>
  ({ id, name, muscle, equipment, compound });

export const EXERCISES = [
  // Chest
  ex('bench-press', 'Barbell Bench Press', 'chest', 'barbell', true),
  ex('incline-db-press', 'Incline Dumbbell Press', 'chest', 'dumbbell', true),
  ex('db-bench-press', 'Dumbbell Bench Press', 'chest', 'dumbbell', true),
  ex('incline-bench-press', 'Incline Barbell Press', 'chest', 'barbell', true),
  ex('push-up', 'Push-Up', 'chest', 'bodyweight', true),
  ex('chest-dip', 'Chest Dip', 'chest', 'bodyweight', true),
  ex('cable-fly', 'Cable Fly', 'chest', 'cable'),
  ex('pec-deck', 'Pec Deck', 'chest', 'machine'),

  // Back
  ex('pull-up', 'Pull-Up', 'back', 'bodyweight', true),
  ex('barbell-row', 'Barbell Row', 'back', 'barbell', true),
  ex('lat-pulldown', 'Lat Pulldown', 'back', 'cable', true),
  ex('seated-cable-row', 'Seated Cable Row', 'back', 'cable', true),
  ex('db-row', 'One-Arm Dumbbell Row', 'back', 'dumbbell', true),
  ex('deadlift', 'Deadlift', 'back', 'barbell', true),
  ex('chin-up', 'Chin-Up', 'back', 'bodyweight', true),
  ex('t-bar-row', 'T-Bar Row', 'back', 'barbell', true),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'back', 'cable'),

  // Shoulders
  ex('overhead-press', 'Overhead Press', 'shoulders', 'barbell', true),
  ex('seated-db-press', 'Seated Dumbbell Press', 'shoulders', 'dumbbell', true),
  ex('arnold-press', 'Arnold Press', 'shoulders', 'dumbbell', true),
  ex('lateral-raise', 'Lateral Raise', 'shoulders', 'dumbbell'),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'shoulders', 'cable'),
  ex('rear-delt-fly', 'Rear Delt Fly', 'shoulders', 'dumbbell'),
  ex('face-pull', 'Face Pull', 'shoulders', 'cable'),

  // Biceps
  ex('barbell-curl', 'Barbell Curl', 'biceps', 'barbell'),
  ex('db-curl', 'Dumbbell Curl', 'biceps', 'dumbbell'),
  ex('hammer-curl', 'Hammer Curl', 'biceps', 'dumbbell'),
  ex('incline-db-curl', 'Incline Dumbbell Curl', 'biceps', 'dumbbell'),
  ex('cable-curl', 'Cable Curl', 'biceps', 'cable'),
  ex('preacher-curl', 'Preacher Curl', 'biceps', 'machine'),

  // Triceps
  ex('close-grip-bench', 'Close-Grip Bench Press', 'triceps', 'barbell', true),
  ex('triceps-pushdown', 'Triceps Pushdown', 'triceps', 'cable'),
  ex('overhead-triceps-ext', 'Overhead Triceps Extension', 'triceps', 'cable'),
  ex('skull-crusher', 'Skull Crusher', 'triceps', 'barbell'),
  ex('bench-dip', 'Bench Dip', 'triceps', 'bodyweight'),

  // Quads
  ex('back-squat', 'Back Squat', 'quads', 'barbell', true),
  ex('front-squat', 'Front Squat', 'quads', 'barbell', true),
  ex('leg-press', 'Leg Press', 'quads', 'machine', true),
  ex('hack-squat', 'Hack Squat', 'quads', 'machine', true),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', 'dumbbell', true),
  ex('goblet-squat', 'Goblet Squat', 'quads', 'dumbbell', true),
  ex('walking-lunge', 'Walking Lunge', 'quads', 'dumbbell', true),
  ex('leg-extension', 'Leg Extension', 'quads', 'machine'),

  // Hamstrings
  ex('romanian-deadlift', 'Romanian Deadlift', 'hamstrings', 'barbell', true),
  ex('good-morning', 'Good Morning', 'hamstrings', 'barbell', true),
  ex('lying-leg-curl', 'Lying Leg Curl', 'hamstrings', 'machine'),
  ex('seated-leg-curl', 'Seated Leg Curl', 'hamstrings', 'machine'),
  ex('nordic-curl', 'Nordic Curl', 'hamstrings', 'bodyweight'),

  // Glutes
  ex('hip-thrust', 'Barbell Hip Thrust', 'glutes', 'barbell', true),
  ex('sumo-deadlift', 'Sumo Deadlift', 'glutes', 'barbell', true),
  ex('step-up', 'Dumbbell Step-Up', 'glutes', 'dumbbell', true),
  ex('glute-bridge', 'Glute Bridge', 'glutes', 'bodyweight'),
  ex('cable-kickback', 'Cable Kickback', 'glutes', 'cable'),

  // Calves
  ex('standing-calf-raise', 'Standing Calf Raise', 'calves', 'machine'),
  ex('seated-calf-raise', 'Seated Calf Raise', 'calves', 'machine'),
  ex('single-leg-calf-raise', 'Single-Leg Calf Raise', 'calves', 'bodyweight'),

  // Core
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'core', 'bodyweight'),
  ex('ab-wheel', 'Ab Wheel Rollout', 'core', 'bodyweight'),
  ex('cable-crunch', 'Cable Crunch', 'core', 'cable'),
  ex('russian-twist', 'Russian Twist', 'core', 'bodyweight'),
  ex('pallof-press', 'Pallof Press', 'core', 'cable'),
  ex('dead-bug', 'Dead Bug', 'core', 'bodyweight'),
];

export const EXERCISES_BY_ID = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
