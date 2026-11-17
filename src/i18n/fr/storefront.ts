// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "Synchronisez jusqu’à {{proDecks}} decks (gratuit : {{freeDecks}})",
      versions: "Conservez {{proVersions}} versions de chaque deck (gratuit : {{freeVersions}})",
      compare: "Comparez vos listes côte à côte",
      seatMark: "Un badge Pro sur votre place dans les parties partagées",
      appIcons: "Icônes d’app Pro",
    },
    save: "Économisez {{ product.relative_discount }}",
    perMonth: "Seulement {{ product.price_per_month }}/mois",
    billedAt: "Facturé {{ product.price_per_period_abbreviated }}.",
    continue: "Continuer",
    restore: "Restaurer les achats",
    terms: "Conditions",
    privacy: "Confidentialité",
  },
} satisfies LocaleNamespace
