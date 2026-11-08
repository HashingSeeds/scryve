const assert = require("node:assert/strict")
const { test } = require("node:test")
const { setTimeout } = require("node:timers")

const {
  applyHostMessage,
  digest,
  laggedQueue,
  organizerMove,
  parseCli,
  playerMove,
  randomResult,
} = require("./event-bots.cjs")

function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

const PLAY = { race: false, dispute: 0, finish: true }

function swiss(tables, extra = {}) {
  return {
    status: "active",
    structure: "swiss",
    bestOf: 3,
    round: 1,
    plannedRounds: 3,
    players: ["a", "b", "c", "d"].map((id) => ({
      id,
      name: id,
      guest: id === "d",
      dropped: false,
    })),
    tables,
    ...extra,
  }
}

const table = (id, playerIds, status = "open", extra = {}) => ({
  id,
  table: Number(id.slice(1)),
  playerIds,
  status,
  result: null,
  reportedBy: null,
  ...extra,
})

test("random results stay inside what a best of 1, 3 or 5 and a pod allow", () => {
  const random = seeded()
  for (const bestOf of [1, 3, 5]) {
    const needed = (bestOf + 1) / 2
    for (let i = 0; i < 500; i += 1) {
      const { gamesWon, gamesDrawn } = randomResult({ structure: "swiss", bestOf }, 2, random)
      assert.ok(gamesWon.every((won) => Number.isInteger(won) && won >= 0 && won <= needed))
      assert.ok(gamesWon[0] !== needed || gamesWon[1] !== needed)
      assert.ok(gamesWon.includes(needed) || gamesWon[0] === gamesWon[1])
      assert.ok(gamesWon[0] + gamesWon[1] + gamesDrawn <= bestOf)
    }
  }
  for (let i = 0; i < 200; i += 1) {
    const { winnerSeat } = randomResult({ structure: "pods" }, 4, random)
    assert.ok(winnerSeat === null || (winnerSeat >= 0 && winnerSeat < 4))
  }
})

test("the first seat reports, the other confirms, and guest tables wait for the organizer", () => {
  const open = swiss([table("t1", ["a", "b"]), table("t2", ["c", "d"])])
  assert.equal(playerMove(open, "a", PLAY).kind, "report")
  assert.equal(playerMove(open, "b", PLAY), undefined)
  assert.equal(playerMove(open, "c", PLAY), undefined)
  assert.equal(playerMove(open, "b", { ...PLAY, race: true }).kind, "report")

  const result = { kind: "match", gamesWon: [2, 0], gamesDrawn: 0 }
  const reported = swiss([table("t1", ["a", "b"], "reported", { result, reportedBy: "a" })])
  assert.equal(playerMove(reported, "a", PLAY), undefined)
  assert.deepEqual(playerMove(reported, "b", PLAY), { kind: "confirm", tableId: "t1" })
  const disputed = playerMove(reported, "b", { ...PLAY, dispute: 1 }, seeded())
  assert.equal(disputed.kind, "report")
  assert.notDeepEqual(disputed.result, result)
})

test("the host bot pairs once ready, reports guest tables, then pairs or finishes", () => {
  const registration = swiss([], { status: "registration", round: 0 })
  assert.equal(organizerMove(registration, PLAY, false), undefined)
  assert.equal(organizerMove(registration, PLAY, true).kind, "startRound")

  const guestOpen = swiss([table("t1", ["a", "b"]), table("t2", ["c", "d"])])
  assert.equal(organizerMove(guestOpen, PLAY, true).tableId, "t2")

  const result = { kind: "match", gamesWon: [2, 1], gamesDrawn: 0 }
  const done = [table("t1", ["a", "b"], "reported", { result, reportedBy: "a" })]
  assert.equal(organizerMove(swiss(done), PLAY, true).kind, "startRound")
  assert.equal(organizerMove(swiss(done, { round: 3 }), PLAY, true).kind, "finish")
  assert.equal(
    organizerMove(swiss(done, { round: 3 }), { ...PLAY, finish: false }, true),
    undefined,
  )
})

test("patches apply in order, and a skipped number asks for a whole view", () => {
  const view = swiss([table("t1", ["a", "b"])], { myPlayerId: "a", isOrganizer: false })
  const feed = applyHostMessage(undefined, { t: "view", seq: 4, view, standings: [] })
  const { players: _, tables: __, myPlayerId: ___, isOrganizer: ____, ...fields } = view
  const reported = { ...view.tables[0], status: "reported", reportedBy: "a" }
  const next = applyHostMessage(feed, {
    t: "patch",
    seq: 5,
    view: { ...fields, round: 1 },
    tables: { set: [reported], gone: [] },
  })
  assert.equal(next.view.tables[0].status, "reported")
  assert.equal(next.view.myPlayerId, "a")
  assert.equal(applyHostMessage(next, { t: "patch", seq: 7, view: fields }), undefined)
})

test("phones agree when only whose phone it is and list order differ", () => {
  const view = swiss([table("t1", ["a", "b"]), table("t2", ["c", "d"])])
  const mine = { ...view, myPlayerId: "a", isOrganizer: false }
  const theirs = {
    ...view,
    myPlayerId: "c",
    isOrganizer: true,
    players: [...view.players].reverse(),
    tables: [...view.tables].reverse(),
  }
  assert.equal(digest(mine, []), digest(theirs, []))
  assert.notEqual(digest(mine, []), digest({ ...theirs, round: 2 }, []))
})

test("cli reads the nearby host and refuses guests it cannot add", () => {
  const nearby = parseCli(["nearby", "ab12cd", "192.168.1.20:51234", "--think", "2s"])
  assert.equal(nearby.code, "AB12CD")
  assert.equal(nearby.host, "192.168.1.20")
  assert.equal(nearby.port, 51234)
  assert.deepEqual(nearby.think, [2000, 2000])
  assert.equal(parseCli(["convex", "host", "--structure", "pods"]).bestOf, 1)
  assert.throws(() => parseCli(["nearby", "AB12CD"]), /<ip>:<port>/)
  assert.throws(() => parseCli(["convex", "join", "AB12CD", "--guests", "2"]), /--guests/)
  assert.throws(() => parseCli(["convex", "host", "--structure", "pods", "--best-of", "3"]), /Pod/)
  assert.throws(() => parseCli(["convex", "host", "--think", "5s-1s"]), /range/)
  assert.deepEqual(
    parseCli(["nearby", "AB12CD", "10.0.0.2:1", "--lag", "50ms-400ms"]).lag,
    [50, 400],
  )
  assert.throws(() => parseCli(["convex", "host", "--lag", "100ms"]), /--lag needs nearby/)
})

test("lagged messages arrive late but never out of order", async () => {
  const send = laggedQueue([5, 30])
  const sent = []
  const arrived = []
  await new Promise((resolve) => {
    // why: messages sent while earlier ones still wait often share a due time, which is when timers can swap them.
    for (let i = 0; i < 200; i += 1)
      setTimeout(() => {
        sent.push(i)
        send(() => {
          arrived.push(i)
          if (arrived.length === 200) resolve()
        })
      }, i % 40)
  })
  assert.deepEqual(arrived, sent)
})
