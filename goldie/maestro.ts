/**
 * why: Maestro reaches every screen and records the preview, and goldie only frames them, so this
 * writes Maestro's captures where `goldie frame` and `goldie preview` read raw ones. Usage and
 * setup: .maestro/store-assets/README.md.
 */
import { execFileSync, spawn } from "node:child_process"
import {
  copyFileSync,
  rmSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline"
import { parseArgs } from "node:util"

import { APP_LANGUAGES } from "./goldie.config.ts"
import { restoreSeed } from "./seed.cjs"
import { serveTable, TABLE_PORT } from "./table.mjs"

const GOLDIE = process.env.GOLDIE_ROOT ?? join(homedir(), "oss/goldie")
const { loadConfig, flowPath, isCaptured, isPreview } = await import(`${GOLDIE}/src/config.ts`)
const { rawDirFor } = await import(`${GOLDIE}/src/capture.ts`)
const { DEVICES } = await import(`${GOLDIE}/src/specs.ts`)

const { values } = parseArgs({
  options: {
    "device": { type: "string" },
    "locale": { type: "string" },
    "scene": { type: "string" },
    "no-preview": { type: "boolean" },
    "no-scenes": { type: "boolean" },
  },
})
const pick = (value: string | undefined) => value?.split(",")

const cfg = await loadConfig(
  process.env.GOLDIE_CONFIG ?? resolve(import.meta.dir, "goldie.config.ts"),
)
const devices: string[] = pick(values.device) ?? cfg.devices
const locales: string[] = pick(values.locale) ?? cfg.locales
const sceneIds = pick(values.scene)
const scenes = values["no-scenes"]
  ? []
  : cfg.scenes.filter(
      (scene: { id: string }) => isCaptured(scene) && (!sceneIds || sceneIds.includes(scene.id)),
    )
const preview = values["no-preview"] ? undefined : cfg.scenes.find(isPreview)

const env = { APP_ID: cfg.bundleId, TABLE: `http://127.0.0.1:${TABLE_PORT}` }

function storePassword() {
  const secrets = join(homedir(), ".argent/secrets.env")
  const password =
    process.env.GOLDIE_STORE_PASSWORD ??
    (existsSync(secrets)
      ? readFileSync(secrets, "utf8").match(/^GOLDIE_STORE_PASSWORD=(.*)$/m)?.[1]
      : undefined)
  if (!password) throw new Error("Set GOLDIE_STORE_PASSWORD for the store account's sign-in")
  return password
}

function simulator(name: string): string {
  const { devices } = JSON.parse(
    execFileSync("xcrun", ["simctl", "list", "devices", "available", "-j"], { encoding: "utf8" }),
  ) as { devices: Record<string, { udid: string; name: string; state: string }[]> }
  const matches = Object.values(devices)
    .flat()
    .filter((device) => device.name === name)
  const found = matches.find((device) => device.state === "Booted") ?? matches[0]
  if (!found) throw new Error(`No "${name}" simulator`)
  if (found.state !== "Booted") execFileSync("xcrun", ["simctl", "boot", found.udid])
  execFileSync("xcrun", ["simctl", "bootstatus", found.udid, "-b"], { stdio: "ignore" })
  return found.udid
}

function prepareSimulator(udid: string) {
  execFileSync("xcrun", ["simctl", "ui", udid, "appearance", cfg.appearance])
  execFileSync("xcrun", [
    "simctl",
    "status_bar",
    udid,
    "override",
    "--time",
    "9:41",
    "--batteryState",
    "charged",
    "--batteryLevel",
    "100",
    "--wifiMode",
    "active",
    "--wifiBars",
    "3",
    "--cellularMode",
    "active",
    "--cellularBars",
    "4",
    "--dataNetwork",
    "5g",
  ])
  execFileSync("xcrun", ["simctl", "install", udid, resolve(cfg.root, cfg.appPath)])
}

async function runMaestro(udid: string, flows: string[], vars: Record<string, string>) {
  const out = mkdtempSync(join(tmpdir(), "goldie-maestro-"))
  const args = ["--device", udid, "test", "--test-output-dir", out, "--debug-output", out]
  for (const [key, value] of Object.entries({ ...env, ...vars })) args.push("-e", `${key}=${value}`)
  // why: async, so this process keeps answering the table server while flows call it.
  const run = spawn("maestro", [...args, ...flows], { stdio: ["ignore", "pipe", "inherit"] })
  const exited = new Promise((done) => run.once("close", done))
  for await (const line of createInterface({ input: run.stdout }))
    if (/FAILED|Element not found|^\s*>/.test(line)) console.log(`    ${line.trim()}`)
  const files = new Map<string, string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name))
      else files.set(entry.name, join(dir, entry.name))
    }
  }
  walk(out)
  return { files, out, ok: (await exited) === 0 }
}

