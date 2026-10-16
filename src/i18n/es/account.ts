// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
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
    licenseAgreementHint: "Abre el contrato de licencia estándar de Apple en el navegador",
    cookiePolicy: "Política de cookies",
    gameContent: "Contenido de juegos de terceros",
    licenseOpenFailed: "No se pudo abrir el contrato de licencia",
  },
  accountData: {
    label: "Cuenta y datos",
    accessibilityLabel: "Cuenta y datos",
    accessibilityHint: "Abre la eliminación de la cuenta y los detalles de los datos",
  },
  shareUsage: "Compartir uso con Scryve",
  settings: {
    title: "Ajustes",
    localDefaults: "Valores predeterminados de partidas locales",
    players: "jugadores",
    openScryveTo: "Abrir Scryve en",
    launchDestination: {
      play: "Jugar",
      decks: "Mazos",
    },
    launchDestinationHint: "Jugar retoma la partida actual o abre un tablero nuevo.",
    gameSystem: "Sistema de juego",
    defaultGameSystem: "Sistema de juego predeterminado",
    format: "Formato",
    noDefault: "Sin predeterminado",
    defaultsHint:
      "Configúralo solo si quieres que las partidas nuevas empiecen con el mismo sistema y formato.",
    haptics: {
      label: "Respuesta háptica",
      helper:
        "Una vibración sutil tras los cambios de vida. Si falla, nunca interrumpe la partida.",
    },
    theme: {
      heading: "Tema",
      system: "Sistema",
      light: "Claro",
      dark: "Oscuro",
      hint: "Sistema sigue la apariencia de tu dispositivo. Claro y oscuro se mantienen fijos hasta que los cambies aquí.",
    },
    menuButton: {
      heading: "Botón del menú de partida",
      hint: "Cambia la forma en el centro del tablero. Prisma tiñe el botón con los colores de todos en la mesa.",
    },
    privacy: {
      heading: "Privacidad",
      shareUsageHelper:
        "Desactivado por defecto. Comparte el uso con un ID aleatorio que no está vinculado a tu cuenta. Detalles en la Política de privacidad.",
      saveFailed: "No se pudo guardar tu elección. Inténtalo de nuevo.",
      unavailable:
        "Compartir el uso no está disponible en esta versión. No se enviarán eventos de PostHog.",
    },
    accountData: {
      description:
        "Gestiona los datos en la nube vinculados a tu cuenta de Scryve. Las partidas locales se quedan en este dispositivo.",
      requestDeletion: "Solicitar la eliminación de la cuenta",
      requestDeletionHint: "Abre la página de solicitud de eliminación de la cuenta",
    },
    help: {
      heading: "Ayuda",
      support: "Ayuda y soporte",
    },
    appInfo: {
      heading: "Información de la app",
      analyticsId: "ID de analíticas: {{id}}",
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
      helper: "Recibe actualizaciones no publicadas antes que nadie. Pueden ser inestables.",
    },
    backToPreview: "Volver a la vista previa",
    backToPreviewFailed: "No se pudo volver a la vista previa. Inténtalo de nuevo.",
    copyDebugInfo: "Copiar info de depuración",
    copied: "Copiado",
    copyFailed: "No se pudo copiar. Inténtalo de nuevo.",
  },
  support: {
    pageTitle: "Ayuda de Scryve",
    pageDescription:
      "Aprende a empezar con Scryve, encuentra respuestas a preguntas frecuentes o contacta con soporte.",
    title: "Ayuda",
    subtitle:
      "Respuestas sobre partidas, cuentas y Scryve Pro. Envíanos un mensaje si necesitas ayuda.",
    contactUs: "Contáctanos",
    contactReason: "Motivo del contacto",
    kind: {
      bug: "Informar de un problema",
      help: "Pedir ayuda",
    },
    messageLabel: {
      bug: "¿Qué pasó?",
      help: "¿En qué podemos ayudarte?",
    },
    messagePlaceholder: {
      bug: "¿Qué pasó? ¿Qué esperabas?",
      help: "Cuéntanos con qué necesitas ayuda",
    },
    emailLabel: {
      bug: "Correo para responderte (opcional)",
      help: "Correo para responderte",
    },
    emailInvalid: "Introduce una dirección de correo válida.",
    replyTime: "Solemos responder en dos días hábiles.",
    selectedScreenshot: "Captura seleccionada",
    removeScreenshot: "Quitar captura",
    addScreenshot: "Añadir captura",
    disclosure:
      "Envía a Sentry tu mensaje, el correo si lo indicas, la versión de la app, la compilación, la plataforma y la captura que añadas.",
    send: "Enviar",
    preferEmail: "¿Prefieres el correo?",
    emailSupport: "Escribir a soporte",
    status: {
      queued: "Comentarios en cola. Si no tienes conexión, se enviarán al reconectarte.",
      saveFailed: "No se pudo guardar tu mensaje. Inténtalo de nuevo o escríbenos por correo.",
      screenshotFailed: "No se pudo añadir esa captura. Prueba con otra imagen.",
    },
    gettingStarted: {
      heading: "Primeros pasos",
      startGame: {
        title: "Empezar una partida",
        body: "Abre Jugar. Tu tablero nuevo usa los valores predeterminados guardados en Ajustes.",
      },
      choosePlay: {
        title: "Elige cómo jugar",
        body: "Juega en un solo dispositivo o elige Conectada para jugar en dispositivos separados.",
      },
      setUpTable: {
        title: "Prepara la mesa",
        body: "Selecciona el número de jugadores y la vida inicial, y empieza la partida.",
      },
    },
    faq: {
      heading: "Preguntas frecuentes",
      restorePro: {
        question: "Restaurar Scryve Pro",
        answer:
          "Abre Scryve, ve a tu cuenta, elige Scryve Pro y toca Restaurar compras. Usa la misma cuenta de Apple o Google con la que hiciste la compra original.",
      },
      manageSubscription: {
        question: "Administrar o cancelar una suscripción",
        answer:
          "Las suscripciones las administra la tienda donde las compraste. En iPhone o iPad, abre Ajustes, toca tu nombre y luego Suscripciones. En Android, abre Google Play, toca tu perfil y luego Pagos y suscripciones.",
      },
      gameTrouble: {
        question: "¿Tienes problemas con una partida?",
        answer:
          "Reinicia Scryve e inténtalo de nuevo. Si el problema continúa, infórmalo aquí con una breve descripción de lo que pasó.",
      },
      accountPrivacy: {
        question: "Preguntas sobre la cuenta o la privacidad",
        answer:
          "Puedes administrar tu cuenta desde la pantalla de cuenta de Scryve. Contáctanos si necesitas ayuda para acceder a tu cuenta o eliminarla.",
      },
    },
    appVersion: "Scryve {{version}}",
  },
  profile: {
    title: "Cuenta",
    signedIn: "Sesión iniciada",
    yourAccount: "Tu cuenta",
    profileAndSecurity: "Perfil y seguridad",
    profileHint:
      "Abre el administrador de perfil para cambiar tu nombre, correos electrónicos y contraseña",
    profileDetails: "Nombre, correo, contraseña y métodos de inicio de sesión.",
    independence:
      "Scryve es independiente y no está afiliado ni respaldado por los editores de juegos, los titulares de derechos ni los proveedores de datos mencionados en nuestro aviso sobre el contenido de los juegos.",
    signingOut: "Cerrando sesión…",
    signOut: "Cerrar sesión",
    signOutFailed: "No se pudo cerrar sesión. Inténtalo de nuevo.",
    signOutFailedShort: "No se pudo cerrar sesión",
    signInPrompt: "Inicia sesión antes de abrir tu perfil.",
    reauthenticate: "Volver a autenticarse",
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
      "Esto elimina permanentemente tu cuenta de Scryve y anonimiza tu historial de juego conectado. Revisa primero qué ocurre.",
    steps: {
      cloud: {
        title: "Se elimina tu cuenta en la nube",
        body: "Se eliminan tu perfil, avatar, inicio de sesión, invitaciones y los datos conectados vinculados a tu cuenta.",
      },
      history: {
        title: "El historial de partidas compartidas se anonimiza",
        body: "Los demás jugadores conservan el resultado de la partida, pero tus asientos pasan a ser entradas sin vincular de «Jugador eliminado» con un avatar neutro.",
      },
      local: {
        title: "Las partidas locales se quedan en este dispositivo",
        body: "El historial de partidas sin conexión se guarda solo en este dispositivo. No está vinculado a tu cuenta y no se borra de forma remota.",
      },
      signOut: {
        title: "Se cierra sesión en todos los dispositivos",
        body: "Se cierra sesión automáticamente en este dispositivo y en cualquier otro donde hayas iniciado sesión.",
      },
    },
    subscription: {
      heading: "¿Tienes una suscripción a Scryve Pro?",
      body: "Eliminar tu cuenta no la cancela. Es posible que se te siga cobrando hasta que la canceles a través de Apple o Google Play. Aún puedes eliminarla ahora, pero perderás el acceso al tiempo pagado que te quede.",
      manageApple: "Administrar suscripciones de Apple",
      manageGoogle: "Administrar suscripciones de Google Play",
    },
    signedInAs: "Sesión iniciada como {{email}}",
    confirmLabel: "Escribe {{word}} para continuar",
    submit: {
      submitting: "Enviando solicitud…",
      retry: "Reintentar eliminación de cuenta",
      delete: "Eliminar cuenta permanentemente",
    },
    footnote: {
      retry:
        "Al reintentar se continúa desde el último paso incompleto; los datos anonimizados no se restauran.",
      first:
        "La eliminación comienza de inmediato y no se puede deshacer una vez iniciado el proceso.",
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
        body: "No se restaurará ningún dato de la cuenta. Escribe {{word}} y envía de nuevo para reintentar el trabajo restante.",
      },
      completed: {
        title: "Eliminación completada",
        body: "Este comprobante no contiene datos de la cuenta.",
      },
      received: {
        title: "Solicitud de eliminación recibida",
        body: "La nueva actividad conectada está bloqueada mientras se procesa la solicitud.",
      },
    },
    receipt: {
      completedBody:
        "Scryve eliminó tu cuenta de inicio de sesión y anonimizó tu historial de juego conectado.",
      failedBody: "Scryve no pudo terminar automáticamente el trabajo de eliminación restante.",
      lastUpdated: "Última actualización: {{day}} a las {{time}}",
      next: {
        completed: "No se necesita ninguna otra acción.",
        failed: "Inicia sesión de nuevo, vuelve a esta página y reintenta la solicitud.",
        pending: "Puedes cerrar Scryve. Esta página seguirá comprobando cuando vuelvas.",
      },
      signInToRetry: "Inicia sesión para reintentar",
      returnHome: "Volver al inicio",
    },
    route: {
      statusCheckFailed:
        "Scryve no pudo comprobar el estado de tu eliminación. La eliminación de la cuenta no estará disponible hasta que la comprobación se complete.",
      signInPrompt: "Inicia sesión para solicitar la eliminación de tu cuenta de Scryve.",
      checkingReceipt: "Comprobando tu comprobante de eliminación…",
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
    closeSignIn: "Cerrar inicio de sesión",
  },
  billing: {
    access: {
      checking: "Comprobando acceso…",
      renews: "Se renueva el {{date}}",
      availableUntil: "Disponible hasta el {{date}}",
      active: "Acceso {{plan}} activo",
      unavailable: "Estado no disponible",
      free: "Plan gratuito",
    },
    loading: "Cargando Scryve Pro",
    manage: "Administrar",
    manageAccessibilityLabel: "Administrar suscripción de Scryve {{plan}}",
    viewOptions: "Ver opciones",
    viewOptionsAccessibilityLabel: "Ver opciones de Scryve Pro",
    notConfigured: "Las compras de Scryve Pro no están configuradas.",
    missingApiKey:
      "Las compras de Scryve Pro no están disponibles porque no se ha configurado la clave pública de API de RevenueCat.",
    errors: {
      revenueCatNotConfigured: "RevenueCat no está configurado.",
      unexpected: "Se produjo un error de compra inesperado.",
      offline: "Conéctate a internet e inténtalo de nuevo.",
      notAllowed: "Las compras no están permitidas en este dispositivo o cuenta de la tienda.",
      productUnavailable: "Esta opción de Scryve Pro no está disponible en la tienda actual.",
      pending: "La tienda sigue procesando esta compra. El acceso se actualizará cuando termine.",
      misconfigured: "Scryve Pro no está configurado correctamente para esta versión.",
      failed: "No se pudo completar la compra.",
      waitForBilling: "Espera a que la facturación se conecte a tu cuenta y vuelve a intentarlo.",
      foilWebOnly: "Las compras de Foil solo están disponibles en la web.",
      manageBeforeFoil: "Gestiona tu suscripción actual antes de cambiar a Foil.",
      productNotInStore: "{{productId}} no está disponible en la tienda actual.",
      paywallFailed: "El paywall de Scryve Pro no pudo completar la solicitud.",
      noManagementPage:
        "Aún no hay una página de gestión de suscripción disponible para este cliente.",
    },
  },
  foil: {
    pageTitle: "Scryve Foil Supporter",
    title: "Foil Supporter",
    price: "500 US$/año",
    description:
      "Las mismas funciones Pro. Apoyo opcional a Scryve. Se renueva cada año hasta que lo canceles.",
    signInPrompt: "Inicia sesión para vincular Foil a tu cuenta de Scryve.",
    alreadyPro: "Ya tienes acceso Pro. Gestiona tu suscripción actual antes de cambiar de plan.",
    manageSubscription: "Gestionar suscripción",
    openingCheckout: "Abriendo el pago…",
    choose: "Elegir Foil Supporter",
    purchasesUnavailable: "Las compras no están disponibles en esta versión.",
  },
  legalConsent: {
    heading: {
      updatedPrivacy: "Hemos actualizado nuestra política de privacidad",
      updatedTerms: "Hemos actualizado nuestros términos",
      beforeStart: "Antes de empezar",
    },
    intro:
      "Revisa nuestros Términos de uso y la Política de privacidad. Debes aceptarlos para usar Scryve.",
    returning: {
      dated: {
        terms:
          "Nuestros Términos de uso cambiaron el {{date}}. Revisa la actualización para seguir usando Scryve.",
        privacy:
          "Nuestra Política de privacidad cambió el {{date}}. Revisa la actualización para seguir usando Scryve.",
        both: "Nuestros Términos de uso y la Política de privacidad cambiaron el {{date}}. Revisa la actualización para seguir usando Scryve.",
      },
      undated: {
        terms:
          "Nuestros Términos de uso han cambiado. Revisa las actualizaciones para seguir usando Scryve.",
        privacy:
          "Nuestra Política de privacidad ha cambiado. Revisa las actualizaciones para seguir usando Scryve.",
        both: "Nuestros Términos de uso y la Política de privacidad han cambiado. Revisa las actualizaciones para seguir usando Scryve.",
      },
    },
    acceptance: {
      dated: {
        terms: 'Al tocar "Acepto", aceptas los Términos de uso con fecha {{date}}.',
        privacy: 'Al tocar "Acepto", aceptas la Política de privacidad con fecha {{date}}.',
        both: 'Al tocar "Acepto", aceptas los Términos de uso y la Política de privacidad con fecha {{date}}.',
      },
      undated: {
        terms: 'Al tocar "Acepto", aceptas los Términos de uso vigentes.',
        privacy: 'Al tocar "Acepto", aceptas la Política de privacidad vigente.',
        both: 'Al tocar "Acepto", aceptas los Términos de uso y la Política de privacidad vigentes.',
      },
    },
    readTerms: "Leer los Términos de uso",
    readPrivacy: "Leer la Política de privacidad",
    shareUsageHelper:
      "Desactivado por defecto. Compartir nos ayuda a crear lo que quieres. Detalles en la Política de privacidad.",
    sharingSaveFailed:
      "No se pudo guardar tu elección de compartir. Inténtalo de nuevo o desactiva compartir para continuar.",
    saving: "Guardando…",
    agree: "Acepto",
  },
  legalDocument: {
    lastUpdated: "Última actualización: {{date}}",
  },
  consentSync: {
    syncing: "Sincronizando tu aceptación…",
    stillPending:
      "La sincronización de la cuenta sigue pendiente. Tu aceptación está guardada en este dispositivo.",
    pending: "Aceptación guardada en este dispositivo. Sincronización de la cuenta pendiente.",
    retrying: "Reintentando…",
    retryAccessibilityLabel: "Reintentar la sincronización del consentimiento de la cuenta",
  },
  updates: {
    downloading: "Descargando actualización…",
    downloadingProgress: "Descargando actualización {{percent}}%",
    ready: "Actualización lista",
    cancelReady: "Cancelar actualización lista",
    restart: "Reiniciar",
    whatsNew: "Novedades de esta actualización",
    dialogMessage:
      "Se aplica la próxima vez que abras Scryve. Tu partida se guarda en ambos casos.",
    restartNow: "Reiniciar ahora",
    later: "Más tarde",
    channelAfterRestart: "{{running}} ({{next}} tras reiniciar)",
    restarting: "Reiniciando Scryve",
  },
  preview: {
    heading: "Vista previa de PR",
    loading: "Cargando {{channel}}…",
    busy: "Otra vista previa sigue cargando. Abre este enlace de nuevo.",
    missing:
      "{{channel}} no tiene ninguna actualización que esta versión pueda ejecutar. Puede que necesite una nueva versión de vista previa.",
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
