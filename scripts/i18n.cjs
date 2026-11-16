const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { readSecret } = require("./secrets.cjs")

const ROOT = path.resolve(__dirname, "..")
const I18N_DIR = path.join(ROOT, "src/i18n")
const LOCKS_DIR = path.join(I18N_DIR, "locks")
const SOURCE_LOCALE = "en"
const MODEL = "claude-sonnet-5-5"
const USD_PER_MILLION_TOKENS = { input: 2, output: 10 }
const UNITS_PER_REQUEST = 100

const LOCALES = {
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
}

const GLOSSARY_PATH = path.join(I18N_DIR, "glossary.json")
const SYSTEMS_PATH = path.join(ROOT, "convex/lib/systems/definitions.ts")
const KEPT_NAMES = [
  "Scryve",
  "Scryve Pro",
  "Foil",
  "Foil Supporter",
  "Scryfall",
  "YGOPRODeck",
  "TCGdex",
  "Limitless",
  "YDKE",
  "Fabrary",
  "MTGO",
  "Pokémon TCG Live",
  "Apple",
  "App Store",
  "iPhone",
  "iPad",
  "iOS",
  "Google",
  "Google Play",
  "Android",
  "Wi-Fi",
  "RevenueCat",
  "Sentry",
  "PostHog",
  "Convex",
  "YDKe",
  "Shift",
  "SoS",
]

const NOTE_LOCALE = /^([a-z]{2,3}): (.*)$/s
const PLURAL_SUFFIX = /^(.*)_(zero|one|two|few|many|other)$/
const PLACEHOLDER = /{{\s*([\w.]+)(?:\s*,\s*\w+)?\s*}}|<\/?([\w-]+)\s*\/?>/g

const LITERAL_TEXT = /{{[^}]*}}|<[^>]*>|https?:\/\/\S+|\S+@\S+|@\w+|「[^」]*」|"[^"]*"|“[^”]*”/g
const LATIN_WORD = /[\p{Script=Latin}\d]+/gu
const LATIN_INSIDE_WORD =
  /[\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Arabic}]\p{Script=Latin}+[\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Arabic}]/u
// why: the English carries these lowercase words into every script ("v2", "vs", "Return to Ravnica").
const LOWERCASE_LATIN_ALLOWED = new Set(["v", "vs", "to"])

const GENERATED_HEADER =
  "// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.\n"

function systemPrompt() {
  const systems = Object.values(loadModule(SYSTEMS_PATH).SYSTEMS)
  const list = (names) => [...new Set(names)].join(", ")
  const games = list(systems.map((system) => system.label))
  return `You translate UI copy for Scryve, a phone life counter for trading card games (${games}).

Rules:
- Keep each string short and natural for a phone screen. Match the English tone: plain, direct, no added enthusiasm.
- Keep every {{placeholder}} exactly as written, including the name inside the braces, and keep every <tag>. Placeholders hold numbers, player names, deck names, or card names.
- Keep these names exactly as written: ${list(KEPT_NAMES)}. Write game, format, variant and card type names the way the glossary says: players should never meet English unless the glossary keeps it. Card names and anything players typed come in placeholders, as they are.
- The request includes language rules and a glossary for the target language. Each glossary entry names an English concept, with what it means, then the term to use for it. Always use those terms, inflected as the grammar needs, and follow the rules.
- Keep ellipsis characters, and keep short labels as compact as the English.
- Never add a digit the English does not have: the app formats every number in the reader's own digits, so numbers come only from placeholders such as {{count}}. A plural form may say its number in words ("one seat", "two seats") instead of {{count}}; the "other" form always keeps {{count}}.
- Write whole words, not single letters: no W/L/D for wins, losses, and draws, and no "m" or "h" for minutes and hours, unless your language truly abbreviates them that way on phone screens.
- Leave the text inside {{ }} exactly as it is: never translate, reorder, or quote it.
- Each entry has a "context" key path that tells you where the string appears. Use it as context; never translate it.
- Some entries have a "note" from the English author about meaning or where the string appears. Follow it; never translate it.
- Each entry lists "slots". Return one translation per slot id. A slot with a "form" is a CLDR plural category: write the grammatically correct form for it, using the English plural forms as reference.

Return a translation for every slot and nothing else.`
}

const OUTPUT_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: {
          type: "object",
          properties: { slot: { type: "string" }, text: { type: "string" } },
          required: ["slot", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["translations"],
    additionalProperties: false,
  },
}

