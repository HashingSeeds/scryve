// why: ExpoConfigVersions keeps the version out of the runtime, so a bump does not cut installs off from OTA.
module.exports = {
  sourceSkips: [
    "PackageJsonScriptsAll",
    "GitIgnore",
    "ExpoConfigExtraSection",
    "ExpoConfigVersions",
  ],
}
