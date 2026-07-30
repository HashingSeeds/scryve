import en, { type Translations } from "./en"

const fr: Translations = {
  localGame: en.localGame,
  common: {
    ok: "OK",
    cancel: "Annuler",
    back: "Retour",
  },
  landingScreen: {
    eyebrow: "Compteur de points de vie",
    title: "Chaque point. Chaque joueur. Un seul plateau clair.",
    subtitle:
      "Commencez ensemble sur un appareil, puis connectez toute la table quand le jeu en ligne arrivera.",
    quickLocalGame: "Partie locale rapide",
    quickLocalGameHint: "Aucun compte ni réseau requis.",
    quickLocalGameAccessibilityHint:
      "Démarrez une partie sur cet appareil. Disponible lors de la prochaine phase du produit.",
    joinConnectedGame: "Rejoindre une partie connectée",
    joinConnectedGameAccessibilityHint:
      "Rejoignez une partie partagée entre plusieurs appareils. Bientôt disponible.",
    signIn: "Se connecter",
    signInAccessibilityHint: "Connectez-vous pour jouer en ligne. Bientôt disponible.",
    status: "La base du produit est prête. La configuration et le jeu connecté arrivent ensuite.",
    comingSoonTitle: "Bientôt disponible",
    comingSoonMessage: "Cette entrée est prête pour la prochaine phase d’implémentation de Count.",
    dismissComingSoon: "Compris",
  },
  errorScreen: {
    title: "Un problème est survenu",
    friendlySubtitle:
      "Count a rencontré une erreur inattendue. Réinitialisez l’application pour repartir d’un état propre. Si le problème persiste, redémarrez le client de développement.",
    reset: "Réinitialiser l’application",
  },
  emptyStateComponent: {
    generic: {
      heading: "Rien pour le moment",
      content: "Aucune donnée trouvée. Essayez d’actualiser ou de recharger l’application.",
      button: "Réessayer",
    },
  },
}

export default fr
