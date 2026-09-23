# Android store-asset capture (agent-device replay)

Deterministic `.ad` replay scripts for Google Play screenshots and promo-video
source. These replace the Maestro store-asset flows on Android: agent-device's
Maestro engine accepts only literals and bare `${VAR}` lookups, and
`.maestro/store-assets/_CaptureGame.yaml` uses expression payloads
(`when.true: ${PLAYER_COUNT > 2}`, `repeat.times: ${PLAYER_COUNT - 2}`), which
fail loudly rather than being skipped.

## Prerequisites

1. A production-identifier release APK installed on the emulator
   (`com.sowinghope.count`).
2. The legal consent gate accepted once on that emulator. `.ad` replay is
   deterministic and cannot branch, so the gate is not handled in-script.

## Google Play upload profiles

Play wants 1080x1920 for phone and 7-inch, 1440x2560 for 10-inch. Set the
logical size and density on the emulator before replaying, and reset after.
The compact density profiles are deliberate: at native large-screen densities
the five- and six-player cards render marks and controls but omit the life
numerals (see .maestro/store-assets/README.md).

```bash
adb -s emulator-5554 shell wm size 1080x1920
adb -s emulator-5554 shell wm density 420

agent-device test "./*.ad" --platform android --artifacts-dir ./artifacts

adb -s emulator-5554 shell wm size reset
adb -s emulator-5554 shell wm density reset
```

Run a single script with:

```bash
agent-device replay ./android-03-six-player.ad --platform android
```

## Ordering

`android-04-six-player-controls.ad` resumes the game left by
`android-03-six-player.ad`. `agent-device test` runs discovered scripts
serially in filename order, which preserves that dependency.
