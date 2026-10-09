import i18n from "i18next"
import type { TOptions } from "i18next"

import { TxKeyPath } from "."

export function translate(key: TxKeyPath, options?: TOptions): string {
  if (i18n.isInitialized) {
    return i18n.t(key, options)
  }
  return key
}
