import type { convexTest } from "convex-test"

import schema from "../node_modules/@convex-dev/rate-limiter/dist/component/schema"

const componentDirectory = require
  .resolve("@convex-dev/rate-limiter/package.json")
  .replace(/package\.json$/, "dist/component/")

export function registerRateLimiter(t: Pick<ReturnType<typeof convexTest>, "registerComponent">) {
  t.registerComponent("rateLimiter", schema, {
    "./lib.ts": async () => jest.requireActual(`${componentDirectory}lib.js`),
    "./internal.ts": async () => jest.requireActual(`${componentDirectory}internal.js`),
    "./time.ts": async () => jest.requireActual(`${componentDirectory}time.js`),
    "./_generated/server.ts": async () =>
      jest.requireActual(`${componentDirectory}_generated/server.js`),
  })
}
