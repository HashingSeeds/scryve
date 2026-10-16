// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  back: "Atrás",
  cancel: "Cancelar",
  close: "Cerrar",
  delete: "Eliminar",
  done: "Listo",
  edit: "Editar",
  remove: "Quitar",
  retry: "Reintentar",
  save: "Guardar",
  tryAgain: "Intentar de nuevo",
  undo: "Deshacer",
  emptyState: {
    heading: "Aún no hay nada aquí",
    content: "No se encontraron datos. Prueba a actualizar o a reiniciar la app.",
  },
  appMenu: {
    more: "Más",
    moreUpdateReady: "Más, actualización lista",
    settings: "Ajustes",
    settingsUpdateReady: "Ajustes, actualización lista",
    account: "Cuenta",
    signIn: "Iniciar sesión",
    closeMenu: "Cerrar menú de utilidades",
    nearbyOnlyOn: "Solo cercana: activado",
    nearbyOnlyOff: "Solo cercana: desactivado",
  },
  appNavigation: {
    decks: "Mazos",
    returnToGame: "Volver a la partida",
    play: "Jugar",
    backToLobby: "Volver a la sala",
  },
  retryableError: {
    retryingIn: "Reintentando en {{seconds}} s",
  },
  selectField: {
    none: "Ninguno",
    triggerLabel: "{{label}}, {{value}}",
    openHint: {
      format: "Abre las opciones de formato",
      commanderColor: "Abre las opciones de color del comandante",
      addTo: "Abre las opciones de «Sumar a»",
      changeBy: "Abre las opciones de «Cambiar en»",
      thisIsMe: "Abre las opciones de «Este soy yo»",
      yourDeck: "Abre las opciones de «Tu mazo»",
      system: "Abre las opciones de sistema",
    },
    closeLabel: {
      format: "Cerrar opciones de formato",
      commanderColor: "Cerrar opciones de color del comandante",
      addTo: "Cerrar opciones de «Sumar a»",
      changeBy: "Cerrar opciones de «Cambiar en»",
      thisIsMe: "Cerrar opciones de «Este soy yo»",
      yourDeck: "Cerrar opciones de «Tu mazo»",
      system: "Cerrar opciones de sistema",
    },
  },
  valueField: {
    readoutLabel: "{{label}}, {{value}}",
    decrease: "Reducir {{label}} en {{step}}",
    increase: "Aumentar {{label}} en {{step}}",
    longPressHint: "Mantén pulsado para cambiarlo de {{step}} en {{step}}.",
  },
} satisfies LocaleNamespace
