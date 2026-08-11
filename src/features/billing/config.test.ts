import { validateRevenueCatConfig } from "./config"

describe("RevenueCat public configuration", () => {
  it("accepts the shared Test Store key", () => {
    expect(
      validateRevenueCatConfig(
        { EXPO_PUBLIC_REVENUECAT_API_KEY: "test_XwBqmXPuQzZamlznmUAnWUXcXWG" },
        "ios",
      ),
    ).toEqual({
      configured: true,
      value: { apiKey: "test_XwBqmXPuQzZamlznmUAnWUXcXWG" },
    })
  })

  it("prefers platform keys and rejects placeholders", () => {
    expect(
      validateRevenueCatConfig(
        {
          EXPO_PUBLIC_REVENUECAT_API_KEY: "test_shared",
          EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_android",
        },
        "android",
      ),
    ).toEqual({ configured: true, value: { apiKey: "goog_android" } })
    expect(
      validateRevenueCatConfig({ EXPO_PUBLIC_REVENUECAT_API_KEY: "test_replace_me" }, "web")
        .configured,
    ).toBe(false)
  })
})
