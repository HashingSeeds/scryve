/**
 * why: an issue filed for player feedback cites the feedback request id, so linking it here means
 * nobody has to remember to press Link issue. Linking tells the player we're tracking it, and lets
 * promotion tell them once the issue's fix ships. The `feedback link` workflow runs this.
 *
 *   GITHUB_EVENT_PATH=event.json node scripts/feedback-link.cjs
 */
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")

// why: Convex ids are lowercase base32; anything else that matches (a Sentry event id) comes back not_found.
const REQUEST_ID = /\b[0-9a-z]{31,37}\b/g

function citedRequests(body) {
  return [...new Set(body?.match(REQUEST_ID) ?? [])]
}

function main() {
  const { issue } = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
  for (const requestId of citedRequests(issue.body)) {
    const args = { requestId, action: "link_issue", text: `#${issue.number}` }
    const result = execFileSync(
      "pnpm",
      ["exec", "convex", "run", "feedback:answerFromRakazo", JSON.stringify(args)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    ).trim()
    console.log(`${requestId}: ${result}`)
  }
}

if (require.main === module) main()

module.exports = { citedRequests }
