# Store asset capture flows

The capture suite prioritizes the in-game board at three representative player counts:

- `01-two-player-game.png`
- `02-five-player-game.png`
- `03-six-player-game.png`
- `04-six-player-controls.png` (phone only)

`_CaptureGame.yaml` resets application state, creates the requested game, changes two life totals, waits for animations to settle, and captures the board. `CapturePhone.yaml` and `CaptureTablet.yaml` run that helper for 2, 5, and 6 players.

## Google Play capture profiles

Run these against a dedicated emulator, always passing its ID explicitly:

```bash
# Phone and 7-inch upload assets: 1080 × 1920
adb -s emulator-5554 shell wm size 1080x1920
adb -s emulator-5554 shell wm density 420

# 10-inch upload assets: 1440 × 2560
adb -s emulator-5554 shell wm size 1440x2560
adb -s emulator-5554 shell wm density 560

MAESTRO_APP_ID=com.sowinghope.count maestro test \
  --device emulator-5554 \
  .maestro/store-assets/CaptureTablet.yaml

# Restore the emulator afterward.
adb -s emulator-5554 shell wm size reset
adb -s emulator-5554 shell wm density reset
```

The current app has a large-logical-width layout defect: at lower tablet densities, five- and six-player cards render their marks and controls but omit the life-total numerals. The compact logical-density profiles above keep the real game board visible while producing Google Play-compliant pixel dimensions. Fix that responsive breakpoint before using native large-screen-density captures.
