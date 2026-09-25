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

## Scryve Pro rollout

RevenueCat owns purchase status. Convex verifies it through the subscriber API and
updates all Pro features together, including the legacy `unlimited_decks` flag.
Existing clients keep their current API contracts and cached offline access.

1. In RevenueCat, attach every Pro store product to the exact entitlement identifier
   `Count Pro`. Configure the `default` offering with `$rc_monthly`, `$rc_annual`, and
   `$rc_lifetime` packages and make it the default offering. Store product identifiers
   must match the stores; the package identifiers above are RevenueCat identifiers.
   Configure its paywall and Customer Center for the app's existing billing UI.
2. In each Convex deployment's Settings → Environment Variables, set
   `REVENUECAT_SECRET_API_KEY` to a RevenueCat key that can read v1 subscriber info
   (the Test Store SDK key works for QA; a v1 secret API key also works),
   `REVENUECAT_WEBHOOK_AUTH` to a random secret header value such as `Bearer <secret>`,
   and `REVENUECAT_ENVIRONMENT` to `SANDBOX` for isolated testing or `PRODUCTION`
   for production. The default is `PRODUCTION`. Never expose these secrets through
   `EXPO_PUBLIC_*` variables.
3. Deploy schema expansion checkpoint `29ebb4b` first: the new
   `revenueCatCustomerStates` and `revenueCatWebhookEvents` tables and their indexes.
   Preserve this checkpoint when merging. Then deploy the backend code
   before releasing the client. No existing fields or functions are removed.
   Follow the explicit Convex release procedure above; configuring environment
   variables or merging code does not deploy the backend.
4. In RevenueCat → Integrations → Webhooks, add a configuration pointing to
   `https://<deployment>.convex.site/revenuecat/webhooks`. Set its Authorization
   header to the **exact** `REVENUECAT_WEBHOOK_AUTH` value, including `Bearer ` if
   used. Select all event types and the relevant apps. Use separate configurations
   for the sandbox and production URLs, each filtered to its matching environment.
   Webhooks are included in RevenueCat's current Pro plan, which starts free up to
   $2,500 in monthly tracked revenue, then charges 1% under its published pricing.
   Some legacy free plans exclude webhooks; check the account's actual plan before
   changing the integration. See [RevenueCat pricing](https://www.revenuecat.com/pricing).
5. Clerk needs no new premium claims or billing configuration. Keep the existing
   Convex integration with audience `convex`, the matching `CLERK_FRONTEND_API_URL`,
   and the `user.created` / `user.updated` webhook at `/clerk/webhooks`. RevenueCat's
   app user ID must remain the Clerk user ID, as the app already configures it.
6. Verify an isolated sandbox purchase, restore, renewal, cancellation before expiry,
   expiration, and transfer. Check `entitlements.current` and deck capacity as well
   as the device paywall. Send the same webhook twice and confirm no duplicate
   grants. A dashboard test event checks delivery and authorization only; it does
   not prove entitlement sync.
7. Publish the client after backend verification. It checks existing subscribers
   when billing and the signed-in profile are ready, after purchase or restore,
   and after reconnect. Older clients gain server access through webhooks; for an
   existing subscriber without a new event, resend a historical webhook from
   RevenueCat to reconcile their current status.

The endpoint waits for a bounded RevenueCat fetch and the atomic database update
before acknowledging delivery. Failed fetches return non-200 so RevenueCat retries.
If retries are exhausted, repair the configuration and use RevenueCat's Retry
action. A cancellation preserves access until RevenueCat's entitlement expires,
including an active billing grace period. Sandbox transactions never grant access
on the production backend.

Setup references: [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks),
[entitlements](https://www.revenuecat.com/docs/getting-started/entitlements),
[offerings](https://www.revenuecat.com/docs/offerings/overview), and
[REST API v1](https://www.revenuecat.com/docs/api-v1).

## Deck sync rollout

1. Deploy schema expansion checkpoint `cc26f1873b5826cd41def31d68bc5f21772b580c` first. It adds optional deck sync fields, the receipt table, and the staged `decks.by_owner_and_sync_id` index. Wait for that index to finish backfilling before deploying the subsequent backend commit that activates and queries it. Preserve both commits when merging the backend PR.
2. Deploy the backend with `decks:syncPage` and `decks:syncWrite`, including the owner-tagged query responses and `expectedOwnerId` write guard from the persisted-shelf PR, before enabling deck sync or publishing a client that uses those endpoints. Existing clients continue using the original deck endpoints.
3. Keep the client flag disabled until a development-device pass verifies offline metadata edits, restart with pending writes, reconnect, conflicting edits, remote deletion, and account switching. Offline creation, deletion, and card/version editing are outside this rollout.
4. Retain operation receipts for as long as a client can replay pending writes. Do not add a time-based purge without defining a supported offline/retry window. Account deletion removes the owner's receipts in batches.

These are explicit release steps. Merging the PRs does not deploy Convex or enable client sync.

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

1. Deploy the schema-only expansion checkpoint `0b8f313793dbdef7fa809b6311f669e9b2491d61` from PR #112. It adds the optional `accountDeletionReceipts.deletedIdentityHash` field and stages `by_deleted_identity_hash`. Wait for the staged index backfill to finish before deploying the following server-fix commit, which activates and queries it. Preserve both commits when merging PR #112 so the expansion checkpoint remains available.
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
