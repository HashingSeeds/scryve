// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "Sincroniza hasta {{proDecks}} mazos (gratis: {{freeDecks}})",
      versions: "Conserva {{proVersions}} versiones de cada mazo (gratis: {{freeVersions}})",
      compare: "Compara tus listas lado a lado",
      seatMark: "Una marca Pro en tu asiento en partidas compartidas",
      appIcons: "Íconos de app Pro",
    },
    save: "Ahorra {{ product.relative_discount }}",
    perMonth: "Solo {{ product.price_per_month }}/mes",
    billedAt: "Se cobra {{ product.price_per_period_abbreviated }}.",
    continue: "Continuar",
    restore: "Restaurar compras",
    terms: "Términos",
    privacy: "Privacidad",
  },
} satisfies LocaleNamespace
