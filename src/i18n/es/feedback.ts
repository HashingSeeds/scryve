// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
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
    noMatch: "No hay respuestas para “{{query}}”.",
    ask: "Pregúntanos sobre “{{query}}”",
  },
  offline: "Sin conexión. Tu borrador se queda aquí hasta que vuelvas.",
  suggest: {
    title: "Enviar comentarios",
    kind: "¿De qué se trata?",
    feature: "Función",
    bug: "Error",
    prompt: {
      feature: "¿Qué te gustaría ver?",
      bug: "¿Qué salió mal?",
    },
    bodyPlaceholder: {
      feature: "¿Cuándo la usarías?",
      bug: "¿Qué pasó y qué esperabas que pasara?",
    },
    addScreenshot: "Añadir captura de pantalla",
    removeScreenshot: "Quitar captura de pantalla",
    selectedScreenshot: "Captura de pantalla seleccionada",
    screenshotFailed: "No se pudo añadir esa captura. Prueba con otra imagen.",
    notice: {
      feature:
        "Puedes escribir en cualquier idioma. Es posible que usemos IA para leerlo. <privacy>Privacidad</privacy>",
      bug: "Puedes escribir en cualquier idioma. Es posible que usemos IA para leerlo. Los informes de errores incluyen información del dispositivo. <privacy>Privacidad</privacy>",
    },
    includeAccount: "Incluir mi cuenta",
    includeAccountHelper:
      "Las respuestas se sincronizan con tus dispositivos y vemos tu nombre de usuario.",
    sendFailed: "No se pudo enviar. Inténtalo de nuevo.",
    rateLimited_one: "Demasiados envíos. Inténtalo de nuevo en {{count}} minuto.",
    rateLimited_many: "Demasiados envíos. Inténtalo de nuevo en {{count}} minutos.",
    rateLimited_other: "Demasiados envíos. Inténtalo de nuevo en {{count}} minutos.",
  },
  mine: {
    title: "Tus comentarios",
    empty: "Aún no has enviado nada desde este dispositivo.",
    unread: "Nuevo",
    deleteAll: "Eliminar mis comentarios",
    deleteHint:
      "Elimina lo que envió este dispositivo y todo lo que enviaste con tu cuenta. Los detalles de errores que ya se enviaron a Sentry se quedan allí.",
    deleteConfirmTitle: "¿Eliminar tus comentarios?",
    deleteConfirmBody:
      "Esto elimina lo que envió este dispositivo y todo lo que enviaste con tu cuenta, junto con las respuestas. Los detalles de errores ya enviados a Sentry permanecen allí.",
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
    body: "Las respuestas siempre aparecen aquí en Scryve, de todos modos.",
    notNow: "Ahora no",
    notify: "Notificarme",
  },
  unavailable:
    "Los comentarios necesitan la nube de Scryve, que no está configurada en esta versión.",
} satisfies LocaleNamespace
