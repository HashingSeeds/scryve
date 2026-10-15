import { Buffer } from "buffer"

// why: a chunk can end inside a multi-byte character, so decode whole lines; slice (not subarray) keeps a Buffer on Hermes.
// why: without a cap, a peer that never sends a newline grows this buffer until the app runs out of memory.
export const MAX_LINE_BYTES = 64 * 1024

export function createLineReader(onLine: (line: string) => void) {
  let pending = Buffer.alloc(0)
  return (chunk: Uint8Array) => {
    pending = Buffer.concat([pending, chunk])
    let newline = pending.indexOf(0x0a)
    while (newline !== -1) {
      if (newline > MAX_LINE_BYTES) throw new Error("LAN message too long")
      const line = pending.slice(0, newline).toString("utf8")
      pending = pending.slice(newline + 1)
      if (line) onLine(line)
      newline = pending.indexOf(0x0a)
    }
    if (pending.length > MAX_LINE_BYTES) throw new Error("LAN message too long")
  }
}
