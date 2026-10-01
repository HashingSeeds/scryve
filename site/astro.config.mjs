import { fileURLToPath } from "node:url"

import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://scryve.sow.care",
  trailingSlash: "never",
  build: { format: "file" },
  vite: {
    resolve: {
      // Shared game modules in the app import each other through the app's `@/` alias.
      alias: { "@/": fileURLToPath(new URL("../src/", import.meta.url)) },
    },
  },
})
