#!/bin/sh
#
# post-checkout: prepare a newly created worktree.
#
# Gitignored files and node_modules do not follow `git worktree add`, so a new
# worktree would otherwise need two manual setup steps before it can run. Hooks
# live in the shared .git directory, so installing this once covers every
# worktree created later, including ones created by tooling rather than by hand.
#
# Git runs post-checkout as: $1 = previous HEAD, $2 = new HEAD, $3 = 1 for a
# branch checkout. `git worktree add` reports the previous HEAD as the null SHA,
# which is how the install below is limited to genuinely new worktrees instead of
# running on every branch switch.
#
# Set SCRYVE_SKIP_INSTALL=1 to skip the dependency install, for when a worktree
# is only needed to read files or inspect a diff.

prev_head="$1"
null_sha="0000000000000000000000000000000000000000"

# Bail out in any directory that is not a checkout of this project.
[ -f package.json ] || exit 0

# Link the shared development env file. Cheap, so it runs for every checkout
# that is missing one, not just for new worktrees.
target="${SCRYVE_DEV_ENV:-${XDG_CONFIG_HOME:-$HOME/.config}/scryve/env.development}"
if [ ! -e .env.local ] && [ -f "$target" ]; then
  ln -s "$target" .env.local 2>/dev/null &&
    echo "post-checkout: linked .env.local -> $target"
fi

# Everything below is for new worktrees only.
[ "$prev_head" = "$null_sha" ] || exit 0
[ -d node_modules ] && exit 0
[ -n "$SCRYVE_SKIP_INSTALL" ] && exit 0
command -v corepack >/dev/null 2>&1 || exit 0

# Git exports these for the hook. Leaving them set would point any nested git
# command run by an install script at the wrong repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

echo "post-checkout: installing dependencies (SCRYVE_SKIP_INSTALL=1 to skip)"
if corepack pnpm install --frozen-lockfile; then
  echo "post-checkout: dependencies ready"
else
  echo "post-checkout: install failed. Run 'corepack pnpm install' in this worktree." >&2
fi

# Never fail the git command that triggered the hook.
exit 0
