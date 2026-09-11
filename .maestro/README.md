# Maestro end-to-end tests

Scryve's Maestro flows exercise an installed build. Development builds use
`com.sowinghope.count.dev`; preview builds use `com.sowinghope.count.preview`.
Maestro requires no runtime dependency inside the Expo app.

## Prerequisites

1. Install the [Maestro CLI](https://docs.maestro.dev/maestro-cli) and verify `maestro --version`.
2. Boot a dedicated iOS simulator or Android emulator. The local flows clear app state.
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
override, including `MAESTRO_APP_ID=com.sowinghope.count.preview` for a preview build.
The shared startup flow accepts the first-use legal consent gate and opens the playable board.
Flows tagged `unconfigured` need a build compiled without cloud environment variables and are
excluded from both runner commands; execute them directly with `maestro test` when testing that build.
`pnpm e2e full` runs all other flows under `.maestro/flows`. Both commands write a JUnit report and Maestro debug output to
`artifacts/e2e/`. Set `SKIP_METRO_CHECK=1` when testing an installed release build.

The flows are `Landing.yaml`, `LocalGameRecovery.yaml`, and `MissingCloudConfig.yaml`. Tag every
deterministic local flow with `local`, and reserve `smoke` for the smallest suite that verifies the
main path. `pnpm run test:maestro:check` does not need a simulator or Maestro installation. It
checks flow selectors against rendered board, dialog, and setup controls in Jest.

Every flow must use `${MAESTRO_APP_ID}` and include `shared/_OnFlowStart.yaml` so state is cleared
and the Expo development-client chooser is handled consistently. Prefer stable React Native
`testID` selectors over translated visible text for interaction targets.

Connected-play flows require real Clerk/Convex development credentials and at least two separately
addressable app installations. Keep those flows separate from the deterministic local smoke suite.
