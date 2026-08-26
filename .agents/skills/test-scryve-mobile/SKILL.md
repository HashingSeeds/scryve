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

- App: `Scryve (Dev)`
- Bundle identifier: `com.sowinghope.count.dev`
- Clerk test identity: `jane+clerk_test@sow.care`
- Clerk development OTP: `424242`

Bundle presence proves the variant, not native compatibility. An Expo
fingerprint can prove that an EAS build matches this worktree's native runtime,
but it proves the installed client matches only when the installed client's EAS
build ID is known.

Reuse the installed client without a fingerprint check when the current changes
are JavaScript, TypeScript, or assets only and its native-build provenance is
otherwise credible. If native inputs changed or the installed build's
compatibility is uncertain:

1. Compute the current platform fingerprint with
   `APP_VARIANT=development eas fingerprint:generate --platform <ios|android> --environment development`.
2. Query finished EAS builds for the matching platform and `development`
   profile. Compare candidate build IDs with
   `APP_VARIANT=development eas fingerprint:compare --build-id <id> --environment development`.
3. If a matching simulator or emulator build exists, stop and report its build
   ID and artifact URL as the compatible build to install.
4. If none matches, stop and report that a new `development` build is required.

Do not start, download, or install an EAS build during this verification pass
unless the user separately approved it. Do not claim the currently installed
binary matches merely because EAS has a compatible build.

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

Bind the first `open` to one explicit `agent-device` session and use that same
session for every snapshot, action, close, and reopen in the pass. Do not rely
on an implicit session when checking persistence.

## Establish the required app state

Use the real consent and Clerk flows. Do not inject MMKV or SecureStore data,
fake authentication, or add a bypass to the app.

Preserve the installed app's state by default. A prior test session and legal
acceptance are useful shared development prerequisites. Clear app data or the
simulator keychain only when the changed behavior requires a clean install,
signed-out state, first-run consent, or account transition. Restore the normal
signed-in state after such a check when the remaining flow requires it.

After opening the app, inspect the current screen and establish only the state
the affected flow needs:

1. If `Before you start` is visible, press `accept-legal-button` and wait for
   the app to settle. This is the real Scryve consent flow. Never suppress it.
2. If the flow works signed out, continue signed out. Authentication is not a
   prerequisite for local play.
3. If the flow requires an account and the app is signed out, open the account
   action and use Clerk's real development sign-in flow with
   `jane+clerk_test@sow.care` and OTP `424242`. Discover and act on the current
   Clerk fields from a fresh accessibility snapshot rather than assuming their
   labels or order. If Clerk asks to create a username or password, stop and
   report that the dedicated test user is missing instead of creating another
   account.
4. Wait for the auth modal to close and confirm the account action reflects the
   signed-in state. If signed-in consent appears, accept it through the same
   `accept-legal-button` flow and wait for its backend sync.
5. Force-close and reopen the app once. Confirm the Clerk session and current
   consent persist before navigating to the changed screen.

The email address and fixed OTP work only with Clerk test mode. Stop if this
development build points at a production Clerk instance or production Convex
deployment. Never enable Clerk test mode in production and never request or
store a Clerk secret key in the app, repository, screenshots, or report.

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
maestro test -e MAESTRO_APP_ID=com.sowinghope.count.dev --include-tags smoke .maestro/flows
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
- **Clerk rejects the test identity or OTP:** confirm the app uses the Clerk
  development instance and that email-code sign-in is enabled. Do not switch
  to a personal account, production instance, or secret-bearing workaround.
