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
    suggestFeature: "Suggérer une fonctionnalité",
    reportBug: "Signaler un bug",
    noMatch: "Aucune réponse pour « {{query}} ».",
    ask: "Posez-nous une question sur « {{query}} »",
  },
  offline: "Hors ligne. Votre brouillon reste ici jusqu'à votre retour.",
  suggest: {
    title: "Envoyer un retour",
    kind: "De quoi s'agit-il ?",
    feature: "Fonctionnalité",
    bug: "Bug",
    prompt: {
      feature: "Que souhaiteriez-vous voir ?",
      bug: "Qu'est-ce qui ne s'est pas passé comme prévu ?",
    },
    bodyPlaceholder: {
      feature: "Quand l'utiliseriez-vous ?",
      bug: "Que s'est-il passé, et qu'attendiez-vous ?",
    },
    addScreenshot: "Ajouter une capture d'écran",
    removeScreenshot: "Retirer la capture d'écran",
    selectedScreenshot: "Capture d'écran sélectionnée",
    screenshotFailed: "Impossible d'ajouter cette capture d'écran. Essayez une autre image.",
    notice: {
      feature:
        "Toutes les langues sont acceptées. Une IA peut nous aider à vous lire. <privacy>Confidentialité</privacy>",
      bug: "Toutes les langues sont acceptées. Une IA peut nous aider à vous lire. Les rapports de bug incluent des infos sur l'appareil. <privacy>Confidentialité</privacy>",
    },
    includeAccount: "Inclure mon compte",
    includeAccountHelper:
      "Les réponses se synchronisent sur vos appareils, et nous voyons votre nom d'utilisateur.",
    sendFailed: "Envoi impossible. Réessayez.",
    rateLimited_one: "Trop d'envois. Réessayez dans {{count}} minute.",
    rateLimited_many: "Trop d'envois. Réessayez dans {{count}} de minutes.",
    rateLimited_other: "Trop d'envois. Réessayez dans {{count}} minutes.",
  },
  mine: {
    title: "Vos retours",
    empty: "Rien n'a encore été envoyé depuis cet appareil.",
    unread: "Nouveau",
    deleteAll: "Supprimer mes retours",
    deleteHint:
      "Supprime ce que cet appareil a envoyé et tout ce que vous avez envoyé avec votre compte. Les détails de bug déjà envoyés à Sentry y restent.",
    deleteConfirmTitle: "Supprimer vos retours ?",
    deleteConfirmBody:
      "Cela supprime ce que cet appareil a envoyé et tout ce que vous avez envoyé avec votre compte, ainsi que les réponses. Les détails de bug déjà envoyés à Sentry y restent.",
    delete: "Supprimer",
    deleteFailed: "Impossible de supprimer vos commentaires. Réessayez une fois en ligne.",
  },
  thread: {
    missing: "Ce retour n'existe plus.",
    you: "Vous",
    team: "Scryve",
    replyPlaceholder: "Ajoutez un détail ou répondez à une question",
    send: "Envoyer",
    sending: "Envoi en cours…",
    sent: "Envoyé",
    sendFailed: "Envoi impossible. Réessayez.",
    linked: "Envoyé avec votre compte",
    linkedElsewhere: "Envoyé avec un autre compte",
    notLinked: "Envoyé sans votre compte.",
    includeAccount: "L'inclure",
    signInToSync: "Connectez-vous pour le synchroniser",
  },
  notifyPrompt: {
    title: "Recevoir une notification pour les réponses ?",
    body: "Dans tous les cas, les réponses apparaissent toujours ici dans Scryve.",
    notNow: "Pas maintenant",
    notify: "Me notifier",
  },
  unavailable:
    "Les retours nécessitent le cloud de Scryve, qui n'est pas configuré dans cette version.",
} satisfies LocaleNamespace
