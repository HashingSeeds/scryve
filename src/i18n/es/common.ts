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
  },
  appNavigation: {
    decks: "Mazos",
    returnToGame: "Volver a la partida",
    play: "Jugar",
    backToLobby: "Volver a la sala",
  },
  confirmDialog: {
    cancelAction: "Cancelar {{action}}",
  },
  retryableError: {
    retryingIn: "Reintentando en {{seconds}} s",
  },
  selectField: {
    none: "Ninguno",
    triggerLabel: "{{label}}, {{value}}",
    openHint: "Abre las opciones de {{label}}",
    closeLabel: "Cerrar opciones de {{label}}",
  },
  valueField: {
    readoutLabel: "{{label}}, {{value}}",
    decrease: "Reducir {{label}} en {{step}}",
    increase: "Aumentar {{label}} en {{step}}",
    longPressHint: "Mantén pulsado para cambiarlo de {{step}} en {{step}}.",
  },
} satisfies LocaleNamespace
