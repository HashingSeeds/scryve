// Assembles the Cloudflare Pages output in dist/:
//   dist/            marketing site (site/dist, built by `pnpm site:build`)
//   dist/play/       Expo web export (`expo export --output-dir dist/play`, base path /play)
//   dist/_redirects  routing rules copied from web/_redirects
const fs = require("node:fs")
const path = require("node:path")

// Cloudflare Pages silently skips any directory named `node_modules`, so the
// fonts and icons Expo exports under `dist/assets/node_modules/` would 404 in
// production and the SPA fallback would answer with index.html instead.
const CLOUDFLARE_SKIPPED_DIR = "assets/node_modules/"
const DEPLOYABLE_DIR = "assets/vendor/"
const REWRITABLE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".map"])
const APP_DIR_NAME = "play"

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
const appDirectory = path.join(distDirectory, APP_DIR_NAME)
const siteDirectory = path.join(process.cwd(), "site", "dist")
if (!fs.existsSync(path.join(appDirectory, "index.html"))) {
  fail("dist/play/index.html not found. Run `pnpm bundle:web:prod` first.")
}
if (!fs.existsSync(path.join(siteDirectory, "index.html"))) {
  fail("site/dist/index.html not found. Run `pnpm site:build` first.")
}
// Without a root 404.html, Pages falls back to SPA mode and serves / for unknown paths.
if (!fs.existsSync(path.join(siteDirectory, "404.html"))) {
  fail("site/dist/404.html not found; unknown URLs would fall back to the site's home page.")
}

const skippedDirectory = path.join(appDirectory, CLOUDFLARE_SKIPPED_DIR)
const deployableDirectory = path.join(appDirectory, DEPLOYABLE_DIR)

if (fs.existsSync(skippedDirectory)) {
  fs.rmSync(deployableDirectory, { force: true, recursive: true })
  fs.renameSync(skippedDirectory, deployableDirectory)
  console.log(`Moved play/${CLOUDFLARE_SKIPPED_DIR} to play/${DEPLOYABLE_DIR}`)
}

if (!fs.existsSync(deployableDirectory) || fs.readdirSync(deployableDirectory).length === 0) {
  fail(`play/${DEPLOYABLE_DIR} is missing or empty; the web export looks incomplete.`)
}

let rewrittenFileCount = 0
for (const file of collectRewritableFiles(appDirectory)) {
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
  for (const file of collectRewritableFiles(appDirectory))
    for (const [, value] of fs
      .readFileSync(file, "utf8")
      .matchAll(new RegExp(`${key}:\\s*"([^"]*)"`, "g")))
      bundled.add(value)
  if (bundled.size === 0) fail(`Could not find ${key} in the export; the bundle looks incomplete.`)
  const unexpected = [...bundled].filter((value) => value.replace(/\/$/, "") !== expected)
  if (unexpected.length > 0)
    fail(
      `${key} in dist/play/ is ${unexpected.map((value) => `"${value}"`).join(", ")} but .env.production expects "${expected}". ` +
        `Re-export with \`pnpm bundle:web:prod\` before deploying.`,
    )
}
console.log(`Verified ${GUARDED_KEYS.length} bundled production value(s).`)

// Pages treats unknown paths as 404.html, looking up from the requested directory.
// The app shell at play/404.html makes any /play/* path without a rewrite rule in
// web/_redirects (new routes, mistyped URLs) render the app instead of the site's 404 page.
fs.copyFileSync(path.join(appDirectory, "index.html"), path.join(appDirectory, "404.html"))

for (const entry of fs.readdirSync(distDirectory)) {
  if (entry !== APP_DIR_NAME)
    fs.rmSync(path.join(distDirectory, entry), { force: true, recursive: true })
}
fs.cpSync(siteDirectory, distDirectory, { recursive: true })
fs.copyFileSync(
  path.join(process.cwd(), "web", "_redirects"),
  path.join(distDirectory, "_redirects"),
)
console.log("Merged the marketing site and Pages redirects into dist/.")
