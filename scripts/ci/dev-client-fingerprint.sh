#!/usr/bin/env bash
# Prints the `development` profile's native fingerprint for a platform, computed the way
# `builds --fingerprint current` does: eas.json's profile env merged over the profiles it
# extends, then @expo/fingerprint. Run from the repo root after `pnpm install`.
set -euo pipefail

platform="${1:?usage: dev-client-fingerprint.sh <ios|android>}"

while IFS= read -r var; do export "$var"; done < <(
  jq -er '
    def env($n): .build[$n] as $b
      | (if $b.extends then env($b.extends) else {} end) + ($b.env // {});
    env("development") | to_entries[] | "\(.key)=\(.value)"' eas.json
)
node_modules/.bin/fingerprint fingerprint:generate --platform "$platform" | jq -er .hash
