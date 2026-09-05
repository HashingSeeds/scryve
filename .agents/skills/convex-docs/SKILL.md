---
name: convex-docs
description: Verify Convex API facts against the installed version when documentation or an unfamiliar API is needed.
---

Read `convex/_generated/ai/guidelines.md` and the installed package version. Check the relevant declaration or implementation in `node_modules/convex` first, including CLI help for flags.

For missing detail, use official Convex documentation or the matching package source. If a docs tool is available, inspect its actual request schema; do not assume it scopes results to the installed version. Compare any result with installed types before adopting a changed signature.

Report the fact, applicable version, and source. Do not install dependencies, create helper modules, or deploy merely to answer a documentation question.
