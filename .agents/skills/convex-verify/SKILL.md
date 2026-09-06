---
name: convex-verify
description: Verify a specific Convex change with focused behavior tests, including access boundaries where relevant.
---

Read `convex/_generated/ai/guidelines.md` and [the test workflow](../convex-test/SKILL.md). Reuse the existing Jest and explicit module-loader setup.

Identify the changed behavior and exercise the actual exported functions. Verify the resulting records or query output, not just that the call returned. For access-boundary changes, use the permitted caller, a different user, and an unauthenticated caller. Assert that unauthorized calls are denied and returned records stay within the caller's permitted scope, using `convex/lib/auth.ts` as the boundary reference. For migrations or outbox recovery, test interrupted work and retries instead of unrelated auth cases.

Run only the relevant tests, targeted lint, and `pnpm compile`. Fix demonstrated defects within the requested scope; do not weaken an assertion to hide them. Report what was exercised and any remaining deployment or real-client gap. No deployment is required for this in-memory verification.
