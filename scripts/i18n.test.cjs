const assert = require("node:assert/strict")
const test = require("node:test")

const {
  chooseApiKey,
  englishNotes,
  flatten,
  prototypeKeys,
  unflatten,
  translationUnits,
  requiredKeys,
  staleUnits,
  editedUnits,
  lockEntry,
  glossaryProblems,
  glossaryText,
  unitConcepts,
  orphanKeys,
  validateUnit,
  englishProblems,
} = require("./i18n.cjs")

const namespace = {
  back: "Back",
  seats: {
    waiting_one: "Waiting for {{count}} more player",
    waiting_other: "Waiting for {{count}} more players",
  },
  seatNumber: "Seat {{seat}}",
}
const english = flatten(namespace)
const units = translationUnits(english)
const locales = ["es", "fr", "hi", "ja", "ko"]
const glossaryWith = (seatTerms = {}) => ({
  rules: Object.fromEntries(locales.map((locale) => [locale, ["Keep it short."]])),
  terms: {
    seat: {
      en: ["seat"],
      ...Object.fromEntries(locales.map((l) => [l, `seat-${l}`])),
      ...seatTerms,
    },
  },
})
const glossary = glossaryWith({ ja: "席" })
const jaComplete = {
  "back": "戻る",
  "seats.waiting_other": "あと{{count}}人",
  "seatNumber": "席{{seat}}",
}
const lockFor = (entries, localeFlat, locale = "ja", terms = glossary) =>
  Object.fromEntries(
    [...entries.values()].map((unit) => [unit.id, lockEntry(unit, localeFlat, locale, terms)]),
  )
const ids = (list) => list.map((unit) => unit.id)

test("round-trips nested namespaces through dotted key paths", () => {
  assert.equal(english["seats.waiting_one"], "Waiting for {{count}} more player")
  assert.deepEqual(unflatten(english), namespace)
})

test("asks each locale for its own plural categories", () => {
  const waiting = units.get("seats.waiting")
  assert.deepEqual(requiredKeys(waiting, "fr"), [
    "seats.waiting_one",
    "seats.waiting_many",
    "seats.waiting_other",
  ])
  assert.deepEqual(requiredKeys(waiting, "ja"), ["seats.waiting_other"])
  assert.deepEqual(requiredKeys(units.get("back"), "ja"), ["back"])
})

test("marks units stale when English changes or the locale lacks a key", () => {
  const lock = lockFor(units, jaComplete)
  const state = { units, lock, localeFlat: jaComplete, locale: "ja", glossary }
  assert.deepEqual(staleUnits(state), [])

  const edited = translationUnits({ ...english, back: "Go back" })
  assert.deepEqual(ids(staleUnits({ ...state, units: edited })), ["back"])

  const { seatNumber: _, ...missingSeat } = jaComplete
  assert.deepEqual(ids(staleUnits({ ...state, localeFlat: missingSeat })), ["seatNumber"])
})

test("a glossary edit retranslates only the strings that mention it, in that language", () => {
  const state = { units, lock: lockFor(units, jaComplete), localeFlat: jaComplete, locale: "ja" }
  assert.deepEqual(ids(staleUnits({ ...state, glossary: glossaryWith({ ja: "座席" }) })), [
    "seatNumber",
  ])
  assert.deepEqual(
    ids(staleUnits({ ...state, glossary: glossaryWith({ ja: "席", ko: "좌석" }) })),
    [],
  )

  const rules = { ...glossary, rules: { ...glossary.rules, ja: ["Use です/ます."] } }
  assert.equal(staleUnits({ ...state, glossary: rules }).length, units.size)
})

test("catches a hand edit to a generated translation until English or the glossary changes", () => {
  const lock = lockFor(units, jaComplete)
  const handEdited = { ...jaComplete, back: "もどる" }
  const state = { units, lock, localeFlat: handEdited, locale: "ja", glossary }
  assert.deepEqual(ids(editedUnits(state)), ["back"])
  assert.deepEqual(staleUnits(state), [])

  const newEnglish = translationUnits({ ...english, back: "Go back" })
  assert.deepEqual(editedUnits({ ...state, units: newEnglish }), [])
  assert.deepEqual(ids(staleUnits({ ...state, units: newEnglish })), ["back"])
})

test("needs every concept to name English the copy uses and a term in every language", () => {
  const entries = [...units.values()]
  assert.deepEqual(glossaryProblems(glossary, entries, locales), [])

  const { ko: _, ...noKorean } = glossary.terms.seat
  const broken = {
    rules: { ...glossary.rules, hi: [], jp: ["Use です/ます."] },
    terms: {
      seat: { ...noKorean, en: ["seat", "chair"], ar: "مقعد" },
      bench: { ...glossary.terms.seat, en: [] },
      blank: { ...glossary.terms.seat, en: [" "] },
    },
    ja: { rules: [] },
  }
  assert.deepEqual(glossaryProblems(broken, entries, locales), [
    "glossary: ja belongs under rules or inside a term",
    "glossary: rules for hi must be a list of rules",
    "glossary: rules has jp, which is not a translated language",
    'glossary: "seat" lists "chair", which no English string uses',
    'glossary: "seat" has no ko term; write what the ko translations already use',
    'glossary: "seat" has ar, which is not a translated language',
    'glossary: "bench" lists no English words in en',
    'glossary: "blank" lists no English words in en',
  ])
  assert.deepEqual(glossaryProblems({ rules: glossary.rules }, entries, locales), [
    "glossary: needs a rules object and a terms object",
  ])
})

