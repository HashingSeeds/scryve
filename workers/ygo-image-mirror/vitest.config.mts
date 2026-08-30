import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

process.env.MIRROR_TOKEN ??= "test-token"

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "wrangler.jsonc" },
      miniflare: { bindings: { MIRROR_TOKEN: "test-token" } },
    }),
  ],
  test: {
    include: ["test/**/*.vitest.ts"],
  },
})
