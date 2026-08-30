import {
  isJpeg,
  printingIdFromKey,
  readBoundedBody,
  RequestFailure,
  validateMirrorInput,
} from "./validation"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_REQUEST_BYTES = 8 * 1024
const FETCH_TIMEOUT_MS = 10_000
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-max-age": "86400",
} as const

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ])
  const providedBytes = new Uint8Array(providedHash)
  const expectedBytes = new Uint8Array(expectedHash)
  let difference = providedBytes.byteLength ^ expectedBytes.byteLength
  for (let index = 0; index < expectedBytes.byteLength; index += 1) {
    difference |= (providedBytes[index] ?? 0) ^ expectedBytes[index]
  }
  return difference === 0
}

async function requireAuthorization(request: Request, env: Env): Promise<void> {
  const header = request.headers.get("authorization")
  const provided = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
  if (!(await secretsMatch(provided, env.MIRROR_TOKEN))) {
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
    if (!object) return new Response("Not found", { status: 404 })
    const headers = new Headers(CORS_HEADERS)
    object.writeHttpMetadata(headers)
    headers.set("etag", object.httpEtag)
    headers.set("cache-control", IMMUTABLE_CACHE)
    return new Response(null, { headers })
  }

  const object = await env.YGO_IMAGES.get(key)
  if (!object) return new Response("Not found", { status: 404 })
  const headers = new Headers(CORS_HEADERS)
  object.writeHttpMetadata(headers)
  headers.set("etag", object.httpEtag)
  headers.set("cache-control", IMMUTABLE_CACHE)

  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(object.body, { headers })
}

async function fetchAndStoreImage(env: Env, input: { key: string; sourceUrl: string }) {
  const source = await fetch(input.sourceUrl, {
    headers: { "User-Agent": "Scryve/1.0 (Yu-Gi-Oh image mirror)" },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!source.ok) throw new RequestFailure(502, `Source returned ${source.status}`)

  const contentType = source.headers.get("content-type")?.split(";", 1)[0]?.trim()
  if (contentType !== "image/jpeg") {
    throw new RequestFailure(415, "Source is not a JPEG image")
  }

  const declaredLength = Number(source.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new RequestFailure(413, "Image is too large")
  }

  const bytes = await readBoundedBody(source.body, MAX_IMAGE_BYTES)
  if (!isJpeg(bytes)) throw new RequestFailure(415, "Source is not a JPEG image")
  const checksumBytes = new Uint8Array(bytes)
  const checksum = await crypto.subtle.digest("SHA-256", checksumBytes.buffer)

  await env.YGO_IMAGES.put(input.key, bytes, {
    httpMetadata: { contentType: "image/jpeg", cacheControl: IMMUTABLE_CACHE },
    customMetadata: {
      sourceUrl: input.sourceUrl,
      sourceEtag: source.headers.get("etag") ?? "",
      mirroredAt: new Date().toISOString(),
    },
    sha256: checksum,
  })
}

async function mirrorImage(request: Request, env: Env): Promise<Response> {
  await requireAuthorization(request, env)
  const input = validateMirrorInput(await jsonBody(request))
  const existing = await env.YGO_IMAGES.head(input.key)
  if (existing) {
    return Response.json({ key: input.key, url: objectUrl(request, input.key), created: false })
  }

  await fetchAndStoreImage(env, input)

  return Response.json({ key: input.key, url: objectUrl(request, input.key), created: true })
}

async function deleteImage(request: Request, env: Env, key: string): Promise<Response> {
  await requireAuthorization(request, env)
  await env.YGO_IMAGES.delete(key)
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } })
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true })
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
  return new Response("Not found", { status: 404 })
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      if (error instanceof RequestFailure) {
        return Response.json({ error: error.message }, { status: error.status })
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error(JSON.stringify({ message: "Yu-Gi-Oh image mirror failed", error: message }))
      return Response.json({ error: "Image mirror failed" }, { status: 502 })
    }
  },
} satisfies ExportedHandler<Env>

export default worker
