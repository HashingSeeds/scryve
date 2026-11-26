import { gunzipSync } from "node:zlib"

import { syncLocalCards } from "./localCards"
import fabCube from "../../../convex/lib/games/fixtures/fabCube.json"

afterEach(() => jest.restoreAllMocks())

const options = {
  game: "fab",
  mirrorBaseUrl: "https://images.example",
  mirrorToken: "secret",
  report: jest.fn(),
} as const

it("uploads Flesh and Blood's card file built from the pinned the-fab-cube release", async () => {
  const release = jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(fabCube))
  const upload = jest.fn().mockResolvedValue(Response.json({ ok: true }))

  await syncLocalCards({ ...options, minCards: 1, fetch: upload })

  expect(release.mock.calls[0][0]).toMatch(/the-fab-cube\/flesh-and-blood-cards\/v[\d.]+\//)
  const [url, init] = upload.mock.calls[0]
  expect(url).toBe("https://images.example/datasets/fab/local-cards.jsonl")
  expect(init.headers).toMatchObject({ authorization: "Bearer secret" })
  const [header, ...lines] = gunzipSync(init.body).toString().split("\n")
  expect(JSON.parse(header).version).toMatch(/^v[\d.]+$/)
  expect(lines.map((line) => JSON.parse(line).name)).toContain("Ball Lightning (red)")
})

it("refuses a release with fewer cards than Flesh and Blood has", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(fabCube))
  const upload = jest.fn()

  await expect(syncLocalCards({ ...options, fetch: upload })).rejects.toThrow("Refusing to upload")
  expect(upload).not.toHaveBeenCalled()
})
