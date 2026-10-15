import { Buffer } from "buffer"

// why: a chunk can end inside a multi-byte character, so decode whole lines; slice (not subarray) keeps a Buffer on Hermes.
export function createLineReader(onLine: (line: string) => void) {
  let pending = Buffer.alloc(0)
  return (chunk: Uint8Array) => {
    pending = Buffer.concat([pending, chunk])
    let newline = pending.indexOf(0x0a)
    while (newline !== -1) {
      const line = pending.slice(0, newline).toString("utf8")
      pending = pending.slice(newline + 1)
      if (line) onLine(line)
      newline = pending.indexOf(0x0a)
    }
  }
}
