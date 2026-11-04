import { gunzipSync, gzipSync } from "node:zlib"

import { syncMagicDataset } from "./mtgDataset"

const BULK = {
  updated_at: "2026-11-04T10:02:03.736+00:00",
  jsonl_download_uri: "https://data.scryfall.io/oracle-cards/oracle-cards.jsonl.gz",
}

function cardLine(id: string, layout = "normal") {
  return JSON.stringify({ id, oracle_id: id, name: `Card ${id}`, layout, oracle_text: "Text" })
}

function fetcherFor(lines: string[]) {
  return jest
    .fn()
    .mockResolvedValueOnce(Response.json(BULK))
    .mockResolvedValueOnce(new Response(gzipSync(lines.join("\n") + "\n")))
    .mockResolvedValueOnce(Response.json({ ok: true }))
}

describe("Magic dataset sync", () => {
  it("uploads the slim deck cards gzip-encoded with the mirror token", async () => {
    const fetcher = fetcherFor([cardLine("a"), cardLine("t", "token"), cardLine("b")])

    await expect(
      syncMagicDataset({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "secret",
        minCards: 2,
        fetch: fetcher,
        report: jest.fn(),
      }),
    ).resolves.toMatchObject({ version: BULK.updated_at, cards: 2 })

    expect(fetcher).toHaveBeenNthCalledWith(2, BULK.jsonl_download_uri, expect.anything())
    const [url, init] = fetcher.mock.calls[2]
    expect(url).toBe("https://images.example/datasets/mtg/cards.json")
    expect(init).toMatchObject({
      method: "PUT",
      headers: expect.objectContaining({ authorization: "Bearer secret" }),
    })
    const uploaded = JSON.parse(gunzipSync(init.body).toString())
    expect(uploaded.version).toBe(BULK.updated_at)
    expect(uploaded.cards.map((card: { name: string }) => card.name)).toEqual(["Card a", "Card b"])
    expect(uploaded.cards[0]).not.toHaveProperty("oracleText")
  })

  it("refuses to upload a short dataset and skips the upload on a dry run", async () => {
    const short = fetcherFor([cardLine("a")])
    await expect(
      syncMagicDataset({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "secret",
        minCards: 2,
        fetch: short,
        report: jest.fn(),
      }),
    ).rejects.toThrow("Refusing to upload 1 cards")
    expect(short).toHaveBeenCalledTimes(2)

    const dryRun = fetcherFor([cardLine("a")])
    await syncMagicDataset({
      mirrorBaseUrl: "",
      mirrorToken: "",
      dryRun: true,
      minCards: 1,
      fetch: dryRun,
      report: jest.fn(),
    })
    expect(dryRun).toHaveBeenCalledTimes(2)
  })
})
