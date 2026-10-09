import type { ConvexReactClient } from "convex/react"
import { type FunctionReference, type FunctionReturnType, getFunctionName } from "convex/server"
import { ConvexError } from "convex/values"

import { FAKE_IDS, OWNER, type ServerIds } from "./lanes"
import { api } from "../../../../convex/_generated/api"
import { type ConvexTestHarness, makeConvexTest } from "../../../../test/convexTest"

export interface Verdict {
  name: string
  /** why: accepted ran; business passed validators then hit a coded domain rule; rejected failed a validator; error is anything else (missing function, crash) and counts as a failure. */
  outcome: "accepted" | "business" | "rejected" | "error"
  detail?: string
}

export interface World {
  t: ConvexTestHarness
  owner: ReturnType<ConvexTestHarness["withIdentity"]>
  ids: ServerIds
}

const INVITE_TOKEN = "t".repeat(43)

/** why: A real deck, version, and two-player active game, so `v.id(...)` validators see ids from the right tables. */
export async function makeWorld(): Promise<World> {
  const t = makeConvexTest()
  const owner = t.withIdentity({ subject: OWNER })
  await owner.mutation(api.users.syncCurrent, { displayName: "Stress" })
  const deckId = await owner.mutation(api.decks.create, { name: "Deck", format: "commander" })
  const version = await t.run((ctx) =>
    ctx.db
      .query("deckVersions")
      .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deckId))
      .first(),
  )
  if (!version) throw new Error("deck create made no version")
  await owner.mutation(api.games.createLobby, {
    publicId: FAKE_IDS.publicId,
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    inviteToken: INVITE_TOKEN,
    manualCodeCandidates: ["ABC234", "DEF567"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: "device-host-0001",
  })
  const joiner = t.withIdentity({ subject: "stress-joiner" })
  await joiner.mutation(api.users.syncCurrent, { displayName: "Joiner" })
  await joiner.mutation(api.games.claimSeat, {
    token: INVITE_TOKEN,
    displayName: "Joiner",
    color: "#2563EB",
  })
  await owner.mutation(api.games.startGame, { publicId: FAKE_IDS.publicId })
  const projection = await owner.query(api.games.lobbyProjection, { publicId: FAKE_IDS.publicId })
  const [first, second] = projection.players.map((player) => player.playerId)
  if (!first || !second) throw new Error("game has fewer than two players")
  return {
    t,
    owner,
    ids: {
      publicId: FAKE_IDS.publicId,
      playerIds: [first, second],
      deckId,
      versionId: version._id,
    },
  }
}

const isValidatorError = (error: unknown) =>
  error instanceof Error && /Validator error|ArgumentValidationError/.test(error.message)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// why: domain rules throw ConvexError with a stable code; anything else means the args never got a fair hearing.
const businessCode = (error: unknown) =>
  error instanceof ConvexError && isRecord(error.data) && typeof error.data.code === "string"
    ? error.data.code
    : undefined

const numberArg = (args: Record<string, unknown>, key: string) =>
  typeof args[key] === "number" ? args[key] : 0

const stringArg = (args: Record<string, unknown>, key: string, fallback: string) =>
  typeof args[key] === "string" ? args[key] : fallback

// why: a domain refusal (conflict, entitlement) would stall the send loop, so the harness answers with a plausible success and keeps validating the queue.
function plausibleResult(name: string, args: Record<string, unknown>, ids: ServerIds): unknown {
  if (name === "decks:syncWrite")
    return {
      id: stringArg(args, "id", ""),
      deckId: ids.deckId,
      revision: numberArg(args, "expectedRevision") + 1,
      name: stringArg(args, "name", ""),
      format: stringArg(args, "format", ""),
      game: stringArg(args, "game", ""),
      note: stringArg(args, "note", ""),
      deleted: false,
      createdAt: 0,
      updatedAt: 0,
    }
  if (name.startsWith("decks:"))
    return {
      deckId: ids.deckId,
      versionId: ids.versionId,
      revision: numberArg(args, "expectedRevision") + 1,
      versionNumber: 1,
      name: stringArg(args, "name", "Version"),
      note: stringArg(args, "note", ""),
      fingerprint: "stress",
      cardCount: 0,
      cardQuantity: 0,
      deleted: name === "decks:syncDeleteVersion",
      updatedAt: 0,
    }
  return {
    operationId: stringArg(args, "resolutionOperationId", stringArg(args, "operationId", "")),
  }
}

/** why: A ConvexReactClient stand-in that runs every mutation against convex-test and records whether its validators accepted the args. */
export function contractClient(
  world: World,
  verdicts: Verdict[],
): Pick<ConvexReactClient, "mutation"> {
  const run = async (reference: FunctionReference<"mutation">, args: Record<string, unknown>) => {
    const name = getFunctionName(reference)
    try {
      const result: unknown = await world.owner.mutation(reference, args)
      if (isRecord(result) && result.status === "conflict") {
        verdicts.push({ name, outcome: "business", detail: "conflict" })
        return plausibleResult(name, args, world.ids)
      }
      verdicts.push({ name, outcome: "accepted" })
      return result
    } catch (error) {
      const code = businessCode(error)
      if (code) {
        verdicts.push({ name, outcome: "business", detail: code })
        return plausibleResult(name, args, world.ids)
      }
      const outcome = isValidatorError(error) ? "rejected" : "error"
      verdicts.push({ name, outcome, detail: String(error).slice(0, 200) })
      throw new ConvexError({ code: "invalid_operation_id", message: `harness: ${outcome}` })
    }
  }
  return {
    async mutation<Mutation extends FunctionReference<"mutation">>(
      reference: Mutation,
      ...argsAndOptions: unknown[]
    ): Promise<FunctionReturnType<Mutation>> {
      const [args] = argsAndOptions
      // why: the stand-in returns whatever the real function returned; the caller's own types describe it.
      return (await run(reference, isRecord(args) ? args : {})) as FunctionReturnType<Mutation>
    },
  }
}

export const verdictFailed = (verdict: Verdict) =>
  verdict.outcome === "rejected" || verdict.outcome === "error"
