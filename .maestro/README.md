# Maestro end-to-end tests

Scryve's Maestro flows exercise an installed development build by bundle/package ID
`com.sowinghope.count`. Maestro requires no runtime dependency inside the Expo app.

## Prerequisites

1. Install the [Maestro CLI](https://docs.maestro.dev/maestro-cli) and verify `maestro --version`.
2. Boot an iOS simulator or Android emulator.
3. Install a Scryve development build (`pnpm run ios` or `pnpm run android`). Expo Go is not
   sufficient for these flows because they launch Scryve by its own app ID.
4. Start Metro with `pnpm run start:expo` when using a development build.

## Commands

```bash
pnpm e2e
pnpm e2e full
```

`pnpm e2e` checks the local environment and runs flows tagged `smoke`. The runner auto-detects
the installed app id (development builds use `com.sowinghope.count.dev`); set `MAESTRO_APP_ID` to
override. The shared startup flow accepts the legal consent gate that every cleared install shows.
Flows tagged `unconfigured` need a build compiled without cloud environment variables and are
excluded from `pnpm e2e` runs; execute them directly with `maestro test` when testing that build. `pnpm e2e full` runs every
flow under `.maestro/flows`. Both commands write a JUnit report and Maestro debug output to
`artifacts/e2e/`. Set `SKIP_METRO_CHECK=1` when testing an installed release build.

The flows are `Landing.yaml`, `LocalGameRecovery.yaml`, and `MissingCloudConfig.yaml`. Tag every
deterministic local flow with `local`, and reserve `smoke` for the smallest suite that verifies the
main path. `pnpm run test:maestro:check` does not need a simulator or Maestro installation. It
catches renamed or stale React Native `testID` selectors in Jest.

Every flow must use `${MAESTRO_APP_ID}` and include `shared/_OnFlowStart.yaml` so state is cleared
and the Expo development-client chooser is handled consistently. Prefer stable React Native
`testID` selectors over translated visible text for interaction targets.

Connected-play flows require real Clerk/Convex development credentials and at least two separately
addressable app installations. Keep those flows separate from the deterministic local smoke suite.
