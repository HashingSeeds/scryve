---
name: test-scryve-mobile
description: Use AFTER implementing user-visible mobile UI changes, when asked for an integrated pass or to verify a change in the app. Not for unit tests or backend-only changes.
---

# Test Scryve Mobile

Run one focused verification pass against the real app on an iOS simulator
(Android emulator when Android is the affected surface or explicitly
requested), driven through [agent-device](https://oss.callstack.com/agent-device).

## Scope

1. Confirm what changed and what the expected behavior is. If nothing
   user-visible changed, say so and stop.
2. Exercise only the affected flow on one representative device unless the
   change specifically concerns platform, OS version, or screen size.
3. If a prerequisite is missing, report it rather than working around it.
   Never claim verification you did not observe.

## Choose the lightest valid launch path

- JavaScript, TypeScript, or asset-only changes: reuse the installed
  development client and start Metro. Do not rebuild native code merely to
  load a new bundle.
- Native source, native dependencies, entitlements, config plugins, or
  generated project changes: rebuild is required. If rebuilding was not
  agreed to, stop and report instead of building.

Development identity:

- App: `Scryve Dev`
- Bundle identifier: `com.sowinghope.count.dev`

Bundle presence proves the variant, not native compatibility. Reuse an
installed client only when the current changes did not alter its Expo SDK,
native dependencies, config plugins, entitlements, generated project, or
native source.

## Setup

1. `agent-device devices --platform ios`; boot a simulator only if none is
   running. Prefer an already-running device.
2. Metro health check before starting anything: inspect the process on the
   Metro port and its `/status`. Reuse it only when it is healthy, belongs
   to this worktree, and matches `APP_VARIANT=development` + `--dev-client`.
   Never kill another worktree's Metro; use a free explicit port if needed.
3. Otherwise start `pnpm start:expo` from the repository root and wait for
   the bundler. Do not start `convex dev`; test against whatever backend
   state exists and note connected-play gaps in the report.
4. Open the app: `agent-device open com.sowinghope.count.dev --platform ios`.
   The development build must already be installed; if it isn't, stop and
   report — never kick off an EAS or local build inside this pass.

## Drive with agent-device

Follow the open -> snapshot -i -> act -> re-snapshot/diff -> verify -> close
loop.

- Act on refs/selectors from accessibility snapshots; fall back to
  screenshot estimation only for elements the AX tree misses.
- Use `--settle` and wait for UI to settle rather than fixed sleeps.
- Treat permission dialogs as part of the flow under test unless asked to
  pre-grant them.

## What to validate

- Changed screens render correctly and match the intended layout.
- Core interactions work: life +/-/undo, seat controls, deck creation/edit,
  navigation to and from the changed area.
- Persistence: force-close and relaunch mid-flow; local game state must
  survive (MMKV).
- Signed-out behavior: the flow must degrade gracefully without Clerk auth;
  connected-play features may be skipped but must fail softly.
- Obvious regressions in adjacent screens navigated along the way.

## Fallbacks

If agent-device cannot complete a flow, run the tagged Maestro smoke flows:

```bash
maestro test -e MAESTRO_APP_ID=com.sowinghope.count --include-tags smoke .maestro/flows
```

and report which passed or failed. If a bug blocks the flow, reproduce it
minimally and capture evidence — do not fix code during this pass.

## Evidence

Capture before/after screenshots of every meaningful state; record a short
video for motion or timing changes. Save artifacts outside the worktree —
never commit PR-only images. Reference them by path in the report.

## Verify and clean up

Before finishing:

1. Confirm the app loaded this worktree's bundle from the intended Metro
   port, not a stale bundle from another session.
2. Capture the relevant final state.
3. Remove any `adb reverse` rules created for this test.
4. Stop only the Metro, simulator, and log processes started by this test.
5. Keep artifacts outside the worktree unless they hold reproduction
   evidence worth preserving; say which you kept and why.

## Report

Return a verdict per validated item (pass/fail/skipped + why), observed vs
expected behavior, artifact paths, and environment caveats (no Convex
backend, stale dev client, etc.). Be specific about what you actually saw.

## Troubleshoot predictable failures

- **Old UI or stale errors appear:** verify Metro's worktree, variant, and
  port before diagnosing the app; reload the bundle.
- **App won't connect to Metro:** confirm the installed build is the
  `com.sowinghope.count.dev` variant — production builds ignore Metro.
- **Flow blocked by a permission dialog:** handle it as part of the flow;
  pre-grant permissions only if asked.
- **agent-device can't see an element:** take a fresh snapshot after
  navigation; fall back to screenshot estimation, then Maestro smoke.
- **Connected-play screens fail:** expected without a Convex dev backend;
  record as skipped, not failed.
