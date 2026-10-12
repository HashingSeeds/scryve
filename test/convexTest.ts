import { convexTest } from "convex-test"
import { readdirSync } from "node:fs"
import { basename, join } from "node:path"

import { registerRateLimiter } from "./registerRateLimiter"
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
