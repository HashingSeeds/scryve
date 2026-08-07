import { validatePublicCloudConfig } from "./config"

describe("public cloud configuration", () => {
  it("degrades actionably when credentials are absent", () => {
    const result = validatePublicCloudConfig({})
    expect(result.configured).toBe(false)
    if (!result.configured) expect(result.message).toContain("Local play remains available")
  })

  it("rejects secret/non-HTTPS-shaped values and accepts public configuration", () => {
    expect(
      validatePublicCloudConfig({
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "sk_test_secret",
        EXPO_PUBLIC_CONVEX_URL: "http://x",
        EXPO_PUBLIC_INVITE_ORIGIN: "count://x",
      }).configured,
    ).toBe(false)
    expect(
      validatePublicCloudConfig({
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("foo-bar-13.clerk.accounts.dev$").toString("base64").replace(/=+$/, "")}`,
        EXPO_PUBLIC_CONVEX_URL: "https://x.convex.cloud",
        EXPO_PUBLIC_INVITE_ORIGIN: "https://count.example",
      }).configured,
    ).toBe(true)
  })

  it("keeps .env.example placeholders on the local-safe unconfigured path", () => {
    expect(
      validatePublicCloudConfig({
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_replace_me",
        EXPO_PUBLIC_CONVEX_URL: "https://replace-me.convex.cloud",
        EXPO_PUBLIC_INVITE_ORIGIN: "https://count.example",
      }).configured,
    ).toBe(false)
  })

  it.each([
    "https://user:pass@count.example",
    "https://count.example/base",
    "https://count.example/?x=1",
    "https://count.example/#frag",
  ])("rejects invite URL that is not an exact origin: %s", (inviteOrigin) => {
    expect(
      validatePublicCloudConfig({
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("foo-bar-13.clerk.accounts.dev$").toString("base64").replace(/=+$/, "")}`,
        EXPO_PUBLIC_CONVEX_URL: "https://x.convex.cloud",
        EXPO_PUBLIC_INVITE_ORIGIN: inviteOrigin,
      }).configured,
    ).toBe(false)
  })
})
