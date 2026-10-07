const { Buffer } = require("node:buffer")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

const {
  DEFAULT_ALLOWED_PATTERNS,
} = require("../tools/eslint-plugin-self-explanatory-code/index.cjs")

const TRACKER_TITLE = "Comment review"
const TRACKER_BODY =
  "Each comment below is a new `why:` comment that landed in main. Check `keep` and the entry hides itself. Check `drop` and an agent removes it with `pnpm comments:apply`; the entry hides once that removal reaches main."
const MARKER_PATTERN = /^<!-- comment-review:([A-Za-z\d+/=]+) -->$/mu
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"])
const CONTEXT_BEFORE = 3
const CONTEXT_AFTER = 6
const COMMENTS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      comments(first: 100, after: $endCursor) {
        nodes { id isMinimized body authorAssociation author { login } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`
const MINIMIZE_MUTATION = `mutation($id: ID!, $classifier: ReportedContentClassifiers!) {
  minimizeComment(input: { subjectId: $id, classifier: $classifier }) { clientMutationId }
}`
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

function formatEntry({ path: filename, line, block }, source, { repo, sha, origin }) {
  const sourceLines = source.replace(/\r\n/gu, "\n").split("\n")
  const firstLine = line - block.slice(0, block.indexOf("why:")).split("\n").length + 1
  const lastLine = firstLine + block.split("\n").length - 1
  const from = Math.max(1, firstLine - CONTEXT_BEFORE)
  let to = Math.min(sourceLines.length, lastLine + CONTEXT_AFTER)
  while (to > lastLine && !sourceLines[to - 1].trim()) to -= 1
  const snippet = sourceLines.slice(from - 1, to)
  const indent = Math.min(
    ...snippet.filter((text) => text.trim()).map((text) => text.match(/^[\t ]*/u)[0].length),
  )
  const diff = snippet
    .map((text, index) => {
      const isWhy = from + index >= firstLine && from + index <= lastLine
      return `${isWhy ? "+" : " "}${text.slice(indent)}`
    })
    .join("\n")
  const fence = "`".repeat(Math.max(3, ...(diff.match(/`+/gu) ?? []).map((run) => run.length + 1)))
  const urlPath = filename.split("/").map(encodeURIComponent).join("/")
  const blobUrl = `https://github.com/${repo}/blob/${sha}/${urlPath}`
  const marker = Buffer.from(JSON.stringify({ path: filename, line, sha, block })).toString(
    "base64",
  )
  return [
    `**[${filename}:${line}](${blobUrl}#L${line})** from ${origin}`,
    "- [ ] keep\n- [ ] drop",
    `${fence}diff\n${diff}\n${fence}`,
    `<details><summary>Permalink</summary>\n\n${blobUrl}#L${from}-L${to}\n\n</details>`,
    `<!-- comment-review:${marker} -->`,
  ].join("\n\n")
}

function parseEntry(body) {
  const match = body.match(MARKER_PATTERN)
  if (!match) return undefined
  try {
    const {
      path: filename,
      line,
      sha,
      block,
    } = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"))
    if (
      typeof filename !== "string" ||
      typeof block !== "string" ||
      path.isAbsolute(filename) ||
      filename.split("/").includes("..")
    ) {
      return undefined
    }
    return {
      path: filename,
      line,
      sha,
      block,
      keep: /^- \[[xX]\] keep[\t ]*\r?$/mu.test(body),
      drop: /^- \[[xX]\] drop[\t ]*\r?$/mu.test(body),
    }
  } catch {
    return undefined
  }
}

function hasBlock(source, { path: filename, block }) {
  const normalized = block.replace(/\r\n/gu, "\n")
  return whyBlocks(source, filename).some(
    (entry) => entry.block.replace(/\r\n/gu, "\n") === normalized,
  )
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
  const run = (command, values, input) =>
    execFileSync(command, values, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, input })
  const [command, base, head] = args
  const hasRange = /^[a-f\d]{40}$/u.test(base ?? "") && /^[a-f\d]{40}$/u.test(head ?? "")
  let repo = process.env.GITHUB_REPOSITORY
  const repoName = () =>
    (repo ||= JSON.parse(run("gh", ["repo", "view", "--json", "nameWithOwner"])).nameWithOwner)

  const sources = new Map()
  const readHead = (filename) => {
    if (!sources.has(filename)) sources.set(filename, run("git", ["show", `${head}:${filename}`]))
    return sources.get(filename)
  }

  const collect = () => {
    const diff = run("git", [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--unified=0",
      base,
      head,
      "--",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
      "*.cjs",
      "*.mjs",
    ])
    const entries = parseDiff(diff, readHead)
    if (!entries.length) return []
    const subject = run("git", ["show", "-s", "--format=%s", head]).trim()
    const origin = subject.match(/\((#\d+)\)$/u)?.[1] ?? head.slice(0, 7)
    return entries.map((entry) => ({
      entry: { ...entry, sha: head },
      body: formatEntry(entry, readHead(entry.path), { repo: repoName(), sha: head, origin }),
    }))
  }

  const findTracker = ({ create }) => {
    const issues = JSON.parse(
      run("gh", [
        "issue",
        "list",
        "--label",
        "comment-review",
        "--state",
        "open",
        "--limit",
        "200",
        "--json",
        "number,title",
      ]),
    )
    const existing = issues.find((issue) => issue.title === TRACKER_TITLE)
    if (existing || !create) return existing?.number
    const url = run("gh", [
      "issue",
      "create",
      "--title",
      TRACKER_TITLE,
      "--label",
      "comment-review",
      "--body",
      TRACKER_BODY,
    ])
    const number = Number(url.trim().split("/").pop())
    try {
      run("gh", ["issue", "pin", String(number)])
    } catch (error) {
      process.stderr.write(`Could not pin #${number}: ${error.message}\n`)
    }
    return number
  }

  const trackerEntries = (number) => {
    const [owner, name] = repoName().split("/")
    return run("gh", [
      "api",
      "graphql",
      "--paginate",
      "-f",
      `query=${COMMENTS_QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
      "-F",
      `number=${number}`,
      "--jq",
      ".data.repository.issue.comments.nodes[]",
    ])
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        const comment = JSON.parse(line)
        const trusted =
          comment.author?.login === "github-actions" ||
          TRUSTED_ASSOCIATIONS.has(comment.authorAssociation)
        const entry = trusted ? parseEntry(comment.body) : undefined
        return entry ? [{ ...entry, id: comment.id, hidden: comment.isMinimized }] : []
      })
  }

  const hide = (id, classifier) =>
    run("gh", [
      "api",
      "graphql",
      "-f",
      `query=${MINIMIZE_MUTATION}`,
      "-f",
      `id=${id}`,
      "-f",
      `classifier=${classifier}`,
    ])

  const entryKey = ({ sha, path: filename, line }) => `${sha}:${filename}:${line}`

  if (command === "collect" && hasRange) {
    process.stdout.write(
      collect()
        .map(({ body }) => body)
        .join("\n\n---\n\n"),
    )
  } else if (command === "sync" && hasRange) {
    const posts = collect()
    const number = findTracker({ create: posts.length > 0 })
    if (!number) return
    const entries = trackerEntries(number)
    const posted = new Set(entries.map(entryKey))
    for (const { entry, body } of posts) {
      if (posted.has(entryKey(entry))) continue
      run(
        "gh",
        ["api", `repos/${repoName()}/issues/${number}/comments`, "--input", "-"],
        JSON.stringify({ body }),
      )
      process.stdout.write(`Queued ${entry.path}:${entry.line}\n`)
    }
    for (const entry of entries.filter(({ hidden }) => !hidden)) {
      let source
      try {
        source = readHead(entry.path)
      } catch {
        source = undefined
      }
      if (source === undefined || !hasBlock(source, entry)) {
        hide(entry.id, entry.drop ? "RESOLVED" : "OUTDATED")
      } else if (entry.keep && !entry.drop) {
        hide(entry.id, "RESOLVED")
      }
    }
  } else if (command === "apply") {
    const number = findTracker({ create: false })
    if (!number) throw new Error(`No open "${TRACKER_TITLE}" issue`)
    const root = fs.realpathSync(run("git", ["rev-parse", "--show-toplevel"]).trim())
    let removed = 0
    let skipped = 0
    for (const entry of trackerEntries(number).filter(({ hidden, drop }) => !hidden && drop)) {
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
    throw new Error("Usage: comment-review.cjs collect|sync <baseSha> <headSha> | apply")
  }
}

module.exports = { parseDiff, formatEntry, parseEntry, hasBlock, removeBlock }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
