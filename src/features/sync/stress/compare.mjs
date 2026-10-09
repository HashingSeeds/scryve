// Side-by-side scorecards from OUTBOX_STRESS_OUT files.
// Usage: node src/features/sync/stress/compare.mjs base.json sidecar.json inline.json
import { readFileSync } from "node:fs"

const cards = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, "utf8")))
const keyOf = (row) => `${row.scenario}  ${row.check}`
const keys = [...new Set(cards.flatMap((card) => card.rows.map(keyOf)))]
const cell = (row) => {
  if (!row) return "-"
  if (row.na && !row.pass && !row.fail && !row.warn) return "n/a"
  const parts = [`${row.pass}/${row.pass + row.fail}`]
  if (row.warn) parts.push(`w${row.warn}`)
  return parts.join(" ")
}
const width = Math.max(...keys.map((key) => key.length))
const columns = cards.map((card) => card.label.split(" ")[0])
const cellWidth = 12
console.log(`${"".padEnd(width)}  ${columns.map((name) => name.padEnd(cellWidth)).join(" ")}`)
for (const key of keys) {
  const rows = cards.map((card) => card.rows.find((row) => keyOf(row) === key))
  const cells = rows.map((row) => cell(row).padEnd(cellWidth))
  const differs = new Set(rows.map(cell)).size > 1 ? " *" : ""
  console.log(`${key.padEnd(width)}  ${cells.join(" ")}${differs}`)
}
console.log("\nMetrics")
for (const key of keys) {
  const metrics = cards.map((card) => card.rows.find((row) => keyOf(row) === key)?.metric)
  if (metrics.some(Boolean))
    console.log(
      `${key}\n${cards.map((card, index) => `  ${columns[index]}: ${metrics[index] ?? "-"}`).join("\n")}`,
    )
}
