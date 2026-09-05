---
name: convex-test
description: Add focused tests for a Scryve Convex behavior using the existing in-memory Jest setup.
---

Read `convex/_generated/ai/guidelines.md` and a nearby `convex/*.test.ts` file before writing tests.

Scryve runs Convex tests with Jest and `convex-test`. Reuse its explicit module-loader map and call `convexTest(schema, modules)`. Include the modules reached by the behavior and scheduled functions. Do not use the default `import.meta.glob` loader or install a parallel Vitest framework.

Seed through public functions where useful, or use `t.run` for records the API cannot create. Use `t.withIdentity` with the identity shape consumed by the existing auth helper. Test the behavior that changes, including a rejected caller when authorization is involved. For scheduled work, use the existing fake-timer and scheduler-drain pattern.

Run `pnpm test <files> --runInBand`, targeted `pnpm exec eslint <files>`, and `pnpm compile`. Keep tests in memory and avoid real network calls or deployment setup.
