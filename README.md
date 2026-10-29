# Lift — Workout Tracker

A private, offline workout tracker for iPhone. Build routines for the muscles
you want to train, log your sets, and get recommendations on what to train
next and how much weight to use.

## Install on your iPhone

1. Open the GitHub Pages link in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Open Lift from your home screen. It runs full-screen and works offline.

## Features

- **Today:** recommends a routine based on which muscles have recovered (48h rule), shows your weekly stats and a muscle recovery map.
- **Routine builder:** pick muscles, a goal (strength / muscle / endurance) and your available time, and Lift builds an editable routine.
- **Workout logging:** previous numbers, progressive-overload targets (+2.5 kg when you hit the top of your rep range on every set) and a rest timer.
- **History:** past workouts, personal records and a progress chart for each exercise.
- **Effort ratings:** after each set, optionally rate how hard it was (6–10). Weight suggestions use it: hit every rep at max effort → repeat the weight; missed reps but it felt easy → add weight.
- **Apple Watch heart rate:** after a workout, import heart rate from Apple Health to see a heart-rate chart, zones, per-exercise effort and how much your recovery between sets slowed (a fatigue signal). The one-time Shortcuts setup is explained in the app under **Settings → Apple Health shortcut**.
- **Backup:** export and restore your data as a file.

## Privacy & security

- All data is stored only in the browser on your device (`localStorage`). There are no accounts, servers, analytics or third-party scripts, and the app makes no network requests besides loading its own files.
- A strict Content-Security-Policy allows only the app's own files to load.
- User input is always rendered as text, never as HTML.
- Imported backups are size-limited and rebuilt field by field from a strict schema.
- Heart rate comes from a shortcut you run yourself, via the clipboard. Lift only accepts data in that shortcut's format, keeps only the readings from the workout's time window, and clears the clipboard afterwards.
- The repository contains only code, never any workout data.

## Development

No build step. Serve the folder with any static server, e.g. `python3 -m http.server`, then:

```sh
npm test   # unit tests for recommendations and data validation (Node 20+)
```