test("a glossary word matches whole words and their plain endings, not longer words", () => {
  const concepts = (text) =>
    unitConcepts(translationUnits({ label: text }).get("label"), {
      terms: { hero: { en: ["hero"] }, seat: { en: ["seat"] } },
    })
  assert.deepEqual(concepts("Heroes and seated players"), ["hero", "seat"])
  assert.deepEqual(concepts("Heroic Outlaw at the seatbelt"), [])
})

test("sends the translator only the glossary terms its strings mention", () => {
  const prompt = (keys) =>
    glossaryText(
      "ja",
      keys.map((key) => units.get(key)),
      glossary,
    )
  assert.match(prompt(["seatNumber"]), /- seat: 席/)
  assert.doesNotMatch(prompt(["back"]), /Glossary/)
  assert.match(prompt(["back"]), /Rules for ja:\n- Keep it short\./)
})

test("flags keys English no longer has, including plural forms the locale does not use", () => {
  const localeFlat = { "back": "戻る", "removed": "x", "seats.waiting_one": "あと1人" }
  assert.deepEqual(orphanKeys({ units, localeFlat, locale: "ja" }), [
    "removed",
    "seats.waiting_one",
  ])
})

test("rejects translations that drop, rename, or miss placeholders and plural forms", () => {
  const seat = units.get("seatNumber")
  assert.deepEqual(validateUnit(seat, { seatNumber: "Asiento {{seat}}" }, "es"), [])
  assert.deepEqual(validateUnit(seat, { seatNumber: "Asiento {{asiento}}" }, "es"), [
    "seatNumber: dropped {{seat}}",
    "seatNumber: introduced {{asiento}}",
  ])

  const waiting = units.get("seats.waiting")
  assert.deepEqual(
    validateUnit(
      waiting,
      { "seats.waiting_one": "Falta un jugador", "seats.waiting_other": "Faltan {{count}}" },
      "es",
    ),
    ["seats.waiting_many: missing translation"],
  )
})

test("rejects numbers typed into copy for languages that write their own digits", () => {
  const seats = translationUnits({
    seats_one: "{{count}} seat",
    seats_other: "{{count}} seats",
    bestOf: "Best of 3",
  })
  assert.deepEqual(
    validateUnit(
      seats.get("seats"),
      {
        seats_zero: "لا مقاعد",
        seats_one: "مقعد واحد",
        seats_two: "2 مقعدين",
        seats_few: "{{count}} مقاعد",
        seats_many: "{{count}} مقعدًا",
        seats_other: "{{count}} مقعد",
      },
      "ar",
    ),
    ["seats_two: typed the number 2; use a placeholder"],
  )
  assert.deepEqual(validateUnit(seats.get("seats"), { seats_other: "{{count}}席" }, "ja"), [])
  assert.deepEqual(validateUnit(seats.get("bestOf"), { bestOf: "الأفضل من ٣" }, "ar"), [])
  assert.deepEqual(validateUnit(seats.get("bestOf"), { bestOf: "الأفضل من 5" }, "ar"), [
    "bestOf: typed the number 5; use a placeholder",
  ])
  assert.deepEqual(validateUnit(seats.get("bestOf"), { bestOf: "Al mejor de 5" }, "es"), [])
})

test("treats a formatted placeholder such as {{delta, signed}} as its own placeholder", () => {
  const unit = translationUnits({ fromStart: "{{delta, signed}} from start" }).get("fromStart")
  assert.deepEqual(validateUnit(unit, { fromStart: "{{delta, signed}} desde el inicio" }, "es"), [])
  assert.deepEqual(validateUnit(unit, { fromStart: "{{delta}} desde el inicio" }, "es"), [
    "fromStart: dropped {{delta,signed}}",
    "fromStart: introduced {{delta}}",
  ])
})

test("lets a plural form say its number in words only when it covers one number", () => {
  const seats = translationUnits({ seats_one: "{{count}} seat", seats_other: "{{count}} seats" })
  const unit = seats.get("seats")
  assert.deepEqual(validateUnit(unit, { seats_one: "one seat", seats_other: "seats" }, "en"), [
    "seats_other: dropped {{count}}",
  ])
  assert.deepEqual(
    validateUnit(
      unit,
      { seats_one: "un siège", seats_many: "{{count}} sièges", seats_other: "{{count}} sièges" },
      "fr",
    ),
    ["seats_one: dropped {{count}}"],
  )
  assert.deepEqual(
    validateUnit(
      unit,
      {
        seats_zero: "لا مقاعد",
        seats_one: "مقعد واحد",
        seats_two: "مقعدان",
        seats_few: "مقاعد",
        seats_many: "مقعدًا",
        seats_other: "{{count}} مقعد",
      },
      "ar",
    ),
    ["seats_few: dropped {{count}}", "seats_many: dropped {{count}}"],
  )
})

