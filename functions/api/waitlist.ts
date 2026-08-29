import { type PagesEnv, requireEnv } from "../env"
import { isValidTurnstileResult, parseWaitlistSubmission } from "../waitlistValidation"

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

async function verifyTurnstile(env: PagesEnv, token: string, ip: string | null) {
  const expectedHostnames = new Set(
    requireEnv(env, "TURNSTILE_HOSTNAMES")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  )
  const formData = new FormData()
  formData.set("secret", requireEnv(env, "TURNSTILE_SECRET_KEY"))
  formData.set("response", token)
  if (ip) formData.set("remoteip", ip)

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  })
  if (!response.ok) return false
  const result: unknown = await response.json()
  if (typeof result !== "object" || result === null) return false
  return isValidTurnstileResult(result, expectedHostnames)
}

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  if (context.request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  let body: unknown
  try {
    body = await context.request.json()
  } catch {
    return json({ error: "Invalid request" }, 400)
  }

  const submission = parseWaitlistSubmission(body)
  if (!submission) return json({ error: "Enter an email and choose at least one platform" }, 400)

  try {
    const verified = await verifyTurnstile(
      context.env,
      submission.turnstileToken,
      context.request.headers.get("CF-Connecting-IP"),
    )
    if (!verified) return json({ error: "Verification failed. Please try again." }, 400)

    const convexUrl = new URL(
      "/waitlist/submissions",
      requireEnv(context.env, "EXPO_PUBLIC_CONVEX_SITE_URL"),
    )
    const response = await fetch(convexUrl, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${requireEnv(context.env, "WAITLIST_INGEST_SECRET")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: submission.email, platforms: submission.platforms }),
    })
    if (!response.ok) throw new Error(`Convex returned ${response.status}`)

    const result: { alreadyJoined?: boolean } = await response.json()
    return json({ alreadyJoined: result.alreadyJoined === true })
  } catch (error) {
    console.error(JSON.stringify({ event: "waitlist_submission_error", error: String(error) }))
    return json({ error: "Could not join the wait list. Please try again." }, 503)
  }
}
