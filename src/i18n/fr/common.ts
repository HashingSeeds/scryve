// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  back: "Retour",
  cancel: "Annuler",
  close: "Fermer",
  delete: "Supprimer",
  done: "Terminé",
  edit: "Modifier",
  remove: "Retirer",
  retry: "Réessayer",
  save: "Enregistrer",
  tryAgain: "Réessayer",
  undo: "Annuler",
  emptyState: {
    heading: "Rien ici pour l'instant",
    content: "Aucune donnée trouvée. Essayez d'actualiser ou de relancer l'app.",
  },
} satisfies LocaleNamespace
