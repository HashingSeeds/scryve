#!/usr/bin/env bash
# Runs a command under the `development` profile's eas.json env, merged over the profiles it
# extends, as an EAS build of that profile and `builds --fingerprint current` see it. Run from
# the repo root.
set -euo pipefail

while IFS= read -r var; do export "$var"; done < <(
  jq -er '
    def env($n): .build[$n] as $b
      | (if $b.extends then env($b.extends) else {} end) + ($b.env // {});
    env("development") | to_entries[] | "\(.key)=\(.value)"' eas.json
)
exec "$@"
