/**
 * why: Rakazo runs on Matthew's Mac behind Tailscale, where Convex can't reach it. This process
 * reaches out instead: it subscribes to feedback waiting on the team and forwards each request to
 * a Rakazo webhook routine, so it catches up by itself after the Mac sleeps.
 *
 *   pnpm rakazo:bridge            run in the foreground
 *   pnpm rakazo:bridge --install  keep it running from a LaunchAgent (macOS, main checkout only)
 *
 * Settings come from the environment, or from ~/.config/scryve/rakazo-bridge.env:
 *   SCRYVE_CONVEX_URL      the deployment's https://<name>.convex.cloud URL
 *   RAKAZO_BRIDGE_SECRET   the same value as that deployment's RAKAZO_BRIDGE_SECRET env var
 *   RAKAZO_WEBHOOK_URL     http://127.0.0.1:<port>/api/v1/bots/<bot id>/webhook
 *   RAKAZO_WEBHOOK_SECRET  the bot's webhook secret
 */
const { ConvexClient } = require("convex/browser")
const { anyApi: api } = require("convex/server")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { setInterval } = require("node:timers")

const script = require.resolve("./rakazo-bridge.cjs")
const ENV_FILE = path.join(os.homedir(), ".config", "scryve", "rakazo-bridge.env")
const LABEL = "com.scryve.rakazo-bridge"
const RETRY_MS = 60_000
const TIMEOUT_MS = 15_000

function createBridge({ deliver, markDelivered, log }) {
  let latest = []
  let draining = null
  async function drain() {
    const tried = new Set()
    const keyOf = (item) => `${item.requestId}:${item.turn}`
    for (let item; (item = latest.find((next) => !tried.has(keyOf(next))));) {
      const key = keyOf(item)
      tried.add(key)
      try {
        await deliver(item, key)
        await markDelivered(item)
        log(`Sent ${item.title} to Rakazo`)
      } catch (error) {
        log(`Couldn't send ${item.requestId}: ${error.message}. Retrying within a minute.`)
      }
    }
  }
  function flush() {
    draining ??= drain().finally(() => (draining = null))
    return draining
  }
  return {
    update(items) {
      latest = items
      return flush()
    },
    flush,
  }
}

async function postToRakazo({ url, secret }, item, key) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secret}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `scryve-feedback:${key}`,
    },
    body: JSON.stringify(item),
    signal: globalThis.AbortSignal.timeout(TIMEOUT_MS),
  })
  const result = await response.json().catch(() => ({}))
  // why: Rakazo answers 200 with `ignored` when the bot has no active webhook routine, dropping the event.
  if (result.ignored) throw new Error("the Rakazo bot has no active webhook routine")
  if (!response.ok) throw new Error(`Rakazo answered ${response.status}`)
}

function settings() {
  const all = {
    SCRYVE_CONVEX_URL: process.env.SCRYVE_CONVEX_URL,
    RAKAZO_BRIDGE_SECRET: process.env.RAKAZO_BRIDGE_SECRET,
    RAKAZO_WEBHOOK_URL: process.env.RAKAZO_WEBHOOK_URL,
    RAKAZO_WEBHOOK_SECRET: process.env.RAKAZO_WEBHOOK_SECRET,
  }
  const missing = Object.keys(all).filter((name) => !all[name])
  if (missing.length) throw new Error(`Set ${missing.join(", ")} in the environment or ${ENV_FILE}`)
  return all
}

function install() {
  const dir = path.dirname(script)
  const git = (arg) =>
    path.resolve(
      dir,
      spawnSync("git", ["rev-parse", arg], { cwd: dir, encoding: "utf8" }).stdout.trim(),
    )
  // why: agents work in worktrees that get deleted, which would leave the LaunchAgent pointing at nothing.
  if (git("--git-dir") !== git("--git-common-dir"))
    throw new Error("Run --install from the main checkout, not a worktree")
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`)
  const log = path.join(os.homedir(), "Library", "Logs", "rakazo-bridge.log")
  fs.mkdirSync(path.dirname(plist), { recursive: true })
  fs.writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${script}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`,
  )
  const domain = `gui/${os.userInfo().uid}`
  spawnSync("launchctl", ["bootout", `${domain}/${LABEL}`])
  const result = spawnSync("launchctl", ["bootstrap", domain, plist], { stdio: "inherit" })
  if (result.status !== 0) throw new Error("launchctl bootstrap failed")
  console.log(`Installed ${plist}, logging to ${log}`)
}

function main() {
  if (process.argv[2] === "--install") return install()
  if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE)
  const config = settings()
  const secret = config.RAKAZO_BRIDGE_SECRET
  const rakazo = { url: config.RAKAZO_WEBHOOK_URL, secret: config.RAKAZO_WEBHOOK_SECRET }
  const client = new ConvexClient(config.SCRYVE_CONVEX_URL)
  const log = (line) => console.log(`${new Date().toISOString()} ${line}`)
  const bridge = createBridge({
    deliver: (item, key) => postToRakazo(rakazo, item, key),
    markDelivered: ({ requestId, turn }) =>
      client.mutation(api.feedback.rakazoDelivered, { secret, requestId, turn }),
    log,
  })
  client.onUpdate(
    api.feedback.rakazoPending,
    { secret },
    (items) => void bridge.update(items),
    (error) => {
      // why: a rejected secret never recovers on its own; exiting lets launchd's throttle space out restarts.
      log(`Convex refused the subscription: ${error.message}`)
      process.exit(1)
    },
  )
  setInterval(() => void bridge.flush(), RETRY_MS)
  log("Waiting for feedback")
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}

module.exports = { createBridge, postToRakazo }
