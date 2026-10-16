const assert = require("node:assert/strict")
const test = require("node:test")

const {
  flatten,
  unflatten,
  translationUnits,
  requiredKeys,
  staleUnits,
  orphanKeys,
  validateUnit,
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
