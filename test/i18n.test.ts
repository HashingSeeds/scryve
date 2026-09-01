import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import en from "../src/i18n/en"

const KEYS_ONLY_USED_IN_CODE_COMMENTS = ["hello"]

const EXCEPTIONS: string[] = [...KEYS_ONLY_USED_IN_CODE_COMMENTS]

function iterate(obj: Record<string, unknown>, stack: string, array: string[]): string[] {
  for (const property in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, property)) {
      const value = obj[property]

      if (typeof value === "object" && value !== null) {
        iterate(value as Record<string, unknown>, `${stack}.${property}`, array)
      } else {
        array.push(`${stack.slice(1)}.${property}`)
      }
    }
  }

  return array
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(entryPath)
    return /\.tsx?$/.test(entry.name) ? [entryPath] : []
  })
}

function findTranslationKeys(source: string): string[] {
  const propPattern = /\b\w*[Tt]x\s*=\s*(?:"([^"\s]+)"|{([^}]*)})/g
  const translatePattern = /\btranslate\(\s*"([^"\s]+)"/g
  const propKeys = [...source.matchAll(propPattern)].flatMap((match) => {
    if (match[1]) return [match[1]]
    return [...match[2].matchAll(/"([^"\s]+)"/g)].map((expressionMatch) => expressionMatch[1])
  })

  const translateKeys = [...source.matchAll(translatePattern)].map((match) => match[1])
  return [...propKeys, ...translateKeys]
}

describe("i18n", () => {
  test("finds no missing keys", () => {
    const allTranslationsDefinedOld = iterate(en, "", [])
    // Replace first instance of "." because of i18next namespace separator
    const allTranslationsDefined = allTranslationsDefinedOld.map((key) => key.replace(".", ":"))
    const allTranslationsUsed = listSourceFiles(join(process.cwd(), "src")).flatMap((file) =>
      findTranslationKeys(readFileSync(file, "utf8")),
    )

    expect(allTranslationsUsed.length).toBeGreaterThanOrEqual(50)
    for (const translation of allTranslationsUsed) {
      if (!EXCEPTIONS.includes(translation)) {
        // You can add keys to EXCEPTIONS (above) if you don't want them included in the test
        expect(allTranslationsDefined).toContainEqual(translation)
      }
    }
  })
})
