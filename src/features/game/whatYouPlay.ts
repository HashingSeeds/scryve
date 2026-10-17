import type { GameType } from "./gameTypes"
import type { LocalSettings } from "./localPersistence"
import { defaultStartingLife } from "./playSystems"

export const COMMANDER_SEATS = 4

export function settingsForWhatYouPlay(settings: LocalSettings, type: GameType): LocalSettings {
  const { askWhatYouPlay: _asked, ...rest } = settings
  if (!type.system) return rest
  const defaultPlayerCount = type.format === "commander" ? COMMANDER_SEATS : rest.defaultPlayerCount
  return {
    ...rest,
    defaultSystem: type.system,
    defaultFormat: type.format,
    defaultPlayerCount,
    defaultStartingLife: defaultStartingLife(type.system, type.format, defaultPlayerCount),
  }
}
