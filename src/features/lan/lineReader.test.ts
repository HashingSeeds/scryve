import { Buffer } from "buffer"

import { createLineReader, MAX_LINE_BYTES } from "./lineReader"

describe("createLineReader", () => {
  it("rebuilds a character split across chunks and skips heartbeat lines", () => {
    const lines: string[] = []
    const read = createLineReader((line) => lines.push(line))
    const bytes = Buffer.from('{"name":"José"}\n\n{"name":"Zoë"}\n')
    const splitInsideE = bytes.indexOf(0xc3) + 1

    read(bytes.subarray(0, splitInsideE))
    read(bytes.subarray(splitInsideE))

    expect(lines).toEqual(['{"name":"José"}', '{"name":"Zoë"}'])
  })

  it("refuses a line that never ends", () => {
    const read = createLineReader(() => {})

    expect(() => read(new Uint8Array(MAX_LINE_BYTES + 1).fill(0x61))).toThrow("too long")
  })
})
