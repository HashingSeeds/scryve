import { v } from "convex/values"

import { env, internalAction } from "./_generated/server"

const CLERK_API = "https://api.clerk.com/v1"
const TEST_EMAIL = /^[^\s@+]+\+clerk_test@[^\s@]+$/

export const signInTicket = internalAction({
  args: { email: v.string() },
  returns: v.string(),
  handler: async (_ctx, { email }) => {
    const key = env.CLERK_SECRET_KEY
    if (!key?.startsWith("sk_test_"))
      throw new Error("Sign-in tickets need a Clerk development instance")
    if (!TEST_EMAIL.test(email)) throw new Error("Only +clerk_test addresses get sign-in tickets")
    const clerk = async (path: string, body?: object): Promise<unknown> => {
      const response = await fetch(`${CLERK_API}${path}`, {
        method: body ? "POST" : "GET",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`Clerk ${path.split("?")[0]} failed (${response.status})`)
      return await response.json()
    }

    const users = await clerk(`/users?limit=1&email_address=${encodeURIComponent(email)}`)
    const user: unknown = Array.isArray(users) ? users[0] : undefined
    if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string")
      throw new Error(`No Clerk user for ${email}. Sign it up once through the app.`)

    const ticket = await clerk("/sign_in_tokens", { user_id: user.id, expires_in_seconds: 600 })
    if (
      !ticket ||
      typeof ticket !== "object" ||
      !("token" in ticket) ||
      typeof ticket.token !== "string"
    )
      throw new Error("Clerk returned no sign-in token")
    return ticket.token
  },
})
