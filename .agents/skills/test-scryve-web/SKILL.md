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

## Drive the flow

- Interact like a user: navigate to the changed screen, perform its primary
  actions, exercise empty/error/loading states where they exist.
- Verify taps land correctly (life deltas, undo, seat controls, deck
  creation/edit) and navigation reaches and leaves the screen cleanly.
- For layout changes, check at desktop width and a phone-width viewport
  (~390px); Scryve web is often used at phone sizes.
- Treat sign-in prompts as part of the flow under test. Clerk native
  components fall back on web; if a flow requires credentials you do not
  have, mark it skipped rather than working around auth.

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
- **Auth dead-end:** expected without Clerk env vars configured; skip
  authenticated flows and record them as such.
- **Connected-play screens fail:** expected without a Convex dev backend;
  record as skipped, not failed.
- **Interaction has no effect:** check the console first — RN-web-only
  crashes often appear there before the UI visibly breaks.