function flatten(tree, prefix = "") {
  return Object.entries(tree).reduce((flat, [key, value]) => {
    const keyPath = prefix ? `${prefix}.${key}` : key
    return typeof value === "string"
      ? { ...flat, [keyPath]: value }
      : { ...flat, ...flatten(value, keyPath) }
  }, {})
}

function unflatten(flat) {
  const tree = {}
  for (const [keyPath, value] of Object.entries(flat)) {
    const segments = keyPath.split(".")
    const leaf = segments.pop()
    let node = tree
    for (const segment of segments) node = node[segment] ??= {}
    node[leaf] = value
  }
  return tree
}

function prototypeKeys(flat) {
  return Object.keys(flat).filter((keyPath) =>
    keyPath.split(".").some((segment) => segment in Object.prototype),
  )
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12)
}

function englishNotes(source) {
  const ts = require("typescript")
  const file = ts.createSourceFile("notes.ts", source, ts.ScriptTarget.Latest, true)
  const notes = {}
  const commentText = (range) =>
    source
      .slice(range.pos, range.end)
      .replace(/^\/\/\s?|^\/\*+|\*+\/$|^\s*\*\s?/gm, "")
      .replace(/\s+/g, " ")
      .trim()
  const visit = (object, prefix, inherited) => {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) continue
      const keyPath = prefix ? `${prefix}.${property.name.text}` : property.name.text
      const own = (ts.getLeadingCommentRanges(source, property.getFullStart()) ?? []).map(
        (range) => {
          const text = commentText(range)
          const scoped = NOTE_LOCALE.exec(text)
          return scoped ? { locale: scoped[1], text: scoped[2] } : { text }
        },
      )
      const note = [...inherited, ...own]
      if (ts.isObjectLiteralExpression(property.initializer))
        visit(property.initializer, keyPath, note)
      else if (note.length) notes[keyPath] = note
    }
  }
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const { initializer } of statement.declarationList.declarations)
      if (initializer && ts.isObjectLiteralExpression(initializer)) visit(initializer, "", [])
  }
  return notes
}

function translationUnits(englishFlat, notes = {}) {
  const units = new Map()
  for (const [key, text] of Object.entries(englishFlat)) {
    const match = PLURAL_SUFFIX.exec(key)
    const isPlural = match && `${match[1]}_other` in englishFlat
    const id = isPlural ? match[1] : key
    const unit = units.get(id) ?? { id, plural: Boolean(isPlural), english: {}, notes: [] }
    unit.english[key] = text
    if (Object.hasOwn(notes, key)) unit.notes.push(notes[key])
    units.set(id, unit)
  }
  for (const unit of units.values()) unit.note = noteFor(unit)
  return units
}

function noteFor(unit, locale) {
  const keyNotes = unit.notes.map((parts) =>
    parts
      .filter((part) => !part.locale || part.locale === locale)
      .map((part) => part.text)
      .join(" "),
  )
  return [...new Set(keyNotes.filter(Boolean))].join(" ") || undefined
}

const wordPatterns = new Map()

