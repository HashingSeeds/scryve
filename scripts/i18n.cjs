const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const util = require("node:util")

const ROOT = path.resolve(__dirname, "..")
const I18N_DIR = path.join(ROOT, "src/i18n")
const LOCKS_DIR = path.join(I18N_DIR, "locks")
const SOURCE_LOCALE = "en"
const MODEL = "claude-sonnet-5-5"
const USD_PER_MILLION_TOKENS = { input: 2, output: 10 }
const UNITS_PER_REQUEST = 100

const LOCALES = {
  es: "Spanish (neutral, natural for both Spain and Latin America)",
  fr: "French",
  hi: "Hindi (Devanagari script)",
  ja: "Japanese",
  ko: "Korean",
}

// why: without fixed terms the model mixed translated and English game terms within one language.
const GAME_TERMS = {
  es: {
    life: "vidas",
    lifePoints: "Puntos de Vida",
    prizeCards: "cartas de Premio",
    lore: "leyenda",
  },
  fr: {
    life: "points de vie",
    lifePoints: "Life Points",
    prizeCards: "cartes Récompense",
    lore: "Lore",
  },
  hi: { life: "लाइफ़", lifePoints: "लाइफ़ पॉइंट", prizeCards: "प्राइज़ कार्ड", lore: "लोर" },
  ja: { life: "ライフ", lifePoints: "ライフポイント", prizeCards: "サイド", lore: "ロア" },
  ko: { life: "라이프", lifePoints: "라이프 포인트", prizeCards: "사이드 카드", lore: "로어" },
}

const PLURAL_SUFFIX = /^(.*)_(zero|one|two|few|many|other)$/
const PLACEHOLDER = /{{\s*([\w.]+)\s*}}|<\/?([\w-]+)\s*\/?>/g

const GENERATED_HEADER =
  "// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.\n"

const SYSTEM_PROMPT = `You translate UI copy for Scryve, a phone life counter for trading card games (Magic: The Gathering, Yu-Gi-Oh!, Pokémon TCG, Disney Lorcana).

Rules:
- Keep each string short and natural for a phone screen. Match the English tone: plain, direct, no added enthusiasm.
- Keep every {{placeholder}} exactly as written, including the name inside the braces, and keep every <tag>. Placeholders hold numbers, player names, deck names, or card names.
- Never translate these names: Scryve, Scryve Pro, Foil, Foil Supporter, Magic: The Gathering, Magic, Yu-Gi-Oh!, Pokémon, Pokémon TCG, Disney Lorcana, Lorcana, Scryfall, YGOPRODeck, TCGdex, Limitless, YDKE, and format names (Commander, Standard, Pioneer, Modern, Legacy, Vintage, Pauper, Brawl, Limited, Constructed, Advanced, Traditional, Rush Duel, Core Constructed, Infinity Constructed).
- Use the publisher's official localized term where one exists: poison counters, commander damage, commander tax, the Monarch, the Initiative, HP. The request lists fixed terms for life (Magic), Life Points (Yu-Gi-Oh!), Prize cards (Pokémon) and lore (Lorcana); always use exactly those, inflected as the grammar needs.
- In French, a counted amount of Lorcana lore is "éclats de Lore" ("20 éclats de Lore"); use "Lore" alone when nothing is counted.
- Product vocabulary, translate consistently: "local game" is a game on one shared device; "connected game" is players on their own phones; "cloud" means synced through Scryve's servers; "nearby" means phones on the same Wi-Fi; "seat" is a player's place at the table; "host" is the player who created a connected game.
- Keep the " · " separator, ellipsis characters, and abbreviations like "5m ago" equally compact.
- Each entry has a "context" key path that tells you where the string appears. Use it as context; never translate it.
- Each entry lists "slots". Return one translation per slot id. A slot with a "form" is a CLDR plural category: write the grammatically correct form for it, using the English plural forms as reference.

Return a translation for every slot and nothing else.`

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

function translationUnits(englishFlat) {
  const units = new Map()
  for (const [key, text] of Object.entries(englishFlat)) {
    const match = PLURAL_SUFFIX.exec(key)
    const isPlural = match && `${match[1]}_other` in englishFlat
    const id = isPlural ? match[1] : key
    const unit = units.get(id) ?? { id, plural: Boolean(isPlural), english: {} }
    unit.english[key] = text
    units.set(id, unit)
  }
  for (const unit of units.values()) unit.hash = hashText(JSON.stringify(unit.english))
  return units
}

function pluralCategories(locale) {
  return new Intl.PluralRules(locale).resolvedOptions().pluralCategories
}

function requiredKeys(unit, locale) {
  if (!unit.plural) return [unit.id]
  return pluralCategories(locale).map((category) => `${unit.id}_${category}`)
}

function staleUnits({ units, lock, localeFlat, locale }) {
  return [...units.values()].filter(
    (unit) =>
      lock[unit.id] !== unit.hash ||
      requiredKeys(unit, locale).some((key) => typeof localeFlat[key] !== "string"),
  )
}

function orphanKeys({ units, localeFlat, locale }) {
  const valid = new Set([...units.values()].flatMap((unit) => requiredKeys(unit, locale)))
  return Object.keys(localeFlat).filter((key) => !valid.has(key))
}

function placeholders(text) {
  return new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[0].replace(/\s+/g, "")))
}

