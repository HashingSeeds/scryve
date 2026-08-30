import {
  isJpeg,
  type MirrorTarget,
  printingIdFromKey,
  readBoundedBody,
  RequestFailure,
  validateMirrorInput,
} from "./validation"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_REQUEST_BYTES = 8 * 1024
const FETCH_TIMEOUT_MS = 10_000
const BROWSER_CACHE = "public, max-age=3600"
const CDN_CACHE = "public, max-age=86400"
const NO_STORE = "no-store"
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-max-age": "86400",
} as const

type MirrorResult = {
  printingId: string
  key: string
  status: "created" | "existing" | "failed"
  httpStatus?: number
  error?: string
}

function noStoreHeaders(headers?: HeadersInit) {
  const result = new Headers(headers)
  result.set("cache-control", NO_STORE)
  return result
}

function noStoreJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: noStoreHeaders() })
}

function imageNotFound() {
  return new Response("Not found", { status: 404, headers: noStoreHeaders(CORS_HEADERS) })
}

function imageHeaders(object: R2Object) {
  const headers = new Headers(CORS_HEADERS)
  object.writeHttpMetadata(headers)
  headers.set("etag", object.httpEtag)
  headers.set("content-length", String(object.size))
  headers.set("cache-control", BROWSER_CACHE)
  headers.set("cloudflare-cdn-cache-control", CDN_CACHE)
  const printingId = printingIdFromKey(object.key)
  if (printingId) headers.set("cache-tag", `scryve-ygo-image-${printingId}`)
  return headers
}

function log(level: "info" | "warn" | "error", event: string, fields = {}) {
  const entry = JSON.stringify({ event, ...fields })
  if (level === "error") console.error(entry)
  else if (level === "warn") console.warn(entry)
  else console.log(entry)
}

function secretsMatch(provided: string, expected: string): boolean {
  const encoder = new TextEncoder()
  const providedBytes = encoder.encode(provided)
  const expectedBytes = encoder.encode(expected)
  let difference = providedBytes.byteLength ^ expectedBytes.byteLength
  for (let index = 0; index < expectedBytes.byteLength; index += 1) {
    difference |= (providedBytes[index] ?? 0) ^ expectedBytes[index]
  }
  return difference === 0
}

function requireAuthorization(request: Request, env: Env): void {
  const header = request.headers.get("authorization")
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
  if (!secretsMatch(provided, env.MIRROR_TOKEN)) {
    throw new RequestFailure(401, "Unauthorized")
  }
}

function decodeImageKey(pathname: string): string | undefined {
  const encoded = pathname.slice("/images/".length)
  try {
    const key = decodeURIComponent(encoded)
    return printingIdFromKey(key) ? key : undefined
  } catch {
    return undefined
  }
}

function objectUrl(request: Request, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/")
  return `${new URL(request.url).origin}/images/${encodedKey}`
}

async function jsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new RequestFailure(413, "Request is too large")
  }

  const bytes = await readBoundedBody(request.body, MAX_REQUEST_BYTES, "Request body is too large")
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new RequestFailure(400, "Invalid JSON")
  }
}

async function serveObject(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method === "HEAD") {
    const object = await env.YGO_IMAGES.head(key)
    if (!object) return imageNotFound()
    return new Response(null, { headers: imageHeaders(object) })
  }

  const object = await env.YGO_IMAGES.get(key)
  if (!object) return imageNotFound()
  const headers = imageHeaders(object)

  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(object.body, { headers })
}

