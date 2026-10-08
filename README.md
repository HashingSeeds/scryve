# Scryve

Scryve is a life counter and deck tracking app for trading card games, with multiplayer built in. It is local-first (MMKV) with Convex sync, and runs on iOS, Android, and web with Expo and React Native.

Offline, local games are always available, even without an account.

## Toolchain

The project pins Node 24.18.1 in `.nvmrc` and pnpm 10.34.5 through the `packageManager`
field in `package.json`. Install pnpm 10 or newer and call it directly; it switches itself to the
pinned version. Don't use `corepack pnpm`: scripts that call `pnpm` again fail with a version
mismatch when the global pnpm is a different major.

## Getting Started

```bash
nvm use
pnpm install --frozen-lockfile
pnpm run start
```

`pnpm start` runs Metro and `convex dev` together and heals the usual worktree problems
first: it stops this worktree's leftover Metro and `convex dev`, runs
`pnpm install --frozen-lockfile` when `pnpm-lock.yaml` changed since the last install,
and uses the next free port when 8081 is taken. It refuses to start unless
`CONVEX_DEPLOYMENT` is a `dev:` deployment. All worktrees share one dev deployment
through `.env.local`, so when another worktree's `convex dev` already pushes to it,
`pnpm start` warns and starts Metro only. The running instance is recorded in
`~/.local/state/scryve-dev/` and removed on exit. Concurrent starts take turns through a
loopback lock on ports 18080-18089; if another app needs those, set
`SCRYVE_DEV_LOCK_PORT=<port>` for every start to move the range.

Development configuration is split three ways:

- `.env.development` is tracked and holds only public client values, so it reaches
  every checkout and worktree through git.
- `~/.config/scryve/.env.local` holds this machine's per-developer values and
  local secrets, such as your own Convex deployment and `SENTRY_AUTH_TOKEN`. It
  lives outside the repo so worktrees can share one copy. Link it with:

```bash
./scripts/link-dev-env.sh
```

  That symlinks the ignored `.env.local` to it, and Expo and Convex load it
  natively. A `post-checkout` hook does this automatically for new worktrees, and
  also installs dependencies. To install the hook on a fresh clone:

```bash
cp scripts/post-checkout-hook.sh "$(git rev-parse --git-common-dir)/hooks/post-checkout"
chmod +x "$(git rev-parse --git-common-dir)/hooks/post-checkout"
```

- Backend secrets are set on each Convex deployment, not in any local file.
  `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `CLERK_FRONTEND_API_URL`,
  `RESEND_API_KEY`, and `MODERATION_ALERT_*` are read by `convex/` code running on
  the deployment. Set them with `npx convex env set`.

Contributors without the shared file can copy `.env.example` to `.env.local`.

### Convex preview for this worktree

Put a Convex **preview deploy key** in `~/.config/scryve/.env.preview` as
`CONVEX_DEPLOY_KEY=preview:...`, or provide `CONVEX_DEPLOY_KEY` in the shell.
The older `CONVEX_PREVIEW_DEPLOY_KEY` name works too. With a different
`XDG_CONFIG_HOME`, use `$XDG_CONFIG_HOME/scryve/.env.preview`. Keep this file
outside the repo; the post-checkout hook does not link deploy keys.

Run `pnpm preview:up` to create or update a preview for the current branch.
It writes the preview URL, site URL, and deployment name to this worktree's
ignored `.env.development.local`. It never changes the shared `.env.local`.
Run `pnpm preview:check` to check that deployment, then `pnpm start:expo` to
serve the development client against it. Use `pnpm start:expo` here because
`pnpm start` also starts `convex dev`.

A fresh preview has no Clerk user projections. Sign in with a development
test account and open Account once to sync its profile before testing decks
or connected play. Preview deployments expire; rerun `pnpm preview:up` when
needed.

## Static checks

```bash
pnpm run compile
pnpm run lint:check
pnpm test --runInBand
```

## Builds

Builds run locally through [EAS](https://docs.expo.dev/build/introduction/). Shortcuts in `package.json`:

```bash
pnpm run build:ios:sim      # iOS simulator, development profile
pnpm run build:ios:dev      # iOS device, development profile
pnpm run build:ios:preview  # iOS device, preview profile
pnpm run build:ios:prod     # iOS, production profile
```

Each has an Android equivalent (`build:android:sim`, `build:android:dev`, `build:android:preview`, `build:android:prod`).

## Running Maestro end-to-end tests

Maestro drives the installed iOS or Android development build through native accessibility, so no
Maestro npm package is linked into the app. Install the
[Maestro CLI](https://docs.maestro.dev/maestro-cli), boot a simulator/emulator with the Scryve
development build installed, and start Metro before running:

```bash
pnpm run test:maestro:check  # fast Jest validation of flow selectors
pnpm run test:maestro:smoke  # one local-game journey
pnpm run test:maestro        # all configured flows
```

The flows, conventions, and troubleshooting notes live in [`.maestro/README.md`](.maestro/README.md).

## Marketing site and web app layout

The public site at `https://scryve.sow.care/` is a static Astro project in `site/`. The Expo web app
is exported with the base path `/play`, so it lives at `https://scryve.sow.care/play`. Invite links
stay `https://scryve.sow.care/join/<token>` (native app links claim `/join`) and redirect to
`/play/join/<token>` on the web.

```bash
pnpm site:dev    # run the marketing site locally
pnpm site:build  # build it to site/dist
```

`SCRYVE_WEB_BASE_URL=/play` is set only by the web export scripts (`bundle:web`, `bundle:web:prod`,
`build:web:pages`). Native builds, EAS, and `pnpm web` do not use a base path.

`scripts/prepare-web-deploy.cjs` assembles the Cloudflare Pages output in `dist/`: the site at the
root, the Expo export under `dist/play/`, and `web/_redirects` as `dist/_redirects`. Add a rewrite
for any new top-level route in `src/app` to `web/_redirects` so deep links return 200.

The Git-connected Cloudflare Pages project builds with `pnpm build:pages` and outputs `dist`. Its
production branch is `production`, which moves only when a beta update is promoted. Set
`EXPO_PUBLIC_CONVEX_URL` to the production Convex URL in the Production environment; production builds
don't deploy Convex, because the beta workflow already did. Set `CONVEX_DEPLOY_KEY` to a preview deploy
key in the Preview environment, and optionally `CONVEX_STAGING_DEPLOY_KEY` to a staging dev deployment
key so branches that don't touch the backend reuse staging. Preview deploys inject their Convex URLs.
See [RELEASING.md](RELEASING.md#convex-deploys).
