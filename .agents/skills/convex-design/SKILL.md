---
name: convex-design
description: Design or implement a Scryve backend change using the existing Convex architecture.
---

Read `convex/_generated/ai/guidelines.md` first, then the affected functions, schema, and client callers. Keep offline behavior and installed-client compatibility explicit in the design.

Reuse existing auth helpers, indexes, validators, and scheduled batch patterns. Keep writes that must agree in one mutation. Bound reads and batches using indexes that support the access pattern. A residual filter after a bounded indexed scan can be appropriate; explain its read cost when it matters.

Function builders come from the module's generated server. Schema builders, `httpRouter`, `cronJobs`, pagination validators, and utility types come from `convex/server`. Do not replace those imports with generated function builders.

Implement the smallest behavior change and focused backend tests. Run the existing tests for that behavior, targeted lint, and `pnpm compile`. A typecheck does not authorize a deployment. Follow `RELEASING.md` and the user's authorized deployment scope.
