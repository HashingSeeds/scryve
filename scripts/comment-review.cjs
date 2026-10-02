const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

function whyBlocks(source) {
  let offset = 0
  const lines = source.split("\n").map((raw) => {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    const line = { text, start: offset, end: offset + text.length }
    offset += raw.length + 1
    return line
  })
  const blocks = []
  const seen = new Set()
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineComment = line.text.match(/\/\/\s*why:/u)
    const blockComment = line.text.match(/\/\*\*?\s*why:/u)
    const blockText = line.text.match(/^\s*\*\s*why:/u)
    let startLine = index
    let startColumn
    let end

    if (lineComment) {
      startColumn = lineComment.index
      let endLine = index
      if (/^\s*$/u.test(line.text.slice(0, startColumn))) {
        while (/^\s*\/\//u.test(lines[endLine + 1]?.text ?? "")) endLine += 1
      }
      end = lines[endLine].end
    } else if (blockComment) {
      startColumn = blockComment.index
    } else if (blockText) {
      while (startLine >= 0 && !lines[startLine].text.includes("/*")) startLine -= 1
      if (startLine < 0) continue
      startColumn = lines[startLine].text.lastIndexOf("/*")
    } else {
      continue
    }

    const start = lines[startLine].start + startColumn
    if (end === undefined) {
      for (let endLine = startLine; endLine < lines.length; endLine += 1) {
        const close = lines[endLine].text.indexOf("*/", endLine === startLine ? startColumn + 2 : 0)
        if (close < 0) continue
        end = lines[endLine].start + close + 2
        break
      }
      if (end === undefined) continue
    }
    const key = `${start}:${end}`
    if (seen.has(key)) continue
    seen.add(key)
    blocks.push({ line: index + 1, start, end, block: source.slice(start, end) })
  }
  return blocks
}

function parseDiff(diff, readHeadFile) {
  const files = new Map()
  let filename
  let line
  for (const text of diff.split("\n")) {
    if (text.startsWith("diff --git ")) {
      filename = undefined
      line = undefined
    } else if (line === undefined && text.startsWith("+++ ")) {
      let destination = text.slice(4)
      if (destination.startsWith('"')) destination = JSON.parse(destination)
      filename = destination.startsWith("b/") ? destination.slice(2) : undefined
      if (filename && /\.(?:ts|tsx|js|cjs|mjs)$/u.test(filename)) {
        if (!files.has(filename)) files.set(filename, new Set())
      } else {
        filename = undefined
      }
    } else if (text.startsWith("@@ ")) {
      line = Number(text.match(/\+(\d+)/u)[1])
    } else if (line !== undefined && filename) {
      if (text.startsWith("+")) files.get(filename).add(line++)
      else if (text.startsWith(" ")) line += 1
    }
  }
  return [...files]
    .filter(([, added]) => added.size)
    .flatMap(([file, added]) =>
      whyBlocks(readHeadFile(file))
        .filter(({ line }) => added.has(line))
        .map(({ line, block }) => ({ path: file, line, block })),
    )
}

function formatEntries(entries, repo, headSha) {
  return entries
    .map(({ path: filename, line, block }) => {
      const urlPath = filename.split("/").map(encodeURIComponent).join("/")
      const url = `https://github.com/${repo}/blob/${headSha}/${urlPath}#L${line}`
      const fence = "`".repeat(
        Math.max(3, ...(block.match(/`+/gu) ?? []).map((run) => run.length + 1)),
      )
      return `- [ ] drop [${filename}:${line}](${url})\n\n${fence}js\n${block}\n${fence}`
    })
    .join("\n\n")
}

function parseCheckedEntries(body) {
  const entries = []
  const pattern =
    /^- \[([ xX])\] drop \[.*\]\(https:\/\/github\.com\/[^/\n]+\/[^/\n]+\/blob\/[^/\n]+\/(.+)#L(\d+)\)\r?\n\r?\n(`{3,})[^\n]*\r?\n([\s\S]*?)\r?\n\4[\t ]*$/gmu
  for (const match of body.matchAll(pattern)) {
    if (match[1].toLowerCase() !== "x") continue
    const filename = decodeURIComponent(match[2])
    if (path.isAbsolute(filename) || filename.split("/").includes("..")) {
      throw new Error(`Invalid comment path: ${filename}`)
    }
    entries.push({
      path: filename,
      line: Number(match[3]),
      block: match[5].replace(/\r\n/gu, "\n"),
    })
  }
  return entries
}

function removeBlock(source, block) {
  const matches = whyBlocks(source).filter(
    (entry) => entry.block.replace(/\r\n/gu, "\n") === block.replace(/\r\n/gu, "\n"),
  )
  if (matches.length !== 1) {
    return {
      source,
      removed: false,
      reason: matches.length ? "ambiguous block" : "block no longer exists",
    }
  }
  let { start, end } = matches[0]
  const lineStart = source.lastIndexOf("\n", start - 1) + 1
  const nextNewline = source.indexOf("\n", end)
  const lineEnd = nextNewline === -1 ? source.length : nextNewline
  let replacement = ""
  if (
    /^[\t ]*$/u.test(source.slice(lineStart, start)) &&
    /^[\t \r]*$/u.test(source.slice(end, lineEnd))
  ) {
    start = lineStart
    end = nextNewline === -1 ? lineEnd : nextNewline + 1
  } else if (
    /[\t ]/u.test(source[start - 1] ?? "") &&
    (/\s/u.test(source[end] ?? "") || end === source.length)
  ) {
    start -= 1
  } else if (!/\s/u.test(source[start - 1] ?? "") && !/\s/u.test(source[end] ?? "")) {
    replacement = " "
  }
  return { source: source.slice(0, start) + replacement + source.slice(end), removed: true }
}

function main(args) {
  const run = (command, values) =>
    execFileSync(command, values, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const [command, first, second] = args
  if (
    command === "collect" &&
    /^[a-f\d]{40}$/u.test(first ?? "") &&
    /^[a-f\d]{40}$/u.test(second ?? "")
  ) {
    const diff = run("git", [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--unified=0",
      first,
      second,
      "--",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.cjs",
      "*.mjs",
    ])
    const entries = parseDiff(diff, (filename) => run("git", ["show", `${second}:${filename}`]))
    if (!entries.length) return
    const repo =
      process.env.GITHUB_REPOSITORY ||
      JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner"])).nameWithOwner
    process.stdout.write(`${formatEntries(entries, repo, second)}\n`)
  } else if (command === "apply" && /^[1-9]\d*$/u.test(first ?? "")) {
    const { body } = JSON.parse(run("gh", ["issue", "view", first, "--json", "body"]))
    const root = fs.realpathSync(run("git", ["rev-parse", "--show-toplevel"]).trim())
    let removed = 0
    let skipped = 0
    for (const entry of parseCheckedEntries(body)) {
      try {
        const filename = path.join(root, entry.path)
        const result = removeBlock(fs.readFileSync(filename, "utf8"), entry.block)
        if (!result.removed) throw new Error(result.reason)
        fs.writeFileSync(filename, result.source)
        removed += 1
        process.stdout.write(`Removed ${entry.path}:${entry.line}\n`)
      } catch (error) {
        skipped += 1
        process.stderr.write(`Skipped ${entry.path}:${entry.line}: ${error.message}\n`)
      }
    }
    process.stdout.write(`Removed ${removed} comment blocks; skipped ${skipped}.\n`)
  } else {
    throw new Error("Usage: comment-review.cjs collect <baseSha> <headSha> | apply <issueNumber>")
  }
}

module.exports = { parseDiff, formatEntries, parseCheckedEntries, removeBlock }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
