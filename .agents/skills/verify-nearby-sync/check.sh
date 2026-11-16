#!/usr/bin/env bash
# Model-checks NearbySync.tla. Every app run must pass, and every break must
# fail on the rule it names, which proves each rule can still catch a bug.
# Usage: check.sh            run everything (about a minute)
#        check.sh <run>      one run, with its full TLC output
set -euo pipefail
cd "$(dirname "$0")"

TLC_VERSION=1.7.4
TLC_SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
jar="${XDG_CACHE_HOME:-$HOME/.cache}/scryve/tla2tools-$TLC_VERSION.jar"
if [ ! -f "$jar" ]; then
  mkdir -p "$(dirname "$jar")"
  curl -fsSL -o "$jar.part" \
    "https://github.com/tlaplus/tlaplus/releases/download/v$TLC_VERSION/tla2tools.jar"
  mv "$jar.part" "$jar"
fi
got=$({ sha256sum "$jar" 2>/dev/null || shasum -a 256 "$jar"; } | awk '{print $1}')
[ "$got" = "$TLC_SHA256" ] ||
  { echo "tla2tools.jar checksum mismatch: $jar" >&2; exit 2; }

# name | bounds | flags turned off | expected: pass, or the rule that must fail
runs='
edits         | Team=TRUE  MaxTaps=2 MaxUndos=1 MaxDrops=0 MaxHostTaps=1 Claims=FALSE |                       | pass
seats         | Team=FALSE MaxTaps=2 MaxUndos=1 MaxDrops=0 MaxHostTaps=1 Claims=FALSE |                       | pass
drops         | Team=TRUE  MaxTaps=1 MaxUndos=1 MaxDrops=2 MaxHostTaps=1 Claims=FALSE |                       | pass
claims        | Team=FALSE MaxTaps=2 MaxUndos=0 MaxDrops=2 MaxHostTaps=0 Claims=TRUE  |                       | pass
no-dedupe     | Team=FALSE MaxTaps=1 MaxUndos=0 MaxDrops=1 MaxHostTaps=0 Claims=FALSE | HostDedupes           | CountedOnce
claim-twice   | Team=FALSE MaxTaps=0 MaxUndos=0 MaxDrops=1 MaxHostTaps=0 Claims=TRUE  | ResolveReplays        | CountedOnce
double-board  | Team=FALSE MaxTaps=1 MaxUndos=0 MaxDrops=0 MaxHostTaps=0 Claims=FALSE | OverlaySkipsConfirmed | BoardsHonest
stale-rejoin  | Team=FALSE MaxTaps=1 MaxUndos=0 MaxDrops=1 MaxHostTaps=1 Claims=FALSE | StateOnRejoin         | BoardsAgree
merge-undo    | Team=FALSE MaxTaps=2 MaxUndos=1 MaxDrops=0 MaxHostTaps=0 Claims=FALSE | UndoEndsMerge         | IntentKept
window        | Team=FALSE MaxTaps=1 MaxUndos=0 MaxDrops=1 MaxHostTaps=1 Claims=FALSE Window=1 |              | BoardsHonest
'
flags="HostDedupes ResolveReplays UndoEndsMerge OverlaySkipsConfirmed StateOnRejoin"

run() { # name bounds off expected [verbose]
  local cfg meta out
  meta=$(mktemp -d) && cfg="$meta/run.cfg"
  local bounds="$2"
  [[ "$bounds" == *Window=* ]] || bounds="$bounds Window=100"
  {
    echo CONSTANTS
    for kv in $bounds; do echo "  ${kv/=/ = }"; done
    for f in $flags; do
      [[ " $3 " == *" $f "* ]] && echo "  $f = FALSE" || echo "  $f = TRUE"
    done
    echo "SPECIFICATION Spec"
    echo "INVARIANTS CountedOnce BoardsHonest BoardsAgree IntentKept"
  } >"$cfg"
  out=$(java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -config "$cfg" -deadlock \
    -workers auto -metadir "$meta/states" NearbySync.tla 2>&1 || true)
  rm -rf "$meta"
  [ -n "${5:-}" ] && echo "$out"
  local got
  if grep -q "Model checking completed. No error has been found." <<<"$out"; then got=pass
  else got=$(sed -n 's/^Error: Invariant \([A-Za-z]*\) is violated.*/\1/p' <<<"$out" | head -1)
  fi
  local states
  states=$(sed -n 's/.* \([0-9,]*\) distinct states found.*/\1/p' <<<"$out" | tail -1)
  if [ "$got" = "$4" ]; then printf 'ok    %-13s %-12s %s states\n' "$1" "$got" "$states"
  else printf 'FAIL  %-13s expected %s, got %s\n' "$1" "$4" "${got:-an error}"; return 1
  fi
}

status=0 matched=
while IFS='|' read -r name bounds off expected; do
  name=$(xargs <<<"$name"); [ -z "$name" ] && continue
  [ -n "${1:-}" ] && [ "$1" != "$name" ] && continue
  matched=1
  run "$name" "$bounds" "$(xargs <<<"$off")" "$(xargs <<<"$expected")" "${1:-}" || status=1
done <<<"$runs"
[ -n "$matched" ] || { echo "no run named ${1:-}" >&2; exit 2; }
exit $status
