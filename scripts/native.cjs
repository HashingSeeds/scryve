const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const util = require("node:util")

const { settleVersion } = require("./release-native.cjs")

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

const USAGE = `Usage: pnpm <target> [--build] [--upload] [--nas] [--ship] [--build-path <path>]
Targets: ${Object.keys(TARGETS).join(", ")}`

// Reads `<target> [flags]`. No flag builds, --upload (EAS) and --nas (`builds put`) send the artifact after a build only with --build, --ship builds then uploads, and --build-path moves the artifact for every step.
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
      },
    })
  } catch (error) {
    throw new Error(`${error.message}\n${USAGE}`, { cause: error })
  }
  const { positionals, values } = parsed
  const [target, ...extra] = positionals
  if (!(target in TARGETS) || extra.length > 0) throw new Error(USAGE)
  const upload = Boolean(values.upload || values.ship)
  if (upload && target === "ios:profile")
    throw new Error("ios:profile is not an EAS build, so it cannot --upload. Use --nas.")
  const nas = Boolean(values.nas)
  return {
    target,
    build: Boolean(values.build || values.ship || !(upload || nas)),
    upload,
    nas,
    // why: pnpm runs scripts from the repo root, so a path typed in a subdirectory resolves against INIT_CWD.
    buildPath: values["build-path"]
      ? path.resolve(process.env.INIT_CWD ?? process.cwd(), values["build-path"])
      : path.join(root, "build", TARGETS[target].output),
  }
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
  if (environment === "preview") {
    const { SENTRY_AUTH_TOKEN } = readEnvFile(".env.local")
    return SENTRY_AUTH_TOKEN ? { SENTRY_AUTH_TOKEN } : {}
  }
  return { ...readEnvFile(".env.local"), ...readEnvFile(".env.production") }
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
    if (TARGETS[options.target].profile === "production") settleVersion()
    fs.mkdirSync(path.dirname(options.buildPath), { recursive: true })
    run(buildCommand(options), { ...process.env, ...buildEnv(options) })
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

module.exports = { TARGETS, buildCommand, nasCommand, parseArgs, uploadCommand }
