const { spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const source = path.join(root, "web", "waitlist")
const output = fs.mkdtempSync(path.join(os.tmpdir(), "scryve-waitlist-"))
const waitlist = path.join(output, "waitlist")

function sync() {
  fs.rmSync(waitlist, { force: true, recursive: true })
  fs.cpSync(source, waitlist, { recursive: true })
  const htmlPath = path.join(waitlist, "index.html")
  const html = fs
    .readFileSync(htmlPath, "utf8")
    .replaceAll("__CLERK_SIGN_IN_URL__", process.env.EXPO_PUBLIC_CLERK_SIGN_IN_URL || "/")
  fs.writeFileSync(htmlPath, html)
  fs.copyFileSync(path.join(root, "assets", "images", "app-icon-all.png"), path.join(waitlist, "icon.png"))
  fs.copyFileSync(
    path.join(root, "node_modules", "@expo-google-fonts", "space-grotesk", "400Regular", "SpaceGrotesk_400Regular.ttf"),
    path.join(waitlist, "space-grotesk-regular.ttf"),
  )
  fs.copyFileSync(
    path.join(root, "node_modules", "@expo-google-fonts", "space-grotesk", "600SemiBold", "SpaceGrotesk_600SemiBold.ttf"),
    path.join(waitlist, "space-grotesk-semibold.ttf"),
  )
}

sync()
const watcher = fs.watch(source, { recursive: true }, sync)
const wranglerExecutable = process.platform === "win32" ? "wrangler.cmd" : "wrangler"
const wrangler = spawn(
  path.join(root, "node_modules", ".bin", wranglerExecutable),
  ["pages", "dev", output, "--live-reload", ...process.argv.slice(2)],
  { stdio: "inherit" },
)

function cleanup() {
  watcher.close()
  fs.rmSync(output, { force: true, recursive: true })
}

wrangler.on("exit", (code) => {
  cleanup()
  process.exitCode = code ?? 1
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => wrangler.kill(signal))
}
