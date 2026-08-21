# Releasing

This app uses two release paths: OTA updates for JS and asset changes within an existing runtime, and native binaries when the fingerprint changes.

## OTA updates (JS-only changes)

1. Merge your changes to main.
2. Publish the update to the preview channel: `eas update --channel preview`.
3. Install and open a preview build. Smoke-test the update on the production-equivalent runtime using `pnpm e2e` for the Maestro smoke suite.
4. Promote the exact tested update to production: `eas update:republish --group <update-group-id> --channel production`. Promote the tested update group; never republish or rebuild from a later commit.
5. Watch Sentry for new fatal issues after publishing. Percentage rollouts (`eas update --rollout-percentage`) become worthwhile once there is a real user base.

## Native releases (fingerprint changed)

1. Build preview binaries: `eas build --profile preview` and `eas build --profile preview:device`.
2. Run the Maestro smoke suite. Perform a manual device pass on iOS and Android.
3. Build production binaries: `eas build --profile production`.
4. Distribute to TestFlight and Play internal testing.
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

## Incident response

**Bad OTA update:** Roll back to the previous update or the embedded update (`eas update:rollback`).

**Bad native binary:** Halt the staged store rollout and prepare a fixed binary. Disable affected cloud features if possible.

**Bad Convex deploy or migration:** Roll FORWARD with backward-compatible server code. A client rollback does not repair server data.
