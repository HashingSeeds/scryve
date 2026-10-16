// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  counterValue: {
    none_one: "{{count}} vie",
    none_many: "{{count}} de vie",
    none_other: "{{count}} vies",
    mtg_one: "{{count}} point de vie",
    mtg_many: "{{count}} de points de vie",
    mtg_other: "{{count}} points de vie",
    ygo_one: "{{count}} Life Point",
    ygo_many: "{{count}} de Life Points",
    ygo_other: "{{count}} Life Points",
    pokemon_one: "{{count}} carte Récompense",
    pokemon_many: "{{count}} de cartes Récompense",
    pokemon_other: "{{count}} cartes Récompense",
  },
  counterChange: {
    none_one: "{{count}} changement de vie",
    none_many: "{{count}} de changements de vie",
    none_other: "{{count}} changements de vie",
    mtg_one: "{{count}} changement de vie",
    mtg_many: "{{count}} de changements de vie",
    mtg_other: "{{count}} changements de vie",
    ygo_one: "{{count}} changement de Life Points",
    ygo_many: "{{count}} de changements de Life Points",
    ygo_other: "{{count}} changements de Life Points",
    pokemon_one: "{{count}} changement de cartes Récompense",
    pokemon_many: "{{count}} de changements de cartes Récompense",
    pokemon_other: "{{count}} changements de cartes Récompense",
  },
  noneTaken: "aucun subi",
  taken: "{{amount}} subi",
  even: "égalité",
  fromStart: "{{delta}} depuis le début",
} satisfies LocaleNamespace
