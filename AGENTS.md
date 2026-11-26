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
Scryve has 2 key app surfaces: web and mobile.

Mobile is the main surface most users install first. It's a React Native/Expo app for both iOS and Android, available on the App Store and Google Play (soon).

## A note from Matt
I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here.

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing Scryve.
- **I, me, we, us, and maintainers** mean Matt and the people building Scryve. These are who you are talking to now.
- **user or player** means the person using Scryve to play games, build decks, and see their stats.
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
On Linux, an iOS `agent-device` failure does not mean mobile verification is unavailable. Check Android targets with `agent-device devices --platform android` and use an Android emulator when authorized. Check existing QA emulator profiles for the installed development app before concluding it is missing. Respect emulator sessions owned by other worktrees.

## Running the app

`pnpm start` is safe to rerun from any worktree. It stops this worktree's stale Metro and `convex dev`, reinstalls when `pnpm-lock.yaml` changed, and picks a free Metro port from 8081. It writes `{ worktree, port, pid, convex }` to `~/.local/state/scryve-dev/<worktree>-<hash>.json` while it runs; pass that port to `agent-device --metro-port`. Every worktree shares one Convex dev deployment, so only the first `pnpm start` runs `convex dev`. Later ones start Metro only and say which worktree owns the push. Stop that one before testing backend changes from yours.

For connected play, bots, or backend changes, run `pnpm convex:local` in the background, then `pnpm start:expo`. It runs a Convex backend of this worktree's own, so it never touches the shared dev deployment or the bill. Use `pnpm preview:up` only for clients that can't reach this machine: PR preview builds, Revyl, and the Mac mini's devices. See README.md.

## Verifying

- Smallest proof that the change works. `pnpm test <files>` for the tests you touched, targeted lint (`pnpm lint:check <files>`) and `pnpm compile` (typechecks both the app and test tsconfigs) for the scope you changed.
- `pnpm compile` type-checks the app and tests (`pnpm check:ygo-worker` covers the worker). It runs tsrs, a Rust port of TypeScript 7, in under a second. Don't run `tsc` or `npx tsc`. `typescript` in `package.json` is the TypeScript 6 API that typescript-eslint and dependency-cruiser need, and `@typescript/native` (TypeScript 7 `tsc`) exists only for the weekly `tsc-parity` workflow.
- For a change with non-obvious reach, name the fact that makes it safe and prove it with the cheapest real evidence: the implementation, the failure path, a focused test, or the client.
- **Do not run repo-wide checks.** No `pnpm lint` (it auto-fixes), full `pnpm test`, or Maestro E2E unless asked.
- Backend behavior changes ship with focused tests for that behavior.
- A change to how nearby games sync life, undo, or commander damage runs `.agents/skills/verify-nearby-sync/check.sh`. Its SKILL.md lists the files it covers.
- A change to the board or to `lobbyProjection` runs `pnpm test test/perf convex/lobbyProjection.perf.test.ts`. They count renders and websocket bytes for set interactions and fail when any count grows. Raising a budget needs a reason in the PR. A warning that a count came in under budget means lower the budget in the same PR.
- A change that could slow the board on a phone, or a perf fix that needs numbers, follows `.agents/skills/verify-perf/SKILL.md`: JS CPU and frame numbers before and after, on the Pixel 6a.
- Upon request, user-visible frontend changes should get one integrated pass in a real client: `test-scryve-web` for web, `test-scryve-mobile` for mobile. The primary agent does this once after integrating, loading `.agents/skills/test-scryve-web/SKILL.md` or `.agents/skills/test-scryve-mobile/SKILL.md`. Subagents do not launch their own dev servers.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images. Motion or timing needs a short video.
- Upload PR evidence to GitHub. Never commit PR-only screenshots or assets such as `.github/pr-assets/`.
- One concern per PR. If the description says "also", split it.
- CodeRabbit reviews only when Matthew asks or the full-send gate requires it. Its limit is shared by every agent, since all PRs open as Matt. Batch review fixes into one push, then queue one review with `fleet cr request <pr-url>`; the Mac mini posts it when the allowance allows. When Matthew asks for the review, label the PR `cr:matthew` first so it goes to the front. Never comment `@coderabbitai` yourself, including `review`, `full review` and `rate limit`. `fleet cr list` shows the queue.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep temporary working material outside the worktree. `.plans/` is gitignored only as a safety net for legacy tooling.

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Styles say start and end, not left and right, so right-to-left languages mirror on web too. The board keeps physical sides (it sits in a `$tableDirection` scope), and measured positions and safe-area insets outside it go through `src/theme/direction.ts`.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Languages

