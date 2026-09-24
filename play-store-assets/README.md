# Google Play visual assets

The phone assets were made with Goldie from an offline preview release APK. The 7-inch assets were captured from the production Android bundle. The 10-inch assets were captured from the current development app on an Android 16 emulator at 1,440 × 2,560 pixels and 320 dpi. All were visually reviewed before packaging.

## Upload inventory

| Play Console field | Asset(s) | Dimensions |
| --- | --- | --- |
| App icon | `app-icon/app-icon-512.png` | 512 × 512 |
| Feature graphic | `feature-graphic/feature-graphic-1024x500.png` | 1,024 × 500 |
| Phone screenshots | `phone/*.png` | 1,080 × 1,920 (9:16) |
| 7-inch tablet screenshots | `tablet-7-inch/*.png` | 1,080 × 1,920 (9:16) |
| 10-inch tablet screenshots | `tablet-10-inch/*.png` | 1,440 × 2,560 (9:16) |

All files are PNGs and are comfortably below the Google Play file-size limits. The feature graphic, phone, and 10-inch screenshots are opaque RGB PNGs.

## Goldie phone captures

`goldie/google-play.config.ts` defines five phone scenes: six-player board, connected setup, deck creation, history, and game controls. Goldie renders the opener as two images, so `phone/` contains six PNGs. The tablet screenshots and feature graphic remain separate assets.

Use a dedicated Pixel 9 Pro or Pixel 10 Pro Android emulator (1,280 × 2,856), with its network disabled. On an x86_64 emulator, build an isolated preview APK from the repo root (set `ANDROID_HOME` to the installed SDK first):

```bash
APP_VARIANT=preview pnpm exec expo prebuild --platform android --no-install
(cd android && set -a && source ../.env.development && set +a && \
  NODE_ENV=production APP_VARIANT=preview CONVEX_DEPLOYMENT=dev:offline \
  EXPO_PUBLIC_CONVEX_URL=https://offline.invalid \
  EXPO_PUBLIC_CONVEX_SITE_URL=https://offline.invalid \
  EXPO_PUBLIC_INVITE_ORIGIN=https://offline.invalid \
  SENTRY_DISABLE_AUTO_UPLOAD=true \
  ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 --rerun-tasks)
```

Then run Goldie:

```bash
GOLDIE_CONFIG=$PWD/goldie/google-play.config.ts GOLDIE_ARGENT_BIN=$PWD/goldie/argent-android-capture.sh npx -y goldie@0.3.1 doctor
GOLDIE_CONFIG=$PWD/goldie/google-play.config.ts npx -y goldie@0.3.1 frame
GOLDIE_CONFIG=$PWD/goldie/google-play.config.ts npx -y goldie@0.3.1 manifest
GOLDIE_CONFIG=$PWD/goldie/google-play.config.ts npx -y goldie@0.3.1 verify
```

The current raw captures are in `goldie/out/raw/pixel-10-pro/`. They were taken with `adb screencap` while navigating the isolated emulator because Argent 0.22.1 could not drive taps on it. The `play-store-*` flows record the intended scenes for a later rerun. Goldie framed and verified the PNGs in `goldie/out/screenshots/pixel-10-pro/en-US/`; those verified files are copied into `play-store-assets/phone/` for upload.

## Notes

- The app icon is a Scryve-specific mark based on the app's four-player board, controls, and production color palette. The launcher, adaptive Android, iOS, and web icon assets now use this mark; it will appear in the next application build.
- Video is optional and is not included. A public or unlisted, ad-free, non-age-restricted YouTube upload is still needed if a promo video is desired.
- The tablet capture flows live in `.maestro/store-assets/`.
- The phone set shows the six-player board, connected setup, deck creation, populated local history, and the six-player controls overlay. The 10-inch set includes the new-game screen.
- Before submission, compare the 10-inch screenshots with the release build to confirm the same UI is shipped.
- Captures rejected during visual QA are retained in `working/` and are not intended for upload.
