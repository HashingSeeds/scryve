#!/usr/bin/env bash

set -euo pipefail

suite="${1:-smoke}"
maestro_app_id="${MAESTRO_APP_ID:-com.sowinghope.count}"

if [[ $# -gt 1 || ( "$suite" != "smoke" && "$suite" != "full" ) ]]; then
  echo "Usage: scripts/maestro-run.sh [smoke|full]" >&2
  exit 1
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "✗ Maestro CLI is not installed — fix: curl -Ls \"https://get.maestro.mobile.dev\" | bash" >&2
  exit 1
fi

device_platform=""
if [[ "$(uname -s)" == "Darwin" ]] && command -v xcrun >/dev/null 2>&1; then
  booted_simulators="$(xcrun simctl list devices booted 2>/dev/null || true)"
  if [[ "$booted_simulators" == *"(Booted)"* ]]; then
    device_platform="ios"
  fi
fi

if [[ -z "$device_platform" ]] && command -v adb >/dev/null 2>&1; then
  if [[ "$(adb get-state 2>/dev/null || true)" == "device" ]]; then
    device_platform="android"
  fi
fi

if [[ -z "$device_platform" ]]; then
  echo "✗ No booted iOS simulator or Android device found — fix: pnpm ios / pnpm android or boot a simulator/emulator" >&2
  exit 1
fi

if [[ "$device_platform" == "ios" ]]; then
  if ! xcrun simctl get_app_container booted "$maestro_app_id" >/dev/null 2>&1; then
    echo "✗ App $maestro_app_id is not installed on the booted iOS simulator — fix: pnpm ios" >&2
    exit 1
  fi
else
  installed_packages="$(adb shell pm list packages "$maestro_app_id" 2>/dev/null | tr -d '\r' || true)"
  if ! grep -Fxq "package:$maestro_app_id" <<<"$installed_packages"; then
    echo "✗ App $maestro_app_id is not installed on the Android device — fix: pnpm android" >&2
    exit 1
  fi
fi

if [[ "${SKIP_METRO_CHECK:-0}" != "1" ]]; then
  if ! curl --fail --silent http://localhost:8081/status >/dev/null; then
    echo "✗ Metro is not reachable at http://localhost:8081/status — fix: pnpm start:expo" >&2
    exit 1
  fi
fi

mkdir -p artifacts/e2e

tag_arguments=()
if [[ "$suite" == "smoke" ]]; then
  tag_arguments=(--include-tags smoke)
fi

if maestro test \
  -e MAESTRO_APP_ID="$maestro_app_id" \
  --format junit \
  --output artifacts/e2e/report.xml \
  --debug-output artifacts/e2e/debug \
  ${tag_arguments[@]+"${tag_arguments[@]}"} \
  .maestro/flows; then
  maestro_status=0
else
  maestro_status=$?
fi

echo "JUnit report: artifacts/e2e/report.xml"
echo "Debug screenshots: artifacts/e2e/debug"
exit "$maestro_status"
