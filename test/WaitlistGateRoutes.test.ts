import { shouldBypassWaitlistGate } from "../functions/waitlistGateRoutes"

describe("wait-list middleware routing", () => {
  it.each([
    "/waitlist",
    "/waitlist/",
    "/waitlist/styles.css",
    "/delete-account",
    "/delete-account/",
    "/privacy",
    "/terms",
    "/cookie-policy",
    "/api/waitlist",
    "/_expo/static/js/web/entry.js",
    "/assets/icon.png",
    "/apple-touch-icon.png",
    "/favicon.ico",
    "/metadata.json",
  ])("keeps %s public", (pathname) => {
    expect(shouldBypassWaitlistGate(pathname)).toBe(true)
  })

  it.each(["/", "/settings", "/decks", "/api/private", "/waitlisted"])(
    "keeps %s behind the gate",
    (pathname) => {
      expect(shouldBypassWaitlistGate(pathname)).toBe(false)
    },
  )
})
