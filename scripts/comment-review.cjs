const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

const {
  DEFAULT_ALLOWED_PATTERNS,
} = require("../tools/eslint-plugin-self-explanatory-code/index.cjs")

const ISSUE_INTRO =
  "New why comments landed in main. Unchecked means keep. Check `drop` for any you want removed, then close the issue. An agent applies drops with `pnpm comments:apply <issue>`."
const MAX_ISSUE_LENGTH = 60_000
const WHY_PATTERN = /^(?:\*\s*)*why:/u

function whyBlocks(source, filename = "") {
  const variant = /\.[jt]sx$/u.test(filename) ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard
  // why: createScanner can miss comments after ambiguous regex or backtick boundaries; rare misses are acceptable.
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, variant, source)
  const comments = []
  const templateBraces = []
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      comments.push({ kind, start: scanner.getTokenPos(), end: scanner.getTextPos() })
    } else if (kind === ts.SyntaxKind.TemplateHead) {
      templateBraces.push(0)
    } else if (templateBraces.length && kind === ts.SyntaxKind.OpenBraceToken) {
      templateBraces[templateBraces.length - 1] += 1
    } else if (templateBraces.length && kind === ts.SyntaxKind.CloseBraceToken) {
      const depth = templateBraces.length - 1
      if (templateBraces[depth]) templateBraces[depth] -= 1
      else if (scanner.reScanTemplateToken(false) === ts.SyntaxKind.TemplateTail)
        templateBraces.pop()
    }
  }

  const blocks = []
  for (let index = 0; index < comments.length; index += 1) {
    const comment = comments[index]
    const text = source.slice(comment.start, comment.end)
    const value = text
      .slice(2, comment.kind === ts.SyntaxKind.MultiLineCommentTrivia ? -2 : undefined)
      .trim()
    if (!WHY_PATTERN.test(value)) continue

    let end = comment.end
    const lineStart = source.lastIndexOf("\n", comment.start - 1) + 1
    if (
      comment.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
      /^\s*$/u.test(source.slice(lineStart, comment.start))
    ) {
      while (comments[index + 1]?.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
        const next = comments[index + 1]
        const nextText = source.slice(next.start, next.end)
        if (!/^\r?\n[\t ]*$/u.test(source.slice(end, next.start))) break
        if (DEFAULT_ALLOWED_PATTERNS.some((pattern) => pattern.test(nextText.slice(2).trim())))
          break
        index += 1
        end = next.end
      }
    }
    const why = comment.start + text.indexOf("why:")
    blocks.push({
      line: source.slice(0, why).split("\n").length,
      start: comment.start,
      end,
      block: source.slice(comment.start, end),
    })
  }
  return blocks
}

function parseDiff(diff, readHeadFile) {
  const files = new Map()
  const candidates = new Set()
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
      if (filename && /\.(?:ts|tsx|js|jsx|cjs|mjs)$/u.test(filename)) {
        if (!files.has(filename)) files.set(filename, new Set())
      } else {
        filename = undefined
      }
    } else if (text.startsWith("@@ ")) {
      line = Number(text.match(/\+(\d+)/u)[1])
    } else if (line !== undefined && filename) {
      if (text.startsWith("+")) {
        files.get(filename).add(line++)
        if (text.includes("why:")) candidates.add(filename)
      } else if (text.startsWith(" ")) line += 1
    }
  }
  return [...files]
    .filter(([file, added]) => added.size && candidates.has(file))
    .flatMap(([file, added]) =>
      whyBlocks(readHeadFile(file), file)
        .filter(({ line }) => added.has(line))
        .map(({ line, block }) => ({ path: file, line, block })),
    )
}

function formatIssue(entries, repo, headSha) {
  const sections = entries.map((entry) => formatEntries([entry], repo, headSha))
  const fullBody = [ISSUE_INTRO, ...sections].join("\n\n")
  if (fullBody.length <= MAX_ISSUE_LENGTH) return fullBody

  const noteSuffix =
    " comment review entries omitted because the issue body reached 60,000 characters."
  const reserve = `\n\n${sections.length}${noteSuffix}`.length
  let body = ISSUE_INTRO
  let included = 0
  for (const section of sections) {
    const candidate = `${body}\n\n${section}`
    if (candidate.length + reserve > MAX_ISSUE_LENGTH) break
    body = candidate
    included += 1
  }
  const omitted = sections.length - included
  return `${body}\n\n${omitted}${noteSuffix}`
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

function removeBlock(source, block, filename) {
  const matches = whyBlocks(source, filename).filter(
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
      "*.jsx",
      "*.cjs",
      "*.mjs",
    ])
    const entries = parseDiff(diff, (filename) => run("git", ["show", `${second}:${filename}`]))
    if (!entries.length) return
    const repo =
      process.env.GITHUB_REPOSITORY ||
      JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner"])).nameWithOwner
    process.stdout.write(formatIssue(entries, repo, second))
  } else if (command === "apply" && /^[1-9]\d*$/u.test(first ?? "")) {
    const { body } = JSON.parse(run("gh", ["issue", "view", first, "--json", "body"]))
    const root = fs.realpathSync(run("git", ["rev-parse", "--show-toplevel"]).trim())
    let removed = 0
    let skipped = 0
    for (const entry of parseCheckedEntries(body)) {
      try {
        const filename = path.join(root, entry.path)
        const result = removeBlock(fs.readFileSync(filename, "utf8"), entry.block, entry.path)
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

module.exports = { parseDiff, formatEntries, formatIssue, parseCheckedEntries, removeBlock }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
