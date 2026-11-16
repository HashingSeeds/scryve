// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "Rechercher dans l’aide",
    yourFeedback: "Vos retours",
    newCount_one: "{{count}} nouveau",
    newCount_many: "{{count}} nouveaux",
    newCount_other: "{{count}} nouveaux",
    email: "Écrire à l’assistance",
    emailDetail: "Questions sur le compte ou la facturation",
    suggestFeature: "Suggérer une fonctionnalité",
    reportBug: "Signaler un bug",
    noMatch: "Aucune réponse pour « {{query}} ».",
    ask: "Nous poser une question sur « {{query}} »",
  },
  offline: "Hors connexion. Votre brouillon reste ici jusqu’à votre retour.",
  suggest: {
    title: "Envoyer un retour",
    kind: "De quoi s’agit-il ?",
    feature: "Fonctionnalité",
    bug: "Bug",
    prompt: {
      feature: "Que souhaiteriez-vous voir ?",
      bug: "Quel est le problème ?",
    },
    bodyPlaceholder: {
      feature: "Quand l’utiliseriez-vous ?",
      bug: "Qu’attendiez-vous ?",
    },
    addScreenshot: "Ajouter une capture d’écran",
    removeScreenshot: "Retirer la capture d’écran",
    selectedScreenshot: "Capture d’écran sélectionnée",
    screenshotFailed: "Impossible d’ajouter cette capture d’écran. Essayez une autre image.",
    notice:
      "Toutes les langues sont acceptées. Une IA peut nous aider à le lire. <privacy>Confidentialité</privacy>",
    includeAccount: "Inclure mon compte",
    includeAccountHelper:
      "Les réponses se synchronisent sur vos appareils, et nous voyons votre nom d’utilisateur.",
    sendFailed: "Envoi impossible. Réessayez.",
    rateLimited_one: "Trop d’envois. Réessayez dans {{count}} minute.",
    rateLimited_many: "Trop d’envois. Réessayez dans {{count}} de minutes.",
    rateLimited_other: "Trop d’envois. Réessayez dans {{count}} minutes.",
  },
  mine: {
    title: "Vos retours",
    empty: "Rien n’a encore été envoyé depuis cet appareil.",
    unread: "Nouveau",
    deleteAll: "Supprimer mes retours",
    deleteHint:
      "Supprime ce que cet appareil a envoyé et tout ce qui a été envoyé avec votre compte. Les détails de bug déjà envoyés à Sentry y restent.",
    deleteConfirmTitle: "Supprimer vos retours ?",
    deleteConfirmBody:
      "Cela supprime ce que cet appareil a envoyé et tout ce qui a été envoyé avec votre compte, ainsi que les réponses. Les détails de bug déjà envoyés à Sentry y restent.",
    delete: "Supprimer",
    deleteFailed: "Impossible de supprimer vos retours. Réessayez une fois en ligne.",
  },
  thread: {
    missing: "Ce retour n’existe plus.",
    you: "Vous",
    team: "Scryve",
    replyPlaceholder: "Ajoutez un détail ou répondez à une question",
    send: "Envoyer",
    sending: "Envoi…",
    sent: "Envoyé",
    sendFailed: "Envoi impossible. Réessayez.",
    linked: "Envoyé avec votre compte",
    linkedElsewhere: "Envoyé avec un autre compte",
    notLinked: "Envoyé sans votre compte.",
    includeAccount: "L’inclure",
    signInToSync: "Se connecter pour le synchroniser",
  },
  notifyPrompt: {
    title: "Recevoir une notification pour les réponses ?",
    body: "Les réponses apparaissent toujours ici dans Scryve, dans les deux cas.",
    notNow: "Pas maintenant",
    notify: "Me notifier",
  },
  unavailable:
    "Les retours nécessitent le cloud de Scryve, qui n’est pas configuré dans cette version.",
} satisfies LocaleNamespace