function mentions(text, word) {
  if (!wordPatterns.has(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    wordPatterns.set(
      word,
      new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:s|es|d|ed|ing)?(?![\\p{L}\\p{N}])`, "iu"),
    )
  }
  return wordPatterns.get(word).test(text)
}

function unitText(unit) {
  return [...Object.values(unit.english), unit.note ?? ""].join("\n")
}

function unitConcepts(unit, glossary) {
  const text = unitText(unit)
  return Object.keys(glossary.terms).filter((concept) =>
    glossary.terms[concept].en.some((word) => mentions(text, word)),
  )
}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value)
const isTextList = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "string" && item.trim())

function glossaryProblems(glossary, units, locales = Object.keys(LOCALES)) {
  if (!isObject(glossary?.rules) || !isObject(glossary?.terms))
    return ["glossary: needs a rules object and a terms object"]
  const texts = units.map(unitText)
  const problems = []
  for (const key of Object.keys(glossary))
    if (key !== "rules" && key !== "terms")
      problems.push(`glossary: ${key} belongs under rules or inside a term`)
  for (const locale of locales)
    if (!isTextList(glossary.rules[locale]))
      problems.push(`glossary: rules for ${locale} must be a list of rules`)
  for (const key of Object.keys(glossary.rules))
    if (!locales.includes(key))
      problems.push(`glossary: rules has ${key}, which is not a translated language`)
  for (const [concept, term] of Object.entries(glossary.terms)) {
    if (!isObject(term)) {
      problems.push(`glossary: "${concept}" must be an object`)
      continue
    }
    if (!isTextList(term.en)) problems.push(`glossary: "${concept}" lists no English words in en`)
    else
      for (const word of term.en)
        if (!texts.some((text) => mentions(text, word)))
          problems.push(`glossary: "${concept}" lists "${word}", which no English string uses`)
    for (const locale of locales)
      if (typeof term[locale] !== "string" || !term[locale].trim())
        problems.push(
          `glossary: "${concept}" has no ${locale} term; write what the ${locale} translations already use`,
        )
    for (const key of Object.keys(term))
      if (key !== "en" && !locales.includes(key))
        problems.push(`glossary: "${concept}" has ${key}, which is not a translated language`)
  }
  return problems
}

function sourceHash(unit, locale, glossary) {
  const terms = unitConcepts(unit, glossary).map((concept) => [
    concept,
    glossary.terms[concept][locale],
  ])
  return hashText(
    JSON.stringify([unit.english, noteFor(unit, locale), glossary.rules[locale], terms]),
  )
}

function translationHash(unit, localeFlat, locale) {
  return hashText(JSON.stringify(requiredKeys(unit, locale).map((key) => localeFlat[key])))
}

function lockEntry(unit, localeFlat, locale, glossary) {
  return `${sourceHash(unit, locale, glossary)}.${translationHash(unit, localeFlat, locale)}`
}

function namespaceUnits(english, namespace) {
  const source = fs.readFileSync(path.join(I18N_DIR, SOURCE_LOCALE, `${namespace}.ts`), "utf8")
  return translationUnits(flatten(english[namespace]), englishNotes(source))
}

function pluralCategories(locale) {
  return new Intl.PluralRules(locale).resolvedOptions().pluralCategories
}

function requiredKeys(unit, locale) {
  if (!unit.plural) return [unit.id]
  return pluralCategories(locale).map((category) => `${unit.id}_${category}`)
}

function staleUnits({ units, lock, localeFlat, locale, glossary }) {
  return [...units.values()].filter(
    (unit) =>
      lock[unit.id]?.split(".")[0] !== sourceHash(unit, locale, glossary) ||
      validateUnit(unit, localeFlat, locale, glossary).length > 0,
  )
}

function editedUnits({ units, lock, localeFlat, locale, glossary }) {
  return [...units.values()].filter((unit) => {
    const [source, translation] = lock[unit.id]?.split(".") ?? []
    return (
      source === sourceHash(unit, locale, glossary) &&
      translation !== translationHash(unit, localeFlat, locale)
    )
  })
}

function orphanKeys({ units, localeFlat, locale }) {
  const valid = new Set([...units.values()].flatMap((unit) => requiredKeys(unit, locale)))
  return Object.keys(localeFlat).filter((key) => !valid.has(key))
}

function placeholders(text) {
  return new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[0].replace(/\s+/g, "")))
}

const DIGIT_RUN = /\p{Nd}+/gu

// why: Unicode lays each script's digits 0 to 9 in a row, so a digit's value is its distance from that row's zero.
function digitValue(char) {
  let zero = char.codePointAt(0)
  while (/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero -= 1
  return (char.codePointAt(0) - zero) % 10
}

function numbersIn(text) {
  return (text.replace(LITERAL_TEXT, " ").match(DIGIT_RUN) ?? []).map((run) =>
    [...run].map(digitValue).join(""),
  )
}

// why: the app writes numbers in the phone region's digits (Arabic-Indic in Saudi Arabia), so a digit typed into the copy would stand out in Latin.
function writesOwnDigits(locale) {
  const { language, region } = new Intl.Locale(locale).maximize()
  return new Intl.NumberFormat(`${language}-${region}`).resolvedOptions().numberingSystem !== "latn"
}

const exactPluralForms = new Map()

function exactForms(locale) {
  if (!exactPluralForms.has(locale)) {
    const rules = new Intl.PluralRules(locale)
    const counts = new Map()
    for (let number = 0; number <= 1000; number++) {
      const category = rules.select(number)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    const exact = [...counts].filter(([, count]) => count === 1).map(([category]) => category)
    exactPluralForms.set(locale, new Set(exact))
  }
  return exactPluralForms.get(locale)
}

function mayDropCount(unit, key, locale) {
  if (!unit.plural) return false
  return exactForms(locale).has(key.slice(unit.id.length + 1))
}

const ENGLISH_DIGIT_TOKENS =
  /\bd(?:4|6|8|10|12|20|100)\b|\bp(?:50|90|99)\b|\b2v2\b|\b2HG\b|\b8th Edition\b|\b1st\b|\b3 Ash Blossom\b/g

function handBuiltSigns(key, text) {
  return (text.match(/[+−-]{{|}}\s?%/g) ?? []).map(
    (sign) =>
      `${key}: "${sign}" builds a sign or percent by hand; use {{x, signed}} or {{x, percent}}`,
  )
}

function englishProblems(key, text) {
  const digits = numbersIn(text.replace(ENGLISH_DIGIT_TOKENS, " "))
  return [
    ...digits.map((number) => `${key}: has the number ${number}; pass it as a placeholder`),
    ...handBuiltSigns(key, text),
  ]
}

const keptLatinCache = new WeakMap()

function keptLatin(locale, glossary) {
  const byLocale = keptLatinCache.get(glossary) ?? new Map()
  keptLatinCache.set(glossary, byLocale)
  if (!byLocale.has(locale)) {
    const sameName = Object.values(glossary.terms).flatMap((term) =>
      String(term[locale] ?? "")
        .split(";")
        .map((entry) => entry.split(":").map((side) => side.trim()))
        .filter(([english, local]) => local === english || local?.startsWith(`${english} (`))
        .map(([english]) => english),
    )
    byLocale.set(
      locale,
      new Set([...KEPT_NAMES, ...sameName].flatMap((name) => name.match(LATIN_WORD) ?? [])),
    )
  }
  return byLocale.get(locale)
}

function validateUnit(unit, translatedFlat, locale, glossary) {
  const englishTexts = Object.values(unit.english)
  const kept =
    glossary &&
    new Set([
      ...keptLatin(locale, glossary),
      ...(/parser input/i.test(unit.note ?? "")
        ? englishTexts.flatMap((text) => text.match(LATIN_WORD) ?? [])
        : []),
    ])
  const english = new Set(englishTexts.flatMap((text) => [...placeholders(text)]))
  const englishNumbers = new Set(englishTexts.flatMap(numbersIn))
  return requiredKeys(unit, locale).flatMap((key) => {
    const text = translatedFlat[key]
    if (typeof text !== "string" || !text.trim()) return [`${key}: missing translation`]
    const found = placeholders(text)
    const required = [...english].filter(
      (token) => token !== "{{count}}" || !mayDropCount(unit, key, locale),
    )
    const missing = required.filter((token) => !found.has(token))
    const unknown = [...found].filter((token) => !english.has(token))
    const typedNumbers = writesOwnDigits(locale)
      ? numbersIn(text).filter((number) => !englishNumbers.has(number))
      : []
    return [
      ...missing.map((token) => `${key}: dropped ${token}`),
      ...unknown.map((token) => `${key}: introduced ${token}`),
      ...typedNumbers.map((number) => `${key}: typed the number ${number}; use a placeholder`),
      ...handBuiltSigns(key, text),
      ...((text.match(/"/g) ?? []).length % 2 ? [`${key}: has an unmatched quote`] : []),
      ...scriptProblems(text, locale, kept).map((problem) => `${key}: ${problem}`),
    ]
  })
}

function scriptProblems(text, locale, kept) {
  if (new Intl.Locale(locale).maximize().script === "Latn") return []
  const stray = (text.replace(LITERAL_TEXT, " ").match(LATIN_WORD) ?? []).filter(
    (word) =>
      (/^\p{Ll}+$/u.test(word) && !LOWERCASE_LATIN_ALLOWED.has(word)) ||
      (kept !== undefined && /^\p{Lu}.*\p{Ll}/u.test(word) && !kept.has(word)),
  )
  return [
    ...stray.map((word) => `left "${word}" in Latin script`),
    ...(LATIN_INSIDE_WORD.test(text) ? ["has Latin letters inside a word"] : []),
  ]
}

function orderLikeEnglish(units, localeFlat, locale) {
  const ordered = {}
  for (const unit of units.values()) {
    for (const key of requiredKeys(unit, locale)) {
      if (typeof localeFlat[key] === "string") ordered[key] = localeFlat[key]
    }
  }
  return ordered
}

function namespacePath(locale, namespace) {
  return path.join(I18N_DIR, locale, `${namespace}.ts`)
}

function lockPath(locale, namespace) {
  return path.join(LOCKS_DIR, locale, `${namespace}.json`)
}

function loadSources(english) {
  const glossary = readJson(GLOSSARY_PATH, {})
  const unitsByNamespace = new Map(
    Object.keys(english).map((namespace) => [namespace, namespaceUnits(english, namespace)]),
  )
  const units = [...unitsByNamespace.values()].flatMap((entries) => [...entries.values()])
  return { glossary, unitsByNamespace, glossaryIssues: glossaryProblems(glossary, units) }
}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback
}

function loadModule(file) {
  const { require: tsxRequire } = require("tsx/cjs/api")
  return tsxRequire(file, __filename)
}

function loadTs(file) {
  if (!fs.existsSync(file)) return undefined
  return loadModule(file).default
}

function loadEnglish() {
  return loadTs(path.join(I18N_DIR, SOURCE_LOCALE, "index.ts"))
}

function namespaceSource(tree) {
  return `${GENERATED_HEADER}import type { LocaleNamespace } from "../localeNamespace"\n\nexport default ${JSON.stringify(tree, null, 2)} satisfies LocaleNamespace\n`
}

function localeIndexSource(namespaces) {
  const imports = namespaces.map((namespace) => `import ${namespace} from "./${namespace}"`)
  return `${GENERATED_HEADER}${imports.join("\n")}\n\nexport default { ${namespaces.join(", ")} }\n`
}

function resourcesSource(locales, namespaces, { web }) {
  const english = `${SOURCE_LOCALE}: (): typeof import("./${SOURCE_LOCALE}").default => require("./${SOURCE_LOCALE}").default`
  const loaders = locales.map((locale) => {
    const file = `./${locale}/language`
    return web
      ? `${locale}: (): Promise<typeof import("${file}").default> => import("${file}").then((bundle) => bundle.default)`
      : `${locale}: (): typeof import("${file}").default => require("${file}").default`
  })
  return `${GENERATED_HEADER}\nexport const namespaces = ${JSON.stringify(namespaces)}\n\nexport const resources = { ${[english, ...loaders].join(", ")} }\n`
}

function scaffoldFiles(namespaces) {
  const locales = Object.keys(LOCALES)
  return [
    [path.join(I18N_DIR, "resources.ts"), resourcesSource(locales, namespaces, { web: false })],
    [path.join(I18N_DIR, "resources.web.ts"), resourcesSource(locales, namespaces, { web: true })],
    ...locales.map((locale) => [
      path.join(I18N_DIR, locale, "language.ts"),
      localeIndexSource(namespaces),
    ]),
  ]
}

async function formatTs(file, source) {
  const prettier = require("prettier")
  const config = await prettier.resolveConfig(file)
  return prettier.format(source, { ...config, filepath: file })
}

async function writeTs(file, source) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, await formatTs(file, source))
}

async function check() {
  const english = loadEnglish()
  const namespaces = Object.keys(english)
  const problems = []

  for (const [file, source] of scaffoldFiles(namespaces)) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined
    if (current !== (await formatTs(file, source)))
      problems.push(`${path.relative(ROOT, file)}: out of date`)
  }

  const { glossary, unitsByNamespace, glossaryIssues } = loadSources(english)
  problems.push(...glossaryIssues)

  for (const [namespace, units] of unitsByNamespace) {
    const englishFlat = flatten(english[namespace])
    for (const key of prototypeKeys(englishFlat))
      problems.push(`en/${namespace}: ${key} shadows a built-in object property; rename it`)
    for (const [key, text] of Object.entries(englishFlat))
      for (const problem of englishProblems(key, text)) problems.push(`en/${namespace}: ${problem}`)
    for (const unit of units.values())
      for (const part of unit.notes.flat())
        if (part.locale && !Object.hasOwn(LOCALES, part.locale))
          problems.push(
            `en/${namespace}: ${unit.id} has a note for ${part.locale}, which is not a translated language`,
          )
    for (const locale of Object.keys(LOCALES)) {
      const localeFlat = flatten(loadTs(namespacePath(locale, namespace)) ?? {})
      for (const unit of units.values())
        for (const problem of validateUnit(unit, localeFlat, locale, glossary))
          problems.push(`${locale}/${namespace}: ${problem}`)
      for (const key of orphanKeys({ units, localeFlat, locale }))
        problems.push(`${locale}/${namespace}: ${key} no longer exists in English`)
      if (glossaryIssues.length) continue
      const lock = readJson(lockPath(locale, namespace), {})
      for (const unit of units.values())
        if (lock[unit.id]?.split(".")[0] !== sourceHash(unit, locale, glossary))
          problems.push(`${locale}/${namespace}: ${unit.id} needs translation`)
      for (const unit of editedUnits({ units, lock, localeFlat, locale, glossary }))
        problems.push(
          `${locale}/${namespace}: ${unit.id} was edited by hand, and the next translate overwrites it. Put the fix in src/i18n/glossary.json, or in a note above the English key (start it with "${locale}: " to change only this language).`,
        )
    }
  }

  if (problems.length === 0) {
    console.log("Translations are up to date.")
    return
  }
  console.error(problems.join("\n"))
  console.error(
    `\n${problems.length} problem(s). Fix each at its source (AGENTS.md, Languages), then run \`pnpm i18n:translate\`.`,
  )
  process.exitCode = 1
}

const ANTHROPIC_API_HOST = "api.anthropic.com"

/** why: ai-pool rejects Console keys and Anthropic rejects the pool's key, so each key goes only to the host that accepts it. Keys are read lazily so an unreadable file the choice does not need cannot block one that works. */
function chooseApiKey({ apiKey, baseUrl, readPoolKey, readConsoleKey }) {
  if (apiKey) return apiKey
  const throughPool = Boolean(baseUrl) && new URL(baseUrl).host !== ANTHROPIC_API_HOST
  return (throughPool && readPoolKey()) || readConsoleKey()
}

function readIfPresent(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined
}

function loadApiKey() {
  const apiKey = chooseApiKey({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    readPoolKey: () => readIfPresent(path.join(os.homedir(), ".config/ai-pool/key"))?.trim(),
    readConsoleKey: () => readSecret("ANTHROPIC_API_KEY"),
  })
  if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey
}

function requestPayload(units, namespace, locale) {
  const slotKeys = new Map()
  const entries = units.map((unit) => ({
    context: `${namespace}:${unit.id}`,
    ...(noteFor(unit, locale) ? { note: noteFor(unit, locale) } : {}),
    english: unit.plural
      ? Object.fromEntries(
          Object.entries(unit.english).map(([key, text]) => [key.slice(unit.id.length + 1), text]),
        )
      : unit.english[unit.id],
    slots: requiredKeys(unit, locale).map((key) => {
      const slot = String(slotKeys.size)
      slotKeys.set(slot, key)
      return unit.plural ? { slot, form: key.slice(unit.id.length + 1) } : { slot }
    }),
  }))
  return { entries, slotKeys }
}

const usage = { input: 0, output: 0 }

function usageSummary() {
  const cost =
    (usage.input * USD_PER_MILLION_TOKENS.input + usage.output * USD_PER_MILLION_TOKENS.output) /
    1_000_000
  return `${usage.input} input + ${usage.output} output tokens, about $${cost.toFixed(2)}`
}

function glossaryText(locale, units, glossary) {
  const concepts = new Set(units.flatMap((unit) => unitConcepts(unit, glossary)))
  return [
    `Rules for ${locale}:\n${glossary.rules[locale].map((rule) => `- ${rule}`).join("\n")}`,
    ...(concepts.size
      ? [
          `Glossary for ${locale}:\n${[...concepts]
            .map((concept) => `- ${concept}: ${glossary.terms[concept][locale]}`)
            .join("\n")}`,
        ]
      : []),
  ].join("\n\n")
}

async function requestTranslations(client, { units, namespace, locale, glossary, feedback }) {
  const payload = requestPayload(units, namespace, locale)
  const request = [
    `Translate into ${LOCALES[locale]} (${locale}).`,
    glossaryText(locale, units, glossary),
    JSON.stringify(payload.entries),
    ...(feedback.length
      ? [`Your previous answer had problems; fix them:\n${feedback.join("\n")}`]
      : []),
  ].join("\n\n")

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: OUTPUT_FORMAT },
    system: systemPrompt(),
    messages: [{ role: "user", content: request }],
  })
  usage.input += response.usage.input_tokens
  usage.output += response.usage.output_tokens

  if (response.stop_reason === "refusal")
    throw new Error(
      `${locale}/${namespace}: the model declined (${response.stop_details?.category})`,
    )
  if (response.stop_reason === "max_tokens")
    throw new Error(`${locale}/${namespace}: response was cut off; lower UNITS_PER_REQUEST`)

  const text = response.content.find((block) => block.type === "text")?.text ?? "{}"
  const { translations } = JSON.parse(text)
  return Object.fromEntries(
    translations.flatMap(({ slot, text }) =>
      payload.slotKeys.has(slot) ? [[payload.slotKeys.get(slot), text]] : [],
    ),
  )
}

