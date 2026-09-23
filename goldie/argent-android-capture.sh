#!/usr/bin/env bash
set -euo pipefail

# Argent 0.22.1 misreads this emulator's full-resolution pixel buffer.
# Goldie still drives every flow; adb supplies only the final PNG capture.
if [[ ${1:-} == run && ${2:-} == screenshot ]]; then
  original=("$@")
  shift 2
  serial=""
  output=""
  scale=""
  while (($#)); do
    case "$1" in
      --udid) serial=$2; shift 2 ;;
      --out) output=$2; shift 2 ;;
      --scale) scale=$2; shift 2 ;;
      *) shift ;;
    esac
  done
  if [[ $scale == 1 && -n $serial && -n $output ]]; then
    remote="/sdcard/goldie-capture-$$.png"
    adb -s "$serial" shell screencap -p "$remote" >/dev/null
    adb -s "$serial" pull "$remote" "$output" >/dev/null
    adb -s "$serial" shell rm "$remote"
    exit 0
  fi
  set -- "${original[@]}"
fi

exec argent "$@"
