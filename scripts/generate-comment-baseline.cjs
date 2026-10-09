const { ESLint } = require("eslint")
const { BASELINE_PREFIX } = require("eslint-plugin-self-explanatory-code")
const fs = require("node:fs")
const path = require("node:path")

const config = require("../.eslintrc.js")

const ruleName = "self-explanatory-code/prefer-self-explanatory-code"
const [severity, options] = config.rules[ruleName]
// why: overrideConfig replaces the rule's whole options object, so recording keeps the configured allowPatterns.
const baselineRule = [severity, { ...options, recordBaseline: true }]

async function main() {
  const cwd = process.cwd()
  const eslint = new ESLint({
    cwd,
    overrideConfig: {
      rules: { [ruleName]: baselineRule },
    },
  })
  const results = await eslint.lintFiles(["."])
  const files = {}

  for (const result of results) {
    const filename = path.relative(cwd, result.filePath).split(path.sep).join("/")
    for (const message of result.messages) {
      if (!message.message.startsWith(BASELINE_PREFIX)) continue
      const hash = message.message.slice(BASELINE_PREFIX.length)
      files[filename] ??= {}
      files[filename][hash] = (files[filename][hash] ?? 0) + 1
    }
  }

  const sortedFiles = Object.fromEntries(
    Object.entries(files)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([filename, hashes]) => [
        filename,
        Object.fromEntries(
          Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)),
        ),
      ]),
  )
  const output = `${JSON.stringify({ version: 1, files: sortedFiles }, null, 2)}\n`
  fs.writeFileSync(path.join(cwd, ".eslint-comments-baseline.json"), output)
  process.stdout.write(
    `Recorded ${Object.keys(sortedFiles).length} files in the comment baseline.\n`,
  )
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
  })
}

module.exports = { ruleName, baselineRule }
