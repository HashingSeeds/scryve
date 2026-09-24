# Store asset capture flows

The capture suite prioritizes the in-game board at three representative player counts:

- `01-two-player-game.png`
- `02-five-player-game.png`
- `03-six-player-game.png`
- `04-six-player-controls.png` (phone only)
- `04-new-game-setup.png` (10-inch tablet only)

`_CaptureGame.yaml` resets application state, creates the requested game, changes two life totals, waits for animations to settle, and captures the board. `CapturePhone.yaml` and `CaptureTablet.yaml` run that helper for 2, 5, and 6 players.

## Google Play capture profiles

Run these against a dedicated emulator, always passing its ID explicitly:

```bash
# Phone upload assets: 1080 × 1920
adb -s emulator-5554 shell wm size 1080x1920
adb -s emulator-5554 shell wm density 420

# 10-inch upload assets: 1440 × 2560, 720dp logical width
adb -s emulator-5554 shell wm size 1440x2560
adb -s emulator-5554 shell wm density 320

MAESTRO_APP_ID=com.sowinghope.count maestro test \
  --device emulator-5554 \
  .maestro/store-assets/CaptureTablet.yaml

# Restore the emulator afterward.
adb -s emulator-5554 shell wm size reset
adb -s emulator-5554 shell wm density reset
```

The 10-inch set was verified at 320 dpi with visible life totals on the five- and six-player boards. The extra new-game screenshot was captured manually from the same emulator profile.

The refreshed 7-inch set uses the Goldie flow in `goldie/tablet-7/config.ts` on a separate tablet emulator; see `play-store-assets/README.md`.

## Apple in-app purchase review screenshot

Apple's review screenshot is an internal review artifact, not a public product-page screenshot.
`CaptureAppleReview.yaml` preserves the installed app's state, opens the live Scryve Pro
paywall, and captures all three purchase choices to:

```text
.maestro/screenshots/apple-review/count-pro-paywall.png
```

Prerequisites:

1. Use an iPhone simulator whose native pixel dimensions match an App Store screenshot size.
2. Install a build with bundle ID `com.sowinghope.count` and the production RevenueCat iOS key.
3. Sign into a non-Pro Clerk test account before running the flow.
4. Set the launch destination to Play in Settings. Resolve any stale game through the normal UI, then relaunch once to confirm the board opens without a "Continue game?" prompt. Choosing Continue alone does not persist that choice across relaunches. The capture preserves app state; keep the account signed in.
5. Publish the RevenueCat paywall for the `default` offering.

Run:

```bash
pnpm run capture:apple-review
```

The same screenshot may be uploaded as the App Review screenshot for `monthly`, `yearly`, and
`lifetime` because it clearly shows all three products. Regenerate it when the paywall or product
presentation materially changes.
