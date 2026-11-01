# lazy-view-managers

Android launch-time work. Pixel 6a release build, cold launch, board interactive 494ms → 377ms together with `js-patches/react-native@0.86.3.patch`.

- `LazyViewManagers.kt` + `app.plugin.js`: React Native builds view manager constants for every
  "eager" package before the first render. The plugin wraps each package in `MainApplication` so
  each view manager's constants are built when JS first renders it (the manager objects are still
  created at launch; they are cheap). The build fails if Expo's
  `MainApplication` template stops matching.
- `package.json` → `expo.autolinking.android.exclude`: native code Scryve never calls, which still
  costs launch time to register. Empty now: `@expo/ui` (~20ms) was excluded until the native
  `Sheet` started using it.

Recheck the exclusion when upgrading Expo. Clerk stopped pulling in the Solana wallet adapter in
`@clerk/expo` 4.10, so it no longer needs one.
