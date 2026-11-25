// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  openPlay: "Ir a Jugar",
  signIn: "Iniciar sesión",
  localGamesStay: "Las partidas locales se quedan en este dispositivo.",
  legal: {
    heading: "Legal",
    privacyPolicy: "Política de privacidad",
    termsOfUse: "Términos de uso",
    licenseAgreement: "Contrato de licencia",
    licenseAgreementHint: "Abre en tu navegador el contrato de licencia estándar de Apple",
    cookiePolicy: "Política de cookies",
    gameContent: "Contenido de juegos de terceros",
    licenseOpenFailed: "No se pudo abrir el contrato de licencia",
  },
  accountData: {
    label: "Cuenta y datos",
    accessibilityLabel: "Cuenta y datos",
    accessibilityHint: "Abre los detalles de eliminación de la cuenta y de los datos",
  },
  shareUsage: "Compartir el uso con Scryve",
  settings: {
    title: "Ajustes",
    localDefaults: "Valores predeterminados de partidas locales",
    general: "General",
    appearance: "Apariencia",
    about: "Acerca de",
    version: "Versión",
    players: "jugadores",
    openScryveTo: "Al abrir Scryve, mostrar",
    launchDestination: {
      play: "Jugar",
      decks: "Mazos",
    },
    game: "Juego",
    chooseGame: "Empezar partidas nuevas con",
    closeGameChoices: "Cerrar opciones de juego",
    haptics: {
      label: "Respuesta háptica",
    },
    theme: {
      heading: "Tema",
      system: "Sistema",
      light: "Claro",
      dark: "Oscuro",
    },
    appIcon: {
      heading: "Icono de la app",
      changeFailed: "No se pudo cambiar el icono de la app. Inténtalo de nuevo.",
      lockedPro: "{{name}}, Scryve Pro",
      foilHeading: "Scryve Foil",
      opensPro: "Abre Scryve Pro",
      proFailed: "No se pudo comprobar Scryve Pro, así que los iconos Pro están bloqueados.",
      names: {
        Default: "Predeterminado",
        Two: "Dos",
        Three: "Tres",
        Midnight: "Medianoche",
        Graphite: "Grafito",
        Ink: "Tinta",
        Outline: "Contorno",
        Bone: "Hueso",
        Paper: "Papel",
        Ash: "Ceniza",
        Pencil: "Lápiz",
        Foil: "Foil",
        Contour: "Silueta",
        Stripes: "Rayas",
        Neon: "Neón",
        Blueprint: "Plano",
        Gilded: "Dorado",
        Prism: "Prisma",
        Holo: "Holo",
      },
    },
    notifications: {
      heading: "Notificaciones",
      feedbackReplies: "Respuestas a comentarios",
      feedbackRepliesHelper: "Las respuestas siempre aparecen en Tus comentarios",
      renewalReminders: "Avisos de renovación",
      renewalRemindersHelper_one: "{{count}} día antes de que se renueve tu suscripción",
      renewalRemindersHelper_many: "{{count}} de días antes de que se renueve tu suscripción",
      renewalRemindersHelper_other: "{{count}} días antes de que se renueve tu suscripción",
      channel: "Respuestas y avisos",
      feedbackReplyPreview: "Nueva respuesta a tus comentarios",
      blockedTitle: "Las notificaciones están desactivadas",
      blockedBody: "Activa las notificaciones de Scryve en Ajustes.",
      openSettings: "Abrir Ajustes",
    },
    privacy: {
      heading: "Privacidad",
      shareUsageHelper:
        "Desactivado por defecto. Comparte el uso con un ID aleatorio que no está vinculado a tu cuenta. Detalles en la Política de privacidad.",
      saveFailed: "No se pudo guardar tu elección. Inténtalo de nuevo.",
      unavailable:
        "Compartir el uso no está disponible en esta compilación. No se enviará ningún evento de PostHog.",
    },
    appInfo: {
      heading: "Información de la app",
      analyticsId: "ID de analítica: {{id}}",
      analyticsIdHint:
        "Este ID nos ayuda a encontrar tus datos de uso. Para pedirnos que los eliminemos, envía el ID por correo a privacy@sowinghope.how.",
      version: "Versión: {{value}}",
      build: "Compilación: {{value}}",
      runtime: "Runtime: {{value}}",
      update: "Actualización: {{value}}",
      channel: "Canal: {{value}}",
      platform: "Plataforma: {{value}}",
      notApplicable: "No aplicable",
      unavailable: "No disponible",
      bundled: "Incluido",
      development: "Desarrollo",
    },
    beta: {
      label: "Actualizaciones beta",
      helper: "Recibe actualizaciones no publicadas antes que el resto. Pueden ser inestables.",
    },
    backToPreview: "Volver a la vista previa",
    backToPreviewFailed: "No se pudo volver a la vista previa. Inténtalo de nuevo.",
    copyDebugInfo: "Copiar información de depuración",
    copied: "Copiado",
    copyFailed: "No se pudo copiar. Inténtalo de nuevo.",
    turns: {
      label: "Turnos",
      helper: "Muestra de quién es el turno. Toca el indicador de turno para pasar.",
    },
    syncStats: {
      label: "Estadísticas para nerds",
      helper:
        "Muestra cuánto tardan los cambios en llegar a cada dispositivo en partidas en línea y cercanas, y cómo encuentra cartas el escáner.",
    },
  },
  support: {
    pageTitle: "Soporte de Scryve",
    pageDescription:
      "Encuentra respuestas a preguntas frecuentes, sugiere una función, informa de un error o contacta con el soporte.",
    title: "Soporte",
    faq: {
      heading: "Preguntas frecuentes",
      restorePro: {
        question: "Restaurar Scryve Pro",
        answer:
          "Abre Scryve, ve a tu cuenta, elige Scryve Pro y toca Restaurar compras. Usa la misma cuenta de Apple o Google con la que hiciste la compra original.",
      },
      manageSubscription: {
        question: "Gestionar o cancelar una suscripción",
        answer:
          "Las suscripciones se gestionan en la tienda donde las contrataste. En iPhone o iPad, abre Ajustes, toca tu nombre y luego Suscripciones. En Android, abre Google Play, toca tu perfil y luego Pagos y suscripciones.",
      },
      gameTrouble: {
        question: "¿Tienes problemas con una partida?",
        answer:
          "Reinicia Scryve e inténtalo de nuevo. Si el problema continúa, repórtalo aquí con una breve descripción de lo que pasó.",
      },
      accountPrivacy: {
        question: "Preguntas sobre la cuenta o la privacidad",
        answer:
          "Puedes gestionar tu cuenta desde la pantalla de cuenta de Scryve. Escribe al soporte si necesitas ayuda para acceder a tu cuenta o eliminarla.",
      },
    },
  },
  profile: {
    title: "Cuenta",
    signedIn: "Sesión iniciada",
    yourAccount: "Tu cuenta",
    profileAndSecurity: "Perfil y seguridad",
    profileHint: "Abre el gestor de perfil para cambiar tu nombre, tus correos y tu contraseña",
    profileDetails: "Nombre, correo, contraseña y métodos de inicio de sesión.",
    independence:
      "Scryve es independiente y no está afiliada ni respaldada por las editoriales de los juegos, los titulares de derechos ni los proveedores de datos mencionados en nuestro aviso sobre el contenido de los juegos.",
    signingOut: "Cerrando sesión…",
    signOut: "Cerrar sesión",
    signOutFailed: "No se pudo cerrar sesión. Inténtalo de nuevo.",
    signOutFailedShort: "No se pudo cerrar sesión",
    signInPrompt: "Inicia sesión antes de abrir tu perfil.",
    reauthenticate: "Volver a autenticarte",
  },
  deleteAccount: {
    title: "Eliminar cuenta",
    eyebrow: "CUENTA Y DATOS",
    heading: {
      needsAttention: "Tu eliminación requiere atención",
      inProgress: "Tu eliminación está en curso",
      before: "Antes de eliminar tu cuenta",
      completed: "Tu cuenta fue eliminada",
    },
    checkingStatus: "Comprobando el estado de la eliminación…",
    intro:
      "Esto elimina de forma permanente tu cuenta de Scryve y anonimiza tu historial de partidas conectadas. Revisa primero lo que ocurrirá.",
    steps: {
      cloud: {
        title: "Se elimina tu cuenta en la nube",
        body: "Se eliminan tu perfil, tu avatar, tu inicio de sesión, tus invitaciones y los datos conectados vinculados a tu cuenta.",
      },
      history: {
        title: "Se anonimiza el historial de encuentros compartidos",
        body: "Las demás personas conservan el resultado del encuentro, pero tus asientos pasan a ser entradas sin vincular de «Jugador eliminado» con un avatar neutro.",
      },
      local: {
        title: "Las partidas locales se quedan en este dispositivo",
        body: "El historial de partidas sin conexión se guarda solo en este dispositivo. No está vinculado a tu cuenta y no se borra de forma remota.",
      },
      feedback: {
        title: "Los comentarios enviados sin tu cuenta se conservan",
        body: "Los comentarios que enviaste con tu cuenta se eliminan. Los que enviaste sin ella se quedan con el dispositivo que los envió. Para eliminarlos, abre Ayuda, luego Tus comentarios y toca Eliminar mis comentarios.",
      },
      signOut: {
        title: "Se cierra sesión en todos los dispositivos",
        body: "Se cerrará sesión automáticamente en este dispositivo y en cualquier otro donde tengas la sesión iniciada.",
      },
    },
    subscription: {
      heading: "¿Tienes una suscripción a Scryve Pro?",
      body: "Eliminar tu cuenta no cancela la suscripción. Es posible que te sigan cobrando hasta que la canceles donde la contrataste. Aun así, puedes eliminar la cuenta ahora, pero perderás el tiempo pagado que te quede.",
      manageApple: "Gestionar suscripciones de Apple",
      manageGoogle: "Gestionar suscripciones de Google Play",
      web: "¿Te suscribiste en la web? Cancela en el portal de clientes. Todos los correos de facturación de Scryve Pro incluyen un enlace a él.",
      manageWeb: "Gestionar suscripción web",
    },
    signedInAs: "Sesión iniciada como {{email}}",
    confirmLabel: "Escribe {{word}} para continuar",
    submit: {
      submitting: "Enviando solicitud…",
      retry: "Reintentar la eliminación de la cuenta",
      delete: "Eliminar cuenta de forma permanente",
    },
    footnote: {
      retry:
        "Al reintentar, se continuará desde el último paso incompleto; los datos anonimizados no se restauran.",
      first:
        "La eliminación comienza de inmediato y no se puede deshacer una vez que empieza el procesamiento.",
    },
    status: {
      failed:
        "Scryve no pudo terminar automáticamente. Vuelve a esta página y envía la solicitud de nuevo para reintentar.",
      identityPending:
        "Tus datos conectados están anonimizados. Scryve está eliminando ahora tu identidad de inicio de sesión.",
      processing:
        "Scryve está anonimizando el historial conectado y eliminando los datos vinculados a la cuenta. Puedes cerrar esta página sin problema.",
    },
    panel: {
      failed: {
        title: "La eliminación requiere atención",
        body: "No se restaurarán datos de la cuenta. Escribe {{word}} y envía de nuevo para reintentar el trabajo pendiente.",
      },
      completed: {
        title: "Eliminación completada",
        body: "Este comprobante no contiene detalles de la cuenta.",
      },
      received: {
        title: "Solicitud de eliminación recibida",
        body: "Mientras se procesa la solicitud, se bloquea la nueva actividad conectada.",
      },
    },
    receipt: {
      completedBody:
        "Scryve eliminó tu cuenta de inicio de sesión y anonimizó tu historial de partidas conectadas.",
      failedBody: "Scryve no pudo terminar automáticamente el resto del trabajo de eliminación.",
      lastUpdated: "Última actualización: {{day}} a las {{time}}",
      next: {
        completed: "No se necesita ninguna otra acción.",
        failed: "Inicia sesión de nuevo, vuelve a esta página y reintenta la solicitud.",
        pending: "Puedes cerrar Scryve. Esta página seguirá comprobando el estado cuando vuelvas.",
      },
      signInToRetry: "Inicia sesión para reintentar",
      returnHome: "Volver al inicio",
    },
    route: {
      statusCheckFailed:
        "Scryve no pudo comprobar el estado de tu eliminación. La eliminación de la cuenta no estará disponible hasta que la comprobación se complete.",
      signInPrompt: "Inicia sesión para solicitar la eliminación de tu cuenta de Scryve.",
      checkingReceipt: "Cargando tu comprobante de eliminación…",
      checkingAccount: "Comprobando tu cuenta…",
      reconnect: "Vuelve a conectarte a Scryve antes de eliminar tu cuenta.",
      submitFailed: "No se pudo enviar la solicitud de eliminación",
    },
  },
  cloud: {
    signInToContinue: "Inicia sesión para continuar.",
    chooseUsername: "Elige tu nombre de usuario de jugador.",
    reconnect: "Vuelve a conectarte para continuar.",
    chooseUsernameAction: "Elegir nombre de usuario",
    unavailableHeading: "Funciones conectadas no disponibles",
    localPlayAvailable: "El juego local sigue disponible.",
    notConfigured:
      "Las funciones conectadas no están disponibles en esta versión. El juego local sigue disponible.",
  },
  billing: {
    proNeedsAccount:
      "Scryve Pro está vinculado a una cuenta. Inicia sesión para obtener Pro o usar el Pro que ya tienes.",
    signInPrompt: {
      title: "¿Quieres usar Pro en todos tus dispositivos?",
      body: "Inicia sesión para usar Scryve Pro en tus otros dispositivos y en la web.",
      notNow: "Ahora no",
    },
    renewalPrompt: {
      title: "¿Quieres un aviso antes de la renovación?",
      body_one: "Recibe una notificación un día antes de tu próximo cobro anual.",
      body_many: "Recibe una notificación {{count}} días antes de tu próximo cobro anual.",
      body_other: "Recibe una notificación {{count}} días antes de tu próximo cobro anual.",
      notNow: "Ahora no",
      remind: "Avisarme",
    },
    access: {
      checking: "Comprobando el acceso…",
      renews: "Se renueva el {{date}}",
      availableUntil: "Disponible hasta el {{date}}",
      active: "Acceso {{plan}} activo",
      unavailable: "Estado no disponible",
      free: "Plan gratuito",
    },
    loading: "Cargando Scryve Pro",
    manage: "Gestionar",
    manageAccessibilityLabel: "Gestionar suscripción de Scryve ({{plan}})",
    viewOptions: "Ver opciones",
    viewOptionsAccessibilityLabel: "Ver opciones de Scryve Pro",
    paywallFailedTitle: "Scryve Pro no se abrió",
    notConfigured: "Las compras de Scryve Pro no están configuradas.",
    missingApiKey:
      "Las compras de Scryve Pro no están disponibles porque no se ha configurado la clave de API pública de RevenueCat.",
    errors: {
      revenueCatNotConfigured: "RevenueCat no está configurado.",
      unexpected: "Se produjo un error inesperado en la compra.",
      offline: "Conéctate a internet e inténtalo de nuevo.",
      notAllowed: "No se permiten compras en este dispositivo o en esta cuenta de la tienda.",
      productUnavailable: "Esta opción de Scryve Pro no está disponible en la tienda actual.",
      pending:
        "La tienda aún está procesando esta compra. El acceso se actualizará cuando termine.",
      misconfigured: "Scryve Pro no está configurado correctamente para esta compilación.",
      failed: "No se pudo completar la compra.",
      waitForBilling: "Espera a que la facturación se conecte a tu cuenta e inténtalo de nuevo.",
      foilWebOnly: "Las compras de Foil solo están disponibles en la web.",
      manageBeforeFoil: "Gestiona tu suscripción actual antes de cambiar a Foil.",
      productNotInStore: "{{productId}}: no está disponible en la tienda actual.",
      paywallFailed: "La pantalla de pago de Scryve Pro no pudo completar la solicitud.",
      noManagementPage:
        "Aún no hay una página de gestión de suscripción disponible para este cliente.",
    },
  },
  foil: {
    pageTitle: "Scryve Foil Supporter",
    title: "Foil Supporter",
    price: "{{amount}} US$/año",
    description:
      "Las mismas funciones de Pro. Apoyo opcional a Scryve. Se renueva cada año hasta que se cancele.",
    signInPrompt: "Inicia sesión para vincular Foil a tu cuenta de Scryve.",
    alreadyPro: "Ya tienes acceso a Pro. Gestiona tu suscripción actual antes de cambiar de plan.",
    manageSubscription: "Gestionar suscripción",
    openingCheckout: "Abriendo el pago…",
    choose: "Elegir Foil Supporter",
    purchasesUnavailable: "Las compras no están disponibles en esta compilación.",
  },
  legalDocument: {
    lastUpdated: "Última actualización: {{date}}",
  },
  updates: {
    downloading: "Descargando actualización…",
    downloadingProgress: "Descargando actualización: {{progress, percent}}",
    ready: "Actualización lista",
    cancelReady: "Cerrar",
    restart: "Reiniciar",
    whatsNew: "Novedades de esta actualización",
    dialogMessage:
      "Se aplicará la próxima vez que abras Scryve. Tu partida se guarda en ambos casos.",
    restartNow: "Reiniciar ahora",
    later: "Más tarde",
    channelAfterRestart: "{{running}} ({{next}} tras reiniciar)",
    restarting: "Reiniciando Scryve",
  },
  preview: {
    heading: "Vista previa de PR",
    loading: "Cargando {{channel}}…",
    busy: "Otra vista previa aún se está cargando. Abre este enlace de nuevo.",
    missing:
      "{{channel}} no tiene ninguna actualización que esta compilación pueda ejecutar. Puede que haga falta una nueva compilación de vista previa.",
  },
  launch: {
    starting: "Iniciando Scryve…",
    startingAccessibilityLabel: "Iniciando Scryve",
  },
  rootError: {
    title: "Algo salió mal",
    message:
      "Scryve encontró un error inesperado. Inténtalo de nuevo o reinicia la app si el problema continúa.",
  },
} satisfies LocaleNamespace
