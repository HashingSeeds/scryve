import {
  isJpeg,
  printingIdFromKey,
  readBoundedBody,
  sourceUrlForKey,
  validateMirrorInput,
} from "./validation"

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
      key: "yugioh/cards/46986414.jpg",
      sourceUrl: "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
    })
    expect(printingIdFromKey("yugioh/cards/46986414.jpg")).toBe("46986414")
    expect(sourceUrlForKey("yugioh/cards/46986414.jpg")).toBe(
      "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
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
  })

  it("uses a generic diagnostic for oversized request bodies", async () => {
    await expect(
      readBoundedBody(body([1, 2], [3, 4]), 3, "Request body is too large"),
    ).rejects.toThrow("Request body is too large")
  })

  it("checks JPEG magic bytes", () => {
    expect(isJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe(true)
    expect(isJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })
})
