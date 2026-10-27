#!/bin/sh
# Builds the preview app in Release, signed for development so Instruments and xctrace can attach.
# Run it through `pnpm ios:profile`, which supplies the preview environment and SCRYVE_PROFILE_IPA.
set -eu

# why: EAS ad hoc builds can never carry get-task-allow, so this signs with the Apple Development
# identity Xcode manages on this Mac. Over SSH, the keychain must be unlocked first.
team=69V3522FCX
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

npx expo prebuild --platform ios --clean
workspace=$(ls -d ios/*.xcworkspace)

xcodebuild -quiet -workspace "$workspace" -scheme "$(basename "$workspace" .xcworkspace)" \
  -configuration Release -destination generic/platform=iOS -archivePath "$work/app.xcarchive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$team" archive

cat >"$work/export.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>debugging</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$team</string>
</dict>
</plist>
EOF

xcodebuild -quiet -exportArchive -archivePath "$work/app.xcarchive" -exportPath "$work/export" \
  -exportOptionsPlist "$work/export.plist" -allowProvisioningUpdates
mv "$work"/export/*.ipa "$SCRYVE_PROFILE_IPA"
echo "Built $SCRYVE_PROFILE_IPA"
