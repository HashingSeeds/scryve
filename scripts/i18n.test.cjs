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
const lockFor = (entries) =>
  Object.fromEntries([...entries.values()].map((unit) => [unit.id, unit.hash]))

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
  const lock = lockFor(units)
  const complete = {
    "back": "戻る",
    "seats.waiting_other": "あと{{count}}人",
    "seatNumber": "席{{seat}}",
  }
  assert.deepEqual(staleUnits({ units, lock, localeFlat: complete, locale: "ja" }), [])

  const edited = translationUnits({ ...english, back: "Go back" })
  assert.deepEqual(
    staleUnits({ units: edited, lock, localeFlat: complete, locale: "ja" }).map((unit) => unit.id),
    ["back"],
  )

  const { seatNumber: _, ...missingSeat } = complete
  assert.deepEqual(
    staleUnits({ units, lock, localeFlat: missingSeat, locale: "ja" }).map((unit) => unit.id),
    ["seatNumber"],
  )
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
        seats_many: "{{count}} مقعدًا",
        seats_other: "{{count}} مقعد",
      },
      "ar",
    ),
    ["seats_few: dropped {{count}}"],
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
  assert.notEqual(after.get("prizes.taken").hash, before.get("prizes.taken").hash)
  assert.equal(after.get("back").hash, before.get("back").hash)
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