function validateUnit(unit, translatedFlat, locale) {
  const english = new Set(Object.values(unit.english).flatMap((text) => [...placeholders(text)]))
  const required = [...english].filter((token) => token !== "{{count}}")
  return requiredKeys(unit, locale).flatMap((key) => {
    const text = translatedFlat[key]
    if (typeof text !== "string" || !text.trim()) return [`${key}: missing translation`]
    const found = placeholders(text)
    const missing = required.filter((token) => !found.has(token))
    const unknown = [...found].filter((token) => !english.has(token))
    return [
      ...missing.map((token) => `${key}: dropped ${token}`),
      ...unknown.map((token) => `${key}: introduced ${token}`),
    ]
  })
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

function lockPath(namespace) {
  return path.join(LOCKS_DIR, `${namespace}.json`)
}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback
}

function loadTs(file) {
  if (!fs.existsSync(file)) return undefined
  const { require: tsxRequire } = require("tsx/cjs/api")
  return tsxRequire(file, __filename).default
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

function resourcesSource(locales) {
  const all = [SOURCE_LOCALE, ...locales]
  const imports = all.map((locale) => `import ${locale} from "./${locale}"`)
  return `${GENERATED_HEADER}${imports.join("\n")}\n\nexport const resources = { ${all.join(", ")} }\n`
}

function scaffoldFiles(namespaces) {
  const locales = Object.keys(LOCALES)
  return [
    [path.join(I18N_DIR, "resources.ts"), resourcesSource(locales)],
    ...locales.map((locale) => [
      path.join(I18N_DIR, locale, "index.ts"),
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

  for (const namespace of namespaces) {
    const englishFlat = flatten(english[namespace])
    for (const key of prototypeKeys(englishFlat))
      problems.push(`en/${namespace}: ${key} shadows a built-in object property; rename it`)
    const units = translationUnits(englishFlat)
    const lock = readJson(lockPath(namespace), {})
    for (const locale of Object.keys(LOCALES)) {
      const localeFlat = flatten(loadTs(namespacePath(locale, namespace)) ?? {})
      for (const unit of staleUnits({ units, lock, localeFlat, locale }))
        problems.push(`${locale}/${namespace}: ${unit.id} needs translation`)
      for (const key of orphanKeys({ units, localeFlat, locale }))
        problems.push(`${locale}/${namespace}: ${key} no longer exists in English`)
    }
  }

  if (problems.length === 0) {
    console.log("Translations are up to date.")
    return
  }
  console.error(problems.join("\n"))
  console.error(`\n${problems.length} translation problem(s). Run \`pnpm i18n:translate\`.`)
  process.exitCode = 1
}

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return
  const envFile = path.join(ROOT, ".env.local")
  if (!fs.existsSync(envFile)) return
  const { ANTHROPIC_API_KEY } = util.parseEnv(fs.readFileSync(envFile, "utf8"))
  if (ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY
}

function requestPayload(units, namespace, locale) {
  const slotKeys = new Map()
  const entries = units.map((unit) => ({
    context: `${namespace}:${unit.id}`,
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

async function requestTranslations(client, { units, namespace, locale, feedback }) {
  const payload = requestPayload(units, namespace, locale)
  const request = [
    `Translate into ${LOCALES[locale]} (${locale}).`,
    `Fixed game terms: Magic life = "${GAME_TERMS[locale].life}"; Yu-Gi-Oh! Life Points = "${GAME_TERMS[locale].lifePoints}"; Pokémon Prize cards = "${GAME_TERMS[locale].prizeCards}"; Lorcana lore = "${GAME_TERMS[locale].lore}".`,
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
    system: SYSTEM_PROMPT,
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

async function translateUnits(client, { units, namespace, locale }) {
  let feedback = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const translated = await requestTranslations(client, { units, namespace, locale, feedback })
    feedback = units.flatMap((unit) => validateUnit(unit, translated, locale))
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

  for (const [file, source] of scaffoldFiles(namespaces)) await writeTs(file, source)

  for (const namespace of namespaces.filter((ns) => !onlyNamespace || ns === onlyNamespace)) {
    const units = translationUnits(flatten(english[namespace]))
    const lock = readJson(lockPath(namespace), {})

    // why: one namespace per call keeps requests small and parallel by locale.
    await Promise.all(
      Object.keys(LOCALES).map(async (locale) => {
        const file = namespacePath(locale, namespace)
        const localeFlat = flatten(loadTs(file) ?? {})
        const outdated = new Set(staleUnits({ units, lock, localeFlat, locale }))
        const stale = [...units.values()].filter(
          (unit) =>
            outdated.has(unit) ||
            Object.values(unit.english).some((text) => retranslate?.test(text)),
        )
        for (const batch of chunk(stale, UNITS_PER_REQUEST)) {
          Object.assign(
            localeFlat,
            await translateUnits(client, { units: batch, namespace, locale }),
          )
        }
        const ordered = orderLikeEnglish(units, localeFlat, locale)
        await writeTs(file, namespaceSource(unflatten(ordered)))
        if (stale.length) console.log(`${locale}/${namespace}: translated ${stale.length} key(s)`)
      }),
    )

    const nextLock = Object.fromEntries([...units.values()].map((unit) => [unit.id, unit.hash]))
    fs.mkdirSync(LOCKS_DIR, { recursive: true })
    fs.writeFileSync(lockPath(namespace), `${JSON.stringify(nextLock, null, 2)}\n`)
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
  flatten,
  prototypeKeys,
  unflatten,
  translationUnits,
  requiredKeys,
  staleUnits,
  orphanKeys,
  validateUnit,
}
