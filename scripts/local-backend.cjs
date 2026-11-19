/**
 * why: `convex dev` rewrites .env.local, which worktrees share through a symlink, so the CLI runs from a directory of its
 * own under .convex/. The CLI names the backend after that directory and takes a backend with its own name on its port
 * for itself, so the name is unique per worktree.
 */
const { spawn, spawnSync } = require("node:child_process")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const readline = require("node:readline")

const { writeEnvValues } = require("./preview.cjs")

const root = fs.realpathSync(path.join(path.dirname(require.resolve("./local-backend.cjs")), ".."))
const convex = path.join(root, "node_modules", ".bin", "convex")
// why: previews take their env vars (Clerk, CARD_CATALOG_SYNC=off) from the project's preview defaults; local copies them.
const PROJECT = "matt-sowinghope-how:count"

function localDir(worktree = root) {
  const hash = createHash("sha256").update(worktree).digest("hex").slice(0, 8)
  return path.join(worktree, ".convex", `scryve-${hash}`)
}

// why: a deploy key or deployment in the shell would point the CLI at the cloud instead.
function cliEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !/^CONVEX_(DEPLOY|SELF_HOSTED)/.test(name)),
  )
}

function readCredentials(directory = localDir()) {
  const file = path.join(directory, ".convex", "local", "default", "config.json")
  if (!fs.existsSync(file)) return undefined
  const { ports, adminKey, deploymentName } = JSON.parse(fs.readFileSync(file, "utf8"))
  return {
    url: `http://127.0.0.1:${ports.cloud}`,
    siteUrl: `http://127.0.0.1:${ports.site}`,
    adminKey,
    deploymentName,
  }
}

async function isRunning({ url, deploymentName }) {
  try {
    const response = await fetch(`${url}/instance_name`)
    return response.ok && (await response.text()) === deploymentName
  } catch {
    return false
  }
}

async function localCredentials(directory = localDir()) {
  const credentials = readCredentials(directory)
  if (!credentials || !(await isRunning(credentials)))
    throw new Error(
      "This worktree's local Convex backend is not running. Start it with pnpm convex:local, or pass --preview <name>.",
    )
  return credentials
}

function run(args, input) {
  const piped = input !== undefined
  const result = spawnSync(convex, args, {
    cwd: localDir(),
    env: cliEnv(),
    input,
    stdio: [piped ? "pipe" : "ignore", piped ? "pipe" : "inherit", "inherit"],
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`convex ${args.join(" ")} failed (exit ${result.status})`)
  return result.stdout
}

function prepare(directory = localDir()) {
  fs.mkdirSync(directory, { recursive: true })
  const config = JSON.parse(fs.readFileSync(path.join(root, "convex.json"), "utf8"))
  fs.writeFileSync(
    path.join(directory, "convex.json"),
    JSON.stringify({ ...config, functions: path.relative(directory, path.join(root, "convex")) }),
  )
  const manifest = path.join(directory, "package.json")
  if (!fs.existsSync(manifest))
    fs.symlinkSync(path.relative(directory, path.join(root, "package.json")), manifest)
}

/**
 * why: this first push fails until the env vars it needs are set, but it creates the backend they go on (--skip-push
 * would leave that backend running). `env set` starts it again on its saved ports, which only now are sure to be free:
 * `convex dev` moves ports when another worktree's backend took them, and `env set` would fail instead.
 */
function create() {
  const result = spawnSync(convex, ["dev", "--once"], {
    cwd: localDir(),
    env: cliEnv(),
    encoding: "utf8",
  })
  if (!readCredentials()) {
    process.stderr.write(`${result.stdout}${result.stderr}`)
    throw new Error("Could not create this worktree's local backend")
  }
  const defaults = run(["env", "default", "list", "--type", "preview", "--project", PROJECT], "")
  run(["env", "set", "--force"], defaults)
}

function main() {
  prepare()
  if (!readCredentials()) create()

  // why: the CLI stops its backend only on SIGINT, so it gets its own process group and exactly one SIGINT.
  const child = spawn(convex, ["dev"], {
    cwd: localDir(),
    env: { ...cliEnv(), FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })
  let stopping = false
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(signal, () => {
      stopping = true
      child.kill("SIGINT")
    })
  child.on("exit", (code) => process.exit(stopping ? 0 : (code ?? 1)))

  let announced = false
  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ])
    readline.createInterface({ input: stream }).on("line", (line) => {
      out.write(`${line}\n`)
      if (announced || !line.includes("Convex functions ready")) return
      announced = true
      try {
        announce(readCredentials())
      } catch (error) {
        console.error(error.message)
        child.kill("SIGINT")
      }
    })
}

function announce({ url, siteUrl, deploymentName }) {
  writeEnvValues({
    EXPO_PUBLIC_CONVEX_URL: url,
    EXPO_PUBLIC_CONVEX_SITE_URL: siteUrl,
    CONVEX_DEPLOYMENT: `anonymous:${deploymentName}`,
  })
  console.log(
    `Local backend ready at ${url}. pnpm start:expo serves the app against it, and pnpm bots play on it.`,
  )
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { cliEnv, localCredentials, localDir }
