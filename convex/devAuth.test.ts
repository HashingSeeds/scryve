import { makeConvexTest } from "../test/convexTest"
import { internal } from "./_generated/api"

describe("devAuth.signInTicket", () => {
  const previousClerkSecret = process.env.CLERK_SECRET_KEY

  afterEach(() => {
    jest.restoreAllMocks()
    if (previousClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = previousClerkSecret
  })

  function clerk() {
    return jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const body = String(input).includes("/sign_in_tokens")
        ? { token: "ticket_for_jane" }
        : [{ id: "user_jane" }]
      return new Response(JSON.stringify(body), { status: 200 })
    })
  }

  it("mints a ticket for a test account on a Clerk development instance", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_dev"
    const fetchSpy = clerk()
    const ticket = await makeConvexTest().action(internal.devAuth.signInTicket, {
      email: "jane+clerk_test@sow.care",
    })
    expect(ticket).toBe("ticket_for_jane")
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "https://api.clerk.com/v1/sign_in_tokens",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: "user_jane", expires_in_seconds: 600 }),
      }),
    )
  })

  it.each([
    ["sk_live_prod", "jane+clerk_test@sow.care"],
    [undefined, "jane+clerk_test@sow.care"],
    ["sk_test_dev", "jane@sow.care"],
    ["sk_test_dev", "jane+clerk_test@sow.care, matt@sow.care"],
  ])("refuses key %s with %s before calling Clerk", async (key, email) => {
    if (key) process.env.CLERK_SECRET_KEY = key
    else delete process.env.CLERK_SECRET_KEY
    const fetchSpy = clerk()
    await expect(
      makeConvexTest().action(internal.devAuth.signInTicket, { email }),
    ).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
