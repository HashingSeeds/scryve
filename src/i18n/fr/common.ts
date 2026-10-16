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
  appMenu: {
    more: "Plus",
    moreUpdateReady: "Plus, mise à jour prête",
    settings: "Réglages",
    settingsUpdateReady: "Réglages, mise à jour prête",
    account: "Compte",
    signIn: "Se connecter",
    closeMenu: "Fermer le menu",
  },
  appNavigation: {
    decks: "Decks",
    returnToGame: "Retour à la partie",
    play: "Jouer",
    backToLobby: "Retour au lobby",
  },
  confirmDialog: {
    cancelAction: "Annuler : {{action}}",
  },
  retryableError: {
    retryingIn: "Nouvel essai dans {{seconds}} s",
  },
  selectField: {
    none: "Aucun",
    triggerLabel: "{{label}}, {{value}}",
    openHint: "Ouvre les choix pour {{label}}",
    closeLabel: "Fermer les choix pour {{label}}",
  },
  valueField: {
    readoutLabel: "{{label}}, {{value}}",
    decrease: "Diminuer {{label}} de {{step}}",
    increase: "Augmenter {{label}} de {{step}}",
    longPressHint: "Appui long pour le modifier de {{step}}.",
  },
} satisfies LocaleNamespace
