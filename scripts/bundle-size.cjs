const fs = require("node:fs")
const path = require("node:path")

const MARKER = "<!-- bundle-size -->"
const BUNDLES = { ios: "iOS", android: "Android", web: "Web" }
const budgetFile = require.resolve("./bundle-size-budget.json")

/** why: web splits into async chunks, so each platform's size is every JS file Metro emitted for it. */
function measure(exportDir) {
  return Object.fromEntries(
    Object.keys(BUNDLES).map((platform) => {
      const dir = path.join(exportDir, "_expo", "static", "js", platform)
      const files = fs.readdirSync(dir).map((name) => fs.statSync(path.join(dir, name)).size)
      if (files.length === 0) throw new Error(`No ${platform} bundle in ${dir}`)
      return [platform, files.reduce((total, size) => total + size, 0)]
    }),
  )
}

/** why: the comment job renders numbers a fork PR uploaded, so anything else is rejected. */
function parseSizes(value, label) {
  if (typeof value !== "object" || value === null) throw new Error(`${label} must be an object`)
  return Object.fromEntries(
    Object.keys(BUNDLES).map((platform) => {
      const bytes = value[platform]
      if (!Number.isSafeInteger(bytes) || bytes < 0)
        throw new Error(`${label}.${platform} must be a byte count`)
      return [platform, bytes]
    }),
  )
}

function parseReport(value) {
  return {
    head: parseSizes(value?.head, "head"),
    base: value?.base == null ? null : parseSizes(value.base, "base"),
    limits: parseSizes(value?.limits, "limits"),
  }
}

function overBudget({ head, limits }) {
  return Object.keys(BUNDLES).filter((platform) => head[platform] > limits[platform])
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`

function change(head, base) {
  if (base === undefined) return "no main baseline"
  const kilobytes = Math.round((head - base) / 1000)
  if (kilobytes === 0) return "no change"
  const sign = kilobytes > 0 ? "+" : "-"
  const percent = Math.abs(((head - base) / base) * 100).toFixed(1)
  return `${sign}${Math.abs(kilobytes).toLocaleString("en-US")} KB (${sign}${percent}%)`
}

function renderComment(report) {
  const over = overBudget(report)
  const rows = Object.entries(BUNDLES).map(
    ([platform, name]) =>
      `| ${name} | ${megabytes(report.head[platform])} | ${change(report.head[platform], report.base?.[platform])} | ${megabytes(report.limits[platform])}${over.includes(platform) ? " **over**" : ""} |`,
  )
  const notes = [
    report.base
      ? "Compared with the latest main build."
      : "No main build is recorded yet, so there is no change to show.",
  ]
  if (over.length > 0)
    notes.push(
      `Over budget: ${over.map((platform) => BUNDLES[platform]).join(", ")}. Trim the bundle, or raise the limit in \`scripts/bundle-size-budget.json\` if the growth is worth it.`,
    )
  return [
    MARKER,
    "| Bundle | Size | Change | Budget |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    ...notes,
  ].join("\n")
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"))

function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === "measure" && args.length === 1) {
    console.log(JSON.stringify(measure(args[0])))
    return
  }
  if (command === "check" && args.length === 3) {
    const [headFile, baseFile, reportFile] = args
    const report = parseReport({
      head: readJson(headFile),
      base: fs.existsSync(baseFile) ? readJson(baseFile) : null,
      limits: readJson(budgetFile),
    })
    fs.writeFileSync(reportFile, JSON.stringify(report))
    console.log(renderComment(report))
    const over = overBudget(report)
    if (over.length > 0) {
      console.error(`Bundle budget exceeded: ${over.join(", ")}`)
      process.exitCode = 1
    }
    return
  }
  console.error(
    "Usage: bundle-size.cjs measure <export-dir> | check <head.json> <base.json> <report.json>",
  )
  process.exitCode = 2
}

if (require.main === module) main()

module.exports = { MARKER, measure, parseReport, renderComment }
