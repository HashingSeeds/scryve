import en, { type Translations } from "./en"

const es: Translations = {
  localGame: en.localGame,
  common: {
    ok: "OK",
    cancel: "Cancelar",
    back: "Volver",
  },
  landingScreen: {
    eyebrow: "Contador de vidas",
    title: "Cada punto. Cada jugador. Un tablero claro.",
    subtitle:
      "Empiecen juntos en un dispositivo o conecten toda la mesa cuando llegue el juego en línea.",
    quickLocalGame: "Partida local rápida",
    quickLocalGameHint: "No requiere cuenta ni conexión.",
    quickLocalGameAccessibilityHint:
      "Inicia una partida en este dispositivo. Disponible en la próxima fase del producto.",
    joinConnectedGame: "Unirse a una partida conectada",
    joinConnectedGameAccessibilityHint:
      "Únete a una partida compartida entre dispositivos. Próximamente.",
    signIn: "Iniciar sesión",
    signInAccessibilityHint: "Inicia sesión para jugar en línea. Próximamente.",
    status:
      "La base del producto está lista. La configuración y el juego conectado llegarán después.",
    comingSoonTitle: "Próximamente",
    comingSoonMessage:
      "Esta entrada está lista para la siguiente fase de implementación de Scryve.",
    dismissComingSoon: "Entendido",
  },
  errorScreen: {
    title: "Algo salió mal",
    friendlySubtitle:
      "Scryve encontró un error inesperado. Reinicia la app para volver a un estado limpio. Si el problema continúa, reinicia el cliente de desarrollo.",
    reset: "Reiniciar app",
  },
  emptyStateComponent: {
    generic: {
      heading: "Todavía no hay nada",
      content: "No se encontraron datos. Intenta actualizar o recargar la app.",
      button: "Intentar de nuevo",
    },
  },
}

export default es
