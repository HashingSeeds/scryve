# Releasing

This app uses two release paths: OTA updates for JS and asset changes within an existing runtime, and native binaries when the fingerprint changes.

## OTA updates (JS-only changes)

1. Merge your changes to main.
2. Confirm the native fingerprint matches the installed production build and that any required Convex change is already live.
3. Test the commit in a preview build with `APP_VARIANT=preview pnpm exec eas update --channel preview --environment preview`. Run `pnpm e2e` and the manual smoke pass. Preview uses a different app identifier and runtime fingerprint, so this checks behavior but does not prove production compatibility.
4. Publish the tested commit with production configuration: `APP_VARIANT=production pnpm exec eas update --channel production --environment production`.
5. Watch Sentry for new fatal issues after publishing. Percentage rollouts (`--rollout-percentage`) become worthwhile once there is a real user base.

Do not republish a preview update group to production. If a future staging build uses the same native configuration, runtime, environment, and code signing as production, promote its tested group with `eas update:republish --group <update-group-id> --destination-channel production`.

## Native releases (fingerprint changed)

1. Build preview binaries: `eas build --profile preview` and `eas build --profile preview:device`.
2. Run the Maestro smoke suite and a manual device pass on iOS and Android. This checks behavior, not the production identity or runtime.
3. Build production binaries: `eas build --profile production`.
4. Distribute those exact production binaries to TestFlight and Play internal testing. Confirm the runtime and production channel in Settings, then repeat the manual smoke pass.
5. Promote those exact builds to the stores after acceptance. Start public store releases with a staged rollout. The runtime version comes from the native fingerprint; any native change automatically requires a new binary before updates flow again.

## Release record

Every store release gets a git tag (`v<version>`) and a GitHub release whose notes contain this manifest:

```
git-sha:
app-version:
ios-build-number:
android-version-code:
runtime-version:
eas-build-id-ios:
eas-build-id-android:
convex-deploy-commit:
sentry-release:
```

## Convex deploys

Production Convex deploys are an explicit release step (`npx convex deploy` against production), performed before publishing the client update or binary that depends on them. Never an incidental side effect of local development. Convex schema and function changes must follow the compatibility rules in AGENTS.md.

## Moderation retention rollout

1. Check the production deploy history for the PR #83 expansion checkpoint (`3c542e1`). If it is not live, deploy that checkpoint first. Confirm
   `gameCommanderClaims.by_actor_user`,
   `gameCommanderClaims.by_resolved_by_user`, and
   `moderationReports.by_retention_expires_at` have finished staging in the
   target deployment before deploying current main.
2. Deploy current main at or after `25ae2de` as an explicit Convex release. This activates retention enforcement and deploys `games:updateLobbySettings` for the merged PR #107 client. Record the expansion and current-main deployment commits.
3. Run `pnpm exec convex run --prod moderation:backfillRetention '{}'` against
   the authorized production target. The first invocation schedules subsequent
   pages. Wait for those scheduled mutations to finish; an error can be retried
   from the beginning because records with a deadline are skipped. Verify that
   resolved reports have deadlines and the daily purge is scheduled.
4. Confirm `games:updateLobbySettings` is live before publishing any client from PR #107. Publish the updated privacy disclosure only after retention enforcement and the backfill are complete. Follow the OTA or binary release steps above.

These are separate authorized release actions. Merging a PR does not run the
backfill or authorize an incidental production command.

## Account deletion webhook protection rollout

1. Deploy the optional `accountDeletionReceipts.deletedIdentityHash` field and `by_deleted_identity_hash` index as a schema-only expansion. Wait for the index to be ready before deploying the deletion-aware sync code.
2. Deploy the server fix before publishing the revised privacy disclosure. Verify in a development deployment that delayed profile webhooks are ignored during deletion and after the receipt says completed.
3. Keep the deletion hash when retaining or cleaning up receipts. Removing it allows delayed events to recreate profiles. Existing completed receipts contain no account identifier, so past deletions cannot be backfilled from those receipts. This fix protects deletions completed after the server change is deployed.

## Incident response

**Bad OTA update:** Roll back to the previous update or the embedded update (`eas update:rollback`).

**Bad native binary:** Halt the staged store rollout and prepare a fixed binary. Disable affected cloud features if possible.

**Bad Convex deploy or migration:** Roll FORWARD with backward-compatible server code. A client rollback does not repair server data.

## Optional PostHog analytics

Before setting `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` for a release:

- Configure the chosen PostHog region and a maximum 90-day event retention period. Confirm the privacy policy matches the project configuration and provider agreement.
- Update App Store privacy details and Google Play Data safety for optional product interaction data and installation identifiers. Review the privacy and web storage policy changes before publishing.
- Use a separate development PostHog project to check opt-in, offline capture followed by reconnect, and opt-out with queued events. Never use the live analytics project for development checks.
- Measure cold start, first gameplay action, frame time, stored queue size, and upload batches with analytics off and on in the same development build. SDK initialization and event processing are scheduled after the current task, but that is not a measured performance guarantee.

The six explicit events are `app_opened`, `game_started`, `game_completed`,
`connection_attempt`, `deck_used`, and `stats_viewed`. A local start means the first
accepted gameplay action, not rendering the fresh board. Completed local games include
`end_source`: `game_menu`, `new_game_prompt`, or `stale_game_prompt`. A cancelled
prompt does not label a later manual finish. Connected completion observations
use `unknown` because the observing client does not know the finishing player's
entry point. This describes the UI path, not the player's motivation. Connected starts and
completions count observations per consenting installation, not unique games or
all players at the table. Historical views do not emit game events. Stats events
mean a visit to history or a loaded deck page showing its record, not proof the
player read the stats. A saved deck and an assigned deck are separate from browsing.

Use `consent_source = first_use` for activation cohorts from the optional, unchecked
choice on the first-use legal screen. `consent_source = settings` includes existing
players and must not be labeled new players. Retention is per installation, not
per person; reinstalling or clearing storage can create a new installation. Players who decline or never
reconnect remain unmeasured. No activity before consent is backfilled. Use event
timestamps rather than ingestion times for offline cohorts.

Usage sharing is a device preference, separate from legal acceptance and sign-in.
The SDK stays unloaded without consent and build configuration. No PostHog replay
plugin or provider is installed. Sentry diagnostics retain their existing behavior.
For analytics deletion requests, locate events using the Analytics ID the player
provides from Settings; these IDs are intentionally not linked to account IDs.

## Native store review prompts

`expo-store-review` requires a new native binary before shipping this change via OTA.
The app counts the first five distinct completed local or connected games on the
installation, independent of analytics consent and game outcome. Abandoned games
and previously finished connected games loaded from history do not count.

After the threshold, a finished summary must stay focused for two seconds with
no app dialog open. Leaving the screen or backgrounding the app cancels the
pending request. Web and development mode skip prompting. The app persists one
request attempt per installation, even if the store declines to display it or the
native call fails; it does not track whether a review was submitted.

Verify the native prompt on iOS and Android using their supported store-review
test distribution paths. TestFlight does not display the iOS review prompt, and
the stores may suppress prompts based on their own quotas. Unit tests cover our
eligibility and cancellation logic, not whether the OS displays its dialog.
