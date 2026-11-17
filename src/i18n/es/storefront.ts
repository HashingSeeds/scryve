// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "Sincroniza hasta {{proDecks}} mazos (gratis: {{freeDecks}})",
      versions: "Conserva {{proVersions}} versiones de cada mazo (gratis: {{freeVersions}})",
      compare: "Compara tus listas lado a lado",
      seatMark: "Una marca Pro en tu asiento en partidas compartidas",
      appIcons: "Íconos de app Pro",
    },
    save: "Ahorra {{ product.relative_discount }}",
    perMonth: "Solo {{ product.price_per_month }}/mes",
    billedAt: "Se cobra {{ product.price_per_period_abbreviated }}.",
    continue: "Continuar",
    restore: "Restaurar compras",
    terms: "Términos",
    privacy: "Privacidad",
  },
  listing: {
    appStoreName: "Scryve: contador de vidas TCG",
    playTitle: "Scryve: contador de vidas TCG",
    subtitle: "Mazos, estadísticas y torneos",
    shortDescription:
      "Contador de vidas para JCC y Commander, con estadísticas de mazos y torneos.",
    gameName: {
      mtg: "Magic: The Gathering",
      ygo: "Yu-Gi-Oh!",
      pokemon: "JCC Pokémon",
      lorcana: "Disney Lorcana",
      fab: "Flesh and Blood",
      riftbound: "Riftbound",
    },
    description: {
      players:
        "Un contador de vidas para hasta {{maxPlayers}} jugadores, con daño de comandante para Commander (EDH) y contadores de daño para Pokémon.",
      play: "Compartan un teléfono, conecten teléfonos en la misma red Wi-Fi para compartir las vidas, o inicia sesión para jugar desde cualquier lugar.",
      games: "Compatible con {{games}}.",
      decks: "Guarda tus mazos y consulta tu % de victorias y el historial de tus encuentros.",
      events:
        "Organiza eventos de suizo o de mesas multijugador desde tu teléfono, incluso con la red Wi-Fi de la tienda sin internet. Los jugadores reportan resultados desde sus teléfonos, y una pantalla de la tienda puede mostrar emparejamientos, el reloj y la clasificación.",
      noAccount:
        "No necesitas una cuenta para jugar con un solo teléfono o por red Wi-Fi, y las partidas con un solo teléfono funcionan sin conexión.",
      proHeading: "Scryve Pro",
      pro: "Sincroniza hasta {{proDecks}} mazos en lugar de {{freeDecks}} y conserva hasta {{proVersions}} versiones de cada mazo. Compara el % de victorias por versión para ver cómo funcionan tus cambios y compara listas lado a lado. Pro también muestra una insignia Pro en tu asiento en las partidas compartidas y desbloquea íconos de app Pro.",
      appleBilling_one:
        "Scryve Pro es una suscripción con renovación automática. El pago se carga a tu cuenta de Apple al confirmar la compra. La suscripción se renueva automáticamente, salvo que se cancele al menos {{count}} hora antes de que termine el período actual. Gestiona o cancela en los ajustes de tu cuenta de Apple.",
      appleBilling_many:
        "Scryve Pro es una suscripción con renovación automática. El pago se carga a tu cuenta de Apple al confirmar la compra. La suscripción se renueva automáticamente, salvo que se cancele al menos {{count}} horas antes de que termine el período actual. Gestiona o cancela en los ajustes de tu cuenta de Apple.",
      appleBilling_other:
        "Scryve Pro es una suscripción con renovación automática. El pago se carga a tu cuenta de Apple al confirmar la compra. La suscripción se renueva automáticamente, salvo que se cancele al menos {{count}} horas antes de que termine el período actual. Gestiona o cancela en los ajustes de tu cuenta de Apple.",
      googleBilling:
        "Scryve Pro es una suscripción con renovación automática que se cobra a tu cuenta de Google Play. Se renueva automáticamente hasta que la canceles. Gestiona o cancela cuando quieras en tus suscripciones de Google Play.",
      eula: "Términos de uso (EULA): {{url}}",
      terms: "Términos del servicio: {{url}}",
      privacy: "Política de privacidad: {{url}}",
    },
    whatsNew:
      "Mazos\n• Comparte cualquier mazo con un enlace. Tus amigos pueden jugarlo al instante en partidas locales, en la nube o cercanas, o guardar su propia copia.\n• Nuevas vistas Jugar y Construir: elige la versión que llevas, consulta los resultados recientes y edita cartas, sideboard y comandantes compañeros.\n• Sideboard entre las partidas de un encuentro.\n• Estadísticas de cada mazo, con comparación de listas en Pro.\n• Filtra los mazos por color y encuéntralos por comandante.\n• Guarda mazos sin límite en este dispositivo y elige cuáles se sincronizan. Registra encuentros sin conexión.\n• Busca cualquier carta sin abrir un mazo. La búsqueda tolera errores de escritura.\n\nPartidas\n• Toca a un jugador para infligir daño de comandante. Los comandantes compañeros atacan juntos.\n• Elige quién juega primero. Las estadísticas del mazo muestran tu historial jugando primero y segundo.\n• Las partidas cercanas están abiertas para todos. Únete con un código o QR.\n\nEventos\n• Organiza eventos de suizo o de mesas multijugador desde tu teléfono, incluso con la red Wi-Fi de la tienda sin internet. Los jugadores reportan desde sus teléfonos, y una pantalla de la tienda puede mostrar emparejamientos, el reloj y la clasificación.\n\nComentarios\n• Envía comentarios desde la app y consulta las respuestas, con avisos opcionales.\n\nAdemás, juego cercano más rápido y muchas correcciones.",
  },
} satisfies LocaleNamespace
