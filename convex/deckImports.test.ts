import { convexTest } from "convex-test"

import { api } from "./_generated/api"
import { parsePastedDeckList } from "./deckImports"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./cards.ts": async () => jest.requireActual("./cards"),
  "./deckImports.ts": async () => jest.requireActual("./deckImports"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const deckListPayload = {
  data: [
    {
      fileName: "AtraxaInfect",
      name: "Atraxa Infect",
      code: "C16",
      releaseDate: "2016-11-11",
      type: "Commander Deck",
    },
  ],
}

function deckListResponse() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => deckListPayload,
  } as unknown as Response)
}

describe("deck list parsing", () => {
  it("parses common exported formats and preserves deck sections", () => {
    expect(
      parsePastedDeckList(`
Commander
1 Atraxa, Praetors' Voice (2X2) 186

Mainboard:
1x Sol Ring
2 Island (M21) 265

Sideboard
1 Swan Song *F*
`),
    ).toEqual({
      entries: [
        { name: "Atraxa, Praetors' Voice", quantity: 1, board: "commander" },
        { name: "Sol Ring", quantity: 1, board: "main" },
        { name: "Island", quantity: 2, board: "main" },
        { name: "Swan Song", quantity: 1, board: "sideboard" },
      ],
      invalidLines: [],
    })
  })

  it("combines duplicate entries and reports malformed lines", () => {
    expect(parsePastedDeckList("1 Sol Ring\n2 Sol Ring\nSol Ring")).toEqual({
      entries: [{ name: "Sol Ring", quantity: 3, board: "main" }],
      invalidLines: ["Sol Ring"],
    })
  })

  it("ignores maybeboard and token sections", () => {
    expect(parsePastedDeckList("1 Forest\nMaybeboard\n1 Island\nTokens\n1 Treasure Token")).toEqual(
      {
        entries: [{ name: "Forest", quantity: 1, board: "main" }],
        invalidLines: [],
      },
    )
  })
})

describe("preconstructed catalog caching", () => {
  it("fetches the official deck list once and serves later searches from the cache", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(deckListResponse)
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "precon-searcher" })
      const first = await actor.action(api.deckImports.searchPreconstructed, { query: "atraxa" })
      const second = await actor.action(api.deckImports.searchPreconstructed, { query: "atraxa" })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(first).toMatchObject([{ fileName: "AtraxaInfect", name: "Atraxa Infect" }])
      expect(second).toEqual(first)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
