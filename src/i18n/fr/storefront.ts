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
  listing: {
    appStoreName: "Scryve : compteur de vie JCC",
    playTitle: "Scryve : compteur de vie JCC",
    subtitle: "Decks, stats et événements",
    shortDescription:
      "Compteur de points de vie pour JCC et Commander, avec stats de deck et tournois.",
    gameName: {
      mtg: "Magic : l’Assemblée",
      ygo: "Yu-Gi-Oh!",
      pokemon: "JCC Pokémon",
      lorcana: "Disney Lorcana",
      fab: "Flesh and Blood",
      riftbound: "Riftbound",
    },
    description: {
      players:
        "Un compteur de points de vie pour jusqu’à {{maxPlayers}} joueurs, avec blessures de commandant pour Commander (EDH) et marqueurs de dégâts pour Pokémon.",
      play: "Partagez un seul téléphone, connectez des téléphones sur le même Wi-Fi pour partager les points de vie, ou connectez-vous pour jouer de n’importe où.",
      games: "Compatible avec {{games}}.",
      decks: "Enregistrez vos decks et suivez vos taux de victoire et vos résultats de match.",
      events:
        "Organisez des événements en rondes suisses ou en tables depuis votre téléphone, même avec le Wi-Fi du magasin sans internet. Les joueurs déclarent leurs résultats depuis leur téléphone, et une télé du magasin peut afficher les appariements, le chrono et le classement.",
      noAccount:
        "Aucun compte requis pour les parties sur un seul téléphone ou en Wi-Fi, et les parties sur un seul téléphone fonctionnent hors ligne.",
      proHeading: "Scryve Pro",
      pro: "Synchronisez jusqu’à {{proDecks}} decks au lieu de {{freeDecks}}, et conservez jusqu’à {{proVersions}} versions de chaque deck. Comparez les taux de victoire par version pour voir l’effet de vos changements, et comparez des listes côte à côte. Pro place aussi un badge Pro sur votre place dans les parties partagées et débloque des icônes d’app Pro.",
      appleBilling_one:
        "Scryve Pro est un abonnement à renouvellement automatique. Le paiement est débité sur votre compte Apple à la confirmation de l’achat. L’abonnement se renouvelle automatiquement, sauf résiliation au moins {{count}} heure avant la fin de la période en cours. Gérez-le ou résiliez-le dans les réglages de votre compte Apple.",
      appleBilling_many:
        "Scryve Pro est un abonnement à renouvellement automatique. Le paiement est débité sur votre compte Apple à la confirmation de l’achat. L’abonnement se renouvelle automatiquement, sauf résiliation au moins {{count}} d’heures avant la fin de la période en cours. Gérez-le ou résiliez-le dans les réglages de votre compte Apple.",
      appleBilling_other:
        "Scryve Pro est un abonnement à renouvellement automatique. Le paiement est débité sur votre compte Apple à la confirmation de l’achat. L’abonnement se renouvelle automatiquement, sauf résiliation au moins {{count}} heures avant la fin de la période en cours. Gérez-le ou résiliez-le dans les réglages de votre compte Apple.",
      googleBilling:
        "Scryve Pro est un abonnement à renouvellement automatique débité sur votre compte Google Play. Il se renouvelle automatiquement jusqu’à résiliation. Gérez-le ou résiliez-le à tout moment dans vos abonnements Google Play.",
      eula: "Conditions d’utilisation (CLUF) : {{url}}",
      terms: "Conditions de service : {{url}}",
      privacy: "Politique de confidentialité : {{url}}",
    },
    whatsNew:
      "Decks\n• Partagez n’importe quel deck avec un lien. Vos amis peuvent y jouer tout de suite en partie locale, cloud ou à proximité, ou enregistrer leur propre copie.\n• Nouvelles vues Jouer et Construire : choisissez la version que vous apportez, consultez les résultats récents et modifiez les cartes, la réserve et les commandants partenaires.\n• Ajustez la réserve entre les parties d’un match.\n• Statistiques pour chaque deck, avec comparaison de listes dans Pro.\n• Filtrez les decks par couleur et retrouvez-les par commandant.\n• Gardez un nombre illimité de decks sur cet appareil et choisissez ceux qui se synchronisent. Enregistrez vos matchs hors ligne.\n• Recherchez n’importe quelle carte sans ouvrir de deck. La recherche tolère les fautes de frappe.\n\nParties\n• Touchez un joueur pour attribuer des blessures de commandant. Les commandants partenaires attaquent ensemble.\n• Choisissez qui commence. Les statistiques du deck montrent vos résultats en jouant en premier et en second.\n• Les parties à proximité sont ouvertes à tous. Rejoignez-les avec un code ou un QR code.\n\nÉvénements\n• Organisez des événements en rondes suisses ou en tables depuis votre téléphone, même avec le Wi-Fi du magasin sans internet. Les joueurs déclarent leurs résultats depuis leur téléphone, et une télé du magasin peut afficher les appariements, le chrono et le classement.\n\nRetours\n• Envoyez un retour dans l’app et consultez les réponses, avec des notifications en option.\n\nEt aussi : un jeu à proximité plus rapide et de nombreuses corrections.",
  },
} satisfies LocaleNamespace
