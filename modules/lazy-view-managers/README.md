# lazy-view-managers

Android launch-time work. Pixel 6a release build, cold launch, board interactive 494ms → 377ms together with `js-patches/react-native@0.86.3.patch`.

- `LazyViewManagers.kt` + `app.plugin.js`: React Native builds view manager constants for every
  "eager" package before the first render. The plugin wraps each package in `MainApplication` so
  each view manager's constants are built when JS first renders it (the manager objects are still
  created at launch; they are cheap). The build fails if Expo's
  `MainApplication` template stops matching.
- `package.json` → `expo.autolinking.android.exclude`: native code Scryve never calls, which still
  cost ~20ms per launch to register.
  - `@expo/ui`: pulled in by expo-router for `Stack.Toolbar`. Remove the exclusion before using
    native toolbars, or Android will crash with a missing native module.
  - `@solana-mobile/mobile-wallet-adapter-protocol`: pulled in by Clerk for Solana wallet sign-in.
    Remove the exclusion before enabling web3 wallets.

Recheck both exclusions when upgrading Expo or Clerk.
