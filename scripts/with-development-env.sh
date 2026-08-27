#!/usr/bin/env bash

set -euo pipefail

if (( $# == 0 )); then
  echo "usage: scripts/with-development-env.sh <command> [args...]" >&2
  exit 64
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
token_file="${XDG_CONFIG_HOME:-$HOME/.config}/scryve/onepassword.env"

if [[ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" && -f "$token_file" ]]; then
  token=$(sed -n 's/^OP_SERVICE_ACCOUNT_TOKEN=//p' "$token_file" | tail -n 1)
  if [[ -n "$token" ]]; then
    export OP_SERVICE_ACCOUNT_TOKEN="$token"
  fi
fi

if [[ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]]; then
  if ! command -v op >/dev/null 2>&1; then
    echo "OP_SERVICE_ACCOUNT_TOKEN is configured, but the 1Password CLI is not installed." >&2
    exit 127
  fi
  exec op run --env-file="$repo_root/.env.op.development" -- "$@"
fi

# Contributors can still copy .env.example to an ignored .env.local. Expo and
# Convex load that file themselves, so no 1Password account is required.
exec "$@"
