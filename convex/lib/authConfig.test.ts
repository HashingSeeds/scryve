import { validateClerkIssuerDomain } from "./authConfig"

describe("Convex Clerk issuer configuration", () => {
  it("accepts an exact HTTPS origin", () => {
    expect(validateClerkIssuerDomain("https://example.clerk.accounts.dev")).toBe(
      "https://example.clerk.accounts.dev",
    )
  })

  it.each([
    undefined,
    "http://example.clerk.accounts.dev",
    "https://example.clerk.accounts.dev/extra",
    "https://example.clerk.accounts.dev?tenant=bad",
    "https://user:pass@example.clerk.accounts.dev",
  ])("rejects unsafe or imprecise issuer value %s", (value) => {
    expect(() => validateClerkIssuerDomain(value)).toThrow("CLERK_FRONTEND_API_URL")
  })
})
