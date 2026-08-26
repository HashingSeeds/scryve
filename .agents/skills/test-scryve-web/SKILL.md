---
name: test-scryve-web
description: Use AFTER implementing user-visible web UI changes, when asked for an integrated pass or to verify a change in the app. Not for unit tests or backend-only changes.
---

# Test Scryve Web

Run one focused verification pass of the changed flow against the real web
app (react-native-web via Expo) in a browser.

## Scope

1. Confirm what changed and what the expected behavior is. If nothing
   user-visible changed, say so and stop.
2. Exercise only the affected flow unless the change concerns responsive
   layout, which gets desktop and phone-width passes.
3. If a prerequisite is missing, report it rather than working around it.
   Never claim verification you did not observe.

## Choose the lightest valid launch path

- JavaScript, TypeScript, or asset-only changes: reuse a healthy dev server
  belonging to this worktree.
- Changes to web-specific config (`app.config.ts`, bundler settings):
  restart the dev server.
- Do not run production exports (`pnpm bundle:web`) as part of this pass;
  if export behavior itself is what changed, that is a separate task.

## Setup

1. Health check before starting anything: probe the Expo web port's `/status`
   and verify the process belongs to this worktree. Never kill another
   worktree's server; start on a free explicit port if needed.
2. Otherwise start `pnpm web` from the repository root and wait for the
   bundler. Do not start `convex dev`; test against whatever backend state
   exists and note connected-play gaps in the report.
3. Open the app in the browser using the harness's browser automation
   (preview tools where available).
4. Check the console for errors after load; record any that appear.

Development identity:

- Clerk test identity: `jane+clerk_test@sow.care`
- Clerk development OTP: `424242`

## Establish the required app state

Use the real consent and Clerk flows. Do not write browser storage directly,
fake authentication, or add a bypass to the app.

Reuse the browser profile's session and legal acceptance by default. Clear site
data only when the changed behavior requires a clean install, signed-out state,
first-run consent, or account transition. Restore the normal signed-in state
after such a check when the remaining flow requires it.

Before entering the test identity, confirm the running bundle uses the Clerk
development instance and development Convex deployment. Check public config
without printing its values in logs or reports. Stop before authentication if
the Clerk publishable key is not a test key or the Convex deployment does not
match the development configuration.

When the affected flow requires authentication and a Clerk session already
exists, confirm it belongs to `jane+clerk_test@sow.care`. If the identity cannot
be confirmed or belongs to another account, stop and report the mismatch. Do
not sign out, switch accounts, or treat that session as valid test evidence
without separate approval.

After opening the app, inspect the current page and establish only the state the
affected flow needs:

1. If `Before you start` is visible, press `accept-legal-button` and wait for
   the app to settle. This is the real Scryve consent flow. Never suppress it.
2. If the flow works signed out, continue signed out. Authentication is not a
   prerequisite for local play.
3. If the flow requires an account and the app is signed out, open the account
   action and use Clerk's real development sign-in flow with
   `jane+clerk_test@sow.care` and OTP `424242`. Inspect the current DOM or
   accessibility snapshot rather than assuming Clerk's field labels or order.
   If Clerk asks to create a username or password, stop and report that the
   dedicated test user is missing instead of creating another account.
4. Wait for authentication to finish and confirm the account action reflects
   the signed-in state. If signed-in consent appears, accept it through the
   same `accept-legal-button` flow and wait for its backend sync.
5. Refresh the page once. Confirm the Clerk session and current consent persist
   before navigating to the changed screen.

The email address and fixed OTP work only with Clerk test mode. Never enable
Clerk test mode in production and never request or store a Clerk secret key in
the client, repository, screenshots, or report.

## Drive the flow

- Interact like a user: navigate to the changed screen, perform its primary
  actions, exercise empty/error/loading states where they exist.
- Verify taps land correctly (life deltas, undo, seat controls, deck
  creation/edit) and navigation reaches and leaves the screen cleanly.
- For layout changes, check at desktop width and a phone-width viewport
  (~390px); Scryve web is often used at phone sizes.
- Treat sign-in prompts as part of the flow under test. Use the development
  test identity above when the flow requires authentication. If the configured
  server is not a development Clerk and Convex environment, mark the flow
  skipped rather than working around auth.

## Platform-gap awareness

Web is a secondary surface. Some native capabilities degrade here (haptics,
camera scanning for invites, secure storage). When behavior legitimately
differs from native, record it as expected platform behavior, not a bug —
but flag anything that fails softly *worse* than documented fallbacks.

## What to validate

- Changed screens render correctly and match the intended layout at both
  viewport sizes when relevant.
- Core interactions work and state updates render without full-page reloads
  or hydration-style flicker.
- Persistence survives a page refresh where local state is involved.
- Obvious regressions in adjacent screens navigated along the way.

## Fallbacks

If browser automation cannot complete a step, capture a screenshot of the
blocked state and report exactly which interaction failed and why.

## Evidence

Capture before/after screenshots of every meaningful state; record a short
video for motion or timing changes. Save artifacts outside the worktree —
never commit PR-only images. Reference them by path in the report.

## Verify and clean up

Before finishing:

1. Confirm the page was served by this worktree's server on the intended
   port, not a stale session from another bundle.
2. Capture the relevant final state.
3. Stop only the dev server and helper processes started by this test.
4. Keep artifacts outside the worktree unless they hold reproduction
   evidence worth preserving; say which you kept and why.

## Report

Return a verdict per validated item (pass/fail/skipped + why), observed vs
expected behavior, artifact paths, and environment caveats (no Convex
backend, unauthenticated flows skipped, etc.). Be specific about what you
actually saw.

## Troubleshoot predictable failures

- **Old UI or stale errors appear:** verify the server's worktree and port;
  hard-reload to bypass the cached bundle.
- **Auth dead-end:** confirm Clerk environment variables are configured for the
  development instance and email-code sign-in is enabled. If they are missing,
  skip authenticated flows and record them as such. Do not switch to a personal
  account, production instance, or secret-bearing workaround.
- **Connected-play screens fail:** expected without a Convex dev backend;
  record as skipped, not failed.
- **Interaction has no effect:** check the console first — RN-web-only
  crashes often appear there before the UI visibly breaks.
