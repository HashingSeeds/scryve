// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  support: {
    search: "Buscar en la ayuda",
    yourFeedback: "Tus comentarios",
    newCount_one: "{{count}} nuevo",
    newCount_many: "{{count}} nuevos",
    newCount_other: "{{count}} nuevos",
    email: "Escribir al soporte",
    emailDetail: "Preguntas sobre la cuenta o la facturación",
    suggestFeature: "Sugerir una función",
    reportBug: "Informar de un error",
    noMatch: "No hay respuestas para «{{query}}».",
    ask: "Pregúntanos sobre «{{query}}»",
  },
  offline: "Sin conexión. Tu borrador se queda aquí hasta que vuelvas.",
  suggest: {
    title: "Enviar comentarios",
    kind: "¿Qué es?",
    feature: "Función",
    bug: "Error",
    prompt: {
      feature: "¿Qué te gustaría ver?",
      bug: "¿Qué salió mal?",
    },
    bodyPlaceholder: {
      feature: "¿Cuándo la usarías?",
      bug: "¿Qué esperabas?",
    },
    addScreenshot: "Añadir captura",
    removeScreenshot: "Quitar captura",
    selectedScreenshot: "Captura seleccionada",
    screenshotFailed: "No se pudo añadir esa captura. Prueba con otra imagen.",
    notice:
      "Puedes escribir en cualquier idioma. Es posible que la IA nos ayude a leerlo. <privacy>Privacidad</privacy>",
    includeAccount: "Incluir mi cuenta",
    includeAccountHelper:
      "Las respuestas se sincronizan con tus dispositivos y veremos tu nombre de usuario.",
    sendFailed: "No se pudo enviar. Inténtalo de nuevo.",
    rateLimited_one: "Demasiados envíos. Inténtalo de nuevo en {{count}} minuto.",
    rateLimited_many: "Demasiados envíos. Inténtalo de nuevo en {{count}} minutos.",
    rateLimited_other: "Demasiados envíos. Inténtalo de nuevo en {{count}} minutos.",
  },
  mine: {
    title: "Tus comentarios",
    empty: "Aún no se ha enviado nada desde este dispositivo.",
    unread: "Nuevo",
    deleteAll: "Eliminar mis comentarios",
    deleteHint:
      "Elimina lo que envió este dispositivo y todo lo enviado con tu cuenta. Los detalles de errores ya enviados a Sentry se conservan allí.",
    deleteConfirmTitle: "¿Eliminar tus comentarios?",
    deleteConfirmBody:
      "Se eliminará lo que envió este dispositivo y todo lo enviado con tu cuenta, junto con las respuestas. Los detalles de errores ya enviados a Sentry se conservan allí.",
    delete: "Eliminar",
    deleteFailed:
      "No se pudieron eliminar tus comentarios. Inténtalo de nuevo cuando tengas conexión.",
  },
  thread: {
    missing: "Estos comentarios ya no existen.",
    you: "Tú",
    team: "Scryve",
    replyPlaceholder: "Añade un detalle o responde una pregunta",
    send: "Enviar",
    sending: "Enviando…",
    sent: "Enviado",
    sendFailed: "No se pudo enviar. Inténtalo de nuevo.",
    linked: "Enviado con tu cuenta",
    linkedElsewhere: "Enviado con otra cuenta",
    notLinked: "Enviado sin tu cuenta.",
    includeAccount: "Incluirla",
    signInToSync: "Inicia sesión para sincronizarlo",
  },
  notifyPrompt: {
    title: "¿Quieres recibir una notificación cuando haya respuestas?",
    body: "Las respuestas siempre aparecen aquí, en Scryve, de todos modos.",
    notNow: "Ahora no",
    notify: "Avísame",
  },
  unavailable:
    "Los comentarios necesitan la nube de Scryve, que no está configurada en esta versión.",
} satisfies LocaleNamespace
