import { emitTelemetry, setTelemetryAdapter } from "./telemetry"

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
})
