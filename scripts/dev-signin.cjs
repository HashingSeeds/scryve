const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const { previewKey } = require("./preview.cjs")

const root = path.join(path.dirname(require.resolve("./dev-signin.cjs")), "..")
const convex = path.join(root, "node_modules", ".bin", "convex")

function testEmail(who) {
  return who.includes("@") ? who : `${who}+clerk_test@sow.care`
}

// why: the ticket must come from the deployment the app talks to, which pnpm preview:up switches.
function deploymentArgs(override = path.join(root, ".env.development.local")) {
  const contents = fs.existsSync(override) ? fs.readFileSync(override, "utf8") : ""
  const preview = contents.match(/^CONVEX_DEPLOYMENT=preview:([a-z0-9-]+)$/m)?.[1]
  return preview ? { args: ["--deployment", preview], key: previewKey() } : { args: [] }
}

function main() {
  const email = testEmail(process.argv[2] ?? "jane")
  const { args, key } = deploymentArgs()
  const result = spawnSync(
    convex,
    ["run", ...args, "devAuth:signInTicket", JSON.stringify({ email })],
    {
      cwd: root,
      encoding: "utf8",
      env: key ? { ...process.env, CONVEX_DEPLOY_KEY: key } : process.env,
      stdio: ["ignore", "pipe", "inherit"],
    },
  )
  if (result.status !== 0) throw new Error(`Could not mint a sign-in ticket for ${email}`)
  const ticket = JSON.parse(result.stdout.trim())
  console.log(`scryve-dev://dev/auth?ticket=${encodeURIComponent(ticket)}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
