// why: the app's formatter reads the device locale through expo-localization, which loads React
// Native; the site is English-only, so astro.config.mjs points shared modules' imports here.
// Only what those modules use on the site is here: a dice roll's number and a list of names.
export function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value)
}

export function formatConjunction(parts: readonly string[]) {
  return new Intl.ListFormat("en", { type: "conjunction" }).format(parts.filter(Boolean))
}
