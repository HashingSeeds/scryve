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
      "• Compra Pro en tu teléfono sin iniciar sesión antes.\n• Pro sigue desbloqueado aunque se corte la conexión.\n• Las esquinas del tablero se adaptan a la pantalla redondeada de tu teléfono.\n• Los avisos de permisos aparecen en tu idioma.\n• Búsqueda de reglas más rápida.\n\nY muchas correcciones más.",
  },
} satisfies LocaleNamespace
