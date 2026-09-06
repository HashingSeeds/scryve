---
name: convex-authz
description: Review or fix authorization in Scryve Convex functions when an authorization audit or hardening pass is requested.
---

Read `convex/_generated/ai/guidelines.md` before inspecting Convex code. Trace the public entry point through `convex/lib/auth.ts` and its callers before deciding that a check is absent.

Use `rg` to locate candidate identity arguments, sensitive returns, document writes, and parent references. Search results are candidates, not defects. Inspect direct argument properties separately from nested payload fields, and follow helper calls. A missing inline `ctx.auth` reference does not mean authentication is missing.

Check whether the caller can impersonate another user, read or change another player's private records, or attach data to a game or deck they cannot access. Distinguish deliberately public data from owner-only data. Derive caller identity from authentication; retain target IDs that the operation legitimately needs.

Reuse the existing `requireIdentity`, `requireUser`, membership, host, and seat-owner checks in `convex/lib/auth.ts`. A configured provider can supply an identity without a users row. Require that row only when the operation needs it. Compare IDs in the same namespace; do not compare a database user ID with an auth subject.

Report concrete unauthorized calls and their consequences. In review-only work, report findings without edits. When fixes are requested, preserve installed-client function names and accepted arguments, ignore obsolete identity arguments rather than trusting them, and test both the permitted and rejected caller using the existing Jest setup. Run focused tests, targeted lint, and `pnpm compile`.
