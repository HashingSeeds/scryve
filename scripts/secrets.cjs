const { spawnSync } = require("node:child_process")
const path = require("node:path")

const root = path.join(__dirname, "..")
const varlock = path.join(root, "node_modules", ".bin", "varlock")

// why: resolving one key at a time keeps each script from fetching secrets it does not use, and the schema file path keeps varlock from loading .env.local.
function readSecret(key) {
  const { status, stdout } = spawnSync(
    varlock,
    ["printenv", "--path", path.join(root, ".env.schema"), key],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      env: { ...process.env, VARLOCK_TELEMETRY_DISABLED: "1" },
    },
  )
  const value = status === 0 ? stdout.trim() : ""
  return value || undefined
}

module.exports = { readSecret }
