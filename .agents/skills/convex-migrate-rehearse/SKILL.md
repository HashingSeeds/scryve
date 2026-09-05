---
name: convex-migrate-rehearse
description: Rehearse a Convex schema migration on an isolated deployment before an authorized release.
---

Read `convex/_generated/ai/guidelines.md`, `RELEASING.md`, and [the migration workflow](../convex-migrate/SKILL.md).

Identify the authorized source and an isolated rehearsal target before any export or write. Use synthetic fixtures unless the user authorized copying real data. Do not fall back to a shared or daily-driver deployment when an isolated target is unavailable.

Inspect installed CLI help and credentials for the intended target. Use explicit deployment selectors for every export, import, deploy, and function invocation. For a production source, an authorized export must explicitly select production; a bare export may select development instead. Discover the actual deployment name rather than assuming a preview label is that name.

Create the rehearsal from the pre-change schema, then seed the approved fixture or snapshot. Apply the expansion, resumable backfill, and compatibility checks in release order. Do not tighten merely because existing rows conform: installed clients may still write the old shape.

Report the tested commit, target, checks, and any remaining adoption gate. Rehearsal does not authorize production promotion. Follow `RELEASING.md` for an authorized release and roll forward on failure. Keep real-data snapshots outside git and public artifact storage; remove temporary copies after the agreed retention period.
