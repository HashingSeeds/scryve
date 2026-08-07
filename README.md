# Count

Count is an Expo Router life-counter app built on Ignite's component and theme foundation.

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
[Maestro CLI](https://docs.maestro.dev/maestro-cli), boot a simulator/emulator with the Count
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