async function fetchAndStoreImage(env: Env, input: MirrorTarget) {
  const source = await fetch(input.sourceUrl, {
    headers: { "User-Agent": "Scryve/1.0 (Yu-Gi-Oh image mirror)" },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!source.ok) {
    await source.body?.cancel().catch(() => undefined)
    throw new RequestFailure(502, `Source returned ${source.status}`)
  }

  const contentType = source.headers.get("content-type")?.split(";", 1)[0]?.trim()
  if (contentType !== "image/jpeg") {
    await source.body?.cancel().catch(() => undefined)
    throw new RequestFailure(415, "Source is not a JPEG image")
  }

  const declaredLength = Number(source.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    await source.body?.cancel().catch(() => undefined)
    throw new RequestFailure(413, "Image is too large")
  }

  const bytes = await readBoundedBody(source.body, MAX_IMAGE_BYTES)
  if (!isJpeg(bytes)) throw new RequestFailure(415, "Source is not a JPEG image")

  await env.YGO_IMAGES.put(input.key, bytes, {
    httpMetadata: { contentType: "image/jpeg", cacheControl: BROWSER_CACHE },
    customMetadata: {
      sourceUrl: input.sourceUrl,
      sourceEtag: source.headers.get("etag") ?? "",
      mirroredAt: new Date().toISOString(),
    },
  })
}

async function mirrorTarget(env: Env, target: MirrorTarget): Promise<MirrorResult> {
  const existing = await env.YGO_IMAGES.head(target.key)
  if (existing) {
    return { printingId: target.printingId, key: target.key, status: "existing" }
  }

  await fetchAndStoreImage(env, target)
  return { printingId: target.printingId, key: target.key, status: "created" }
}

async function mirrorBatch(env: Env, targets: readonly MirrorTarget[]) {
  return await Promise.all(
    targets.map(async (target): Promise<MirrorResult> => {
      try {
        return await mirrorTarget(env, target)
      } catch (error) {
        const known = error instanceof RequestFailure
        log(known ? "warn" : "error", "mirror_target_failed", {
          printingId: target.printingId,
          status: known ? error.status : 502,
          error: error instanceof Error ? error.message : "Unknown error",
        })
        return {
          printingId: target.printingId,
          key: target.key,
          status: "failed",
          httpStatus: known ? error.status : 502,
          error: known ? error.message : "Image mirror failed",
        }
      }
    }),
  )
}

async function mirrorImage(request: Request, env: Env): Promise<Response> {
  requireAuthorization(request, env)
  const input = validateMirrorInput(await jsonBody(request))
  if (input.kind === "legacy") {
    const [target] = input.targets
    const result = await mirrorTarget(env, target)
    log("info", "mirror_completed", {
      requested: 1,
      created: result.status === "created" ? 1 : 0,
      existing: result.status === "existing" ? 1 : 0,
      failed: 0,
    })
    return noStoreJson({
      key: target.key,
      url: objectUrl(request, target.key),
      created: result.status === "created",
    })
  }

  const results = await mirrorBatch(env, input.targets)
  const created = results.filter((result) => result.status === "created").length
  const existing = results.filter((result) => result.status === "existing").length
  const failed = results.length - created - existing
  log("info", "mirror_batch_completed", {
    requested: input.targets.length,
    created,
    existing,
    failed,
  })
  return noStoreJson(
    {
      requested: input.targets.length,
      created,
      existing,
      failed,
      results: results.map((result) => ({
        ...result,
        ...(result.status === "failed" ? {} : { url: objectUrl(request, result.key) }),
      })),
    },
    failed === 0 ? 200 : created + existing > 0 ? 207 : 502,
  )
}

async function deleteImage(request: Request, env: Env, key: string): Promise<Response> {
  requireAuthorization(request, env)
  await env.YGO_IMAGES.delete(key)
  log("info", "mirror_deleted", { printingId: printingIdFromKey(key) })
  return new Response(null, { status: 204, headers: noStoreHeaders() })
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/health") {
    return noStoreJson({ ok: true })
  }
  if (request.method === "OPTIONS" && url.pathname.startsWith("/images/")) {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (request.method === "POST" && url.pathname === "/mirror") {
    return await mirrorImage(request, env)
  }
  if (url.pathname.startsWith("/images/")) {
    const key = decodeImageKey(url.pathname)
    if (!key) throw new RequestFailure(400, "Invalid image key")
    if (request.method === "GET" || request.method === "HEAD") {
      return await serveObject(request, env, key)
    }
    if (request.method === "DELETE") return await deleteImage(request, env, key)
  }
  return new Response("Not found", { status: 404, headers: noStoreHeaders() })
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      if (error instanceof RequestFailure) {
        if (request.method !== "GET" || error.status >= 500) {
          log(error.status >= 500 ? "error" : "warn", "request_rejected", {
            method: request.method,
            path: new URL(request.url).pathname,
            status: error.status,
            error: error.message,
          })
        }
        return noStoreJson({ error: error.message }, error.status)
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      log("error", "request_failed", {
        method: request.method,
        path: new URL(request.url).pathname,
        error: message,
      })
      return noStoreJson({ error: "Image mirror failed" }, 502)
    }
  },
} satisfies ExportedHandler<Env>

export default worker
