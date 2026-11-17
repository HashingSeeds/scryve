import type { RenderResult } from "@testing-library/react-native"
import type { ReactTestRendererJSON } from "react-test-renderer"

// why: the app's name stays Scryve in every language, so it never passes through a translation.
const PROPER_NAMES = ["Scryve"]

export function visibleTexts(view: RenderResult) {
  const texts: string[] = []
  const visit = (node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null) => {
    if (node === null || typeof node === "string") return
    if (Array.isArray(node)) return node.forEach(visit)
    if (node.type === "Text") {
      const own = (node.children ?? []).filter((child) => typeof child === "string").join("")
      if (own.trim()) texts.push(own)
    }
    node.children?.forEach(visit)
  }
  visit(view.toJSON())
  return texts
}

function withoutNames(text: string, userData: readonly string[]) {
  return [...userData, ...PROPER_NAMES]
    .sort((a, b) => b.length - a.length)
    .reduce((remaining, name) => remaining.split(name).join(" "), text)
}

function withoutTranslations(text: string) {
  let rest = text
  for (let previous = ""; previous !== rest;) {
    previous = rest
    rest = rest.replace(/\u27e6[^\u27e6\u27e7]*\u27e7/g, " ")
  }
  return rest
}

/** why: under the en-XA pseudo-locale, translations are bracketed and formatted digits are Arabic-Indic, so an ASCII digit anywhere, even inside a translation, or an unbracketed word on screen skipped i18n. */
export function localeProblems(view: RenderResult, userData: readonly string[]) {
  return visibleTexts(view).flatMap((text) => {
    const shown = withoutNames(text, userData)
    return [
      ...(/[0-9]/.test(shown) ? [`unformatted number: ${text}`] : []),
      ...(/\p{L}/u.test(withoutTranslations(shown)) ? [`skipped i18n: ${text}`] : []),
    ]
  })
}
