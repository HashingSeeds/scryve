---
name: verify-perf
description: Use when a change could make the board slower on a phone (renders, animations, lists, sync) or slow down app launch (native dependencies, startup work), or to prove a perf fix with before and after numbers from a real device.
---

# Verify perf

Measures JS and UI thread CPU and dropped frames for fixed board interactions on a real Android
phone, then compares a before bundle with an after bundle on the same device and binary.
Render counts and websocket bytes are already exact in Jest (`test/perf`,
`convex/lobbyProjection.perf.test.ts`); run those first. This skill is for what Jest can't see.

Only Android is proven. `Prepare.yaml` uses Android's back key and answers Android's nearby
devices prompt, and `run.mjs` reads Perfetto traces, so the iPhone needs both reworked first.

## What it runs

`.maestro/perf/` holds the flows. `Prepare.yaml` gets past the dev client's intro and menu,
the nearby devices prompt, and first-run setup. Before each scenario, `Board4.yaml` starts a new
4-player game. The scenarios:

- `LifeTaps.yaml`: 12 quick taps on one seat's life.
- `MenuToggle.yaml`: open and close the game menu 3 times.

`run.mjs` traces each scenario with Perfetto and repeats every scenario 10 times. Per sample:

- `jsCpuMs`: CPU time of the JS thread (`mqt_v_js`) over the scenario. This is the metric that
  sees slower renders and reducers; frame stats come from the UI thread and miss them.
- `uiCpuMs`: the same for the app's main (UI) thread. Most of it is Maestro reading the view
  tree, so it also moves with how many views the board has.
- `droppedFramePercent`: from gfxinfo over the scenario.

CPU is a total, not a share of the time, because Maestro waits for the app to settle after each
tap: slower JS also stretches the scenario. agent-device traces into Perfetto's default 32 MB
ring buffer, which menu animations fill in about 20 seconds, so the scenarios are short and
`run.mjs` stops if a trace wrapped. Keep any new scenario that short. `run.mjs` downloads a pinned
`trace_processor_shell` (Perfetto v58.0, checksum checked) to `~/.cache/verify-perf` on first
use, and deletes each trace once it is read.

## Steps

Run everything on the Mac mini with the Pixel 6a (`--serial 25061JEGR08933`): traces land on
the mini, and `run.mjs` reads them there. Emulator numbers say nothing about a phone: the
emulator drops over 90% of frames on any bundle.

1. Make a worktree for each side (usually `origin/main` and your branch) and link the main
   checkout's `.env.local` into each, which holds the dev Convex URL.
2. Serve the **before** bundle in production mode on the device's dev client. Production mode
   runs the JS the way a release build does, and the dev client keeps the native binary the same
   for both sides:

   ```sh
   agent-device-mini up --app com.sowinghope.count.dev --scheme scryve-dev --serial 25061JEGR08933 --dir <before worktree> -- \
     sh -c 'set -a && . ./.env.development && . ./.env.local && set +a && APP_VARIANT=development npx expo start --dev-client --scheme scryve-dev --port "$METRO_PORT" --no-dev --minify --clear'
   ```

   Source the env files yourself: with `--no-dev`, Expo loads the production env files
   instead. Without the Convex URL, starting a game crashes into "Something went wrong".

3. Run it: `AD="agent-device-mini --serial 25061JEGR08933" node .agents/skills/verify-perf/run.mjs /tmp/before.json`.
   Ten runs take about 13 minutes, so run it in the background.
4. `agent-device-mini down`, then repeat steps 2 and 3 with the **after** worktree into `/tmp/after.json`.
5. Compare: `node .agents/skills/verify-perf/compare.mjs /tmp/before.json /tmp/after.json`.
   A metric regresses when the after runs are worse than the before runs at p <= 0.01 on an
   exact permutation test, so noise rarely fails a change. Exit 1 means a regression. Put the
   table in the PR. JS CPU varies about 5% between runs, so 10 runs a side reliably catch a
   change of about 10% (an 8 ms stall in every LifeCard render); 5 runs do not. Smaller
   regressions can read as ok, so keep relying on `test/perf` for render counts.
