// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  counterValue: {
    none_one: "{{count}} vida",
    none_many: "{{count}} de vidas",
    none_other: "{{count}} vidas",
    mtg_one: "{{count}} vida",
    mtg_many: "{{count}} de vidas",
    mtg_other: "{{count}} vidas",
    ygo_one: "{{count}} Life Point",
    ygo_many: "{{count}} de Life Points",
    ygo_other: "{{count}} Life Points",
    pokemon_one: "{{count}} carta de Premio",
    pokemon_many: "{{count}} de cartas de Premio",
    pokemon_other: "{{count}} cartas de Premio",
  },
  counterChange: {
    none_one: "{{count}} cambio de vida",
    none_many: "{{count}} de cambios de vida",
    none_other: "{{count}} cambios de vida",
    mtg_one: "{{count}} cambio de vida",
    mtg_many: "{{count}} de cambios de vida",
    mtg_other: "{{count}} cambios de vida",
    ygo_one: "{{count}} cambio de Life Points",
    ygo_many: "{{count}} de cambios de Life Points",
    ygo_other: "{{count}} cambios de Life Points",
    pokemon_one: "{{count}} cambio de cartas de Premio",
    pokemon_many: "{{count}} de cambios de cartas de Premio",
    pokemon_other: "{{count}} cambios de cartas de Premio",
  },
  noneTaken: "ninguna perdida",
  taken: "{{amount}} perdidas",
  even: "igual",
  fromStart: "{{delta}} desde el inicio",
} satisfies LocaleNamespace
