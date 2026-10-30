import type { ConvexReactClient } from "convex/react"

import { buildManualMatchArgs, defaultManualMatchDraft } from "./manualMatchForm"
import { ManualMatchController, ManualMatchRepository } from "./matchOutbox"
import { api } from "../../../convex/_generated/api"
import { makeConvexTest, signedIn } from "../../../test/convexTest"
import { MemoryStorage } from "../../../test/support/memoryStorage"

const flush = () => new Promise(setImmediate)

function matchArgs(publicId = "match_offline_0001") {
  const draft = defaultManualMatchDraft()
  const built = buildManualMatchArgs(
    { ...draft, opponents: [{ ...draft.opponents[0], name: "Rival" }] },
    { publicId },
  )
  if (!built.ok) throw new Error(built.error)
  return built.args
}

async function setup() {
  const t = makeConvexTest()
  const actor = await signedIn(t, "owner")
  const sent: string[] = []
  let loseNextAcknowledgement = false
  const client = {
    mutation: async (reference: typeof api.matches.recordManualMatch, args: unknown) => {
      const result = await actor.mutation(reference, args as Parameters<typeof actor.mutation>[1])
      sent.push((args as { publicId: string }).publicId)
      if (loseNextAcknowledgement) {
        loseNextAcknowledgement = false
        throw new Error("acknowledgement lost")
      }
      return result
    },
  } as unknown as ConvexReactClient
  const local = new MemoryStorage()
  const relaunch = () =>
    new ManualMatchController(client, new ManualMatchRepository("owner", local))
  const matches = () => t.run((ctx) => ctx.db.query("matches").collect())
  return { relaunch, matches, sent, loseAcknowledgement: () => (loseNextAcknowledgement = true) }
}

describe("manual match outbox", () => {
  it("keeps a match saved offline through a relaunch and sends it once reachable", async () => {
    const { relaunch, matches, sent } = await setup()
    const offline = relaunch()
    offline.record(matchArgs())
    await flush()
    expect(sent).toEqual([])
    expect(offline.getSnapshot().pending).toHaveLength(1)

    const online = relaunch()
    const stop = online.start()
    await flush()
    stop()

    expect(sent).toEqual(["match_offline_0001"])
    expect(await matches()).toHaveLength(1)
    expect(online.getSnapshot().pending).toEqual([])
  })

  it("records a match once when its acknowledgement is lost and it sends again", async () => {
    const { relaunch, matches, sent, loseAcknowledgement } = await setup()
    loseAcknowledgement()
    const first = relaunch()
    const stopFirst = first.start()
    first.record(matchArgs())
    await flush()
    stopFirst()
    expect(first.getSnapshot().pending).toHaveLength(1)

    const stopSecond = relaunch().start()
    await flush()
    stopSecond()

    expect(sent).toEqual(["match_offline_0001", "match_offline_0001"])
    expect(await matches()).toHaveLength(1)
  })
})