const seconds = (file: string) =>
  Number(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      {
        encoding: "utf8",
      },
    ),
  )

const table = await serveTable()
const missing: string[] = []
try {
  for (const deviceKey of devices) {
    const udid = simulator(DEVICES[deviceKey].simulatorName)
    prepareSimulator(udid)
    // why: the session lives in the simulator's keychain, which clearState keeps, so one sign-in per device covers every scene.
    const signIn = await runMaestro(udid, [flowPath(cfg, "sign-in")], { PASSWORD: storePassword() })
    // why: Maestro's logs record every -e value, the password included.
    rmSync(signIn.out, { recursive: true, force: true })
    if (!signIn.ok) throw new Error(`Sign-in failed on ${deviceKey}`)
    for (const locale of locales) {
      const { appleLocale } = APP_LANGUAGES[locale]
      const rawDir = rawDirFor(cfg, deviceKey, locale)
      mkdirSync(rawDir, { recursive: true })
      const manifestFile = join(rawDir, "manifest.json")
      const manifest = existsSync(manifestFile)
        ? JSON.parse(readFileSync(manifestFile, "utf8"))
        : { device: deviceKey, udid, screenshots: [], preview: null }
      // why: Expo reads the app's locale from AppleLanguages, so it carries the region that formats numbers and dates.
      const vars = { LANGUAGE: appleLocale.replace("_", "-"), LOCALE: appleLocale }
      await restoreSeed()

      if (scenes.length) {
        console.log(
          `> ${deviceKey} ${locale}: ${scenes.map((scene: { id: string }) => scene.id).join(", ")}`,
        )
        // why: each scene flow ends with `takeScreenshot: <its id>`, so files map back by name.
        const { files: shots, ok: scenesOk } = await runMaestro(
          udid,
          scenes.map((scene: { flow: string }) => flowPath(cfg, scene.flow)),
          vars,
        )
        for (const scene of scenes) {
          const shot = shots.get(`${scene.id}.png`)
          if (shot) copyFileSync(shot, join(rawDir, `${scene.id}.png`))
          else missing.push(`${deviceKey}/${locale}/${scene.id}`)
        }
        if (!scenesOk) missing.push(`${deviceKey}/${locale}: a scene flow failed`)
      }
      // why: a run of some scenes keeps the captures earlier runs left, so the manifest lists every one on disk.
      manifest.screenshots = cfg.scenes
        .filter(isCaptured)
        .map((scene: { id: string }) => ({
          sceneId: scene.id,
          file: join(rawDir, `${scene.id}.png`),
        }))
        .filter((entry: { file: string }) => existsSync(entry.file))

      if (preview && DEVICES[deviceKey].preview) {
        console.log(`> ${deviceKey} ${locale}: preview`)
        // why: each segment flow wraps its filmed steps in `startRecording: <segment id>`.
        const { files: clips, ok: previewOk } = await runMaestro(
          udid,
          preview.segments.map((segment: { flow: string }) => flowPath(cfg, segment.flow)),
          vars,
        )
        const recorded = preview.segments.map((segment: { id: string }) => {
          const clip = clips.get(`${segment.id}.mp4`)
          if (!clip) return undefined
          const file = join(rawDir, `${preview.id}-${segment.id}.mp4`)
          copyFileSync(clip, file)
          return { segmentId: segment.id, file, durationSeconds: seconds(file) }
        })
        if (recorded.every(Boolean)) manifest.preview = { sceneId: preview.id, clips: recorded }
        else missing.push(`${deviceKey}/${locale}/${preview.id}`)
        if (!previewOk) missing.push(`${deviceKey}/${locale}: the preview flow failed`)
      }

      manifest.capturedAt = new Date().toISOString()
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
    }
  }
} finally {
  table.close()
}
if (missing.length) {
  console.error(`Not captured or failed: ${missing.join(", ")}`)
  process.exitCode = 1
}
