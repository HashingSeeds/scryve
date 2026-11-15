const { spawnSync } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const util = require("node:util")

const { settleOffMainVersion, settleVersion } = require("./release-native.cjs")
const { readSecret } = require("./secrets.cjs")

const root = path.join(__dirname, "..")
const easCli = `eas-cli@${require("../package.json").config.easCli}`

// why: Android ignores the :device profiles, which only turn off the iOS simulator, so it builds from the base ones.
const TARGETS = {
  "ios:development:sim": { profile: "development", output: "ios-sim.tar.gz" },
  "ios:development": { profile: "development:device", output: "ios-dev.ipa" },
  "ios:preview": { profile: "preview:device", output: "ios-preview.ipa" },
  "ios:production": { profile: "production", output: "ios-prod.ipa" },
  // why: Xcode signs this one for development, which EAS cannot, so "profile" only labels it for --nas.
  "ios:profile": { profile: "profile", output: "ios-profile.ipa" },
  "android:development": { profile: "development", output: "android-dev.apk" },
  "android:preview": { profile: "preview", output: "android-preview.apk" },
  "android:production": { profile: "production", output: "android-prod.aab" },
}

const USAGE = `Usage: pnpm <target> [--build] [--upload] [--nas] [--ship] [--build-path <path>] [--off-main] [--fresh] [--all-archs]
Targets: ${Object.keys(TARGETS).join(", ")}`

// Reads `<target> [flags]`. No flag builds, --upload (EAS) and --nas (`builds put`) send the artifact after a build only with --build, --ship builds then uploads, --build-path moves the artifact for every step, and --off-main builds a production artifact without a version commit.
// --fresh and --all-archs turn off the shortcuts a plain development build takes (see localPlan).
function parseArgs(args) {
  let parsed
  try {
    parsed = util.parseArgs({
      args,
      allowPositionals: true,
      options: {
        build: { type: "boolean" },
        upload: { type: "boolean" },
        ship: { type: "boolean" },
        nas: { type: "boolean" },
        "build-path": { type: "string" },
        "off-main": { type: "boolean" },
        fresh: { type: "boolean" },
        "all-archs": { type: "boolean" },
      },
    })
  } catch (error) {
    throw new Error(`${error.message}\n${USAGE}`, { cause: error })
  }
  const { positionals, values } = parsed
  const [target, ...extra] = positionals
  if (!(target in TARGETS) || extra.length > 0) throw new Error(USAGE)
  const offMain = Boolean(values["off-main"])
  if (offMain && TARGETS[target].profile !== "production")
    throw new Error(`--off-main only applies to production builds.\n${USAGE}`)
  const upload = Boolean(values.upload || values.ship)
  if (upload && target === "ios:profile")
    throw new Error("ios:profile is not an EAS build, so it cannot --upload. Use --nas.")
  const nas = Boolean(values.nas)
  return {
    target,
    build: Boolean(values.build || values.ship || !(upload || nas)),
    upload,
    nas,
    offMain,
    fresh: Boolean(values.fresh),
    allArchs: Boolean(values["all-archs"]),
    // why: pnpm runs scripts from the repo root, so a path typed in a subdirectory resolves against INIT_CWD.
    buildPath: values["build-path"]
      ? path.resolve(process.env.INIT_CWD ?? process.cwd(), values["build-path"])
      : path.join(root, "build", TARGETS[target].output),
  }
}

// Each build architecture matching the machine's own simulator or emulator.
const ARCHITECTURES = {
  arm64: { ios: "arm64", android: "arm64-v8a" },
  x64: { ios: "x86_64", android: "x86_64" },
}

// A plain development build stays on this machine, so it first looks for a build `builds` already has
// with the same fingerprint (--fresh skips that), and otherwise compiles only this machine's
// architecture, about half the work (--all-archs builds both, as for a physical Android device).
// Builds for CI, --nas or --upload reach other machines and keep every architecture.
// why: eas.json's profile env beats the shell's, so the architecture goes in as a Gradle system
// property and an xcodebuild argument, which both outrank it.
function localPlan({ target, upload, nas, fresh, allArchs }, env = process.env, arch = os.arch()) {
  if (TARGETS[target].profile !== "development" || upload || nas || env.CI) return { reuse: false, env: {} }
  const [platform] = target.split(":")
  const name = allArchs ? undefined : ARCHITECTURES[arch]?.[platform]
  const join = (current, extra) => [current, extra].filter(Boolean).join(" ")
  const archEnv = !name
    ? {}
    : platform === "android"
      ? { GRADLE_OPTS: join(env.GRADLE_OPTS, `-Dorg.gradle.project.reactNativeArchitectures=${name}`) }
      : { GYM_XCARGS: join(env.GYM_XCARGS, `ARCHS=${name}`) }
  return { reuse: !fresh, env: archEnv }
}

