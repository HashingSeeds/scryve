# Google Play visual assets

The phone and 7-inch assets were captured from the production Android bundle. The 10-inch assets were captured from the current development app on an Android 16 emulator at 1,440 × 2,560 pixels and 320 dpi. All were visually reviewed before packaging.

## Upload inventory

| Play Console field | Asset(s) | Dimensions |
| --- | --- | --- |
| App icon | `app-icon/app-icon-512.png` | 512 × 512 |
| Feature graphic | `feature-graphic/feature-graphic-1024x500.png` | 1,024 × 500 |
| Phone screenshots | `phone/*.png` | 1,080 × 1,920 (9:16) |
| 7-inch tablet screenshots | `tablet-7-inch/*.png` | 1,080 × 1,920 (9:16) |
| 10-inch tablet screenshots | `tablet-10-inch/*.png` | 1,440 × 2,560 (9:16) |

All files are PNGs and are comfortably below the Google Play file-size limits. The feature graphic and 10-inch screenshots are opaque RGB PNGs.

## Notes

- The app icon is a Scryve-specific mark based on the app's four-player board, controls, and production color palette. The launcher, adaptive Android, iOS, and web icon assets now use this mark; it will appear in the next application build.
- Video is optional and is not included. A public or unlisted, ad-free, non-age-restricted YouTube upload is still needed if a promo video is desired.
- Reproducible Maestro capture flows live in `.maestro/store-assets/`.
- The final screenshot sets prioritize live 2-, 5-, and 6-player boards. The phone set also includes the six-player controls overlay; the 10-inch set includes the new-game screen.
- Before submission, compare the 10-inch screenshots with the release build to confirm the same UI is shipped.
- Captures rejected during visual QA are retained in `working/` and are not intended for upload.
