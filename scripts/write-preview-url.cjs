/* eslint-env node */

const fs = require("fs")
const path = require("path")

const url = process.env.EXPO_PUBLIC_CONVEX_URL
if (!url) {
  console.error("EXPO_PUBLIC_CONVEX_URL not set; skipping .env.local update")
  process.exit(0)
}

const envFile = path.join(__dirname, "..", ".env.local")
let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : ""

if (/^EXPO_PUBLIC_CONVEX_URL=.*$/m.test(content)) {
  content = content.replace(/^EXPO_PUBLIC_CONVEX_URL=.*$/m, `EXPO_PUBLIC_CONVEX_URL=${url}`)
} else {
  content += `\nEXPO_PUBLIC_CONVEX_URL=${url}\n`
}

fs.writeFileSync(envFile, content)
console.log(`Wrote EXPO_PUBLIC_CONVEX_URL=${url} to .env.local`)
