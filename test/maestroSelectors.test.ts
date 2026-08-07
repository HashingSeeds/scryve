import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { lifeControlTestId } from "@/components/LifeControls"

describe("shipping Maestro selectors", () => {
  it("targets Home and stable seat-based controls mounted by the Expo Router app", () => {
    const recovery = readFileSync(
      join(process.cwd(), ".maestro/flows/Phase4LocalRecovery.yaml"),
      "utf8",
    )
    const localSmoke = readFileSync(join(process.cwd(), ".maestro/flows/Landing.yaml"), "utf8")

    expect(recovery).toContain('id: "new-game-button"')
    expect(recovery).toContain(`id: "${lifeControlTestId(1, 1)}"`)
    expect(localSmoke).toContain("longPressOn:")
    expect(localSmoke).toContain(`id: "${lifeControlTestId(1, -1)}"`)
    expect(recovery).not.toContain("quick-local-game-button")
  })

  it("keeps every flow app-id driven and isolated by the shared startup flow", () => {
    const flowDirectory = join(process.cwd(), ".maestro/flows")
    const flowNames = readdirSync(flowDirectory).filter((name) => name.endsWith(".yaml"))

    expect(flowNames.length).toBeGreaterThan(0)
    for (const flowName of flowNames) {
      const flow = readFileSync(join(flowDirectory, flowName), "utf8")
      expect(flow).toContain("appId: ${MAESTRO_APP_ID}")
      expect(flow).toContain("../shared/_OnFlowStart.yaml")
    }
  })

  it("exposes selector validation, smoke, and full-suite package commands", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))

    expect(packageJson.scripts["test:maestro:check"]).toContain("maestroSelectors.test.ts")
    expect(packageJson.scripts["test:maestro:smoke"]).toContain("Landing.yaml")
    expect(packageJson.scripts["test:maestro"]).toContain(".maestro/flows")
  })
})
