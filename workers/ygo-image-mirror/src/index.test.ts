import {
  isJpeg,
  MAX_MIRROR_TARGETS,
  mirrorTargetForPrintingId,
  printingIdFromKey,
  readBoundedBody,
  sourceUrlForKey,
  validateMirrorInput,
} from "./validation"

import worker from "./index"

function body(...chunks: number[][]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk))
      controller.close()
    },
  })
}

describe("Yu-Gi-Oh image mirror validation", () => {
  it("accepts a matching YGOPRODeck source and deterministic key", () => {
    expect(
      validateMirrorInput({
        key: "yugioh/cards/46986414.jpg",
        sourceUrl: "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
      }),
    ).toEqual({
      kind: "legacy",
      targets: [
        {
          printingId: "46986414",
          key: "yugioh/cards/46986414.jpg",
          sourceUrl: "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
        },
      ],
    })
    expect(printingIdFromKey("yugioh/cards/46986414.jpg")).toBe("46986414")
    expect(sourceUrlForKey("yugioh/cards/46986414.jpg")).toBe(
      "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
    )
  })

  it("derives an approved target from a printing ID", () => {
    expect(validateMirrorInput({ printingIds: ["46986414"] })).toEqual({
      kind: "batch",
      targets: [mirrorTargetForPrintingId("46986414")],
    })
    expect(() => validateMirrorInput({ printingIds: [] })).toThrow("printingIds must contain")
    expect(() =>
      validateMirrorInput({
        printingIds: Array.from({ length: MAX_MIRROR_TARGETS + 1 }, (_, index) =>
          String(index + 1),
        ),
      }),
    ).toThrow("printingIds must contain")
    expect(() => validateMirrorInput({ printingIds: ["46986414.jpg"] })).toThrow(
      "Invalid printing ID",
    )
  })

  it.each([
    "http://images.ygoprodeck.com/images/cards/46986414.jpg",
    "https://example.com/images/cards/46986414.jpg",
    "https://images.ygoprodeck.com/images/cards/89631139.jpg",
    "https://images.ygoprodeck.com/images/cards/46986414.jpg?download=1",
    "https://images.ygoprodeck.com/redirect/46986414.jpg",
  ])("rejects an unsafe or mismatched source: %s", (sourceUrl) => {
    expect(() => validateMirrorInput({ key: "yugioh/cards/46986414.jpg", sourceUrl })).toThrow()
  })

  it("bounds streamed images before buffering them", async () => {
    await expect(readBoundedBody(body([1, 2], [3, 4]), 3)).rejects.toThrow("too large")
    await expect(readBoundedBody(body([1, 2], [3]), 3)).resolves.toEqual(Uint8Array.from([1, 2, 3]))
    await expect(
      readBoundedBody(body([1, 2], [3, 4]), 3, "Request body is too large"),
    ).rejects.toThrow("Request body is too large")
  })

  it("preserves the size error when stream cancellation fails", async () => {
    const cancel = jest.fn().mockRejectedValue(new Error("cancel failed"))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2, 3, 4]))
      },
      cancel,
    })

    await expect(readBoundedBody(stream, 3)).rejects.toThrow("Image is too large")
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("does not populate the mirror from an anonymous image request", async () => {
    const get = jest.fn().mockResolvedValue(null)
    const put = jest.fn()
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    const env: Env = {
      MIRROR_TOKEN: "test-token",
      YGO_IMAGES: { get, put } as R2Bucket,
    }

    const response = await worker.fetch(
      new Request("https://images.example/images/yugioh%2Fcards%2F46986414.jpg"),
      env,
    )

    expect(response.status).toBe(404)
    expect(get).toHaveBeenCalledWith("yugioh/cards/46986414.jpg")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("mirrors an authenticated target", async () => {
    const head = jest.fn().mockResolvedValue(null)
    const put = jest.fn().mockResolvedValue({})
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), {
        headers: { "content-type": "image/jpeg", "content-length": "4" },
      }),
    )
    const env: Env = {
      MIRROR_TOKEN: "test-token",
      YGO_IMAGES: { head, put } as R2Bucket,
    }

    const createdResponse = await worker.fetch(
      new Request("https://images.example/mirror", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ printingIds: ["46986414"] }),
      }),
      env,
    )

    expect(createdResponse.status).toBe(200)
    expect(createdResponse.headers.get("cache-control")).toBe("no-store")
    await expect(createdResponse.json()).resolves.toMatchObject({
      requested: 1,
      created: 1,
      existing: 0,
      failed: 0,
      results: [{ printingId: "46986414", status: "created" }],
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
      expect.objectContaining({ redirect: "manual" }),
    )
    expect(put).toHaveBeenCalledWith(
      "yugioh/cards/46986414.jpg",
      expect.any(Uint8Array),
      expect.objectContaining({
        httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=3600" },
      }),
    )
    fetchSpy.mockRestore()
  })

  it("returns failure details when the source image fails", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
    const response = await worker.fetch(
      new Request("https://images.example/mirror", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ printingIds: ["1"] }),
      }),
      {
        MIRROR_TOKEN: "test-token",
        YGO_IMAGES: {
          head: jest.fn().mockResolvedValue(null),
          put: jest.fn().mockResolvedValue({}),
        } as R2Bucket,
      },
    )

    expect(response.status).toBe(502)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toMatchObject({
      requested: 1,
      created: 0,
      existing: 0,
      failed: 1,
      results: [{ printingId: "1", status: "failed", httpStatus: 502 }],
    })
    fetchSpy.mockRestore()
  })

  it("cancels a rejected source response body", async () => {
    const cancel = jest.fn()
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(Uint8Array.from([1, 2, 3]))
          },
          cancel,
        }),
        { headers: { "content-type": "text/html" } },
      ),
    )
    const response = await worker.fetch(
      new Request("https://images.example/mirror", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          key: "yugioh/cards/46986414.jpg",
          sourceUrl: "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
        }),
      }),
      {
        MIRROR_TOKEN: "test-token",
        YGO_IMAGES: { head: jest.fn().mockResolvedValue(null) } as R2Bucket,
      },
    )

    expect(response.status).toBe(415)
    expect(cancel).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it("checks JPEG magic bytes", () => {
    expect(isJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe(true)
    expect(isJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })
})
