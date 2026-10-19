import { Buffer } from "buffer"

import { createLineReader, MAX_LINE_BYTES } from "./lineReader"

describe("createLineReader", () => {
  it("rebuilds characters split across chunks and skips heartbeat lines", () => {
    const lines: string[] = []
    const read = createLineReader((line) => lines.push(line))
    const bytes = Buffer.from('{"name":"José"}\n\n{"name":"Zoë 🐉"}\n').toString("latin1")
    const insideDragon = bytes.indexOf("\xf0") + 2

    read(bytes.slice(0, insideDragon))
    read(bytes.slice(insideDragon))

    expect(lines).toEqual(['{"name":"José"}', '{"name":"Zoë 🐉"}'])
  })

  it("refuses an oversized line whether or not it has ended", () => {
    const read = createLineReader(() => {})

    const oversized = "a".repeat(MAX_LINE_BYTES + 1)

    expect(() => createLineReader(() => {})(oversized)).toThrow("too long")
    expect(() => read(`${oversized}\n`)).toThrow("too long")
  })
})