async function translateUnits(client, { units, namespace, locale, glossary }) {
  let feedback = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const translated = await requestTranslations(client, {
      units,
      namespace,
      locale,
      glossary,
      feedback,
    })
    feedback = units.flatMap((unit) => validateUnit(unit, translated, locale, glossary))
    if (feedback.length === 0) return translated
  }
  throw new Error(`${locale}/${namespace}: invalid translations\n${feedback.join("\n")}`)
}

function chunk(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
}

function parseArgs(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const match = flag("--match")
  return { onlyNamespace: flag("--ns"), retranslate: match ? new RegExp(match) : undefined }
}

async function translate({ onlyNamespace, retranslate }) {
  loadApiKey()
  const { default: Anthropic } = require("@anthropic-ai/sdk")
  const client = new Anthropic()
  const english = loadEnglish()
  const namespaces = Object.keys(english)
  if (onlyNamespace && !namespaces.includes(onlyNamespace))
    throw new Error(`Unknown namespace "${onlyNamespace}". Known: ${namespaces.join(", ")}`)

  const { glossary, unitsByNamespace, glossaryIssues } = loadSources(english)
  if (glossaryIssues.length)
    throw new Error(`Fix the glossary first:\n${glossaryIssues.join("\n")}`)

  for (const [file, source] of scaffoldFiles(namespaces)) await writeTs(file, source)

  for (const namespace of namespaces.filter((ns) => !onlyNamespace || ns === onlyNamespace)) {
    const units = unitsByNamespace.get(namespace)

    await Promise.all(
      Object.keys(LOCALES).map(async (locale) => {
        const file = namespacePath(locale, namespace)
        const lock = readJson(lockPath(locale, namespace), {})
        const localeFlat = flatten(loadTs(file) ?? {})
        const state = { units, lock, localeFlat, locale, glossary }
        const edited = new Set(editedUnits(state))
        const outdated = new Set(staleUnits(state))
        for (const unit of edited)
          console.warn(
            `${locale}/${namespace}: ${unit.id} was edited by hand; retranslating it. Put the fix in src/i18n/glossary.json, or in a note above the English key (start it with "${locale}: " to change only this language).`,
          )
        const stale = [...units.values()].filter(
          (unit) =>
            outdated.has(unit) ||
            edited.has(unit) ||
            Object.values(unit.english).some((text) => retranslate?.test(text)),
        )
        for (const batch of chunk(stale, UNITS_PER_REQUEST)) {
          Object.assign(
            localeFlat,
            await translateUnits(client, { units: batch, namespace, locale, glossary }),
          )
        }
        const ordered = orderLikeEnglish(units, localeFlat, locale)
        await writeTs(file, namespaceSource(unflatten(ordered)))
        const nextLock = Object.fromEntries(
          [...units.values()].map((unit) => [unit.id, lockEntry(unit, ordered, locale, glossary)]),
        )
        fs.mkdirSync(path.dirname(lockPath(locale, namespace)), { recursive: true })
        fs.writeFileSync(lockPath(locale, namespace), `${JSON.stringify(nextLock, null, 2)}\n`)
        if (stale.length) console.log(`${locale}/${namespace}: translated ${stale.length} key(s)`)
      }),
    )
  }
  console.log(`Used ${usageSummary()}.`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === "check") return check()
  if (command === "translate") return translate(parseArgs(rest))
  console.error(
    "Usage: node scripts/i18n.cjs <check|translate> [--ns <namespace>] [--match <regex>]",
  )
  process.exitCode = 1
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = {
  chooseApiKey,
  loadApiKey,
  englishNotes,
  flatten,
  prototypeKeys,
  unflatten,
  translationUnits,
  requiredKeys,
  staleUnits,
  editedUnits,
  lockEntry,
  noteFor,
  glossaryProblems,
  glossaryText,
  unitConcepts,
  orphanKeys,
  validateUnit,
  englishProblems,
}
