import { emitTelemetry, setTelemetryAdapter, type TelemetryEventName } from "./telemetry"

describe("privacy-safe telemetry", () => {
  afterEach(() => setTelemetryAdapter())

  it("emits only allow-listed, validated metadata", () => {
    const emit = jest.fn()
    setTelemetryAdapter({ emit })
    emitTelemetry("join.completed", {
      durationMs: 31,
      outcome: "success",
      inviteToken: "secret-token",
      email: "person@example.com",
      displayName: "Private Person",
      publicId: "convex-id",
      errorCode: "USER_ABC123",
      payload: { life: 20 },
    })
    expect(emit).toHaveBeenCalledWith({
      name: "join.completed",
      at: expect.any(Number),
      metadata: { durationMs: 31, outcome: "success" },
    })
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(
      /secret-token|person@example|Private Person|convex-id|life/,
    )
  })

  it("accepts the product-event metadata added for analytics", () => {
    const emit = jest.fn()
    setTelemetryAdapter({ emit })
    emitTelemetry("premium.blocked", {
      feature: "deck_limit",
      mode: "connected",
      source: "scan",
      reason: "full",
      playerCount: 4,
    })
    expect(emit).toHaveBeenCalledWith({
      name: "premium.blocked",
      at: expect.any(Number),
      metadata: {
        feature: "deck_limit",
        mode: "connected",
        source: "scan",
        reason: "full",
        playerCount: 4,
      },
    })
  })

  it("rejects values of the wrong shape for an allow-listed key", () => {
    const emit = jest.fn()
    setTelemetryAdapter({ emit })
    emitTelemetry("game.started", {
      mode: 4,
      feature: "not_a_feature",
      playerCount: -1,
      outcome: "success",
    })
    expect(emit).toHaveBeenCalledWith({
      name: "game.started",
      at: expect.any(Number),
      metadata: { outcome: "success" },
    })
  })

  it("accepts only a locally minted analytics id", () => {
    const emit = jest.fn()
    setTelemetryAdapter({ emit })
    const minted = "analytics_" + "0123456789abcdef".repeat(2)
    emitTelemetry("game.completed", { analyticsId: minted })
    emitTelemetry("game.completed", { analyticsId: "user_2abc" })
    expect(emit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        metadata: { analyticsId: minted },
      }),
    )
    expect(emit).toHaveBeenNthCalledWith(2, expect.objectContaining({ metadata: {} }))
  })

  it("drops an event whose name is not on the allowlist", () => {
    const emit = jest.fn()
    setTelemetryAdapter({ emit })
    emitTelemetry("deck.exfiltrate" as TelemetryEventName, { playerCount: 4 })
    expect(emit).not.toHaveBeenCalled()
  })
})
