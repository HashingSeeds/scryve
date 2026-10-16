// why: shared game modules call the app's translate(), whose setup loads React Native; the site is English-only, so astro.config.mjs points those imports here.
import i18n, { type TOptions } from "i18next"

import en from "@/i18n/en"
import type { TxKeyPath } from "@/i18n"

const site = i18n.createInstance()
void site.init({
  lng: "en",
  resources: { en },
  interpolation: { escapeValue: false },
  initImmediate: false,
})

export function translate(key: TxKeyPath, options?: TOptions): string {
  return site.t(key, options)
}
