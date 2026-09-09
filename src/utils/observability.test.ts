import { addDiagnosticStep, initDiagnostics } from "@/utils/diagnostics"
import { initObservability } from "@/utils/observability"
import { emitTelemetry, setTelemetryAdapter } from "@/utils/telemetry"

jest.mock("@/utils/diagnostics", () => ({
  initDiagnostics: jest.fn(),
  addDiagnosticStep: jest.fn(),
}))

afterEach(() => {
  setTelemetryAdapter()
  jest.clearAllMocks()
})

it("initializes diagnostics and records only allowlisted breadcrumbs", () => {
  initObservability()
  expect(initDiagnostics).toHaveBeenCalledTimes(1)
  emitTelemetry("mutation.ack", {
    durationMs: 123,
    outcome: "success",
    privateText: "must not leave the app",
  })
  expect(addDiagnosticStep).toHaveBeenCalledWith("mutation.ack", {
    durationMs: 123,
    outcome: "success",
  })
})