// Copies the build `builds get` finds for the current fingerprint (CI's attested builds of main
// first, then the NAS) to buildPath. False when `builds` is not installed or finds none.
function reuseBuild({ target, buildPath }) {
  const { status, stdout, error } = spawnSync("builds", ["get", ...easArgs(target), "--fingerprint", "current"], {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  })
  if (error?.code === "ENOENT") return false
  if (error || status !== 0) {
    console.error("Building instead.")
    return false
  }
  const found = stdout.trim().split("\n").at(-1)
  fs.copyFileSync(found, buildPath)
  console.log(`Reused ${found} for this fingerprint. Pass --fresh to build anyway.`)
  return true
}

function easArgs(target) {
  const [platform] = target.split(":")
  return ["--platform", platform, "--profile", TARGETS[target].profile]
}

function buildCommand({ target, buildPath }) {
  if (target === "ios:profile") {
    const env = ["npx", "--yes", easCli, "env:exec", "preview", "--non-interactive"]
    return ["node", "scripts/quiet-pod-script-phases.cjs", ...env, "sh scripts/ios-profile.sh"]
  }
  const eas = ["npx", "--yes", easCli, "build", ...easArgs(target), "--local", "--output", buildPath]
  return target.startsWith("ios:") ? ["node", "scripts/quiet-pod-script-phases.cjs", ...eas] : eas
}

function uploadCommand({ target, buildPath }) {
  return ["eas-local", "upload", ...easArgs(target), "--build-path", buildPath, "--current", "--non-interactive"]
}

function nasCommand({ target, buildPath }) {
  return ["builds", "put", buildPath, ...easArgs(target)]
}

const readEnvFile = (file) => util.parseEnv(fs.readFileSync(path.join(root, file), "utf8"))

// why: preview only needs Sentry's token to upload source maps; production loads the same public config as the web release.
// why: profile builds read only the EAS preview environment, as an EAS build would, and keep their events and source maps out of preview's.
function buildEnv({ target, buildPath }) {
  if (target === "ios:profile") {
    return {
      APP_VARIANT: "preview",
      EXPO_NO_DOTENV: "1",
      EXPO_PUBLIC_SENTRY_ENVIRONMENT: "profile",
      SENTRY_DISABLE_AUTO_UPLOAD: "true",
      SCRYVE_PROFILE_BUILD: "1",
      SCRYVE_PROFILE_IPA: buildPath,
    }
  }
  const [environment] = TARGETS[target].profile.split(":")
  if (environment === "development") return { APP_VARIANT: "development" }
  if (environment === "preview") return sentryToken()
  return { ...readEnvFile(".env.local"), ...readEnvFile(".env.production"), ...sentryToken() }
}

function sentryToken() {
  const SENTRY_AUTH_TOKEN = readSecret("SENTRY_AUTH_TOKEN")
  return SENTRY_AUTH_TOKEN ? { SENTRY_AUTH_TOKEN } : {}
}

function run([command, ...args], env) {
  const { status, error } = spawnSync(command, args, { cwd: root, stdio: "inherit", env })
  if (error) throw error
  if (status !== 0) {
    process.exitCode = status ?? 1
    throw new Error(`${command} exited with ${status}`)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.build) {
    const production = TARGETS[options.target].profile === "production"
    // why: an off-main build cannot commit its version, so app.config.ts reads it from SCRYVE_APP_VERSION.
    const offMainVersion = production && options.offMain ? settleOffMainVersion() : undefined
    if (production && !options.offMain) settleVersion()
    fs.mkdirSync(path.dirname(options.buildPath), { recursive: true })
    const local = localPlan(options)
    if (local.reuse && reuseBuild(options)) return
    run(buildCommand(options), {
      ...process.env,
      // why: EAS defaults to the OS temp dir, a RAM tmpfs on some Linux machines that a 4 GB build fills or OOMs.
      EAS_LOCAL_BUILD_WORKINGDIR:
        process.env.EAS_LOCAL_BUILD_WORKINGDIR ??
        path.join(os.homedir(), ".cache", "eas-build-local", crypto.randomUUID()),
      ...buildEnv(options),
      ...(offMainVersion ? { SCRYVE_APP_VERSION: offMainVersion } : {}),
      ...local.env,
    })
  }
  if (options.upload) run(uploadCommand(options), process.env)
  if (options.nas) run(nasCommand(options), process.env)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode ||= 1
  }
}

module.exports = { TARGETS, buildCommand, localPlan, nasCommand, parseArgs, uploadCommand }
