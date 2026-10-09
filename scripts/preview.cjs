const { spawnSync } = require("node:child_process")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { URL } = require("node:url")

const root = path.join(path.dirname(require.resolve("./preview.cjs")), "..")
const convex = path.join(root, "node_modules", ".bin", "convex")
const override = path.join(root, ".env.development.local")

function previewName(branch) {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const hash = createHash("sha256").update(branch).digest("hex").slice(0, 8)
  return `${slug.slice(0, 40).replace(/-$/g, "") || "branch"}-${hash}`
}

function previewKey() {
  const config = path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "scryve",
    ".env.preview",
  )
  const contents = fs.existsSync(config) ? fs.readFileSync(config, "utf8") : ""
  const fromFile = contents.match(/^(?:CONVEX_DEPLOY_KEY|CONVEX_PREVIEW_DEPLOY_KEY)=(.*)$/m)?.[1]
  const key = process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_PREVIEW_DEPLOY_KEY || fromFile
  if (!key) throw new Error(`Set CONVEX_DEPLOY_KEY or create ${config}`)
  if (!/^preview:[^:|]+:[^:|]+\|\S+$/.test(key))
    throw new Error("A Convex preview deploy key is required")
  return key
}

function writeOverride(url, siteUrl, file = override) {
  const parsed = new URL(url)
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !/^[a-z0-9-]+\.convex\.cloud$/.test(parsed.hostname) ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Convex did not provide a preview deployment URL")
  const deployment = parsed.hostname.split(".")[0]
  if (siteUrl !== `https://${deployment}.convex.site`)
    throw new Error("Convex did not provide the matching preview site URL")
  const values = {
    EXPO_PUBLIC_CONVEX_URL: parsed.origin,
    EXPO_PUBLIC_CONVEX_SITE_URL: siteUrl,
    CONVEX_DEPLOYMENT: `preview:${deployment}`,
  }
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error(`Refusing to write through symlink ${file}`)
  let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`
    const pattern = new RegExp(`^${name}=.*$`, "m")
    content = pattern.test(content)
      ? content.replace(pattern, line)
      : `${content.trimEnd()}\n${line}\n`
  }
  fs.writeFileSync(file, content, { mode: 0o600 })
  console.log(`Wrote preview settings to ${file}`)
}

function run(args, env, stdio = "inherit") {
  const result = spawnSync(convex, args, { cwd: root, env, stdio })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Convex ${args[0]} failed (exit ${result.status})`)
}

function main() {
  const command = process.argv[2]
  if (command === "capture") {
    if (
      !process.env.SCRYVE_PREVIEW_URL_FILE ||
      !process.env.EXPO_PUBLIC_CONVEX_URL ||
      !process.env.EXPO_PUBLIC_CONVEX_SITE_URL
    )
      throw new Error("Missing preview URL capture configuration")
    fs.writeFileSync(
      process.env.SCRYVE_PREVIEW_URL_FILE,
      JSON.stringify({
        url: process.env.EXPO_PUBLIC_CONVEX_URL,
        siteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
      }),
    )
    return
  }
  if (command !== "up" && command !== "check") throw new Error("Use preview:up or preview:check")

  const key = previewKey()
  const branch = spawnSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).stdout?.trim()
  if (!branch) throw new Error("A checked-out branch is required for a preview")
  const name = previewName(branch)
  const env = { ...process.env, CONVEX_DEPLOY_KEY: key }

  if (command === "check") {
    if (!fs.existsSync(override)) throw new Error("Run preview:up in this worktree first")
    const deployment = fs
      .readFileSync(override, "utf8")
      .match(/^CONVEX_DEPLOYMENT=preview:([a-z0-9-]+)$/m)?.[1]
    if (!deployment) throw new Error("No preview deployment in this worktree")
    run(["data", "users", "--limit", "1", "--deployment", deployment], env, [
      "ignore",
      "ignore",
      "inherit",
    ])
    console.log(`Preview ${name} is available (${deployment})`)
    return
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-preview-"))
  const urlFile = path.join(directory, "url")
  try {
    run(
      [
        "deploy",
        "--preview-name",
        name,
        "--cmd-url-env-var-name",
        "EXPO_PUBLIC_CONVEX_URL",
        "--cmd",
        "node scripts/preview.cjs capture",
      ],
      { ...env, SCRYVE_PREVIEW_URL_FILE: urlFile },
    )
    const { url, siteUrl } = JSON.parse(fs.readFileSync(urlFile, "utf8"))
    writeOverride(url, siteUrl)
    console.log(`Preview ${name} is ready. Start the app with pnpm start:expo.`)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { previewKey, previewName, writeOverride }
