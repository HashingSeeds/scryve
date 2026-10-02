export const DEFAULT_VERSION_NAME = "Current"

export function versionLabel(version: { name?: string; versionNumber: number }) {
  const name = version.name?.trim()
  if (version.versionNumber === 1 && name === "Main") return DEFAULT_VERSION_NAME
  return name || `Version ${version.versionNumber}`
}
