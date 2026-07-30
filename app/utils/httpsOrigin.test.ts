import { normalizeHttpsOrigin } from "./httpsOrigin"

describe("HTTPS origin normalization", () => {
  it.each([
    "http://count.example",
    "https://user:pass@count.example",
    "https://count.example/base",
    "https://count.example/?x=1",
    "https://count.example/#frag",
  ])("rejects non-origin value %s", (value) => expect(normalizeHttpsOrigin(value)).toBeNull())

  it("normalizes host case, default ports, and preserves explicit ports", () => {
    expect(normalizeHttpsOrigin(" HTTPS://COUNT.EXAMPLE:443 ")).toBe("https://count.example")
    expect(normalizeHttpsOrigin("https://count.example:8443")).toBe("https://count.example:8443")
  })
})