6. `agent-device-mini close`.

A local emulator works for changing the flows: start Metro with `metro-session` and the same
command, open the dev client on
`scryve-dev://expo-development-client/?url=<URL-encoded Metro URL>`, and pass the agent-device
command `device_open` gives you as `AD`.

## Frame probe

For frame numbers on any backend, iOS included, set `EXPO_PUBLIC_FRAME_PROBE=1` in the Metro
command. It works in development and production mode (`--no-dev --minify`) on the dev client.
It also needs `APP_VARIANT=development`, so store, preview, and beta bundles never show it
even if an EAS environment sets the flag.

```sh
agent-device-mini up --app com.sowinghope.count.dev --scheme scryve-dev --udid <simulator> -- \
  sh -c 'set -a && . ./.env.development && . ./.env.local && set +a && EXPO_PUBLIC_FRAME_PROBE=1 APP_VARIANT=development npx expo start --dev-client --scheme scryve-dev --port "$METRO_PORT" --no-dev --minify --clear'
```

Drop `--no-dev --minify --clear` and the env sourcing for development mode. With the probe on, a
small readout sits in the top-left corner of every screen, and its accessibility label reads:

```
frame-probe ui frames=479 dropped=24 hitches=11 max=111 js frames=494 dropped=11 hitches=6 max=73
```

`ui` counts Reanimated frame callbacks on the UI thread, `js` counts `requestAnimationFrame` on the
JS thread. `dropped` is missed frame slots (a gap over 1.5 frames at 60 Hz), `hitches` is how many
gaps missed any, and `max` is the longest gap in ms. Counters are cumulative and refresh every
500 ms. Tap the readout (`press 'id="frame-probe"'`) to reset them, wait a second, then read the
label with `snapshot` before and after an action, waiting at least 500 ms after it. On Revyl,
read the same numbers from a screenshot. A snapshot itself can drop a few UI frames, so compare
against an idle reset-and-read with no action between.

## Launch times

`launch.mjs` times cold and hot launches. Launch time depends on the native binary, so it compares
two preview builds (release native code, dev Clerk and Convex), not two bundles on one dev client.
Each run relaunches the app under a Perfetto trace, then sends it home and opens it again:

- `Cold launchMs`: Android's launch time, from the tap to the app's first frame
  (`android_startups`), which the splash screen holds back until it hides.
- `Cold interactiveMs`: process start until the app is interactive, from the startup metrics EAS
  Observe reports from the field (`coldLaunchTime` plus `timeToInteractive`), which Android
  reports from API 35 (Android 15). Development and preview builds log them as
  `scryve-launch {...}` (`src/devtools/launchTimes.ts`), and the script reads that line from the
  session's app log.
- `Hot launchMs`: Android's launch time when the process is still alive.

1. Build a preview APK of each side from its worktree: `pnpm android:preview --build-path <path>`.
   A side older than `src/devtools/launchTimes.ts` logs no launch times, so cherry-pick the
   commit that added it first; it is JS only and leaves the native side as it was.
2. Install the **before** APK (`agent-device-mini install com.sowinghope.count.preview <apk>`),
   open it once, and get past first-run setup onto a board, so every launch lands on the same
   screen.
3. Run it on the mini, like `run.mjs`:
   `AD="agent-device-mini --serial 25061JEGR08933" node .agents/skills/verify-perf/launch.mjs /tmp/launch-before.json`.
4. Install the **after** APK over it (same EAS signing key, so the app keeps its data), and run
   it again into `/tmp/launch-after.json`.
5. `node .agents/skills/verify-perf/compare.mjs /tmp/launch-before.json /tmp/launch-after.json`.

A local emulator works with the `agent-device` command `device_open` gives you as `AD`, but its
absolute numbers say little about a phone.

## Not covered

Connected and nearby play, iOS launch times, and where the CPU goes. When a metric regresses and
you need to know why, take a trace by hand and open it in ui.perfetto.dev: `agent-device-mini perf trace start --kind perfetto --out <path>`.
