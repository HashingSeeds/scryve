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
pnpm run test:maestro        # all flows
```

The flows, conventions, and troubleshooting notes live in [`.maestro/README.md`](.maestro/README.md).

## Web wait-list gate

The production Pages deployment uses `functions/_middleware.ts` to admit signed-in Clerk users and
redirect everyone else to `/waitlist/`. The gate is disabled unless the production Pages environment
sets `WAITLIST_GATE_ENABLED=true`, so local and preview deployments remain open.

Preview the wait-list source with live reload at `http://localhost:8788/waitlist/`:

```bash
pnpm waitlist
```

The production Pages environment also needs `APP_ORIGIN`, `CLERK_SECRET_KEY`,
`TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAMES=scryve.sow.care`, and `WAITLIST_INGEST_SECRET`, along with the existing
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CONVEX_SITE_URL`. Set the same
`WAITLIST_INGEST_SECRET` in the production Convex deployment. The public Turnstile site key is
embedded in the wait-list page. The static page gets its Clerk Account Portal sign-in URL from
`EXPO_PUBLIC_CLERK_SIGN_IN_URL` during `scripts/prepare-web-deploy.cjs`.

For a Git-connected Cloudflare Pages project, use `pnpm build:web:pages` as the build command and
`dist` as the build output directory.
