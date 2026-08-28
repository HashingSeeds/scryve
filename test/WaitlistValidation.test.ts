import { isValidTurnstileResult, parseWaitlistSubmission } from "../functions/waitlistValidation"

describe("wait-list form validation", () => {
  it("normalizes valid submissions and removes duplicate platforms", () => {
    expect(
      parseWaitlistSubmission({
        email: " Player@Example.com ",
        platforms: ["web", "web", "ios"],
        turnstileToken: "token",
      }),
    ).toEqual({
      email: "player@example.com",
      platforms: ["web", "ios"],
      turnstileToken: "token",
    })
  })

  it.each([
    {},
    { email: "invalid", platforms: ["web"], turnstileToken: "token" },
    { email: "player@example.com", platforms: [], turnstileToken: "token" },
    { email: "player@example.com", platforms: ["windows"], turnstileToken: "token" },
    { email: "player@example.com", platforms: ["web"], turnstileToken: "" },
  ])("rejects an invalid submission", (submission) => {
    expect(parseWaitlistSubmission(submission)).toBeNull()
  })
})

describe("Turnstile response validation", () => {
  const expectedHostnames = new Set(["scryve.sow.care"])

  it("accepts the expected action and production hostname", () => {
    expect(
      isValidTurnstileResult(
        { success: true, action: "join_waitlist", hostname: "scryve.sow.care" },
        expectedHostnames,
      ),
    ).toBe(true)
  })

  it.each([
    { success: false, action: "join_waitlist", hostname: "scryve.sow.care" },
    { success: true, action: "signup", hostname: "scryve.sow.care" },
    { success: true, action: "join_waitlist", hostname: "preview.pages.dev" },
    { success: true, action: "join_waitlist" },
  ])("rejects an untrusted response", (result) => {
    expect(isValidTurnstileResult(result, expectedHostnames)).toBe(false)
  })
})
