const { execFileSync } = require("node:child_process")
const fs = require("node:fs")

/** why: must match `provenanceDigest` in src/features/sync/durableOutbox.ts (FNV-1a, 32-bit). */
function provenanceDigest(value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** why: the app stores the first 12 characters of the release commit, so that prefix is what got hashed. */
function gitCandidates() {
  try {
    return execFileSync("git", ["log", "--all", "--format=%H"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((commit) => commit.slice(0, 12))
  } catch {
    return []
  }
}

/**
 * why: OutboxQuarantine events carry digests of update IDs, runtime fingerprints and release commits, never the
 * values, so a build is found by hashing known candidates. Usage: `node scripts/outbox-provenance-lookup.cjs <digest>...`.
 * Commits come from git; pipe update IDs and fingerprints in one per line, e.g.
 * `eas update:list --all --json --non-interactive | jq -r '.. | objects | (.id?, .runtimeVersion?) | strings' | node scripts/outbox-provenance-lookup.cjs 1a2b3c4d`
 */
function lookup(digests, candidates) {
  const wanted = new Set(digests)
  return [...new Set(candidates)].filter((candidate) => wanted.has(provenanceDigest(candidate)))
}

if (require.main === module) {
  const digests = process.argv.slice(2)
  if (!digests.length) {
    console.error("Usage: node scripts/outbox-provenance-lookup.cjs <digest>...")
    process.exit(1)
  }
  const piped = process.stdin.isTTY ? [] : fs.readFileSync(0, "utf8").split(/\s+/).filter(Boolean)
  const matches = lookup(digests, [...piped, ...gitCandidates()])
  for (const match of matches) console.log(`${provenanceDigest(match)} ${match}`)
  if (!matches.length) process.exitCode = 1
}

module.exports = { lookup, provenanceDigest }
