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
    players: "joueurs",
    openScryveTo: "À l'ouverture de Scryve, afficher",
    launchDestination: {
      play: "Jouer",
      decks: "Decks",
    },
    launchDestinationHint: "Jouer reprend une partie en cours ou ouvre un nouveau plateau.",
    game: "Jeu",
    chooseGame: "Lancer les nouvelles parties en",
    closeGameChoices: "Fermer le choix du jeu",
    defaultsHint:
      "Ne les définissez que si vous voulez que les nouvelles parties démarrent avec le même système et le même format.",
    haptics: {
      label: "Retour haptique",
      helper:
        "Un léger retour tactile après les changements de points de vie. Les échecs ne bloquent jamais la partie.",
    },
    theme: {
      heading: "Thème",
      system: "Système",
      light: "Clair",
      dark: "Sombre",
      hint: "Système suit l'apparence de votre appareil. Clair et sombre restent fixes jusqu'à modification ici.",
    },
    appIcon: {
      heading: "Icône de l’app",
      changeFailed: "Impossible de changer l’icône de l’app. Veuillez réessayer.",
      lockedPro: "{{name}}, Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Ouvre Scryve Pro",
      opensSignIn: "Ouvre la connexion",
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
    menuButton: {
      heading: "Bouton du menu de jeu",
      hint: "Change la forme au centre du plateau. Prism teinte le bouton avec les couleurs de tous les joueurs à la table.",
    },
    privacy: {
      heading: "Confidentialité",
      shareUsageHelper:
        "Désactivé par défaut. Partage l'usage avec un identifiant aléatoire non lié à votre compte. Détails dans la Politique de confidentialité.",
      saveFailed: "Impossible d'enregistrer votre choix. Veuillez réessayer.",
      unavailable:
        "Le partage d'utilisation n'est pas disponible dans cette version. Aucun événement PostHog ne sera envoyé.",
    },
    accountData: {
      description:
        "Gérez les données cloud liées à votre compte Scryve. Les parties locales restent sur cet appareil.",
      requestDeletion: "Demander la suppression du compte",
      requestDeletionHint: "Ouvre la page de demande de suppression du compte",
    },
    help: {
      heading: "Aide",
      support: "Aide et assistance",
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
  },
  support: {
    pageTitle: "Aide Scryve",
    pageDescription:
      "Découvrez comment démarrer avec Scryve, trouvez des réponses aux questions courantes ou contactez l'assistance.",
    title: "Aide",
    subtitle:
      "Réponses sur les parties, les comptes et Scryve Pro. Envoyez-nous un message si vous avez besoin d'aide.",
    contactUs: "Nous contacter",
    contactReason: "Motif du contact",
    kind: {
      bug: "Signaler un problème",
      help: "Demander de l'aide",
    },
    messageLabel: {
      bug: "Que s'est-il passé ?",
      help: "Comment pouvons-nous vous aider ?",
    },
    messagePlaceholder: {
      bug: "Que s'est-il passé ? À quoi vous attendiez-vous ?",
      help: "Dites-nous de quoi vous avez besoin",
    },
    emailLabel: {
      bug: "E-mail pour la réponse (facultatif)",
      help: "E-mail pour la réponse",
    },
    emailInvalid: "Saisissez une adresse e-mail valide.",
    replyTime: "Nous répondons généralement sous deux jours ouvrés.",
    selectedScreenshot: "Capture d'écran sélectionnée",
    removeScreenshot: "Supprimer la capture d'écran",
    addScreenshot: "Ajouter une capture d'écran",
    disclosure:
      "Envoie à Sentry votre message, votre e-mail si fourni, la version de l'app, le build, la plateforme et toute capture d'écran ajoutée.",
    send: "Envoyer",
    preferEmail: "Vous préférez l'e-mail ?",
    emailSupport: "Assistance par e-mail",
    status: {
      queued: "Commentaire en attente. Si vous êtes hors ligne, il sera envoyé à la reconnexion.",
      saveFailed: "Impossible d'enregistrer votre message. Réessayez ou écrivez-nous par e-mail.",
      screenshotFailed: "Impossible d'ajouter cette capture d'écran. Essayez une autre image.",
    },
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
          "Vous pouvez gérer votre compte depuis l'écran de compte de Scryve. Contactez-nous si vous avez besoin d'aide pour accéder à votre compte ou le supprimer.",
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
      signOut: {
        title: "Tous les appareils sont déconnectés",
        body: "Cet appareil et tous les autres appareils connectés sont déconnectés automatiquement.",
      },
    },
    subscription: {
      heading: "Vous avez un abonnement Scryve Pro ?",
      body: "Supprimer votre compte ne l'annulera pas. Vous pourriez continuer à être facturé tant que vous n'annulez pas via Apple ou Google Play. Vous pouvez quand même supprimer maintenant, mais vous perdrez l'accès au temps payé restant.",
      manageApple: "Gérer les abonnements Apple",
      manageGoogle: "Gérer les abonnements Google Play",
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
  },
  billing: {
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
  legalConsent: {
    heading: {
      updatedPrivacy: "Nous avons mis à jour notre politique de confidentialité",
      updatedTerms: "Nous avons mis à jour nos conditions",
      beforeStart: "Avant de commencer",
    },
    intro:
      "Veuillez lire nos Conditions d'utilisation et notre Politique de confidentialité. Vous devez les accepter pour utiliser Scryve.",
    returning: {
      dated: {
        terms:
          "Nos Conditions d'utilisation ont changé le {{date}}. Veuillez consulter la mise à jour pour continuer à utiliser Scryve.",
        privacy:
          "Notre Politique de confidentialité a changé le {{date}}. Veuillez consulter la mise à jour pour continuer à utiliser Scryve.",
        both: "Nos Conditions d'utilisation et notre Politique de confidentialité ont changé le {{date}}. Veuillez consulter la mise à jour pour continuer à utiliser Scryve.",
      },
      undated: {
        terms:
          "Nos Conditions d'utilisation ont changé. Veuillez consulter les mises à jour pour continuer à utiliser Scryve.",
        privacy:
          "Notre Politique de confidentialité a changé. Veuillez consulter les mises à jour pour continuer à utiliser Scryve.",
        both: "Nos Conditions d'utilisation et notre Politique de confidentialité ont changé. Veuillez consulter les mises à jour pour continuer à utiliser Scryve.",
      },
    },
    acceptance: {
      dated: {
        terms:
          "En touchant « J'accepte », vous acceptez les Conditions d'utilisation datées du {{date}}.",
        privacy:
          "En touchant « J'accepte », vous acceptez la Politique de confidentialité datée du {{date}}.",
        both: "En touchant « J'accepte », vous acceptez les Conditions d'utilisation et la Politique de confidentialité datées du {{date}}.",
      },
      undated: {
        terms: "En touchant « J'accepte », vous acceptez les Conditions d'utilisation en vigueur.",
        privacy:
          "En touchant « J'accepte », vous acceptez la Politique de confidentialité en vigueur.",
        both: "En touchant « J'accepte », vous acceptez les Conditions d'utilisation et la Politique de confidentialité en vigueur.",
      },
    },
    readTerms: "Lire les Conditions d'utilisation",
    readPrivacy: "Lire la Politique de confidentialité",
    shareUsageHelper:
      "Désactivé par défaut. Le partage nous aide à créer ce que vous voulez. Détails dans la Politique de confidentialité.",
    sharingSaveFailed:
      "Impossible d'enregistrer votre choix de partage. Réessayez ou désactivez le partage pour continuer.",
    saving: "Enregistrement…",
    agree: "J'accepte",
  },
  legalDocument: {
    lastUpdated: "Dernière mise à jour : {{date}}",
  },
  consentSync: {
    syncing: "Synchronisation de votre accord…",
    stillPending:
      "La synchronisation du compte est toujours en attente. Votre accord est enregistré sur cet appareil.",
    pending: "Accord enregistré sur cet appareil. Synchronisation du compte en attente.",
    retrying: "Nouvelle tentative…",
    retryAccessibilityLabel: "Réessayer la synchronisation du consentement du compte",
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
