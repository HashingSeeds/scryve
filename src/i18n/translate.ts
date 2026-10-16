import type { TOptions } from "i18next"

import { i18n, type TxKeyPath } from "."

export function translate(key: TxKeyPath, options?: TOptions): string {
  return i18n.t(key, options)
}
