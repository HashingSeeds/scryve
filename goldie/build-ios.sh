#!/bin/sh
# Builds the iOS simulator app that goldie's captures install: Release, the production identifiers,
# no EAS channel and OTA updates off, so prereleaseBuild() and the nearby beta are off and the app
# shows what App Store players get. It talks to this worktree's local Convex backend; start
# `pnpm convex:local` first, since the build bakes in its URL.
set -eu
cd "$(dirname "$0")/.."

set -a
. ./.env.development
. ./.env.development.local
set +a
case "$EXPO_PUBLIC_CONVEX_URL" in
  http://127.0.0.1:*) ;;
  *) echo "Point .env.development.local at pnpm convex:local first" >&2; exit 1 ;;
esac
# why: a RevenueCat test key alerts "Wrong API Key" in a Release build, over the first screen.
unset EXPO_PUBLIC_POSTHOG_KEY EXPO_PUBLIC_POSTHOG_HOST EXPO_PUBLIC_REVENUECAT_API_KEY
export APP_VARIANT=production SCRYVE_PROFILE_BUILD=1 EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_INVITE_ORIGIN=https://scryve.sow.care \
  EXPO_PUBLIC_SENTRY_ENVIRONMENT=goldie SENTRY_DISABLE_AUTO_UPLOAD=true

npx expo prebuild --platform ios
workspace=$(ls -d ios/*.xcworkspace)
xcodebuild -quiet -workspace "$workspace" -scheme "$(basename "$workspace" .xcworkspace)" \
  -configuration Release -sdk iphonesimulator -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/ScryveGoldie" build
rm -rf build/goldie-ios && mkdir -p build/goldie-ios
cp -R "$HOME/Library/Developer/Xcode/DerivedData/ScryveGoldie/Build/Products/Release-iphonesimulator/"*.app build/goldie-ios/Scryve.app
echo "Built build/goldie-ios/Scryve.app"
