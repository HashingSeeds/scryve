<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Convex change compatibility

Installed clients cannot be forced to upgrade, so every deployed Convex change must use expand-and-contract.

- Never require a newly added field in the same release that introduces it; add it as optional, backfill, then tighten.
- Never rename or remove a Convex function while any installed client can still call it.
- Keep mutation semantics compatible with at least the current and previous production runtime.
- Add new tables, fields, and indexes before deploying code that depends on them.
- Make background migrations resumable and idempotent.
- Deploy backend changes that accept both old and new clients BEFORE releasing the new client, then remove old behavior only after the adoption window has passed.
- Production deploys follow RELEASING.md; never run an incidental convex deploy against production.
