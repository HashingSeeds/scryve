// why: without a cap, a peer that never sends a newline grows this buffer until the app runs out of memory.
export const MAX_LINE_BYTES = 64 * 1024
const NON_ASCII = /[\x80-\xff]/
const NOT_ASCII = /[^\x00-\x7f]/g

// why: btoa takes one byte per char, and peers on any version parse the \u escapes back to the same text.
export const encodeLine = (message: unknown) =>
  `${JSON.stringify(message).replace(NOT_ASCII, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`)}\n`

// why: a chunk can end inside a multi-byte character, so chunks stay binary strings (one char per byte) and only whole lines decode as UTF-8.
export function createLineReader(onLine: (line: string) => void) {
  let pending = ""
  return (binaryChunk: string) => {
    pending += binaryChunk
    let lineStart = 0
    let newline = pending.indexOf("\n")
    while (newline !== -1) {
      if (newline - lineStart > MAX_LINE_BYTES) throw new Error("LAN message too long")
      const line = pending.slice(lineStart, newline)
      // why: peers from before ASCII-only JSON send raw UTF-8; the Buffer polyfill decodes it 50x slower on Hermes.
      if (line) onLine(NON_ASCII.test(line) ? decodeURIComponent(escape(line)) : line)
      lineStart = newline + 1
      newline = pending.indexOf("\n", lineStart)
    }
    pending = pending.slice(lineStart)
    if (pending.length > MAX_LINE_BYTES) throw new Error("LAN message too long")
  }
}
