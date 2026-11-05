import type { GameType } from "./gameTypes"
import { COMMANDER_SEATS, type LocalSettings } from "./localPersistence"
import { defaultStartingLife } from "./playSystems"
import { isCommanderFormat } from "../../../convex/lib/gameRules"

const HEAD_TO_HEAD_SEATS = 2

export const whatYouPlaySeats = ({ system, format }: GameType) =>
  isCommanderFormat(system, format) ? COMMANDER_SEATS : HEAD_TO_HEAD_SEATS

export function settingsForWhatYouPlay(settings: LocalSettings, type: GameType): LocalSettings {
  const {
    askWhatYouPlay: _asked,
    defaultSystem: _system,
    defaultFormat: _format,
    ...rest
  } = settings
  const defaultPlayerCount = whatYouPlaySeats(type)
  return {
    ...rest,
    ...(type.system ? { defaultSystem: type.system, defaultFormat: type.format } : {}),
    defaultPlayerCount,
    defaultStartingLife: defaultStartingLife(type.system, type.format, defaultPlayerCount),
  }
}
