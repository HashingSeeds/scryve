import { parseWaitlistSubmission } from "../functions/waitlistValidation"

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
