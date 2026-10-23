// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "Rechercher dans l'aide",
    yourFeedback: "Vos retours",
    newCount_one: "{{count}} nouveau",
    newCount_many: "{{count}} nouveaux",
    newCount_other: "{{count}} nouveaux",
    email: "Écrire au support",
    emailDetail: "Questions sur le compte ou la facturation",
    suggest: "Suggérer une fonctionnalité ou signaler un bug",
    noMatch: "Aucune réponse pour « {{query}} ».",
    ask: "Posez-nous une question sur « {{query}} »",
  },
  offline: "Hors ligne. Ce que vous envoyez attend et part dès votre retour.",
  suggest: {
    title: "Envoyer un retour",
    kind: "De quoi s'agit-il ?",
    feature: "Fonctionnalité",
    bug: "Bug",
    bodyLabel: "Message",
    bodyPlaceholder: {
      feature: "Que souhaiteriez-vous, et quand l'utiliseriez-vous ?",
      bug: "Que s'est-il passé ? Qu'attendiez-vous ?",
    },
    addScreenshot: "Ajouter une capture d'écran",
    removeScreenshot: "Retirer la capture d'écran",
    selectedScreenshot: "Capture d'écran sélectionnée",
    screenshotFailed: "Impossible d'ajouter cette capture d'écran. Essayez une autre image.",
    bugDisclosure:
      "Les signalements de bug envoient aussi les informations de votre appareil et toute capture d'écran à Sentry.",
    translationNotice:
      "Écrivez dans la langue de votre choix. Nous pouvons utiliser des outils d'IA pour la traduire. Consultez notre <privacy>Politique de confidentialité</privacy>.",
    includeAccount: "Inclure mon compte",
    includeAccountHelper:
      "Les réponses vous suivent sur chaque appareil où vous vous connectez, et nous voyons votre nom d'utilisateur.",
    anonymous:
      "Envoyé sans votre compte. Les réponses s'affichent sur cet appareil, et une réinstallation peut les faire perdre.",
    signInToKeep: "Connectez-vous pour la conserver",
    send: "Envoyer",
    sendOffline: "Envoyer une fois en ligne",
    sendFailed: "Envoi impossible. Réessayez.",
    rateLimited_one: "Trop d'envois. Réessayez dans {{count}} minute.",
    rateLimited_many: "Trop d'envois. Réessayez dans {{count}} de minutes.",
    rateLimited_other: "Trop d'envois. Réessayez dans {{count}} minutes.",
  },
  mine: {
    title: "Vos retours",
    empty: "Rien n'a encore été envoyé depuis cet appareil.",
    unread: "Nouveau",
    waiting: "En attente de connexion. Envoi dès votre retour.",
    sending: "Envoi en cours…",
    notSent: "Non envoyé. {{reason}}",
    otherAccount: "Vous avez changé de compte avant l'envoi",
    discard: "Supprimer",
    deleteAll: "Supprimer mes retours",
    deleteHint:
      "Supprime ce que cet appareil a envoyé. Les détails de bug déjà envoyés à Sentry y restent.",
    deleteConfirmTitle: "Supprimer vos retours ?",
    deleteConfirmBody:
      "Cela supprime ce que cet appareil a envoyé, ainsi que les réponses. Les détails de bug déjà envoyés à Sentry y restent.",
    delete: "Supprimer",
    deleteFailed: "Impossible de supprimer vos commentaires. Réessayez une fois en ligne.",
  },
  thread: {
    missing: "Ce retour n'existe plus.",
    you: "Vous",
    team: "Scryve",
    replyLabel: "Réponse",
    replyPlaceholder: "Ajoutez un détail ou répondez à une question",
    send: "Envoyer",
    sendOffline: "Envoyer une fois en ligne",
    sendFailed: "Envoi impossible. Réessayez.",
    includeAccount: "Inclure mon compte",
    includeAccountHelper:
      "Nous permet de voir votre nom d'utilisateur et garde cette conversation sur tous vos appareils.",
    linked: "Envoyé avec votre compte",
    linkedElsewhere: "Envoyé avec un autre compte",
    signInToKeep: "Connectez-vous pour conserver cette conversation si vous réinstallez",
  },
  unavailable:
    "Les retours nécessitent le cloud de Scryve, qui n'est pas configuré dans cette version.",
} satisfies LocaleNamespace
