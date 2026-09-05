---
name: convex-migrate
description: Prepare or execute an authorized expand-and-contract Convex schema migration for installed Scryve clients.
---

Read `convex/_generated/ai/guidelines.md`, `AGENTS.md`, and `RELEASING.md`. Identify the old client reads and writes before choosing the transition.

- New field: add it as optional, backfill, then require it only after all writers support it.
- Type change: accept old and new representations, migrate records, then narrow after old writers have aged out.
- Rename: support old and new fields with compatible reads and writes, backfill, then remove the old representation after the client adoption window.
- Removal: stop new dependencies first and retain the old function or field while installed clients still use it.

Declare staged indexes before using them; deploy that expansion and confirm backfill readiness before the code that queries them. Backend compatibility ships before the dependent client.

Use the repository's bounded scheduled mutations for small backfills. Each batch must be retry-safe and resumable through a persisted cursor or a predicate that excludes completed rows. Use an installed migration component if it already solves the task; do not add one automatically. Verify restart and retry behavior, remaining eligible records, and the resulting data before any tightening.

Prepare and test the migration before requesting any missing production authorization. Name the target immediately before an authorized deployment or migration. Record the exact commit and invocation in the release record. Roll forward with compatible code; do not restore an old snapshot over newer writes.
