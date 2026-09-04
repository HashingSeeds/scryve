#!/usr/bin/env bash
#
# Point this worktree's .env.local at the machine-wide development env file.
#
# Gitignored files do not follow `git worktree add`, so without this every new
# worktree starts with no local configuration. Symlinking keeps one copy of the
# per-developer values on the machine and lets Expo and Convex load .env.local
# natively, with no command wrapper.
#
# Run once per worktree, or let .git/hooks/post-checkout run it automatically.

set -euo pipefail

# Metro follows this symlink in development. Keep the shared target's basename
# dotenv-shaped so Metro does not try to transform it as application source.
target="${SCRYVE_DEV_ENV:-${XDG_CONFIG_HOME:-$HOME/.config}/scryve/.env.local}"
worktree=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
link="$worktree/.env.local"

if [[ ! -f "$target" ]]; then
  echo "No machine env file at $target." >&2
  echo "Create it, or copy .env.example to $link for a standalone setup." >&2
  exit 1
fi

if [[ -L "$link" ]]; then
  current=$(readlink "$link")
  if [[ "$current" == "$target" ]]; then
    echo ".env.local already links to $target"
    exit 0
  fi
  echo ".env.local links to $current, not $target. Remove it first." >&2
  exit 1
fi

if [[ -e "$link" ]]; then
  echo ".env.local already exists as a regular file. Leaving it alone." >&2
  echo "Move it aside and rerun to switch to the shared file." >&2
  exit 1
fi

ln -s "$target" "$link"
echo "Linked .env.local -> $target"
