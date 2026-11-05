/** @type {import('@babel/core').TransformOptions} */
module.exports = function (api) {
  api.cache(true)
  return {
    // why: no preset options, or Expo treats the config as custom and the dev Oxc transformer falls back to Babel.
    presets: ["babel-preset-expo"],
    env: {
      // why: Jest runs CommonJS, so `import()` must become require(); Metro keeps it to split lazy chunks.
      test: { plugins: ["@babel/plugin-transform-dynamic-import"] },
    },
  }
}
