const { withMainApplication } = require("expo/config-plugins")

const IMPORT = "import expo.modules.lazyviewmanagers.withLazyViewManagers"
const PACKAGE_LIST = "PackageList(this).packages"
const LAZY_PACKAGE_LIST = "PackageList(this).packages.map(::withLazyViewManagers).toMutableList()"

module.exports = function withLazyViewManagersPlugin(config) {
  return withMainApplication(config, (config) => {
    const { modResults } = config
    if (modResults.language !== "kt")
      throw new Error("lazy-view-managers: expected a Kotlin MainApplication")

    let contents = modResults.contents
    if (!contents.includes(LAZY_PACKAGE_LIST)) {
      if (contents.split(PACKAGE_LIST).length !== 2)
        throw new Error(`lazy-view-managers: expected one "${PACKAGE_LIST}" in MainApplication.kt`)
      contents = contents.replace(PACKAGE_LIST, LAZY_PACKAGE_LIST)
    }
    if (!contents.includes(IMPORT))
      contents = contents.replace(/^(package [^\n]+\n)/m, `$1\n${IMPORT}\n`)

    modResults.contents = contents
    return config
  })
}
