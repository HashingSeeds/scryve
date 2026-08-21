export const DEFAULT_VERSION_NAME = "Current"

export function versionLabel(version: { name?: string; versionNumber: number }) {
  const name = version.name?.trim()
  if (version.versionNumber === 1 && name === "Main") return DEFAULT_VERSION_NAME
  return name || `Version ${version.versionNumber}`
}

export function winRate(record: { games: number; wins: number }) {
  return record.games > 0 ? record.wins / record.games : undefined
}

export function formatWinRate(record: { games: number; wins: number }) {
  const rate = winRate(record)
  return rate === undefined ? "No games yet" : `${Math.round(rate * 100)}% win rate`
}
