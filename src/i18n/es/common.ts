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
} satisfies LocaleNamespace
