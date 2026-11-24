// trace_processor reads the Perfetto traces run.mjs and launch.mjs take. Pinned per platform;
// set TRACE_PROCESSOR to a trace_processor_shell binary for any other machine.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const version = "v58.0"
const builds = {
  "darwin-arm64": {
    name: "mac-arm64",
    sha256: "af44b5187c763929f7d9ad05cc812b304c284e0a2eda2693b8d9689eb74e1842",
  },
  "linux-x64": {
    name: "linux-amd64",
    sha256: "a34796adba1c02e34f257103ffb7130aa2f5da0935ccd906864d5caadf1038c2",
  },
}

export async function traceProcessor() {
  if (process.env.TRACE_PROCESSOR) return process.env.TRACE_PROCESSOR
  const build = builds[`${process.platform}-${process.arch}`]
  if (!build)
    throw new Error("set TRACE_PROCESSOR to a trace_processor_shell binary for this machine")
  const path = join(
    homedir(),
    ".cache/verify-perf",
    `trace_processor_shell-${version}-${build.name}`,
  )
  if (existsSync(path)) return path
  const url = `https://commondatastorage.googleapis.com/perfetto-luci-artifacts/${version}/${build.name}/trace_processor_shell`
  const binary = Buffer.from(await (await fetch(url)).arrayBuffer())
  if (createHash("sha256").update(binary).digest("hex") !== build.sha256)
    throw new Error(`checksum mismatch for ${url}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, binary)
  chmodSync(path, 0o755)
  return path
}

// The last row of a query's CSV output, split into fields.
export function queryLastRow(tracer, trace, sql) {
  const query = join(dirname(trace), "query.sql")
  writeFileSync(query, sql)
  const rows = execFileSync(tracer, ["-q", query, trace], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
  return rows.trim().split("\n").at(-1).split(",")
}