test("rejects numbers and hand-built signs in English copy", () => {
  assert.deepEqual(englishProblems("last", "Last 7 days"), [
    "last: has the number 7; pass it as a placeholder",
  ])
  assert.deepEqual(englishProblems("dice", "Roll a d20 for 2HG or 2v2"), [])
  assert.deepEqual(englishProblems("hint", 'Use lines like "1 Sol Ring"'), [])
  assert.deepEqual(englishProblems("badge", "+{{cost}} or {{rate}}%"), [
    'badge: "+{{" builds a sign or percent by hand; use {{x, signed}} or {{x, percent}}',
    'badge: "}}%" builds a sign or percent by hand; use {{x, signed}} or {{x, percent}}',
  ])
  assert.deepEqual(englishProblems("badge", "{{cost, signed}} · {{share, percent}}"), [])
  assert.deepEqual(
    validateUnit(
      { id: "share", english: { share: "{{share, percent}}" } },
      { share: "{{share, percent}} %" },
      "fr",
    ),
    ['share: "}} %" builds a sign or percent by hand; use {{x, signed}} or {{x, percent}}'],
  )
})

test("flags keys that i18next would resolve to built-in object properties", () => {
  assert.deepEqual(
    prototypeKeys({ "life.valueOf": "x", "life.valueOutOf": "y", "toString": "z" }),
    ["life.valueOf", "toString"],
  )
})

test("sends comments above English keys as notes, and a changed note retranslates the key", () => {
  const source = `const ns = {
  // Pokémon only.
  prizes: {
    // Prize cards the player has taken.
    taken: "{{amount}} taken",
    left_one: "{{count}} left",
    left_other: "{{count}} left",
  },
  back: "Back",
}`
  const notes = englishNotes(source)
  assert.deepEqual(notes, {
    "prizes.taken": "Pokémon only. Prize cards the player has taken.",
    "prizes.left_one": "Pokémon only.",
    "prizes.left_other": "Pokémon only.",
  })

  const flat = { "prizes.taken": "{{amount}} taken", "back": "Back" }
  const before = translationUnits(flat)
  const after = translationUnits(flat, notes)
  assert.equal(after.get("prizes.taken").note, "Pokémon only. Prize cards the player has taken.")
  const sourceOf = (entries, key) => lockEntry(entries.get(key), {}, "ja", glossary).split(".")[0]
  assert.notEqual(sourceOf(after, "prizes.taken"), sourceOf(before, "prizes.taken"))
  assert.equal(sourceOf(after, "back"), sourceOf(before, "back"))
})

test("rejects Latin words left in Japanese, Korean, and Hindi, and unmatched quotes", () => {
  const unit = translationUnits({ label: "Monarch {{name}}" }).get("label")
  assert.deepEqual(validateUnit(unit, { label: "monarch {{name}}" }, "ja"), [
    'label: left "monarch" in Latin script',
  ])
  assert.deepEqual(validateUnit(unit, { label: "모나크 없ANC수 {{name}}" }, "ko"), [
    "label: has Latin letters inside a word",
  ])
  assert.deepEqual(
    validateUnit(unit, { label: "統治者 Scryve「3 Ash Blossom」{{name}}" }, "ja"),
    [],
  )
  assert.deepEqual(validateUnit(unit, { label: "monarca {{name}}" }, "es"), [])
  assert.deepEqual(validateUnit(unit, { label: 'Monarca {{name}}"' }, "es"), [
    "label: has an unmatched quote",
  ])
})

test("sends the pool key only through ai-pool and the Console key only to Anthropic", () => {
  const keys = { readPoolKey: () => "pool", readConsoleKey: () => "console" }
  const pool = "https://ai-pool.example.ts.net"

  assert.equal(chooseApiKey({ ...keys, baseUrl: pool }), "pool")
  assert.equal(chooseApiKey({ ...keys, baseUrl: "https://api.anthropic.com" }), "console")
  assert.equal(chooseApiKey({ ...keys, baseUrl: undefined }), "console")
  assert.equal(chooseApiKey({ ...keys, baseUrl: pool, readPoolKey: () => undefined }), "console")
  assert.equal(chooseApiKey({ ...keys, apiKey: "explicit", baseUrl: pool }), "explicit")
})

test("never reads a key file the choice does not need", () => {
  const unreadable = () => {
    throw new Error("EACCES")
  }

  assert.equal(
    chooseApiKey({ apiKey: "explicit", readPoolKey: unreadable, readConsoleKey: unreadable }),
    "explicit",
  )
  assert.equal(
    chooseApiKey({
      baseUrl: "https://api.anthropic.com",
      readPoolKey: unreadable,
      readConsoleKey: () => "console",
    }),
    "console",
  )
})
