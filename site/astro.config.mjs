import { fileURLToPath } from "node:url"

import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://scryve.sow.care",
  trailingSlash: "never",
  build: { format: "file" },
  vite: {
    resolve: {
      // Shared game modules in the app import each other through the app's `@/` alias.
      alias: [
        {
          find: /^@\/i18n\/translate$/,
          replacement: fileURLToPath(new URL("./src/translate.ts", import.meta.url)),
        },
        { find: "@/", replacement: fileURLToPath(new URL("../src/", import.meta.url)) },
      ],
    },
  },
})
