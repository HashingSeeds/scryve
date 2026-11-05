import type { LocalSettings } from "@/features/game/localPersistence"

export const NO_SYSTEM_SETTINGS: LocalSettings = {
  schemaVersion: 1,
  defaultPlayerCount: 2,
  defaultStartingLife: 20,
  hapticsEnabled: true,
  themePreference: "system",
  launchDestination: "play",
}
