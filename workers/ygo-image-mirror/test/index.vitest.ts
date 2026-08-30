// eslint-disable-next-line import/no-unresolved
import { env } from "cloudflare:workers"
import { afterEach, describe, expect, it } from "vitest"

import worker from "../src/index"

const PRINTING_ID = "46986414"
const KEY = `yugioh/cards/${PRINTING_ID}.jpg`
const URL = `https://images.example/images/${encodeURIComponent(KEY)}`
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0x00])

afterEach(async () => {
  await env.YGO_IMAGES.delete(KEY)
})

describe("Yu-Gi-Oh image mirror Worker runtime", () => {
  it("serves an R2 image with cache and conditional-request metadata", async () => {
    await env.YGO_IMAGES.put(KEY, JPEG, {
      httpMetadata: { contentType: "image/jpeg" },
    })

    const response = await worker.fetch(new Request(URL), env)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(response.headers.get("content-length")).toBe(String(JPEG.byteLength))
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600")
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe("public, max-age=86400")
    expect(response.headers.get("cache-tag")).toBe(`scryve-ygo-image-${PRINTING_ID}`)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG)

    const etag = response.headers.get("etag")!
    const notModified = await worker.fetch(
      new Request(URL, { headers: { "if-none-match": etag } }),
      env,
    )
    expect(notModified.status).toBe(304)

    const head = await worker.fetch(new Request(URL, { method: "HEAD" }), env)
    expect(head.status).toBe(200)
    expect(head.headers.get("etag")).toBe(etag)
    expect(await head.text()).toBe("")
  })

  it("never caches a missing image or an authorization failure", async () => {
    const missing = await worker.fetch(new Request(URL), env)
    expect(missing.status).toBe(404)
    expect(missing.headers.get("cache-control")).toBe("no-store")

    const unauthorized = await worker.fetch(
      new Request("https://images.example/mirror", {
        method: "POST",
        body: JSON.stringify({ printingIds: [PRINTING_ID] }),
      }),
      env,
    )
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get("cache-control")).toBe("no-store")
  })

  it("recognizes an existing image through the authenticated batch endpoint", async () => {
    await env.YGO_IMAGES.put(KEY, JPEG, {
      httpMetadata: { contentType: "image/jpeg" },
    })

    const response = await worker.fetch(
      new Request("https://images.example/mirror", {
        method: "POST",
        headers: {
          "authorization": "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ printingIds: [PRINTING_ID] }),
      }),
      env,
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      requested: 1,
      created: 0,
      existing: 1,
      failed: 0,
    })
  })

  it("deletes an image only through the authenticated endpoint", async () => {
    await env.YGO_IMAGES.put(KEY, JPEG, {
      httpMetadata: { contentType: "image/jpeg" },
    })

    const response = await worker.fetch(
      new Request(URL, {
        method: "DELETE",
        headers: { authorization: "Bearer test-token" },
      }),
      env,
    )
    expect(response.status).toBe(204)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(env.YGO_IMAGES.head(KEY)).resolves.toBeNull()
  })
})
