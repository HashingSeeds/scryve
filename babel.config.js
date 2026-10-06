/** @type {import('@babel/core').TransformOptions} */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    env: {
      // why: Jest runs CommonJS, so `import()` must become require(); Metro keeps it to split lazy chunks.
      test: { plugins: ["@babel/plugin-transform-dynamic-import"] },
    },
  }
}
