const fs = require("node:fs")
const path = require("node:path")

// Cloudflare Pages silently skips any directory named `node_modules`, so the
// fonts and icons Expo exports under `dist/assets/node_modules/` would 404 in
// production and the SPA fallback would answer with index.html instead.
const CLOUDFLARE_SKIPPED_DIR = "assets/node_modules/"
const DEPLOYABLE_DIR = "assets/vendor/"
const REWRITABLE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".map"])
const WAITLIST_SOURCE = path.join(process.cwd(), "web", "waitlist")

function collectRewritableFiles(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) collectRewritableFiles(entryPath, found)
    else if (REWRITABLE_EXTENSIONS.has(path.extname(entry.name))) found.push(entryPath)
  }
  return found
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const distDirectory = path.join(process.cwd(), "dist")
if (!fs.existsSync(distDirectory)) {
  fail("dist/ not found. Run `pnpm bundle:web:prod` first.")
}

const skippedDirectory = path.join(distDirectory, CLOUDFLARE_SKIPPED_DIR)
const deployableDirectory = path.join(distDirectory, DEPLOYABLE_DIR)

if (fs.existsSync(skippedDirectory)) {
  fs.rmSync(deployableDirectory, { force: true, recursive: true })
  fs.renameSync(skippedDirectory, deployableDirectory)
  console.log(`Moved ${CLOUDFLARE_SKIPPED_DIR} to ${DEPLOYABLE_DIR}`)
}

if (!fs.existsSync(deployableDirectory) || fs.readdirSync(deployableDirectory).length === 0) {
  fail(`${DEPLOYABLE_DIR} is missing or empty; the web export looks incomplete.`)
}

let rewrittenFileCount = 0
for (const file of collectRewritableFiles(distDirectory)) {
  const contents = fs.readFileSync(file, "utf8")
  if (!contents.includes(CLOUDFLARE_SKIPPED_DIR)) continue
  fs.writeFileSync(file, contents.split(CLOUDFLARE_SKIPPED_DIR).join(DEPLOYABLE_DIR))
  rewrittenFileCount += 1
}
console.log(`Rewrote asset references in ${rewrittenFileCount} file(s).`)

// Metro caches the values babel inlines for EXPO_PUBLIC_* variables, so a prod
// export can silently reuse a development bundle's Clerk key or Convex URL.
// Compare what actually landed in the bundle against .env.production.
const GUARDED_KEYS = ["EXPO_PUBLIC_CONVEX_URL", "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]

function readProductionEnv() {
  const envPath = path.join(process.cwd(), ".env.production")
  const values = {}
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "")
    }
  }
  return { ...values, ...process.env }
}

const productionEnv = readProductionEnv()
for (const key of GUARDED_KEYS) {
  const expected = productionEnv[key]
  if (!expected) fail(`${key} is missing from the production build environment.`)
  const bundled = new Set()
  for (const file of collectRewritableFiles(distDirectory))
    for (const [, value] of fs
      .readFileSync(file, "utf8")
      .matchAll(new RegExp(`${key}:\\s*"([^"]*)"`, "g")))
      bundled.add(value)
  if (bundled.size === 0) fail(`Could not find ${key} in the export; the bundle looks incomplete.`)
  const unexpected = [...bundled].filter((value) => value.replace(/\/$/, "") !== expected)
  if (unexpected.length > 0)
    fail(
      `${key} in dist/ is ${unexpected.map((value) => `"${value}"`).join(", ")} but .env.production expects "${expected}". ` +
        `Re-export with \`pnpm bundle:web:prod\` before deploying.`,
    )
}
console.log(`Verified ${GUARDED_KEYS.length} bundled production value(s).`)

const clerkSignInUrl = productionEnv.EXPO_PUBLIC_CLERK_SIGN_IN_URL
if (!clerkSignInUrl)
  fail("EXPO_PUBLIC_CLERK_SIGN_IN_URL is missing from the production build environment.")

const waitlistDirectory = path.join(distDirectory, "waitlist")
fs.rmSync(waitlistDirectory, { force: true, recursive: true })
fs.cpSync(WAITLIST_SOURCE, waitlistDirectory, { recursive: true })
fs.copyFileSync(
  path.join(process.cwd(), "assets", "images", "app-icon-all.png"),
  path.join(waitlistDirectory, "icon.png"),
)
fs.copyFileSync(
  path.join(
    process.cwd(),
    "node_modules",
    "@expo-google-fonts",
    "space-grotesk",
    "400Regular",
    "SpaceGrotesk_400Regular.ttf",
  ),
  path.join(waitlistDirectory, "space-grotesk-regular.ttf"),
)
fs.copyFileSync(
  path.join(
    process.cwd(),
    "node_modules",
    "@expo-google-fonts",
    "space-grotesk",
    "600SemiBold",
    "SpaceGrotesk_600SemiBold.ttf",
  ),
  path.join(waitlistDirectory, "space-grotesk-semibold.ttf"),
)

const waitlistHtmlPath = path.join(waitlistDirectory, "index.html")
const waitlistHtml = fs
  .readFileSync(waitlistHtmlPath, "utf8")
  .replaceAll("__CLERK_SIGN_IN_URL__", clerkSignInUrl)
fs.writeFileSync(waitlistHtmlPath, waitlistHtml)
fs.copyFileSync(
  path.join(process.cwd(), "web", "_routes.json"),
  path.join(distDirectory, "_routes.json"),
)
console.log("Prepared the wait-list page and Pages routing rules.")
