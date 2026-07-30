const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const DEFAULT_ALLOWED_PATTERNS = [
  /^eslint(?:-env|-disable(?:-next-line|-line)?|-enable)?\b/u,
  /^global(?:s)?\b/u,
  /^exported\b/u,
  /^@ts-(?:check|nocheck|ignore|expect-error)\b/u,
  /^@(?:jsx|jsxFrag|jsxImportSource|jsxRuntime)\b/u,
  /^(?:prettier|biome|oxlint)-ignore\b/u,
  /^(?:istanbul|c8)\s+ignore\b/u,
  /^webpack(?:ChunkName|Mode|Prefetch|Preload|FetchPriority|Include|Exclude|Exports):/u,
  /^#__PURE__$/u,
  /^@__PURE__$/u,
  /^@(?:license|preserve)\b/u,
  /^!\s*@preserve\b/u,
]

const FEEDBACK =
  "Prefer self-explanatory code over this comment. Rewrite the code so its intent is expressed through the API, variables, function names, and parameters. Simplify or extract the logic first; keep a comment only when the code cannot express a necessary constraint or rationale."
const BASELINE_PREFIX = "self-explanatory-code-baseline:"
const baselineCache = new Map()

function commentHash(comment) {
  return crypto
    .createHash("sha256")
    .update(`${comment.type}\0${comment.value.replace(/\r\n/gu, "\n")}`)
    .digest("hex")
}

function loadBaseline(filename) {
  if (!filename) return { files: {} }
  if (baselineCache.has(filename)) return baselineCache.get(filename)

  let baseline = { files: {} }
  try {
    baseline = JSON.parse(fs.readFileSync(filename, "utf8"))
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  baselineCache.set(filename, baseline)
  return baseline
}

function relativeFilename(context) {
  const filename = context.getPhysicalFilename?.() ?? context.getFilename()
  return path.relative(context.getCwd(), filename).split(path.sep).join("/")
}

const preferSelfExplanatoryCode = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer simpler, self-explanatory code and APIs over explanatory comments.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          allowDirectiveComments: { type: "boolean" },
          allowPatterns: { type: "array", items: { type: "string" }, uniqueItems: true },
          baselineFile: { type: "string" },
          recordBaseline: { type: "boolean" },
        },
      },
    ],
    messages: { preferCode: FEEDBACK },
  },

  create(context) {
    const sourceCode = context.getSourceCode()
    const options = context.options[0] ?? {}
    const allowDirectiveComments = options.allowDirectiveComments !== false
    const customPatterns = (options.allowPatterns ?? []).map((pattern) => new RegExp(pattern, "u"))
    const baselinePath = options.baselineFile
      ? path.resolve(context.getCwd(), options.baselineFile)
      : undefined
    const baseline = loadBaseline(baselinePath)
    const fileBaseline = { ...(baseline.files?.[relativeFilename(context)] ?? {}) }

    function isAllowed(comment) {
      const value = comment.value.trim()
      return (
        (allowDirectiveComments &&
          DEFAULT_ALLOWED_PATTERNS.some((pattern) => pattern.test(value))) ||
        customPatterns.some((pattern) => pattern.test(value))
      )
    }

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (isAllowed(comment)) continue

          const hash = commentHash(comment)
          if (options.recordBaseline) {
            context.report({ loc: comment.loc, message: `${BASELINE_PREFIX}${hash}` })
            continue
          }

          if ((fileBaseline[hash] ?? 0) > 0) {
            fileBaseline[hash] -= 1
            continue
          }

          context.report({ loc: comment.loc, messageId: "preferCode" })
        }
      },
    }
  },
}

module.exports = {
  rules: {
    "prefer-self-explanatory-code": preferSelfExplanatoryCode,
  },
  BASELINE_PREFIX,
}
