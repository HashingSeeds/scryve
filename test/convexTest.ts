import type { ConvexReactClient } from "convex/react"
import type { FunctionArgs, FunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import { readdirSync } from "node:fs"
import { basename, join } from "node:path"

import { registerRateLimiter } from "./registerRateLimiter"
import { api } from "../convex/_generated/api"
import schema from "../convex/schema"

const convexDirectory = join(__dirname, "../convex")

// why: Jest has no import.meta.glob, so this builds the same lazy module map by walking convex/ the way the Convex bundler does.
const functionFiles = readdirSync(convexDirectory, { recursive: true, encoding: "utf8" }).filter(
  (file) =>
    file.endsWith(".ts") &&
    !file.startsWith("_generated") &&
    basename(file).split(".").length === 2,
)

const modules = Object.fromEntries(
  ["_generated/api.ts", "_generated/server.ts", ...functionFiles].map((file) => [
    `./${file}`,
    async () => jest.requireActual(join(convexDirectory, file.replace(/\.ts$/, ""))),
  ]),
)

export function makeConvexTest() {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  return t
}

export type ConvexTestHarness = ReturnType<typeof makeConvexTest>

export async function signedIn(t: ConvexTestHarness, subject: string, displayName = subject) {
  const actor = t.withIdentity({ subject })
  const userId = await actor.mutation(api.users.syncCurrent, { displayName })
  return Object.assign(actor, { userId })
}

type Mutation = FunctionReference<"mutation", "public", Record<string, unknown>, unknown>

export function convexClientFor<Reference extends Mutation = Mutation>(
  actor: ReturnType<ConvexTestHarness["withIdentity"]>,
  around: (send: () => Promise<unknown>, args: FunctionArgs<Reference>) => Promise<unknown> = (
    send,
  ) => send(),
) {
  const mutation = (reference: Reference, args: FunctionArgs<Reference>) =>
    around(() => actor.mutation<Mutation>(reference, args), args)
  return { mutation } as unknown as ConvexReactClient
}
