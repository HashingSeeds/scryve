# Scryve

Scryve is a life counter and deck tracking app for trading card games with multiplayer built-in. A Convex backend handles sync while MMKV supports the local-first React Native/Expo mobile and web apps.

## What makes Scryve special?
We want Scryve to be loved by everyone from the casual player at a local game store to the grinder at an international tournament. It's important we maintain the things they love as we continue to iterate on the product. Here's a brief list of the things we can never compromise on.

1. Open at the core
Scryve is truly open. We share how we think about things and of course we share all our code. We work in the open, and should strive to stay that way.

2. Performance without compromise
Lots of apps have gotten bogged down with bad tech decisions and "slop". We have not, and we're proud of the performance of Scryve. We regularly audit for performance regressions, often caused by sending too much data over websockets, css animations causing gpu spikes, lists being hard to render, and more. Make sure all changes are considerate of performance impact.

3. Local-first
Scryve is a joy to use regardless of network connection and it always will be. Our Convex backend makes syncing smooth and fast, but when networks are slow or lost everything should still work. MMKV keeps the data locally and then it all gracefully catches up when reconnected. Or our users can choose local-only without an account for features where that makes sense.

4. Multi-surface
T3 Code has 2 key app surfaces: web and mobile.

Mobile is the main surface most users install first. It's a React Native/Expo app for both iOS and Android, available on the App Store and Google Play (soon).

## A note from Matt
I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here.

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing Scryve.
- **I, me, we, us, and maintainers** mean Matt and the people building Scryve. These are who you are talking to now.
- **user or player** means the person using Scrive to play games, build decks, and see their stats.
- **team** means a group of players (e.g. two player teams).
- **game** means the local or connected play session.
- **match** means multiple games, such as best-of-three.
- **round** means a tournament pairing or time unit.
- **system** means the specific game system, for example, Magic the Gathering, Yugioh, and Pokemon.
- **card** means an item with rules and stats connected to it based on the system it belongs to.
- **deck** means a group of cards a player uses to play a game.
- **format** means a particular group of rules that tell how a game is played (e.g. Modern, Commander).
- **ruleset** means the underlying rules configuration.
- **rule** means a specific piece of governance on how the game is played in a system or format.

## Ways to hurt yourself
This section is empty for now. If you have consistently 1. struggled with something, or 2. noticed you and I have misunderstood each other you can document what you think would have helped you here.

## Verifying

- Smallest proof that the change works. `pnpm test <files>` for the tests you touched, targeted lint (`pnpm lint:check <files>`) and `pnpm compile` (typechecks both the app and test tsconfigs) for the scope you changed.
- For a change with non-obvious reach, name the fact that makes it safe and prove it with the cheapest real evidence: the implementation, the failure path, a focused test, or the client.
- **Do not run repo-wide checks.** No `pnpm lint` (it auto-fixes), full `pnpm test`, or Maestro E2E unless asked.
- Backend behavior changes ship with focused tests for that behavior.
- Upon request, user-visible frontend changes should get one integrated pass in a real client: `test-scryve-web` for web, `test-scryve-mobile` for mobile. The primary agent does this once after integrating, loading `.agents/skills/test-scryve-web/SKILL.md` or `.agents/skills/test-scryve-mobile/SKILL.md`. Subagents do not launch their own dev servers.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images. Motion or timing needs a short video.
- Upload PR evidence to GitHub. Never commit PR-only screenshots or assets such as `.github/pr-assets/`.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep temporary working material outside the worktree. `.plans/` is gitignored only as a safety net for legacy tooling.

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.

This project uses [Convex](https://convex.dev) as its backend.

Before inspecting or editing any Convex file, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. 

## Convex change compatibility

Installed clients cannot be forced to upgrade, so every deployed Convex change must use expand-and-contract.

- Never require a newly added field in the same release that introduces it; add it as optional, backfill, then tighten.
- Never rename or remove a Convex function while any installed client can still call it.
- Add new tables, fields, and indexes before deploying code that depends on them.
- Make background migrations resumable and idempotent.
- Deploy backend changes that accept both old and new clients BEFORE releasing the new client, then remove old behavior only after the adoption window has passed.
- Production deploys follow RELEASING.md; never run an incidental convex deploy against production.
