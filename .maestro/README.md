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
pnpm run test:maestro:check
pnpm run test:maestro:smoke
pnpm run test:maestro
```

`test:maestro:check` does not need a simulator or Maestro installation. It catches renamed or stale
React Native `testID` selectors in Jest. `test:maestro:smoke` runs the local-game happy path.
`test:maestro` runs every flow under `.maestro/flows`.

Every flow must use `${MAESTRO_APP_ID}` and include `shared/_OnFlowStart.yaml` so state is cleared
and the Expo development-client chooser is handled consistently. Prefer stable React Native
`testID` selectors over translated visible text for interaction targets.

Connected-play flows require real Clerk/Convex development credentials and at least two separately
addressable app installations. Keep those flows separate from the deterministic local smoke suite.
