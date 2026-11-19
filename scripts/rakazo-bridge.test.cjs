const assert = require("node:assert/strict")
const { test } = require("node:test")

const { createBridge, postToRakazo } = require("./rakazo-bridge.cjs")

const item = (turn) => ({ requestId: "r1", turn, title: "Idea: Sync timers" })

test("sends each turn, marks it delivered, and retries a failed one on the next flush", async () => {
  const sent = []
  const marked = []
  let down = true
  const bridge = createBridge({
    deliver: async (_, key) => {
      if (down) throw new Error("offline")
      sent.push(key)
    },
    markDelivered: async ({ turn }) => marked.push(turn),
    log: () => {},
  })

  await bridge.update([item("request")])
  assert.deepEqual(sent, [])
  down = false
  await bridge.flush()
  assert.deepEqual(sent, ["r1:request"])
  assert.deepEqual(marked, ["request"])
})

test("never sends the same turn twice at once", async () => {
  let release
  const sent = []
  const bridge = createBridge({
    deliver: (_, key) => {
      sent.push(key)
      return new Promise((resolve) => (release = resolve))
    },
    markDelivered: async () => {},
    log: () => {},
  })
  const first = bridge.update([item("m1")])
  await bridge.flush()
  release()
  await first
  assert.deepEqual(sent, ["r1:m1"])
})

test("treats Rakazo's ignored delivery as a failure", async (t) => {
  t.mock.method(global, "fetch", async () => ({ ok: true, json: async () => ({ ignored: true }) }))
  await assert.rejects(
    postToRakazo({ url: "http://rakazo.test", secret: "s" }, item("m1"), "r1:m1"),
    /no active webhook routine/,
  )
})
