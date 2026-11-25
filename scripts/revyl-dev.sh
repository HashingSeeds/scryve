#!/usr/bin/env bash
# Starts a Revyl iOS simulator on the dev client CI built for this worktree's native fingerprint
# (dev-client.yml uploads each one to Revyl's `main` branch), so `revyl dev` never builds here.
# Extra arguments pass through to `revyl dev`. Run from the repo root.
set -euo pipefail

app=$(sed -n 's/^ *app_id: //p' .revyl/config.yaml | head -n 1)
fingerprint=$(scripts/ci/dev-client-env.sh node_modules/.bin/fingerprint fingerprint:generate --platform ios | jq -er .hash)
build=$(revyl build list --app "$app" --branch main --page-size 100 --json |
  jq -r --arg fingerprint "$fingerprint" 'first(.versions[] | select(.version | startswith($fingerprint + "-")) | .id) // empty')

[ -n "$build" ] || {
  echo "revyl-dev: no CI dev client on Revyl for iOS fingerprint $fingerprint." >&2
  echo "This worktree changes native code, or CI is still building main. Use the mini's simulators." >&2
  exit 1
}
exec revyl dev --platform ios --detach --json --no-build --build-selection pinned --build-version-id "$build" "$@"
