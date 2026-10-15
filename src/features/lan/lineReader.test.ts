import { Buffer } from "buffer"

import { createLineReader } from "./lineReader"

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
})
