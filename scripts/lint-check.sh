#!/bin/sh
# `pnpm lint:check <files>` lints only those files; with no files it lints the repo.
# Passing `.` alongside the files would lint everything, which is what agents hit.
[ $# -gt 0 ] || set -- .
exec eslint --cache --cache-strategy content --cache-location node_modules/.cache/eslint/ "$@"
