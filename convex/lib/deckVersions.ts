export const DEFAULT_VERSION_NAME = "Current"
const LEGACY_DEFAULT_VERSION_NAME = "Main"

export function versionLabel(
  version: { name?: string; versionNumber: number },
  latestVersionNumber: number,
) {
  const name = version.name?.trim()
  const serverNamed =
    version.versionNumber === 1 &&
    (name === DEFAULT_VERSION_NAME || name === LEGACY_DEFAULT_VERSION_NAME)
  if (!serverNamed) return name || undefined
  const isLatest = version.versionNumber === latestVersionNumber
  return isLatest ? DEFAULT_VERSION_NAME : undefined
}