- Every number, date, clock, and list a person reads goes through `src/i18n/format.ts`, or through a translation, which formats each `{{value}}` for you. Lint points at the helper when you reach for `toLocaleString`, `Intl`, `.join(" · ")`, or a hand-built sign.
- Numbers in copy come from placeholders: `{{count}}`, `{{delta, signed}}`, `{{share, percent}}` (a ratio: pass 0.6 for 60%), `{{cards, orMore}}`. A `Date` in a placeholder shows its day and time; for another shape, pass the result of `formatDate(date, options)`. `pnpm i18n:check` fails on a dropped placeholder, and on a digit the English lacks in a language whose region writes its own digits.
- Text that gets saved (a note, a default name) uses `translateForStorage`, so it carries no direction marks or native digits into data.
- Translations in `src/i18n/<language>` are generated. Fix wording at its source, choosing the narrowest fix, then run `pnpm i18n:translate`, which retranslates only what the fix touches:
  - One string in one language: a note above the English key that starts with the language code, like `// ko: Use 덱 통계.`
  - One string in every language: a plain note above the English key.
  - A word everywhere: its concept in `src/i18n/glossary.json`. The concept's name is the meaning the translator reads, `en` lists the English words it covers, and every language needs a term. A new concept's terms describe what the translations already use.
  - A whole language: a rule under `rules`. This retranslates the whole language.
- `pnpm i18n:check` fails on a hand edit to a generated file, a note for a language we don't translate, a concept missing a language, and a concept whose English words the copy never uses.
- An iOS permission reason goes in `src/i18n/en/permissions.ts` and `permissionPrompts` in `app.config.ts`, never straight into `infoPlist`, so every language gets one. Changing one changes the native fingerprint, so it ships in a new binary.
- To add a language, add it to `LOCALES` in `scripts/i18n.cjs`, give it `rules` and a term for every concept in the glossary, then run `pnpm i18n:translate`. Its push copy lives in `convex/lib/notifications.ts`, and a test fails until it's there. Its App Store keywords and store regions go in `src/i18n/storeKeywords.json` and `scripts/store.cjs`, and the store scripts fail until they're there. Adding it is a backend release.
- Copy shown outside the app lives in `src/i18n/en/storefront.ts` and translates the same way, but no app bundle loads it. `pnpm i18n:paywall <export.csv>` fills RevenueCat's paywall CSV. `pnpm store:play` previews the Google Play listing, subscription names and newest internal release's notes, and `--apply` publishes them. `pnpm store:apple` fills the text in a `store.config.json` from `pnpm store:pull` and drops its screenshots and previews, so `pnpm store:push` changes only text, except that it deletes previews added in App Store Connect after the pull. RELEASING.md's native releases say when to run them. App Store keywords aren't translated: each language's list in `src/i18n/storeKeywords.json` is written for that market from what players there search, without words a store would read as gambling, religion or dating, and the store scripts reject words already in the name or subtitle and games outside `KEYWORD_GAMES`. A note that says "At most 30 characters." makes `pnpm i18n:check` enforce the limit.
- `EXPO_PUBLIC_LOCALE=en-XA` brackets every translated string and draws formatted digits as Arabic-Indic. On screen, unbracketed text skipped i18n and an ASCII digit skipped the formatter.

## Comments

`why:` comments only for breakage no test catches.

Keep:
- `/** why: sets rather than toggles, so two devices tapping at once agree. */`
- `` // why: clients that predate `invalid` see no seats and fall through to claimSeat, which throws. ``

Drop:
- `/** why: Poisoned and Burned only ever sit on the Active. Absent means neither, so boards stored before conditions existed need no backfill. */` (the optional field already says it)
- `// why: undefined means the deck list is still loading, which keeps the picker closed.` (put that state in the type)

One exception: in `src/i18n/en`, a comment above a key or group is a note for translators. `pnpm i18n:translate` sends it with the string, and adding or editing one retranslates that key. Write one when the English is ambiguous out of context: `// Pokémon only: Prize cards the player has taken so far. Not damage.` Per-language terms live in `src/i18n/glossary.json`.

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
- Merging to main deploys Convex to production and publishes the app to the `beta` channel (`.github/workflows/beta.yml`). The production app and web change only on promotion (see RELEASING.md). Treat every merge as a backend release, and never run `convex deploy` against production by hand outside the recovery path there.
