const { getSentryExpoConfig } = require("@sentry/react-native/metro")

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname)

config.transformer.getTransformOptions = async () => ({
  transform: {
    // Inline requires are very useful for deferring loading of large dependencies/components.
    // For example, src/app/_layout.tsx conditionally loads Reactotron in development.
    // However, this comes with some gotchas.
    // Read more here: https://reactnative.dev/docs/optimizing-javascript-loading
    // And here: https://github.com/expo/expo/issues/27279#issuecomment-1971610698
    inlineRequires: true,
  },
})

// This helps support certain popular third-party libraries
// such as Firebase that use the extension cjs.
config.resolver.sourceExts.push("cjs")

// why: obscenity's "import" export is an ESM shim that default-imports its own CJS build, which Metro's interop resolves to undefined on web.
const OBSCENITY_CJS_ENTRY = require.resolve("obscenity")
const resolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === "obscenity"
    ? { type: "sourceFile", filePath: OBSCENITY_CJS_ENTRY }
    : (resolveRequest ?? context.resolveRequest)(context, moduleName, platform)

module.exports = config
