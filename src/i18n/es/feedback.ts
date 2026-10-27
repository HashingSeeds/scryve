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
    suggest: "Sugerir una función o informar de un error",
    noMatch: "No hay respuestas para “{{query}}”.",
    ask: "Pregúntanos sobre “{{query}}”",
  },
  offline: "Sin conexión. Tu borrador se queda aquí hasta que vuelvas.",
  suggest: {
    title: "Enviar comentarios",
    kind: "¿De qué se trata?",
    feature: "Función",
    bug: "Error",
    bodyLabel: "Mensaje",
    bodyPlaceholder: {
      feature: "¿Qué te gustaría y cuándo lo usarías?",
      bug: "¿Qué pasó? ¿Qué esperabas que pasara?",
    },
    addScreenshot: "Añadir captura de pantalla",
    removeScreenshot: "Quitar captura de pantalla",
    selectedScreenshot: "Captura de pantalla seleccionada",
    screenshotFailed: "No se pudo añadir esa captura. Prueba con otra imagen.",
    bugDisclosure:
      "Los informes de errores también envían los datos de tu dispositivo y cualquier captura de pantalla a Sentry.",
    translationNotice:
      "Escribe en el idioma que quieras. Podemos usar herramientas de IA para traducirlo. Consulta nuestra <privacy>Política de privacidad</privacy>.",
    includeAccount: "Incluir mi cuenta",
    includeAccountHelper:
      "Las respuestas te siguen en todos los dispositivos en los que inicies sesión, y nosotros vemos tu nombre de usuario.",
    anonymous:
      "Enviado sin tu cuenta. Las respuestas se muestran en este dispositivo y, si reinstalas la app, podrías perderlas.",
    signInToKeep: "Inicia sesión para conservarlo",
    send: "Enviar",
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
    replyLabel: "Respuesta",
    replyPlaceholder: "Añade un detalle o responde una pregunta",
    send: "Enviar",
    sendFailed: "No se pudo enviar. Inténtalo de nuevo.",
    includeAccount: "Incluir mi cuenta",
    includeAccountHelper:
      "Nos permite ver tu nombre de usuario y mantiene este hilo en todos tus dispositivos.",
    linked: "Enviado con tu cuenta",
    linkedElsewhere: "Enviado con otra cuenta",
    signInToKeep: "Inicia sesión para conservar este hilo si reinstalas",
    notifyReplies: "Avisarme cuando respondamos",
  },
  unavailable:
    "Los comentarios necesitan la nube de Scryve, que no está configurada en esta versión.",
} satisfies LocaleNamespace
