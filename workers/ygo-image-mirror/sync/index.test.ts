import { batches, mirrorOrigin, printingIdsFromCardData, syncYgoImages } from "./index"

describe("Yu-Gi-Oh image sync", () => {
  it("extracts unique printing IDs from one card-data response", () => {
    expect(
      printingIdsFromCardData({
        data: [
          { card_images: [{ id: 46986414 }, { id: 89631139 }] },
          { card_images: [{ id: 46986414 }, { id: "14558127" }, { id: "invalid" }] },
        ],
      }),
    ).toEqual(["46986414", "89631139", "14558127"])
    expect(() => printingIdsFromCardData({ cards: [] })).toThrow("invalid card data")
  })

  it("bounds batch sizes and accepts only an HTTPS mirror origin", () => {
    expect(batches(["1", "2", "3"], 1)).toEqual([["1"], ["2"], ["3"]])
    expect(() => batches(["1"], 2)).toThrow("between 1 and 1")
    expect(mirrorOrigin("https://images.example/")).toBe("https://images.example")
    expect(() => mirrorOrigin("http://images.example")).toThrow("valid HTTPS origin")
    expect(() => mirrorOrigin("https://images.example/path")).toThrow("valid HTTPS origin")
  })

  it("syncs each batch through the authenticated mirror and reports totals", async () => {
    const report = jest.fn()
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ card_images: [{ id: 1 }, { id: 2 }] }, { card_images: [{ id: 3 }] }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ requested: 1, created: 1, existing: 0, failed: 0 }))
      .mockResolvedValueOnce(Response.json({ requested: 1, created: 1, existing: 0, failed: 0 }))
      .mockResolvedValueOnce(Response.json({ requested: 1, created: 0, existing: 1, failed: 0 }))

    await expect(
      syncYgoImages({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "secret",
        fetch: fetcher,
        report,
      }),
    ).resolves.toEqual({ discovered: 3, selected: 3, created: 2, existing: 1, failed: 0 })

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://images.example/mirror",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer secret" }),
        body: JSON.stringify({ printingIds: ["1"] }),
      }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "https://images.example/mirror",
      expect.objectContaining({ body: JSON.stringify({ printingIds: ["2"] }) }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      4,
      "https://images.example/mirror",
      expect.objectContaining({ body: JSON.stringify({ printingIds: ["3"] }) }),
    )
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: "sync_completed", created: 2, existing: 1 }),
    )
  })

  it("can inspect provider data without requiring a mirror token", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ card_images: [{ id: 1 }, { id: 2 }] }] }))
    await expect(
      syncYgoImages({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "",
        dryRun: true,
        limit: 1,
        fetch: fetcher,
        report: jest.fn(),
      }),
    ).resolves.toEqual({ discovered: 2, selected: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("rejects invalid sync options before calling the provider", async () => {
    const fetcher = jest.fn()
    const baseOptions = {
      mirrorBaseUrl: "https://images.example",
      mirrorToken: "secret",
      fetch: fetcher,
    }

    await expect(syncYgoImages({ ...baseOptions, batchSize: 0 })).rejects.toThrow("Batch size")
    await expect(syncYgoImages({ ...baseOptions, batchSize: 2 })).rejects.toThrow("Batch size")
    await expect(syncYgoImages({ ...baseOptions, limit: 0 })).rejects.toThrow("Limit")
    await expect(syncYgoImages({ ...baseOptions, retries: 9 })).rejects.toThrow("Retries")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("does not retry an authorization failure", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ card_images: [{ id: 1 }] }] }))
      .mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }))

    await expect(
      syncYgoImages({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "wrong",
        fetch: fetcher,
        report: jest.fn(),
      }),
    ).rejects.toThrow("status 401")
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("rejects inconsistent mirror totals", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ card_images: [{ id: 1 }] }] }))
      .mockResolvedValue(Response.json({ requested: 1, created: 1, existing: 1, failed: 0 }))

    await expect(
      syncYgoImages({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "secret",
        retries: 0,
        fetch: fetcher,
        report: jest.fn(),
      }),
    ).rejects.toThrow("inconsistent totals")
  })

  it("continues after an exhausted transient batch failure", async () => {
    const report = jest.fn()
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ card_images: [{ id: 1 }, { id: 2 }] }] }))
      .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ requested: 1, created: 1, existing: 0, failed: 0 }))

    await expect(
      syncYgoImages({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "secret",
        batchSize: 1,
        retries: 0,
        fetch: fetcher,
        report,
      }),
    ).resolves.toEqual({ discovered: 2, selected: 2, created: 1, existing: 0, failed: 1 })
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sync_batch_failed", batch: 1, failed: 1 }),
    )
  })

  it("records permanent image failures after retries are exhausted", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ card_images: [{ id: 1 }] }] }))
      .mockResolvedValueOnce(
        Response.json({ requested: 1, created: 0, existing: 0, failed: 1 }, { status: 207 }),
      )

    await expect(
      syncYgoImages({
        mirrorBaseUrl: "https://images.example",
        mirrorToken: "secret",
        retries: 0,
        fetch: fetcher,
        report: jest.fn(),
      }),
    ).resolves.toEqual({ discovered: 1, selected: 1, created: 0, existing: 0, failed: 1 })
  })
})
