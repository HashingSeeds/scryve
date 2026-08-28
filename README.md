# Scryve

Scryve is an Expo Router life-counter app built on Ignite's component and theme foundation.

This is the boilerplate that [Infinite Red](https://infinite.red) uses as a way to test bleeding-edge changes to our React Native stack.

- [Quick start documentation](https://github.com/infinitered/ignite/blob/master/docs/boilerplate/Boilerplate.md)
- [Full documentation](https://github.com/infinitered/ignite/blob/master/docs/README.md)

## Toolchain

The project pins Node 24.18.1 in `.nvmrc` and pnpm 10.14.0 through the `packageManager`
field in `package.json`. Use Corepack so the project-selected pnpm version wins over any ambient
global installation.

## Getting Started

```bash
nvm use
corepack pnpm install --frozen-lockfile
corepack pnpm run start
```

Development configuration is split three ways:

- `.env.development` is tracked and holds only public client values, so it reaches
  every checkout and worktree through git.
- `~/.config/scryve/env.development` holds this machine's per-developer values and
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

Static checks run with:

```bash
corepack pnpm run compile
corepack pnpm run lint:check
corepack pnpm test --runInBand
```

To make things work on your local simulator, or on your phone, you need first to [run `eas build`](https://github.com/infinitered/ignite/blob/master/docs/expo/EAS.md). We have many shortcuts on `package.json` to make it easier:

```bash
pnpm run build:ios:sim # build for ios simulator
pnpm run build:ios:device # build for ios device
pnpm run build:ios:prod # build for ios device
```

### `./assets`

This directory is designed to organize and store various assets, making it easy for you to manage and use them in your application. The assets are further categorized into subdirectories, including `icons` and `images`:

```tree
assets
├── icons
└── images
```

**icons**
This is where your icon assets will live. These icons can be used for buttons, navigation elements, or any other UI components. The recommended format for icons is PNG, but other formats can be used as well.

Ignite comes with a built-in `Icon` component. You can find detailed usage instructions in the [docs](https://github.com/infinitered/ignite/blob/master/docs/boilerplate/app/components/Icon.md).

**images**
This is where your images will live, such as background images, logos, or any other graphics. You can use various formats such as PNG, JPEG, or GIF for your images.

Another valuable built-in component within Ignite is the `AutoImage` component. You can find detailed usage instructions in the [docs](https://github.com/infinitered/ignite/blob/master/docs/Components-AutoImage.md).

How to use your `icon` or `image` assets:

```typescript
import { Image } from 'react-native';

const MyComponent = () => {
  return (
    <Image source={require('assets/images/my_image.png')} />
  );
};
```

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

## Next Steps

### Ignite Cookbook

[Ignite Cookbook](https://ignitecookbook.com/) is an easy way for developers to browse and share code snippets (or “recipes”) that actually work.

### Upgrade Ignite boilerplate

Read our [Upgrade Guide](https://ignitecookbook.com/docs/recipes/UpdatingIgnite) to learn how to upgrade your Ignite project.

## Community

⭐️ Help us out by [starring on GitHub](https://github.com/infinitered/ignite), filing bug reports in [issues](https://github.com/infinitered/ignite/issues) or [ask questions](https://github.com/infinitered/ignite/discussions).

💬 Join us on [Slack](https://join.slack.com/t/infiniteredcommunity/shared_invite/zt-1f137np4h-zPTq_CbaRFUOR_glUFs2UA) to discuss.

📰 Make our Editor-in-chief happy by [reading the React Native Newsletter](https://reactnativenewsletter.com/).
Connected lobby development is configuration-gated; see [docs/CONNECTED_SETUP.md](docs/CONNECTED_SETUP.md). Missing Clerk/Convex configuration never blocks offline local games.

## Web wait-list gate

The production Pages deployment uses `functions/_middleware.ts` to admit signed-in Clerk users and
redirect everyone else to `/waitlist/`. The gate is disabled unless the production Pages environment
sets `WAITLIST_GATE_ENABLED=true`, so local and preview deployments remain open.

The production Pages environment also needs `APP_ORIGIN`, `CLERK_SECRET_KEY`,
`TURNSTILE_SECRET_KEY`, and `WAITLIST_INGEST_SECRET`, along with the existing
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CONVEX_SITE_URL`. Set the same
`WAITLIST_INGEST_SECRET` in the production Convex deployment. The static page gets its Turnstile
site key and Clerk Account Portal sign-in URL from `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and
`EXPO_PUBLIC_CLERK_SIGN_IN_URL` during `scripts/prepare-web-deploy.cjs`.

For a Git-connected Cloudflare Pages project, use `pnpm build:web:pages` as the build command and
`dist` as the build output directory.
