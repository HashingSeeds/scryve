// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  openPlay: "Aller à Jouer",
  signIn: "Se connecter",
  localGamesStay: "Les parties locales restent sur cet appareil.",
  legal: {
    heading: "Mentions légales",
    privacyPolicy: "Politique de confidentialité",
    termsOfUse: "Conditions d'utilisation",
    licenseAgreement: "Contrat de licence",
    licenseAgreementHint: "Ouvre le contrat de licence standard d'Apple dans votre navigateur",
    cookiePolicy: "Politique relative aux cookies",
    gameContent: "Contenu de jeu tiers",
    licenseOpenFailed: "Impossible d'ouvrir le contrat de licence",
  },
  accountData: {
    label: "Compte et données",
    accessibilityLabel: "Compte et données",
    accessibilityHint: "Ouvre la suppression du compte et les détails des données",
  },
  shareUsage: "Partager l'utilisation avec Scryve",
  settings: {
    title: "Réglages",
    localDefaults: "Paramètres par défaut des parties locales",
    general: "Général",
    appearance: "Apparence",
    about: "À propos",
    version: "Version",
    players: "joueurs",
    openScryveTo: "À l'ouverture de Scryve, afficher",
    launchDestination: {
      play: "Jouer",
      decks: "Decks",
    },
    game: "Jeu",
    chooseGame: "Lancer les nouvelles parties en",
    closeGameChoices: "Fermer le choix du jeu",
    haptics: {
      label: "Retour haptique",
    },
    theme: {
      heading: "Thème",
      system: "Système",
      light: "Clair",
      dark: "Sombre",
    },
    appIcon: {
      heading: "Icône de l’app",
      changeFailed: "Impossible de changer l’icône de l’app. Veuillez réessayer.",
      lockedPro: "{{name}}, Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Ouvre Scryve Pro",
      opensSignIn: "Ouvre la connexion",
      proFailed: "Impossible de vérifier Scryve Pro, les icônes Pro sont donc verrouillées.",
      names: {
        Default: "Par défaut",
        Two: "Deux",
        Three: "Trois",
        Midnight: "Minuit",
        Graphite: "Graphite",
        Ink: "Encre",
        Outline: "Contour",
        Bone: "Os",
        Paper: "Papier",
        Ash: "Cendre",
        Pencil: "Crayon",
        Foil: "Foil",
        Contour: "Double contour",
        Stripes: "Rayures",
        Neon: "Néon",
        Blueprint: "Plan",
        Gilded: "Doré",
        Prism: "Prisme",
        Holo: "Holo",
      },
    },
    notifications: {
      heading: "Notifications",
      feedbackReplies: "Réponses aux commentaires",
      feedbackRepliesHelper: "Les réponses s'affichent toujours dans Vos commentaires",
      renewalReminders: "Rappels de renouvellement",
      renewalRemindersHelper: "3 jours avant le renouvellement de votre abonnement",
      channel: "Réponses et rappels",
      feedbackReplyPreview: "Nouvelle réponse à votre commentaire",
      blockedTitle: "Les notifications sont désactivées",
      blockedBody: "Activez les notifications pour Scryve dans les réglages.",
      openSettings: "Ouvrir les réglages",
    },
    privacy: {
      heading: "Confidentialité",
      shareUsageHelper:
        "Désactivé par défaut. Partage l'usage avec un identifiant aléatoire non lié à votre compte. Détails dans la Politique de confidentialité.",
      saveFailed: "Impossible d'enregistrer votre choix. Veuillez réessayer.",
      unavailable:
        "Le partage d'utilisation n'est pas disponible dans cette version. Aucun événement PostHog ne sera envoyé.",
    },
    appInfo: {
      heading: "Informations sur l'app",
      analyticsId: "ID d'analyse : {{id}}",
      analyticsIdHint:
        "Cet ID nous aide à retrouver vos données d'utilisation. Pour demander leur suppression, envoyez l'ID par e-mail à privacy@sowinghope.how.",
      version: "Version : {{value}}",
      build: "Build : {{value}}",
      runtime: "Runtime : {{value}}",
      update: "Mise à jour : {{value}}",
      channel: "Canal : {{value}}",
      platform: "Plateforme : {{value}}",
      notApplicable: "Sans objet",
      unavailable: "Indisponible",
      bundled: "Intégré",
      development: "Développement",
    },
    beta: {
      label: "Mises à jour bêta",
      helper:
        "Reçoit les mises à jour non publiées avant tout le monde. Elles peuvent être instables.",
    },
    backToPreview: "Retour à l'aperçu",
    backToPreviewFailed: "Impossible de revenir à l'aperçu. Réessayez.",
    copyDebugInfo: "Copier les infos de débogage",
    copied: "Copié",
    copyFailed: "Copie impossible. Réessayez.",
    syncStats: {
      label: "Stats pour les geeks",
      helper:
        "Affiche le temps que mettent les changements à atteindre chaque appareil dans les parties en ligne et à proximité.",
    },
  },
  support: {
    pageTitle: "Assistance Scryve",
    pageDescription:
      "Prenez Scryve en main, trouvez des réponses aux questions courantes, suggérez des fonctionnalités ou contactez l'assistance.",
    title: "Assistance",
    gettingStarted: {
      heading: "Pour commencer",
      startGame: {
        title: "Lancer une partie",
        body: "Ouvrez Jouer. Votre nouveau plateau utilise les paramètres par défaut enregistrés dans Réglages.",
      },
      choosePlay: {
        title: "Choisir comment jouer",
        body: "Jouez ensemble sur un seul appareil, ou choisissez Connecté pour jouer sur des appareils séparés.",
      },
      setUpTable: {
        title: "Préparer la table",
        body: "Sélectionnez le nombre de joueurs et les points de vie de départ, puis lancez la partie.",
      },
    },
    faq: {
      heading: "Questions fréquentes",
      restorePro: {
        question: "Restaurer Scryve Pro",
        answer:
          "Ouvrez Scryve, allez dans votre compte, choisissez Scryve Pro, puis touchez Restaurer les achats. Utilisez le même compte Apple ou Google que pour l'achat initial.",
      },
      manageSubscription: {
        question: "Gérer ou résilier un abonnement",
        answer:
          "Les abonnements sont gérés par la boutique où vous les avez achetés. Sur iPhone ou iPad, ouvrez Réglages, touchez votre nom, puis Abonnements. Sur Android, ouvrez Google Play, touchez votre profil, puis Paiements et abonnements.",
      },
      gameTrouble: {
        question: "Un problème avec une partie ?",
        answer:
          "Redémarrez Scryve et réessayez. Si le problème persiste, signalez-le ici avec une courte description de ce qui s’est passé.",
      },
      accountPrivacy: {
        question: "Questions sur le compte ou la confidentialité",
        answer:
          "Vous pouvez gérer votre compte depuis l’écran de compte de Scryve. Écrivez au support si vous avez besoin d’aide pour accéder à votre compte ou le supprimer.",
      },
    },
    appVersion: "Scryve {{version}}",
  },
  profile: {
    title: "Compte",
    signedIn: "Connecté",
    yourAccount: "Votre compte",
    profileAndSecurity: "Profil et sécurité",
    profileHint:
      "Ouvre le gestionnaire de profil pour modifier votre nom, vos adresses e-mail et votre mot de passe",
    profileDetails: "Nom, e-mail, mot de passe et méthodes de connexion.",
    independence:
      "Scryve est indépendant et n’est ni affilié ni approuvé par les éditeurs de jeux, les détenteurs de droits ou les fournisseurs de données cités dans notre avis sur le contenu des jeux.",
    signingOut: "Déconnexion…",
    signOut: "Se déconnecter",
    signOutFailed: "Déconnexion impossible. Réessayez.",
    signOutFailedShort: "Déconnexion impossible",
    signInPrompt: "Connectez-vous avant d'ouvrir votre profil.",
    reauthenticate: "Se réauthentifier",
  },
  deleteAccount: {
    title: "Supprimer le compte",
    eyebrow: "COMPTE ET DONNÉES",
    heading: {
      needsAttention: "Votre suppression requiert votre attention",
      inProgress: "Votre suppression est en cours",
      before: "Avant de supprimer votre compte",
      completed: "Votre compte a été supprimé",
    },
    checkingStatus: "Vérification de l’état de la suppression…",
    intro:
      "Cela supprime définitivement votre compte Scryve et anonymise votre historique de parties connectées. Vérifiez d'abord ce qui se passe.",
    steps: {
      cloud: {
        title: "Votre compte cloud est supprimé",
        body: "Votre profil, votre avatar, votre connexion, vos invitations et les données connectées liées au compte sont supprimés.",
      },
      history: {
        title: "L'historique des matchs partagés est anonymisé",
        body: "Les autres joueurs conservent le résultat du match, mais vos places deviennent des entrées « Joueur supprimé » non liées, avec un avatar neutre.",
      },
      local: {
        title: "Les parties locales restent sur cet appareil",
        body: "L'historique des parties hors ligne est stocké uniquement sur cet appareil. Il n'est pas lié à votre compte et n'est pas effacé à distance.",
      },
      feedback: {
        title: "Les retours envoyés sans votre compte sont conservés",
        body: "Les retours d'expérience envoyés avec votre compte sont supprimés. Ceux envoyés sans compte restent sur l'appareil qui les a envoyés. Pour les supprimer, ouvrez Assistance, puis Vos retours, et touchez Supprimer mes retours.",
      },
      signOut: {
        title: "Tous les appareils sont déconnectés",
        body: "Cet appareil et tous les autres appareils connectés sont déconnectés automatiquement.",
      },
    },
    subscription: {
      heading: "Vous avez un abonnement Scryve Pro ?",
      body: "Supprimer votre compte ne l'annulera pas. Vous pourriez continuer à être facturé tant que vous n'annulez pas l'abonnement là où vous vous êtes abonné. Vous pouvez quand même supprimer maintenant, mais vous perdrez l'accès au temps payé restant.",
      manageApple: "Gérer les abonnements Apple",
      manageGoogle: "Gérer les abonnements Google Play",
      web: "Abonné sur le web ? Annulez dans le portail client. Chaque e-mail de facturation Scryve Pro contient un lien vers ce portail.",
      manageWeb: "Gérer l'abonnement web",
    },
    signedInAs: "Connecté en tant que {{email}}",
    confirmLabel: "Saisissez {{word}} pour continuer",
    submit: {
      submitting: "Envoi de la demande…",
      retry: "Réessayer la suppression du compte",
      delete: "Supprimer définitivement le compte",
    },
    footnote: {
      retry:
        "Une nouvelle tentative reprend à la dernière étape incomplète ; les données anonymisées ne sont pas restaurées.",
      first:
        "La suppression commence immédiatement et ne peut pas être annulée une fois le traitement lancé.",
    },
    status: {
      failed:
        "Scryve n’a pas pu terminer automatiquement. Revenez sur cette page et renvoyez la demande pour réessayer.",
      identityPending:
        "Vos données connectées sont anonymisées. Scryve supprime maintenant votre identité de connexion.",
      processing:
        "Scryve anonymise l'historique connecté et supprime les données liées au compte. Vous pouvez fermer cette page sans risque.",
    },
    panel: {
      failed: {
        title: "La suppression requiert votre attention",
        body: "Aucune donnée du compte ne sera restaurée. Saisissez {{word}} et validez à nouveau pour réessayer le reste du traitement.",
      },
      completed: {
        title: "Suppression terminée",
        body: "Ce reçu ne contient aucun détail du compte.",
      },
      received: {
        title: "Demande de suppression reçue",
        body: "Toute nouvelle activité connectée est bloquée pendant le traitement de la demande.",
      },
    },
    receipt: {
      completedBody:
        "Scryve a supprimé votre compte de connexion et anonymisé votre historique de parties connectées.",
      failedBody: "Scryve n’a pas pu terminer automatiquement le reste de la suppression.",
      lastUpdated: "Dernière mise à jour le {{day}} à {{time}}",
      next: {
        completed: "Aucune autre action n’est nécessaire.",
        failed: "Connectez-vous à nouveau, revenez sur cette page et relancez la demande.",
        pending: "Vous pouvez fermer Scryve. Cette page continuera à vérifier à votre retour.",
      },
      signInToRetry: "Se connecter pour réessayer",
      returnHome: "Retour à l’accueil",
    },
    route: {
      statusCheckFailed:
        "Scryve n'a pas pu vérifier l'état de votre suppression. La suppression du compte reste indisponible tant que la vérification n'a pas réussi.",
      signInPrompt: "Connectez-vous pour demander la suppression de votre compte Scryve.",
      checkingReceipt: "Vérification de votre reçu de suppression…",
      checkingAccount: "Vérification de votre compte…",
      reconnect: "Reconnectez-vous à Scryve avant de supprimer votre compte.",
      submitFailed: "Impossible d’envoyer la demande de suppression",
    },
  },
  cloud: {
    signInToContinue: "Connectez-vous pour continuer.",
    chooseUsername: "Choisissez votre nom d'utilisateur de joueur.",
    reconnect: "Reconnectez-vous pour continuer.",
    chooseUsernameAction: "Choisir un nom d'utilisateur",
    unavailableHeading: "Fonctions connectées indisponibles",
    localPlayAvailable: "Le jeu local reste disponible.",
    notConfigured:
      "Les fonctions connectées sont indisponibles dans cette version. Le jeu local reste disponible.",
    closeSignIn: "Fermer la connexion",
    signInAgreement:
      "En continuant, vous acceptez les <terms>Conditions d'utilisation</terms> et la <privacy>Politique de confidentialité</privacy>.",
  },
  billing: {
    renewalPrompt: {
      title: "Vous prévenir avant le renouvellement ?",
      body: "Recevez une notification 3 jours avant votre prochain paiement annuel.",
      notNow: "Plus tard",
      remind: "Me prévenir",
    },
    access: {
      checking: "Vérification de l’accès…",
      renews: "Renouvellement le {{date}}",
      availableUntil: "Disponible jusqu’au {{date}}",
      active: "Accès {{plan}} actif",
      unavailable: "Statut indisponible",
      free: "Formule gratuite",
    },
    loading: "Chargement de Scryve Pro",
    manage: "Gérer",
    manageAccessibilityLabel: "Gérer l’abonnement Scryve {{plan}}",
    viewOptions: "Voir les options",
    viewOptionsAccessibilityLabel: "Voir les options Scryve Pro",
    paywallFailedTitle: "Scryve Pro ne s'est pas ouvert",
    notConfigured: "Les achats Scryve Pro ne sont pas configurés.",
    missingApiKey:
      "Les achats Scryve Pro sont indisponibles, car la clé API publique RevenueCat n’est pas configurée.",
    errors: {
      revenueCatNotConfigured: "RevenueCat n’est pas configuré.",
      unexpected: "Une erreur d’achat inattendue s’est produite.",
      offline: "Connectez-vous à Internet et réessayez.",
      notAllowed: "Les achats ne sont pas autorisés sur cet appareil ou ce compte de boutique.",
      productUnavailable: "Cette option Scryve Pro n’est pas disponible dans la boutique actuelle.",
      pending: "La boutique traite encore cet achat. L’accès sera mis à jour une fois terminé.",
      misconfigured: "Scryve Pro n’est pas correctement configuré pour cette version.",
      failed: "L'achat n'a pas pu être finalisé.",
      waitForBilling: "Attendez que la facturation se connecte à votre compte, puis réessayez.",
      foilWebOnly: "Les achats Foil sont uniquement disponibles sur le web.",
      manageBeforeFoil: "Gérez votre abonnement actuel avant de passer à Foil.",
      productNotInStore: "{{productId}} n'est pas disponible dans la boutique actuelle.",
      paywallFailed: "Le paywall Scryve Pro n'a pas pu traiter la demande.",
      noManagementPage:
        "Aucune page de gestion d'abonnement n'est encore disponible pour ce client.",
    },
  },
  foil: {
    pageTitle: "Scryve Foil Supporter",
    title: "Foil Supporter",
    price: "500 US$/an",
    description:
      "Les mêmes fonctionnalités Pro. Soutien facultatif à Scryve. Renouvelé chaque année jusqu'à annulation.",
    signInPrompt: "Connectez-vous pour lier Foil à votre compte Scryve.",
    alreadyPro:
      "Vous avez déjà accès à Pro. Gérez votre abonnement actuel avant de changer d'offre.",
    manageSubscription: "Gérer l'abonnement",
    openingCheckout: "Ouverture du paiement…",
    choose: "Choisir Foil Supporter",
    purchasesUnavailable: "Les achats ne sont pas disponibles dans cette version.",
  },
  legalDocument: {
    lastUpdated: "Dernière mise à jour : {{date}}",
  },
  updates: {
    downloading: "Téléchargement de la mise à jour…",
    downloadingProgress: "Téléchargement de la mise à jour {{percent}} %",
    ready: "Mise à jour prête",
    cancelReady: "Fermer",
    restart: "Redémarrer",
    whatsNew: "Contenu de cette mise à jour",
    dialogMessage:
      "S'applique à la prochaine ouverture de Scryve. Votre partie est enregistrée dans tous les cas.",
    restartNow: "Redémarrer maintenant",
    later: "Plus tard",
    channelAfterRestart: "{{running}} ({{next}} après redémarrage)",
    restarting: "Redémarrage de Scryve",
  },
  preview: {
    heading: "Aperçu de PR",
    loading: "Chargement de {{channel}}…",
    busy: "Un autre aperçu est encore en cours de chargement. Rouvrez ce lien.",
    missing:
      "{{channel}} n'a aucune mise à jour que cette version peut exécuter. Une nouvelle version d'aperçu est peut-être nécessaire.",
  },
  launch: {
    starting: "Démarrage de Scryve…",
    startingAccessibilityLabel: "Démarrage de Scryve",
  },
  rootError: {
    title: "Une erreur s'est produite",
    message:
      "Scryve a rencontré une erreur inattendue. Réessayez, ou redémarrez l'app si le problème persiste.",
  },
} satisfies LocaleNamespace
